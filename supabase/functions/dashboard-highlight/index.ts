/**
 * dashboard-highlight — Tổng hợp điểm nổi bật từ briefs của user.
 * Kết quả được cache vào bảng dashboard_highlights.
 * Chỉ gọi LLM khi có brief mới hơn lần tổng hợp cuối.
 *
 * POST (authenticated)
 * Body: { market: { gainers, losers, indices }, force?: boolean }
 * Response: {
 *   headlines, deep_summary, deep_brief_id,
 *   portfolio_impacts, watchlist_items,
 *   brief_refs, from_briefs, from_cache, generated_at
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Service-role client (bypasses RLS) để ghi cache
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Headline { text: string; source_name: string; source_url: string; symbols: string[]; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  let body: { market?: { gainers?: any[]; losers?: any[]; indices?: any[] }; force?: boolean } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const market = body.market ?? {};
  const force = body.force === true;

  const ok = (data: object) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    // ── 1. Tìm brief mới nhất của user ──────────────────────────────────────
    const { data: latestBriefRow } = await sbAdmin
      .from("briefs")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .in("type", ["daily_digest", "deep_research"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const latestBriefAt = latestBriefRow?.created_at ?? null;

    // ── 2. Kiểm tra cache ────────────────────────────────────────────────────
    if (!force && latestBriefAt) {
      const { data: cached } = await sbAdmin
        .from("dashboard_highlights")
        .select("data, latest_brief_at, generated_at")
        .eq("user_id", user.id)
        .single();

      if (cached && cached.latest_brief_at === latestBriefAt) {
        // Cache còn hợp lệ — trả về ngay, không gọi LLM
        return ok({ ...cached.data, from_cache: true });
      }
    }

    // ── 3. Load briefs để tổng hợp ──────────────────────────────────────────
    const [briefsRes, holdingsRes] = await Promise.all([
      sbAdmin
        .from("briefs")
        .select("id, title, summary, content, type, tickers, sources, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .in("type", ["daily_digest", "deep_research"])
        .order("created_at", { ascending: false })
        .limit(8),
      sbAdmin
        .from("portfolio_holdings")
        .select("symbol")
        .eq("user_id", user.id),
    ]);

    const briefs = briefsRes.data ?? [];
    const portfolioSymbols = (holdingsRes.data ?? []).map((h: any) => h.symbol as string);

    if (!briefs.length) {
      const result = {
        headlines: [],
        deep_summary: null,
        deep_brief_id: null,
        portfolio_impacts: buildMarketImpacts(market),
        watchlist_items: buildWatchlist(market),
        brief_refs: [],
        from_briefs: false,
        from_cache: false,
        generated_at: new Date().toISOString(),
      };
      return ok(result);
    }

    // ── 4. Parse daily_digest → headlines ────────────────────────────────────
    const headlines: Headline[] = [];
    let digestBrief: any = null;
    let deepBrief: any = null;

    for (const b of briefs) {
      if (b.type === "daily_digest" && !digestBrief) {
        digestBrief = b;
        try {
          const parsed = JSON.parse(b.content ?? "{}");
          for (const s of (parsed.sections ?? [])) {
            if (s.type !== "news_card") continue;
            if (!s.url) continue;
            const title: string = s.title ?? s.headline ?? "";
            // Bỏ qua company profile: title bắt đầu bằng "- " hoặc chứa "Hoạt động KD"
            if (!title || /^[-–—]\s/.test(title) || title.includes("Hoạt động KD")) continue;
            headlines.push({
              text: title,
              source_name: s.source ?? "",
              source_url: s.url ?? "",
              symbols: Array.isArray(s.affected_symbols) ? s.affected_symbols : [],
            });
            if (headlines.length >= 4) break;
          }
        } catch { /* ignore */ }
      }
      if (b.type === "deep_research" && !deepBrief) {
        deepBrief = b;
      }
    }

    // ── 5. Extract deep_research summary ─────────────────────────────────────
    let deepSummary: string | null = null;
    if (deepBrief) {
      const rawContent = deepBrief.content ?? "";

      const stripMd = (s: string) => s
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/\[ref:\d+\]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();

      const isGarbage = (s: string) =>
        !s || s.length < 25 ||
        /^(Hoạt động KD:|VCB -|HPG -|FPT -|- BCTC|Báo cáo tài chính|Giá cổ phiếu)/.test(s) ||
        /không phải tư vấn đầu tư|tư vấn đầu tư theo Luật/i.test(s) ||
        /^"/.test(s) ||    // quoted disclaimer
        s.includes("| ") || // markdown table
        s.endsWith(":");   // incomplete label

      // Thử 1: section "### Tóm tắt" trong content
      const sectionMatch = rawContent.match(/###\s*(?:\d+\.\s*)?(?:Tóm tắt|Executive Summary)[^\n]*\n+([\s\S]{30,400}?)(?=\n###|\n##|$)/i);
      if (sectionMatch) {
        const candidate = stripMd(sectionMatch[1])
          .replace(/^[-•]\s*/gm, "")
          .replace(/\n+/g, " ")
          .trim()
          .slice(0, 260);
        if (!isGarbage(candidate)) deepSummary = candidate;
      }

      // Thử 2: summary column — chỉ dùng nếu không có "- " prefix và sạch
      if (!deepSummary && deepBrief.summary) {
        const candidate = stripMd(deepBrief.summary)
          .replace(/^[-•]\s*/, "")
          .trim();
        if (!isGarbage(candidate)) deepSummary = candidate.slice(0, 260);
      }

      // Thử 3: câu văn đầu tiên có nghĩa trong content (không phải list/table/header)
      if (!deepSummary) {
        const lines = rawContent.split("\n");
        for (const line of lines) {
          const clean = stripMd(line.trim());
          if (
            clean.length > 40 &&
            !clean.startsWith("#") &&
            !clean.startsWith("-") &&
            !clean.startsWith("|") &&
            !clean.startsWith("*") &&
            !isGarbage(clean) &&
            clean.includes(" ") // phải là câu hoàn chỉnh
          ) {
            // Lấy đến hết câu đầu tiên (dấu chấm)
            const firstSentenceEnd = clean.search(/[.!?]/);
            deepSummary = firstSentenceEnd > 20
              ? clean.slice(0, firstSentenceEnd + 1)
              : clean.slice(0, 240);
            break;
          }
        }
      }
    }

    // ── 6. LLM: portfolio_impacts + watchlist_items + deep_summary (nếu cần) ──
    const headlineCtx = headlines.map(h => `- ${h.text}`).join("\n");
    const marketCtx = [
      ...(market.indices ?? []).map((i: any) => `${i.name}: ${i.value?.toLocaleString?.("vi-VN") ?? i.value} (${i.pct >= 0 ? "+" : ""}${i.pct?.toFixed?.(2) ?? ""}%)`),
      ...(market.gainers ?? []).slice(0, 3).map((g: any) => `Tăng: ${g.symbol} +${g.pct?.toFixed?.(2) ?? ""}%`),
      ...(market.losers ?? []).slice(0, 3).map((l: any) => `Giảm: ${l.symbol} ${l.pct?.toFixed?.(2) ?? ""}%`),
    ].join("\n");
    const portfolioCtx = portfolioSymbols.length
      ? `Danh mục người dùng: ${portfolioSymbols.join(", ")}`
      : "Chưa có danh mục";

    // Cắt đoạn đầu brief để LLM tóm tắt nếu extraction thủ công không ra kết quả sạch
    const deepContentCtx = deepBrief
      ? (deepBrief.content ?? "").slice(0, 1200)
      : null;
    const needLlmDeepSummary = !deepSummary && !!deepContentCtx;

    const systemPrompt = `Bạn là AI phân tích tài chính Việt Nam. Dựa vào dữ liệu bên dưới, hãy sinh JSON với các mục:
1. "portfolio_impacts": mảng 2-3 string — ý nghĩa của tin tức/phân tích với danh mục người dùng
2. "watchlist_items": mảng 2-3 string — điểm cần theo dõi (rủi ro, sự kiện sắp tới)${needLlmDeepSummary ? `
3. "deep_summary": string — tóm tắt 1-2 câu ngắn gọn nội dung chính của bản tin phân tích (không phải disclaimer, không phải công thức)` : ""}
Chỉ trả về JSON. Ngôn ngữ tiếng Việt. KHÔNG khuyến nghị mua/bán.`;

    const userPrompt = [
      `Thị trường:\n${marketCtx || "(không có)"}`,
      portfolioCtx,
      headlineCtx ? `\nTin tức bản tin:\n${headlineCtx}` : "",
      deepSummary ? `\nDeep Research:\n${deepSummary}` : "",
      needLlmDeepSummary ? `\nNội dung bản tin phân tích:\n${deepContentCtx}` : "",
    ].filter(Boolean).join("\n\n");

    let portfolioImpacts: string[] = [];
    let watchlistItems: string[] = [];

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          max_tokens: 500,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });
      const json = await res.json();
      const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
      portfolioImpacts = Array.isArray(parsed.portfolio_impacts) ? parsed.portfolio_impacts.slice(0, 3) : [];
      watchlistItems = Array.isArray(parsed.watchlist_items) ? parsed.watchlist_items.slice(0, 3) : [];
      if (needLlmDeepSummary && typeof parsed.deep_summary === "string" && parsed.deep_summary.length > 20) {
        deepSummary = parsed.deep_summary;
      }
    } catch { /* fallback below */ }

    if (!portfolioImpacts.length) portfolioImpacts = buildMarketImpacts(market);
    if (!watchlistItems.length) watchlistItems = buildWatchlist(market);

    // ── 7. Brief refs ────────────────────────────────────────────────────────
    const briefRefs = briefs.slice(0, 4).map(b => ({
      id: b.id, title: b.title, type: b.type, created_at: b.created_at,
    }));

    const result = {
      headlines,
      deep_summary: deepSummary,
      deep_brief_id: deepBrief?.id ?? null,
      portfolio_impacts: portfolioImpacts,
      watchlist_items: watchlistItems,
      brief_refs: briefRefs,
      from_briefs: true,
      from_cache: false,
      generated_at: new Date().toISOString(),
    };

    // ── 8. Lưu vào cache ─────────────────────────────────────────────────────
    await sbAdmin.from("dashboard_highlights").upsert({
      user_id: user.id,
      data: result,
      latest_brief_at: latestBriefAt,
      generated_at: result.generated_at,
    }, { onConflict: "user_id" });

    return ok(result);

  } catch (err) {
    console.error("dashboard-highlight error:", err);
    return ok({
      headlines: [],
      deep_summary: null,
      deep_brief_id: null,
      portfolio_impacts: buildMarketImpacts(market),
      watchlist_items: buildWatchlist(market),
      brief_refs: [],
      from_briefs: false,
      from_cache: false,
      generated_at: new Date().toISOString(),
    });
  }
});

