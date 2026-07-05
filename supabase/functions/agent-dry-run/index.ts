/**
 * agent-dry-run — Preview agent output (no DB write, no email)
 *
 * POST { templateId?, systemPrompt?, model?, watchSymbols?: string[] }
 * - daily_digest  → { output: string, tokensUsed, refs }
 * - deep_research → { output: string, tokensUsed, targetSymbol, refs }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { financialReport, TYPE_LABEL } from "../_shared/financial-report.ts";
import { hasCredits, deduct } from "../_shared/credits.ts";

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

  // Báo cáo tài chính chi tiết: IS/BS/CF + chỉ số RIÊNG theo loại hình + KQKD quý gần nhất
  try {
    const { data: tk } = await sb.from("tickers").select("company_type").eq("symbol", sym).single();
    const ctype = tk?.company_type ?? "normal";
    const report = await financialReport(sb, sym, ctype);
    if (report.trim()) {
      const ref = registry.add("BCTC", faUrl(sym));
      lines.push(`\n### Báo cáo tài chính (${TYPE_LABEL[ctype] ?? ctype}) ${ref}`);
      lines.push(report);
    } else {
      lines.push(`\n*Không có số liệu tài chính chi tiết cho ${sym} trong hệ thống. Không được tự ước tính các chỉ số tài chính.*`);
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

// Used for deep_research — includes strict Markdown format constraint
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

// Used for daily_digest — no format constraint so user's prompt controls the structure
const GROUNDING_RULES_DATA_ONLY = `

## ══ QUY TẮC BẮT BUỘC ══

**CHỈ VIẾT NHỮNG GÌ CÓ TRONG DỮ LIỆU — QUY TẮC CỐT LÕI**
- Chỉ được đề cập đến thông tin, số liệu XUẤT HIỆN TRỰC TIẾP trong NGUỒN DỮ LIỆU bên dưới
- Nếu một chủ đề KHÔNG có trong dữ liệu → bỏ qua hoàn toàn, không nhắc đến
- KHÔNG dùng kiến thức nền, KHÔNG ước tính, KHÔNG nội suy từ training data

**TRÍCH DẪN NGUỒN — BẮT BUỘC VỚI MỌI SỐ LIỆU**
- Mỗi con số, phần trăm, giá trị cụ thể PHẢI có token [ref:N] liền sau

**ĐỊNH DẠNG MÀU SẮC — KHI NGƯỜI DÙNG YÊU CẦU TÔ MÀU**
- Dùng HTML inline: \`<span style="color:red">con số</span>\` cho màu đỏ
- Dùng \`<span style="color:green">con số</span>\` cho màu xanh, tương tự với các màu khác
- CHỈ wrap phần text cần tô màu, không wrap cả câu

**TUÂN THỦ PHÁP LÝ**
- KHÔNG khuyến nghị mua/bán bất kỳ cổ phiếu nào`;

// ── Model map ─────────────────────────────────────────────────────────────────

function resolveModel(_model?: string): string {
  // Chuẩn hóa toàn hệ thống: mọi lựa chọn model đều chạy gpt-4.1-mini
  // (ổn định output; Beeny trừ theo token thật).
  return "gpt-4.1-mini";
}

const DEFAULT_DAILY_DIGEST_PROMPT = `Bạn là trợ lý phân tích chứng khoán Wealbee. Nhiệm vụ: tạo bản tin thị trường hàng ngày.

Cấu trúc bản tin:
1. **Danh mục hôm nay** — mã nào có tin tức, mã nào không có tin gì
2. **Tin tức theo mã** — với từng mã có tin, tạo section riêng, liệt kê các tin kèm nguồn và ngày đăng
3. Disclaimer pháp lý

Nguyên tắc:
- Chỉ viết dữ liệu có trong NGUỒN DỮ LIỆU, KHÔNG bịa số liệu
- Mỗi số liệu phải có [ref:N] liền sau`;

// ── Daily digest dry-run (with real news from DB) ─────────────────────────────

async function runDailyDigestDry(
  systemPrompt: string,
  watchSymbols: string[],
  model: string,
): Promise<{ output: string; tokensUsed: number; refs: Array<{ index: number; label: string; url: string }> }> {
  const registry = new SourceRegistry();
  const syms = watchSymbols.map(s => s.toUpperCase());

  // Lấy tin theo ĐÚNG logic news_feed của run-agent (per-symbol limit 5 + global top 10)
  // để "chạy thử" có cùng độ phủ tin như "chạy thật".
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const baseQuery = () => sb
    .from("market_news")
    .select("title,content_summary,label,impact_score,affected_symbols,published_at,article_url,source")
    .not("label", "is", null)
    .neq("label", "trash")
    .gte("published_at", since);

  // Tin riêng theo từng mã (5 tin/mã)
  const symNewsMap = new Map<string, any[]>();
  const symNewsIds = new Set<string>();
  await Promise.all(syms.map(async (sym) => {
    const { data } = await baseQuery()
      .contains("affected_symbols", [sym])
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(5);
    if (data?.length) symNewsMap.set(sym, data);
  }));
  for (const rows of symNewsMap.values())
    for (const r of rows) if (r.article_url) symNewsIds.add(r.article_url);

  // Tin thị trường chung top-10 (loại trùng với tin theo mã)
  const { data: globalNews } = await baseQuery()
    .order("impact_score", { ascending: false, nullsFirst: false })
    .limit(10);

  const hasNews = new Set<string>([...symNewsMap.keys()]);
  const lines: string[] = [`\n## Tin tức thị trường (48h gần nhất)\nDanh mục theo dõi: ${syms.join(", ")}\n`];

  const pushItem = (n: any) => {
    const ref = n.article_url ? ` ${registry.add(n.source ?? "Tin tức", n.article_url)}` : "";
    const score = n.impact_score != null ? ` [tác động:${n.impact_score}]` : "";
    lines.push(`- ${n.title}${score}${ref} (${n.label}) — ${n.published_at?.substring(0, 10) ?? "?"}`);
    const summary = n.content_summary;
    const summaryText = Array.isArray(summary) ? summary[0] : (typeof summary === "string" ? summary.split("\n")[0] : "");
    if (summaryText) lines.push(`  ${summaryText}`);
  };

  if (symNewsMap.size > 0) {
    lines.push("\n## Tin tức liên quan đến mã theo dõi (48h)");
    for (const [sym, rows] of symNewsMap.entries()) {
      lines.push(`\n### ${sym}`);
      for (const n of rows) pushItem(n);
    }
  }

  const generalNews = (globalNews ?? []).filter(n => !symNewsIds.has(n.article_url ?? ""));
  if (generalNews.length > 0) {
    lines.push("\n## Tin tức thị trường chung (48h)");
    for (const n of generalNews.slice(0, 10)) pushItem(n);
  }

  const noNews = syms.filter(s => !hasNews.has(s));
  lines.push(`\n## Tóm tắt danh mục`);
  lines.push(`Có tin: ${hasNews.size > 0 ? [...hasNews].join(", ") : "(không có)"}`);
  lines.push(`Không có tin: ${noNews.length > 0 ? noNews.join(", ") : "(tất cả đều có tin)"}`);

  const groundedSystemPrompt = (systemPrompt.trim() || DEFAULT_DAILY_DIGEST_PROMPT) + GROUNDING_RULES_DATA_ONLY + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN — CHỈ DÙNG CÁC SỐ LIỆU NÀY
Ngày phân tích: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}
═══════════════════════════════════════
${lines.join("\n")}
═══════════════════════════════════════
HẾT NGUỒN DỮ LIỆU — KHÔNG ĐƯỢC DÙNG BẤT KỲ SỐ LIỆU NÀO NGOÀI PHẦN TRÊN
═══════════════════════════════════════`;

  const userMessage = `Tạo bản tin hàng ngày theo đúng yêu cầu đã cấu hình. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8000,
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
  let tokensIn = 0, tokensOut = 0, cachedIn = 0;
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = leftover + decoder.decode(value, { stream: true });
    const rawLines = chunk.split("\n");
    leftover = rawLines.pop() ?? "";
    for (const line of rawLines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) accumulated += delta;
        if (parsed.usage?.total_tokens) {
          tokensUsed = parsed.usage.total_tokens;
          tokensIn = parsed.usage.prompt_tokens ?? 0;
          tokensOut = parsed.usage.completion_tokens ?? 0;
          cachedIn = parsed.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }
      } catch { /* skip */ }
    }
  }

  return { output: accumulated, tokensUsed, tokensIn, tokensOut, cachedIn, refs: registry.toArray() };
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
      max_tokens: 8000,
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
  let tokensIn = 0, tokensOut = 0, cachedIn = 0;
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
        if (parsed.usage?.total_tokens) {
          tokensUsed = parsed.usage.total_tokens;
          tokensIn = parsed.usage.prompt_tokens ?? 0;
          tokensOut = parsed.usage.completion_tokens ?? 0;
          cachedIn = parsed.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }
      } catch { /* skip */ }
    }
  }

  return { output: accumulated, tokensUsed, tokensIn, tokensOut, cachedIn, refs: registry.toArray() };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  // ── CREDIT GATE: chạy thử cũng tốn API → cũng trừ credit ──
  const { ok: hasCr } = await hasCredits(sb, user.id);
  if (!hasCr) {
    return new Response(JSON.stringify({
      error: "Bạn đã hết Beeny hôm nay. Beeny sẽ được nạp lại vào ngày mai, hoặc nâng cấp gói để có thêm.",
      code: "not_enough_credits",
    }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const {
    templateId = "daily_digest",
    systemPrompt,
    model,
    watchSymbols: bodySymbols,
    agentId,
    agentName,
    tools,
  } = body;

  const saveSession = async (
    status: "success" | "error",
    output: string | null,
    tokensUsed: number,
    runTimeS: number,
    error?: string,
  ) => {
    try {
      await sb.from("agent_test_sessions").insert({
        user_id: user.id,
        agent_id: agentId ?? null,
        template_id: templateId,
        status,
        output,
        tokens_used: tokensUsed,
        run_time_s: runTimeS,
        error: error ?? null,
        config: {
          systemPrompt: systemPrompt ?? null,
          model: model ?? null,
          tools: tools ?? null,
          watchSymbols: bodySymbols ?? null,
          templateId,
          agentName: agentName ?? null,
        },
      });
    } catch { /* fire-and-forget: don't fail the response if save fails */ }
  };

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
    const t0 = Date.now();
    try {
      const { output, tokensUsed, tokensIn, tokensOut, cachedIn, refs } = await runDeepResearchDry(prompt, targetSymbol, gptModel);
      await saveSession("success", output, tokensUsed, (Date.now() - t0) / 1000);
      const charge = await deduct(sb, user.id, tokensIn, tokensOut, "chạy thử deep_research", cachedIn);
      return new Response(JSON.stringify({ output, tokensUsed, targetSymbol, refs, ...charge }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      await saveSession("error", null, 0, (Date.now() - t0) / 1000, String(err));
      return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }

  // ── Daily digest ──────────────────────────────────────────────────────────
  const watchSymbols: string[] = bodySymbols ?? [];

  if (!watchSymbols.length) {
    return new Response(JSON.stringify({ error: "Vui lòng thêm ít nhất 1 mã cổ phiếu vào danh sách theo dõi." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const t0 = Date.now();
  try {
    const { output, tokensUsed, tokensIn, tokensOut, cachedIn, refs } = await runDailyDigestDry(systemPrompt ?? "", watchSymbols, gptModel);
    await saveSession("success", output, tokensUsed, (Date.now() - t0) / 1000);
    const charge = await deduct(sb, user.id, tokensIn, tokensOut, "chạy thử daily_digest", cachedIn);
    return new Response(JSON.stringify({ output, tokensUsed, refs, ...charge }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    await saveSession("error", null, 0, (Date.now() - t0) / 1000, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
