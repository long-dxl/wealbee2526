/**
 * agent-dry-run — Preview agent output (no DB write, no email)
 *
 * POST { templateId?, systemPrompt?, model?, watchSymbols?: string[] }
 * - daily_digest  → { brief: BriefOutput, tokensUsed }
 * - deep_research → { output: string, tokensUsed, targetSymbol }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchNewsAndBuildData,
  buildSystemPrompt,
  generateBrief,
  DEFAULT_USER_PROMPT,
} from "../_shared/generate-brief.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY  = Deno.env.get("OPENAI_API_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Helpers (mirrors run-agent) ───────────────────────────────────────────────

const faUrl = (sym: string) => `https://fireant.vn/ma-chung-khoan/${sym}`;

class SourceRegistry {
  private list: Array<{ label: string; url: string }> = [];
  add(label: string, url: string): string {
    const existing = this.list.findIndex(s => s.url === url);
    if (existing !== -1) return `[ref:${existing + 1}]`;
    this.list.push({ label, url });
    return `[ref:${this.list.length}]`;
  }
  toArray() { return this.list.map((s, i) => ({ index: i + 1, ...s })); }
}

// ── Build financials context (identical to run-agent's buildFinancialsContext) ─

async function buildFinancialsContext(symbol: string, registry: SourceRegistry): Promise<string> {
  const sym = symbol.toUpperCase();
  const lines: string[] = [`\n## Dữ liệu tài chính: ${sym}`];

  try {
    const { data: fins } = await sb
      .from("financials_annual")
      .select("year,revenue,net_profit,eps,pe_ratio,pb_ratio,roe,roa,debt_to_equity")
      .eq("symbol", sym)
      .order("year", { ascending: false })
      .limit(4);

    if (fins?.length) {
      const countFields = (f: (typeof fins)[0]) =>
        [f.revenue, f.net_profit, f.eps, f.pe_ratio, f.pb_ratio, f.roe, f.roa, f.debt_to_equity]
          .filter(v => v != null).length;
      const qualifiedRows = fins.filter(f => countFields(f) >= 3);
      if (qualifiedRows.length === 0) {
        lines.push(`\n*Không có số liệu tài chính chi tiết cho ${sym} trong hệ thống. Không được tự ước tính các chỉ số tài chính.*`);
      } else {
        const ref = registry.add("BCTC", faUrl(sym));
        lines.push(`\n### Kết quả tài chính theo năm ${ref}`);
        lines.push("| Năm | Doanh thu (tỷ) | LNST (tỷ) | EPS | P/E | P/B | ROE | ROA | D/E |");
        lines.push("|-----|---------------|-----------|-----|-----|-----|-----|-----|-----|");
        for (const f of qualifiedRows) {
          const rev = f.revenue        != null ? (Number(f.revenue)    / 1e9).toFixed(0) : "—";
          const np  = f.net_profit     != null ? (Number(f.net_profit) / 1e9).toFixed(0) : "—";
          const eps = f.eps            != null ? Number(f.eps).toLocaleString("vi-VN")    : "—";
          const pe  = f.pe_ratio       != null ? Number(f.pe_ratio).toFixed(1)            : "—";
          const pb  = f.pb_ratio       != null ? Number(f.pb_ratio).toFixed(2)            : "—";
          const roe = f.roe            != null ? (Number(f.roe) * 100).toFixed(1) + "%"   : "—";
          const roa = f.roa            != null ? (Number(f.roa) * 100).toFixed(2) + "%"   : "—";
          const de  = f.debt_to_equity != null ? Number(f.debt_to_equity).toFixed(2)      : "—";
          lines.push(`| ${f.year} | ${rev} | ${np} | ${eps} | ${pe} | ${pb} | ${roe} | ${roa} | ${de} |`);
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const { data: divs } = await sb
      .from("dividends")
      .select("ex_date,dividend_type,amount,payment_date")
      .eq("symbol", sym)
      .order("ex_date", { ascending: false })
      .limit(6);

    if (divs?.length) {
      const ref = registry.add("Cổ tức", faUrl(sym));
      lines.push(`\n### Lịch sử cổ tức ${ref}`);
      for (const d of divs) {
        const typeLabel = d.dividend_type === "cash" ? "tiền mặt" : "cổ phiếu";
        const amtLabel  = d.dividend_type === "cash"
          ? `${Number(d.amount).toLocaleString("vi-VN")} đ/CP`
          : `${(Number(d.amount) * 100).toFixed(1)}%`;
        lines.push(`- ${d.ex_date}: ${typeLabel} ${amtLabel}${d.payment_date ? ` (thanh toán ${d.payment_date})` : ""}`);
      }
    }
  } catch { /* ignore */ }

  try {
    const { data: ins } = await sb
      .from("insider_transactions")
      .select("trade_date,insider_name,trade_type,volume")
      .eq("symbol", sym)
      .order("trade_date", { ascending: false })
      .limit(8);

    if (ins?.length) {
      const ref = registry.add("Insider", faUrl(sym));
      lines.push(`\n### Giao dịch nội bộ gần đây ${ref}`);
      for (const t of ins) {
        const vol = t.volume ? `${Number(t.volume).toLocaleString("vi-VN")} CP` : "";
        lines.push(`- ${t.trade_date}: ${t.insider_name} **${t.trade_type === "buy" ? "MUA" : "BÁN"}** ${vol}`);
      }
    }
  } catch { /* ignore */ }

  // Latest news about this symbol
  try {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    const { data: newsRows } = await sb
      .from("market_news")
      .select("title,article_url,published_at,source,content_summary,impact_score,label")
      .contains("affected_symbols", [sym])
      .gte("published_at", since)
      .not("label", "is", null)
      .neq("label", "trash")
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(5);

    if (newsRows?.length) {
      lines.push(`\n### Tin tức gần đây (48h)`);
      for (const n of newsRows) {
        const ref = n.article_url ? ` ${registry.add(n.source ?? "Tin tức", n.article_url)}` : "";
        lines.push(`- **${n.title}**${ref} (${n.label}) — ${n.published_at?.substring(0, 10)}`);
        const summary = n.content_summary;
        const summaryText = Array.isArray(summary) ? summary[0] : (typeof summary === "string" ? summary.split("\n")[0] : "");
        if (summaryText) lines.push(`  ${summaryText}`);
      }
    }
  } catch { /* ignore */ }

  return lines.length > 1 ? lines.join("\n") : `\nKhông có dữ liệu tài chính cho ${sym} trong DB.`;
}

