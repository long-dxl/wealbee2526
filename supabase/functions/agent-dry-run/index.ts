/**
 * agent-dry-run — Preview agent output (no DB write, no email)
 *
 * POST { templateId?, systemPrompt?, model?, watchSymbols?: string[] }
 * - daily_digest  → { output: string, tokensUsed, refs }
 * - deep_research → { output: string, tokensUsed, targetSymbol, refs }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasCredits, deduct } from "../_shared/credits.ts";
import { SourceRegistry } from "../_shared/source-registry.ts";
import { CORS } from "../_shared/cors.ts";
import { buildFinancialsContext, buildInsiderContext } from "../_shared/context-builders.ts";
import { GROUNDING_RULES_DEEP, GROUNDING_RULES_DAILY, DEFAULT_DAILY_DIGEST_PROMPT } from "../_shared/prompts.ts";
import { getModelConfig, isProviderAvailable } from "../_shared/llm-adapter.ts";
import { ProviderLLMRuntime } from "../_shared/llm-runtime.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_RUNTIME = new ProviderLLMRuntime();

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function completeDryRun(modelId: string, system: string, user: string) {
  const model = getModelConfig(modelId);
  if (!isProviderAvailable(model.provider)) throw new Error(`${model.provider} chưa được cấu hình API key`);
  const result = await LLM_RUNTIME.complete({
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0,
  });
  return {
    output: result.content,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
    tokensIn: result.usage.inputTokens,
    tokensOut: result.usage.outputTokens,
    cachedIn: result.usage.cachedInputTokens,
  };
}

// ── Shared: SourceRegistry, CORS, buildFinancialsContext, buildInsiderContext,
//    GROUNDING_RULES_DEEP, GROUNDING_RULES_DAILY, DEFAULT_DAILY_DIGEST_PROMPT
//    → đã extract vào _shared/ (source-registry, cors, context-builders, prompts) ─

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

  const groundedSystemPrompt = (systemPrompt.trim() || DEFAULT_DAILY_DIGEST_PROMPT) + GROUNDING_RULES_DAILY + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN — CHỈ DÙNG CÁC SỐ LIỆU NÀY
Ngày phân tích: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}
═══════════════════════════════════════
${lines.join("\n")}
═══════════════════════════════════════
HẾT NGUỒN DỮ LIỆU — KHÔNG ĐƯỢC DÙNG BẤT KỲ SỐ LIỆU NÀO NGOÀI PHẦN TRÊN
═══════════════════════════════════════`;

  const userMessage = `Tạo bản tin hàng ngày theo đúng yêu cầu đã cấu hình. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

  return { ...await completeDryRun(model, groundedSystemPrompt, userMessage), refs: registry.toArray() };
}

// ── Deep research dry-run (with real DB data) ─────────────────────────────────

async function runDeepResearchDry(
  rawSystemPrompt: string,
  targetSymbol: string,
  model: string,
  tools?: string[],
): Promise<{ output: string; tokensUsed: number; refs: Array<{ index: number; label: string; url: string }> }> {
  const sym = targetSymbol.toUpperCase();

  // Strip __TARGET_SYMBOL__ header from prompt (same as run-agent)
  const SYM_PREFIX = "__TARGET_SYMBOL__: ";
  const firstLine = rawSystemPrompt.split("\n")[0] ?? "";
  const cleanPrompt = firstLine.startsWith(SYM_PREFIX)
    ? rawSystemPrompt.replace(/^__TARGET_SYMBOL__:[^\n]*\n\n?/, "").trim()
    : rawSystemPrompt.trim();

  // Fetch real data from DB — gate theo `tools` giống hệt run-agent, để "Chạy thử"
  // phản ánh đúng những gì "Chạy ngay" sẽ làm (trước đây gọi vô điều kiện, không gate).
  const registry = new SourceRegistry();
  const enabledTools = tools ?? [];
  const financialsCtx = enabledTools.includes("financials") ? await buildFinancialsContext(sb, sym, registry, "full", true) : "";
  const insiderCtx = enabledTools.includes("insider_trades") ? await buildInsiderContext(sb, sym, registry) : "";

  // Build grounded system prompt (same pattern as run-agent)
  const groundedSystemPrompt = cleanPrompt + GROUNDING_RULES_DEEP + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN — CHỈ DÙNG CÁC SỐ LIỆU NÀY
Ngày phân tích: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}
═══════════════════════════════════════
${financialsCtx}${insiderCtx}
═══════════════════════════════════════
HẾT NGUỒN DỮ LIỆU — KHÔNG ĐƯỢC DÙNG BẤT KỲ SỐ LIỆU NÀO NGOÀI PHẦN TRÊN
═══════════════════════════════════════`;

  const userMessage = `Phân tích cổ phiếu **${sym}** CHỈ dựa trên NGUỒN DỮ LIỆU XÁC NHẬN ở trên. Với chỉ tiêu nào KHÔNG có trong dữ liệu → bỏ qua hoàn toàn. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

  return { ...await completeDryRun(model, groundedSystemPrompt, userMessage), refs: registry.toArray() };
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

  const selectedModel = model ?? "gpt-4o-mini";

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
      const { output, tokensUsed, tokensIn, tokensOut, cachedIn, refs } = await runDeepResearchDry(prompt, targetSymbol, selectedModel, tools);
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
    const { output, tokensUsed, tokensIn, tokensOut, cachedIn, refs } = await runDailyDigestDry(systemPrompt ?? "", watchSymbols, selectedModel);
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
