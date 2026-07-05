/**
 * agent-scheduler — Đọc agents có next_run_at <= now(), chạy từng agent,
 * lưu brief vào Inbox, gửi email nếu bật, rồi tính next_run_at tiếp theo.
 *
 * Được gọi mỗi 15 phút bởi pg_cron.
 * Không cần auth — dùng service role key.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { financialReport, insiderReport, TYPE_LABEL } from "../_shared/financial-report.ts";
import { buildPriceContext, buildNewsContext } from "../_shared/market-context.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY    = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM        = Deno.env.get("EMAIL_FROM") ?? "Wealbee <no-reply@wealbee.com>";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL_MAP: Record<string, { provider: "openai" | "anthropic"; apiModel: string }> = {
  "gpt-4o-mini":   { provider: "openai",    apiModel: "gpt-4o-mini"       },
  "gpt-4o":        { provider: "openai",    apiModel: "gpt-4o"            },
  "claude-sonnet": { provider: "anthropic", apiModel: "claude-sonnet-4-6" },
  "claude-opus":   { provider: "anthropic", apiModel: "claude-opus-4-7"   },
  "gemini-pro":    { provider: "openai",    apiModel: "gpt-4.1-mini"      },
  "gemini-flash":  { provider: "openai",    apiModel: "gpt-4.1-mini"      },
};
const DEFAULT_MODEL = { provider: "openai" as const, apiModel: "gpt-4.1-mini" };

const faUrl = (sym: string) => `https://fireant.vn/ma-chung-khoan/${sym}`;

// ── Schedule helpers ──────────────────────────────────────────────────────────

interface ScheduleConfig {
  mode: "scheduled" | "realtime";
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  time: string;
  days: number[];
}

function parseSchedule(raw: string): ScheduleConfig | null {
  if (!raw || raw === "manual" || raw === "realtime") return null;
  // JSON format: {"mode":"scheduled","frequency":"daily","time":"09:15","days":[]}
  try {
    const cfg = JSON.parse(raw) as ScheduleConfig;
    if (cfg.mode && cfg.frequency && cfg.time) return cfg;
  } catch { /* fall through */ }
  // Legacy string format: "daily:09:15" | "weekdays:09:15"
  const match = raw.match(/^(daily|weekdays|weekly):(\d{1,2}:\d{2})$/);
  if (match) {
    return { mode: "scheduled", frequency: match[1] as ScheduleConfig["frequency"], time: match[2], days: [] };
  }
  return null;
}

function uiDayToJS(d: number): number { return d === 6 ? 0 : d + 1; }

function calcNextRunAt(cfg: ScheduleConfig, startFromToday = false): string | null {
  if (cfg.mode !== "scheduled") return null;
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowVN = new Date(Date.now() + VN_OFFSET_MS);
  const [hour, minute] = cfg.time.split(":").map(Number);

  let validJSDays: number[];
  if (cfg.frequency === "daily")         validJSDays = [0,1,2,3,4,5,6];
  else if (cfg.frequency === "weekdays") validJSDays = [1,2,3,4,5];
  else                                   validJSDays = (cfg.days ?? []).map(uiDayToJS);

  if (!validJSDays.length) return null;

  // startFromToday=true: xét hôm nay nếu giờ chưa qua, rồi mới nhảy sang ngày mai
  const startAhead = startFromToday ? 0 : 1;
  for (let ahead = startAhead; ahead <= 8; ahead++) {
    const cand = new Date(nowVN);
    cand.setDate(cand.getDate() + ahead);
    cand.setHours(hour, minute, 0, 0);
    if (validJSDays.includes(cand.getDay()) && cand.getTime() > nowVN.getTime()) {
      return new Date(cand.getTime() - VN_OFFSET_MS).toISOString();
    }
  }
  return null;
}

// ── DB helpers (shared với run-agent) ────────────────────────────────────────

class SourceRegistry {
  private list: Array<{ label: string; url: string }> = [];
  add(label: string, url: string): string {
    const i = this.list.findIndex(s => s.url === url);
    if (i !== -1) return `[ref:${i + 1}]`;
    this.list.push({ label, url });
    return `[ref:${this.list.length}]`;
  }
  toArray() { return this.list.map((s, i) => ({ index: i + 1, ...s })); }
}