// ── Anti-hallucination grounding rules (identical to run-agent) ───────────────

const GROUNDING_RULES = `

## ══ QUY TẮC BẮT BUỘC TUYỆT ĐỐI ══

**ĐỊNH DẠNG OUTPUT — BẮT BUỘC**
- Chỉ dùng **Markdown thuần** (##, ###, -, **, *italic*)
- TUYỆT ĐỐI KHÔNG dùng HTML tags

**CHỈ VIẾT NHỮNG GÌ CÓ TRONG DỮ LIỆU — QUY TẮC CỐT LÕI**
- Chỉ được đề cập đến thông tin, số liệu XUẤT HIỆN TRỰC TIẾP trong phần "NGUỒN DỮ LIỆU" bên dưới
- Nếu một chủ đề KHÔNG có trong dữ liệu → **bỏ qua hoàn toàn**, không nhắc đến
- KHÔNG dùng kiến thức nền, KHÔNG ước tính, KHÔNG nội suy từ training data

**TRÍCH DẪN NGUỒN — BẮT BUỘC VỚI MỌI SỐ LIỆU**
- Mỗi con số, phần trăm, giá trị cụ thể PHẢI có token [ref:N] liền sau
- Token [ref:N] đã có sẵn trong NGUỒN DỮ LIỆU — chỉ được dùng những ref đó

**TUÂN THỦ PHÁP LÝ**
- KHÔNG khuyến nghị mua/bán bất kỳ cổ phiếu nào
- Cuối output PHẢI có: *"Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019"*`;

// ── Model map ─────────────────────────────────────────────────────────────────

function resolveModel(model?: string): string {
  const MAP: Record<string, string> = {
    "gpt-4o-mini":   "gpt-4o-mini",
    "gpt-4o":        "gpt-4o",
    "claude-sonnet": "gpt-4o",
    "claude-opus":   "gpt-4o",
    "gemini-pro":    "gpt-4o-mini",
    "gemini-flash":  "gpt-4o-mini",
  };
  return MAP[model ?? ""] ?? "gpt-4o-mini";
}

// ── Deep research dry-run (with real DB data) ─────────────────────────────────