function buildMarketImpacts(market: any): string[] {
  const impacts: string[] = [];
  if ((market.gainers ?? []).length) impacts.push(`${market.gainers[0].symbol} tăng mạnh ${market.gainers[0].pct?.toFixed?.(2)}% — cổ phiếu dẫn sóng phiên hôm nay`);
  if ((market.indices ?? []).length) impacts.push(`${market.indices[0].name} biến động ${market.indices[0].pct >= 0 ? "+" : ""}${market.indices[0].pct?.toFixed?.(2)}% — ảnh hưởng toàn danh mục`);
  if (!impacts.length) impacts.push("Chưa có bản tin AI trong 30 ngày. Hãy chạy agent để nhận phân tích tự động.");
  return impacts;
}

function buildWatchlist(market: any): string[] {
  const items: string[] = [];
  if ((market.losers ?? []).length) items.push(`${market.losers[0].symbol} giảm ${market.losers[0].pct?.toFixed?.(2)}% — theo dõi thanh khoản và ngưỡng hỗ trợ`);
  if ((market.losers ?? []).length > 1) items.push(`${market.losers[1].symbol} tiếp tục điều chỉnh — kiểm tra ngưỡng kỹ thuật`);
  if (!items.length) items.push("Theo dõi biến động thị trường và dòng vốn khối ngoại.");
  return items;
}