// Tool "financials" (BCTC) — dùng chung module financialReport() (Năm + 5 Quý gần
// nhất), thay cho query financials_annual cũ (đông cứng, khác số với tầng mới).
async function buildFinancialsContext(symbol: string, registry: SourceRegistry): Promise<string> {
  const sym = symbol.toUpperCase();
  const lines: string[] = [`\n## Tài chính: ${sym}`];
  try {
    const { data: tk } = await sb.from("tickers").select("company_type").eq("symbol", sym).single();
    const ctype = tk?.company_type ?? "normal";
    const report = await financialReport(sb, sym, ctype);
    if (report.trim()) {
      const ref = ` ${registry.add("BCTC", faUrl(sym))}`;
      lines.push(`### BCTC (${TYPE_LABEL[ctype] ?? ctype})${ref}`);
      lines.push(report);
    }
  } catch { /* ignore */ }
  return lines.length > 1 ? lines.join("\n") : "";
}

// Tool "insider_trades" (cổ tức + giao dịch nội bộ) — tách riêng khỏi BCTC.
async function buildInsiderContext(symbol: string, registry: SourceRegistry): Promise<string> {
  const sym = symbol.toUpperCase();
  const lines: string[] = [`\n## Cổ tức & Giao dịch nội bộ: ${sym}`];
  const report = await insiderReport(sb, sym);
  if (report.trim()) {
    const ref = ` ${registry.add("Nội bộ", faUrl(sym))}`;
    lines.push(ref);
    lines.push(report);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

const GROUNDING_RULES = `

## QUY TẮC BẮT BUỘC
- Chỉ dùng Markdown thuần, KHÔNG dùng HTML
- Chỉ viết thông tin CÓ TRONG DỮ LIỆU — nếu không có thì bỏ qua
- Mọi số liệu phải có [ref:N] liền sau
- Cuối output PHẢI có: *"Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019"*
- KHÔNG khuyến nghị mua/bán`;

// ── Gửi email ─────────────────────────────────────────────────────────────────

async function sendEmail(to: string, agentName: string, title: string, content: string): Promise<void> {
  if (!RESEND_API_KEY || !to) return;
  const bodyHtml = content
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, `<h2 style="color:#0849ac;font-size:15px;margin:16px 0 8px">$1</h2>`)
    .replace(/^### (.+)$/gm, `<h3 style="color:#1a1a2e;font-size:14px;margin:12px 0 6px">$1</h3>`)
    .replace(/^- (.+)$/gm, `<li style="margin:4px 0">$1</li>`)
    .replace(/(<li.*<\/li>\n?)+/g, `<ul style="padding-left:20px;margin:8px 0">$&</ul>`)
    .replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject: `[Wealbee Agent] ${title}`,
      html: `<!DOCTYPE html><html><body style="font-family:Helvetica,sans-serif;background:#f0f4fa;padding:24px">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
          <div style="background:#0849ac;padding:20px 28px">
            <span style="color:#fff;font-size:18px;font-weight:700">Wealbee</span>
            <span style="color:rgba(255,255,255,0.6);font-size:12px;float:right">${agentName}</span>
          </div>
          <div style="padding:28px;font-size:14px;color:#374151;line-height:1.8">
            <h1 style="font-size:18px;color:#1a1a2e;margin:0 0 16px">${title}</h1>
            <p>${bodyHtml}</p>
          </div>
          <div style="padding:16px;text-align:center;font-size:11px;color:#99a1af">
            Wealbee Agent · Chỉ mang tính thông tin, không phải khuyến nghị đầu tư
          </div>
        </div>
      </body></html>`,
    }),
  });
}

// ── Chạy một agent ────────────────────────────────────────────────────────────