async function runDeepResearchDry(
  rawSystemPrompt: string,
  targetSymbol: string,
  model: string,
): Promise<{ output: string; tokensUsed: number; refs: Array<{ index: number; label: string; url: string }> }> {
  const sym = targetSymbol.toUpperCase();

  // Strip __TARGET_SYMBOL__ header from prompt (same as run-agent)
  const SYM_PREFIX = "__TARGET_SYMBOL__: ";
  const firstLine = rawSystemPrompt.split("\n")[0] ?? "";
  const cleanPrompt = firstLine.startsWith(SYM_PREFIX)
    ? rawSystemPrompt.replace(/^__TARGET_SYMBOL__:[^\n]*\n\n?/, "").trim()
    : rawSystemPrompt.trim();

  // Fetch real data from DB
  const registry = new SourceRegistry();
  const financialsCtx = await buildFinancialsContext(sym, registry);

  // Build grounded system prompt (same pattern as run-agent)
  const groundedSystemPrompt = cleanPrompt + GROUNDING_RULES + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN — CHỈ DÙNG CÁC SỐ LIỆU NÀY
Ngày phân tích: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}
═══════════════════════════════════════
${financialsCtx}
═══════════════════════════════════════
HẾT NGUỒN DỮ LIỆU — KHÔNG ĐƯỢC DÙNG BẤT KỲ SỐ LIỆU NÀO NGOÀI PHẦN TRÊN
═══════════════════════════════════════`;

  const userMessage = `Phân tích cổ phiếu **${sym}** CHỈ dựa trên NGUỒN DỮ LIỆU XÁC NHẬN ở trên. Với chỉ tiêu nào KHÔNG có trong dữ liệu → bỏ qua hoàn toàn. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 3000,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: groundedSystemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) throw new Error(`GPT API error: ${await res.text()}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let tokensUsed = 0;
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = leftover + decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    leftover = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) accumulated += delta;
        if (parsed.usage?.total_tokens) tokensUsed = parsed.usage.total_tokens;
      } catch { /* skip */ }
    }
  }

  return { output: accumulated, tokensUsed, refs: registry.toArray() };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => ({}));
  const { templateId = "daily_digest", systemPrompt, model, watchSymbols: bodySymbols } = body;

  const gptModel = resolveModel(model);

  // ── Deep research ─────────────────────────────────────────────────────────
  if (templateId !== "daily_digest") {
    // Resolve target symbol: from watchSymbols, or from __TARGET_SYMBOL__ header in prompt
    let targetSymbol: string | undefined = (bodySymbols ?? [])[0];
    if (!targetSymbol && systemPrompt) {
      const firstLine = (systemPrompt as string).split("\n")[0] ?? "";
      if (firstLine.startsWith("__TARGET_SYMBOL__: ")) {
        targetSymbol = firstLine.slice("__TARGET_SYMBOL__: ".length).trim();
      }
    }
    if (!targetSymbol) {
      return new Response(JSON.stringify({ error: "Cần chọn ít nhất 1 mã cổ phiếu để chạy thử." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const prompt = systemPrompt ?? "Bạn là chuyên gia phân tích chứng khoán Việt Nam. Phân tích mã __TARGET_SYMBOL__.";
    try {
      const { output, tokensUsed, refs } = await runDeepResearchDry(prompt, targetSymbol, gptModel);
      return new Response(JSON.stringify({ output, tokensUsed, targetSymbol, refs }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }

  // ── Daily digest ──────────────────────────────────────────────────────────
  let watchSymbols: string[] = bodySymbols ?? [];
  if (!watchSymbols.length) {
    let { data: sub } = await sb.from("digest_subscribers").select("watch_symbols").eq("user_id", user.id).maybeSingle();
    if (!sub && user.email) {
      const r = await sb.from("digest_subscribers").select("watch_symbols").eq("email", user.email).maybeSingle();
      sub = r.data;
    }
    watchSymbols = sub?.watch_symbols ?? [];
  }

  if (!watchSymbols.length) {
    return new Response(JSON.stringify({ error: "Không có mã theo dõi. Vui lòng thêm mã vào watchlist." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const { dataForLLM } = await fetchNewsAndBuildData(sb, watchSymbols);
  const fullPrompt = buildSystemPrompt(systemPrompt ?? DEFAULT_USER_PROMPT);

  try {
    const { brief, tokensUsed } = await generateBrief(OPENAI_API_KEY, fullPrompt, dataForLLM, gptModel);
    return new Response(JSON.stringify({ brief, tokensUsed, _debug: { watchSymbols, hasNews: (dataForLLM as any).hasNews } }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