async function runAgent(agent: Record<string, unknown>): Promise<void> {
  const agentId  = agent.id as string;
  const userId   = agent.user_id as string;
  const tools    = (agent.tools as string[]) ?? [];
  const syms     = (agent.target_symbols as string[]) ?? [];
  const model    = (agent.model as string) ?? "gpt-4o-mini";

  console.log(`[scheduler] Running agent ${agentId} "${agent.name}"`);

  // Tạo run record
  const { data: run } = await sb.from("agent_runs")
    .insert({ agent_id: agentId, user_id: userId, status: "running" })
    .select("id").single();
  if (!run) { console.error("Cannot create run record"); return; }

  const startedAt = Date.now();
  const registry = new SourceRegistry();

  try {
    // Thu thập context — DB tool IDs: price_feed, news_feed, financials, insider_trades, rsi, macd
    let priceCtx = `Ngày: ${new Date().toLocaleDateString("vi-VN",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Ho_Chi_Minh"})}`;
    if (tools.some(t => ["price_feed","price","index","movers"].includes(t))) {
      priceCtx = await buildPriceContext(sb, registry, syms);
    }

    let newsCtx = "";
    if (tools.some(t => ["news_feed","news","macro"].includes(t))) {
      newsCtx = await buildNewsContext(sb, registry, syms.length > 0 ? syms : undefined);
    }

    let financialsCtx = "";
    if (syms.length > 0 && tools.some(t => ["financials","pe"].includes(t))) {
      const parts = await Promise.all(syms.map(s => buildFinancialsContext(s, registry)));
      financialsCtx = parts.filter(Boolean).join("\n\n");
    }

    let insiderCtx = "";
    if (syms.length > 0 && tools.some(t => ["insider_trades","insider"].includes(t))) {
      const parts = await Promise.all(syms.map(s => buildInsiderContext(s, registry)));
      insiderCtx = parts.filter(Boolean).join("\n\n");
    }

    // ── KB RAG ─────────────────────────────────────────────────────────────
    let kbCtx = "";
    const kbDocIds: string[] = (agent.kb_document_ids as string[]) ?? [];

    if (kbDocIds.length > 0 && OPENAI_API_KEY) {
      try {
        const kbQuery = syms.length > 0
          ? `Phân tích cổ phiếu ${syms.join(", ")} — tiêu chí định giá, ngành, rủi ro`
          : (agent.description as string) ?? (agent.name as string) ?? "phân tích chứng khoán Việt Nam";

        const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: kbQuery }),
        });

        if (embedRes.ok) {
          const embedJson = await embedRes.json();
          const embedding = embedJson.data?.[0]?.embedding;
          if (embedding) {
            const { data: chunks } = await sb.rpc("match_knowledge_chunks", {
              query_embedding: embedding,
              match_user_id:   userId,
              match_count:     8,
              match_threshold: 0.40,
            });

            const relevant = (chunks ?? [])
              .filter((c: Record<string, unknown>) => kbDocIds.includes(c.document_id as string))
              .slice(0, 3);

            if (relevant.length > 0) {
              kbCtx = "\n\n## KIẾN THỨC NỀN TỪ KNOWLEDGE BASE\n"
                + "(Dùng làm ngữ cảnh phân tích, không trích dẫn [ref:N] cho phần này)\n"
                + (relevant as Record<string, unknown>[]).map(c => `---\n${c.content}`).join("\n");
              console.log(`[scheduler] KB RAG: ${relevant.length} chunks found for agent ${agentId}`);
            }
          }
        }
      } catch (kbErr) {
        console.error(`[scheduler] KB RAG error:`, kbErr);
      }
    }

    // Build system prompt
    const basePrompt = (agent.system_prompt as string)?.trim() || "Bạn là trợ lý phân tích chứng khoán Việt Nam.";
    const portfolioNote = syms.length > 0
      ? `\n\nDANH MỤC CỦA NGƯỜI DÙNG: ${syms.join(", ")}
Dữ liệu đã được phân loại sẵn: "Tin ảnh hưởng nhiều cổ phiếu trong danh mục" = bài ảnh hưởng 2+ mã; "Tin riêng - [MÃ]" = bài chỉ ảnh hưởng mã đó. Hãy dùng đúng phân loại này khi viết output.`
      : "";
    const systemPrompt = basePrompt + portfolioNote + GROUNDING_RULES + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN
Ngày: ${new Date().toLocaleDateString("vi-VN",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Ho_Chi_Minh"})}
═══════════════════════════════════════
${priceCtx}${newsCtx}${financialsCtx}${insiderCtx}${kbCtx}
═══════════════════════════════════════`;

    const userMessage = syms.length > 0
      ? `Phân tích danh mục ${syms.join(", ")} CHỈ dựa trên NGUỒN DỮ LIỆU. Mọi số liệu phải có [ref:N]. Trả lời tiếng Việt.`
      : `Thực hiện nhiệm vụ CHỈ dựa trên NGUỒN DỮ LIỆU. Mọi số liệu phải có [ref:N]. Trả lời tiếng Việt.`;

    // Gọi LLM
    let { provider, apiModel } = MODEL_MAP[model] ?? DEFAULT_MODEL;
    if (provider === "anthropic" && !ANTHROPIC_API_KEY) { provider = "openai"; apiModel = "gpt-4o-mini"; }

    let fullOutput = "";
    let tokens = 0;

    if (provider === "anthropic" && ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: apiModel, max_tokens: 2000, temperature: 0, system: systemPrompt, messages: [{ role: "user", content: userMessage }] }),
      });
      if (res.ok) {
        const j = await res.json();
        fullOutput = j.content?.[0]?.text ?? "";
        tokens = (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0);
      }
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: apiModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }], max_tokens: 2000, temperature: 0 }),
      });
      if (res.ok) {
        const j = await res.json();
        fullOutput = j.choices?.[0]?.message?.content ?? "";
        tokens = j.usage?.total_tokens ?? 0;
      }
    }

    const durationMs = Date.now() - startedAt;

    // Extract title + summary
    const lines = fullOutput.split("\n").map(l => l.trim()).filter(Boolean);
    let title = agent.name as string;
    for (const l of lines) {
      const clean = l.replace(/^#+\s*/,"").replace(/\*\*/g,"").trim();
      if (clean.length >= 10) { title = clean.substring(0,100); break; }
    }
    const summary = fullOutput.replace(/\*\*/g,"").replace(/^#+\s*/gm,"").split("\n").filter(l=>l.trim()).slice(1,4).join(" ").substring(0,200) || title;

    // Persist run + brief
    await sb.from("agent_runs").update({
      status: "completed", output: fullOutput, tokens_used: tokens,
      duration_ms: durationMs, finished_at: new Date().toISOString(),
    }).eq("id", run.id);

    const refs = registry.toArray().filter(r => fullOutput.includes(`[ref:${r.index}]`));
    await sb.from("briefs").insert({
      user_id: userId, agent_id: agentId, agent_run_id: run.id,
      type: "daily_digest", title, summary, content: fullOutput,
      tickers: syms, is_read: false,
      refs, sources: refs.map(r => ({ type: "exchange", title: r.label, url: r.url })),
    });

    await sb.from("agents").update({ last_run_at: new Date().toISOString(), run_count: ((agent.run_count as number) ?? 0) + 1 }).eq("id", agentId);

    console.log(`[scheduler] Agent ${agentId} done — ${tokens} tokens, ${durationMs}ms`);

    // Gửi email nếu bật
    if (agent.email_notify && RESEND_API_KEY) {
      const { data: profile } = await sb.from("user_profiles").select("email").eq("user_id", userId).single();
      if (profile?.email) {
        await sendEmail(profile.email, agent.name as string, title, fullOutput).catch(console.error);
        console.log(`[scheduler] Email sent to ${profile.email}`);
      }
    }

  } catch (err) {
    console.error(`[scheduler] Agent ${agentId} failed:`, err);
    await sb.from("agent_runs").update({
      status: "failed", error: String(err), finished_at: new Date().toISOString(),
    }).eq("id", run.id);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const now = new Date().toISOString();
  console.log(`[scheduler] Triggered at ${now}`);

  // Tìm agents có next_run_at đã đến và status = active
  const { data: readyAgents, error } = await sb
    .from("agents")
    .select("*")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", now);

  if (error) {
    console.error("[scheduler] Query error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!readyAgents?.length) {
    console.log("[scheduler] No agents ready to run");
    return new Response(JSON.stringify({ ok: true, ran: 0 }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log(`[scheduler] ${readyAgents.length} agent(s) ready`);

  // Chạy từng agent và cập nhật next_run_at
  const results: string[] = [];
  for (const agent of readyAgents) {
    try {
      await runAgent(agent);

      // Tính next_run_at tiếp theo
      const schedCfg = parseSchedule(agent.schedule as string);
      const nextRunAt = schedCfg ? calcNextRunAt(schedCfg) : null;
      await sb.from("agents").update({ next_run_at: nextRunAt }).eq("id", agent.id);

      results.push(`${agent.id}: ok, next=${nextRunAt ?? "none"}`);
    } catch (err) {
      results.push(`${agent.id}: error — ${err}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, ran: readyAgents.length, results }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
