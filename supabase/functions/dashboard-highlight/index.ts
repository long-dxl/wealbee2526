/**
 * dashboard-highlight — Điểm nổi bật + Ý nghĩa với danh mục + Cần theo dõi.
 *
 * THIẾT KẾ: KHÔNG gọi LLM. Toàn bộ dựa trên dữ liệu đã được 1 pipeline riêng
 * (news-scoring job) chấm điểm sẵn trong `market_news` (label, impact_score,
 * news_type, affected_symbols) — đọc lại hoàn toàn miễn phí, và nhanh hơn hẳn
 * so với chờ round-trip LLM (vài trăm ms so với 2-5s).
 *
 * Cân bằng chiều +/- khi xếp hạng (pickBalanced) và lọc trùng tiêu đề
 * (dedupeByTitle, kể cả loại trùng giữa "Điểm nổi bật" và "Cần theo dõi") để
 * tránh 1 câu chuyện chiếm nhiều suất hiển thị hoặc chỉ thấy 1 chiều rủi ro.
 *
 * POST (authenticated)
 * Response: {
 *   highlights: { title, source_name, source_url, impact_score, symbols, published_at }[]
 *   portfolio_insights: { symbol, price, pct, insight, insight_source, source_url, insight_at }[]
 *   watchlist: { title, source_name, source_url, impact_score, news_type, published_at }[]
 *   generated_at
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sbAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

const MACRO_TYPES = ["vi_mo", "vi_mo_dn", "thi_truong", "phap_ly"];
const NEWS_WINDOW_DAYS = 14;   // cửa sổ tin tức cho insight/watchlist — "không có tin mới thì giữ tin gần nhất"
const HIGHLIGHT_WINDOW_H = 48; // điểm nổi bật: tin trong 48h gần nhất
const PRICE_WINDOW_DAYS = 10;

interface NewsRow {
  title: string; source: string | null; article_url: string | null;
  impact_score: number | null; news_type: string | null;
  affected_symbols: string[] | null; published_at: string | null; created_at: string;
}

// Loại tin trùng tiêu đề (crawl trùng từ nhiều nguồn/nhiều lượt) — giữ dòng có
// published_at sớm nhất (tin gốc), tránh 1 câu chuyện chiếm nhiều suất hiển thị.
function dedupeByTitle(rows: NewsRow[]): NewsRow[] {
  const byKey = new Map<string, NewsRow>();
  for (const r of rows) {
    const key = r.title.trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, r); continue; }
    const rTime = new Date(r.published_at ?? r.created_at).getTime();
    const eTime = new Date(existing.published_at ?? existing.created_at).getTime();
    if (rTime < eTime) byKey.set(key, r);
  }
  return [...byKey.values()];
}

// Chọn top-N cân bằng 2 chiều tích cực/tiêu cực (không để 1 chiều chiếm hết chỉ
// vì tình cờ |impact_score| lớn hơn) — chuyên gia tài chính cần thấy cả rủi ro
// lẫn cơ hội, không chỉ chiều nào "ồn ào" hơn hôm đó.
function pickBalanced(rows: NewsRow[], n: number): NewsRow[] {
  const pos = rows.filter(r => (r.impact_score ?? 0) > 0).sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0));
  const neg = rows.filter(r => (r.impact_score ?? 0) < 0).sort((a, b) => (a.impact_score ?? 0) - (b.impact_score ?? 0));
  const zero = rows.filter(r => (r.impact_score ?? 0) === 0);

  const half = Math.floor(n / 2);
  const picked: NewsRow[] = [...pos.slice(0, half), ...neg.slice(0, n - half)];
  if (picked.length < n) {
    const used = new Set(picked);
    const rest = [...pos, ...neg, ...zero]
      .filter(r => !used.has(r))
      .sort((a, b) => Math.abs(b.impact_score ?? 0) - Math.abs(a.impact_score ?? 0));
    picked.push(...rest.slice(0, n - picked.length));
  }
  return picked.sort((a, b) => Math.abs(b.impact_score ?? 0) - Math.abs(a.impact_score ?? 0)).slice(0, n);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const ok = (data: object) => new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const now = Date.now();
    const newsWindowIso = new Date(now - NEWS_WINDOW_DAYS * 24 * 3600_000).toISOString();
    const highlightWindowIso = new Date(now - HIGHLIGHT_WINDOW_H * 3600_000).toISOString();
    const priceWindowStr = new Date(now - PRICE_WINDOW_DAYS * 24 * 3600_000).toISOString().slice(0, 10);

    const { data: holdings } = await sbAdmin.from("portfolio_holdings").select("symbol").eq("user_id", user.id);
    const portfolioSymbols = [...new Set((holdings ?? []).map((h: any) => h.symbol as string))];

    const [priceRes, portfolioNewsRes, reportsRes, highlightNewsRes, macroNewsRes] = await Promise.all([
      portfolioSymbols.length
        ? sbAdmin.from("prices_daily").select("symbol,date,close")
            .in("symbol", portfolioSymbols).gte("date", priceWindowStr)
            .order("date", { ascending: false }).order("id", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      // 1 query cho TẤT CẢ mã danh mục (tránh N+1) — overlaps = affected_symbols giao với danh mục
      portfolioSymbols.length
        ? sbAdmin.from("market_news").select("title,source,article_url,impact_score,news_type,affected_symbols,published_at,created_at")
            .neq("label", "trash").not("label", "is", null)
            .overlaps("affected_symbols", portfolioSymbols)
            .gte("created_at", newsWindowIso)
            .order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] as any[] }),
      portfolioSymbols.length
        ? sbAdmin.from("analyst_reports").select("ticker,title,source_firm,recommendation,target_price,report_date,pdf_url")
            .in("ticker", portfolioSymbols).order("report_date", { ascending: false, nullsFirst: false }).limit(100)
        : Promise.resolve({ data: [] as any[] }),
      sbAdmin.from("market_news").select("title,source,article_url,impact_score,news_type,affected_symbols,published_at,created_at")
        .neq("label", "trash").not("label", "is", null)
        .gte("created_at", highlightWindowIso)
        .order("created_at", { ascending: false }).limit(200),
      sbAdmin.from("market_news").select("title,source,article_url,impact_score,news_type,affected_symbols,published_at,created_at")
        .neq("label", "trash").not("label", "is", null)
        .in("news_type", MACRO_TYPES)
        .gte("created_at", highlightWindowIso)
        .order("created_at", { ascending: false }).limit(200),
    ]);

    // ── Giá % hôm nay mỗi mã (mỗi mã tự lấy 2 ngày gần nhất của riêng nó) ──
    const bySym: Record<string, any[]> = {};
    (priceRes.data ?? []).forEach((p: any) => (bySym[p.symbol] ??= []).push(p));
    const priceMap: Record<string, { price: number; pct: number }> = {};
    for (const sym of Object.keys(bySym)) {
      const rows = bySym[sym];
      const latest = rows[0], prev = rows[1];
      const pct = prev && Number(prev.close) > 0 ? ((Number(latest.close) - Number(prev.close)) / Number(prev.close)) * 100 : 0;
      priceMap[sym] = { price: Number(latest.close), pct };
    }

    // ── Insight mỗi mã: ưu tiên tin CHUYÊN BIỆT cho đúng mã đó (ít mã được gắn
    // cùng lúc) trước, impact_score chỉ dùng để xếp hạng NỘI BỘ trong từng nhóm
    // — tránh tin vĩ mô gắn hàng chục mã cùng lúc (impact_score cao, nhưng
    // không hề "riêng" cho mã này) luôn thắng và đè lên tin chuyên biệt mới
    // hơn/liên quan hơn. Fallback: báo cáo phân tích gần nhất.
    const SPECIFIC_MAX_SYMBOLS = 2;
    const newsBySym: Record<string, NewsRow[]> = {};
    dedupeByTitle(portfolioNewsRes.data ?? []).forEach((n: NewsRow) => {
      for (const s of n.affected_symbols ?? []) {
        if (portfolioSymbols.includes(s)) (newsBySym[s] ??= []).push(n);
      }
    });
    const reportBySym: Record<string, any> = {};
    (reportsRes.data ?? []).forEach((r: any) => { if (!reportBySym[r.ticker]) reportBySym[r.ticker] = r; }); // đã order desc report_date

    const portfolioInsights = portfolioSymbols.map(sym => {
      const price = priceMap[sym] ?? { price: 0, pct: 0 };
      const newsForSym = (newsBySym[sym] ?? []).slice().sort((a, b) => {
        const aSpecific = (a.affected_symbols?.length ?? 99) <= SPECIFIC_MAX_SYMBOLS;
        const bSpecific = (b.affected_symbols?.length ?? 99) <= SPECIFIC_MAX_SYMBOLS;
        if (aSpecific !== bSpecific) return aSpecific ? -1 : 1; // tin chuyên biệt luôn ưu tiên trước
        return Math.abs(b.impact_score ?? 0) - Math.abs(a.impact_score ?? 0);
      });
      const topNews = newsForSym[0];
      let insight: string | null = null, insightSource: string | null = null, sourceUrl: string | null = null, insightAt: string | null = null;
      if (topNews) {
        insight = topNews.title;
        insightSource = topNews.source;
        sourceUrl = topNews.article_url;
        insightAt = topNews.published_at ?? topNews.created_at;
      } else {
        const rep = reportBySym[sym];
        if (rep) {
          insight = rep.title ?? (rep.recommendation && rep.target_price
            ? `Khuyến nghị ${rep.recommendation}, giá mục tiêu ${Number(rep.target_price).toLocaleString("vi-VN")}đ`
            : null);
          insightSource = rep.source_firm ?? "Báo cáo phân tích";
          sourceUrl = rep.pdf_url ?? null;
          insightAt = rep.report_date;
        }
      }
      return { symbol: sym, price: price.price, pct: price.pct, insight, insight_source: insightSource, source_url: sourceUrl, insight_at: insightAt };
    }).sort((a, b) => b.pct - a.pct);

    // ── Điểm nổi bật: top tin tác động lớn 48h gần nhất, cân bằng tích cực/tiêu cực, lọc trùng ──
    const highlightCandidates = dedupeByTitle(highlightNewsRes.data ?? []);
    const highlights = pickBalanced(highlightCandidates, 4).map((n: NewsRow) => ({
      title: n.title, source_name: n.source, source_url: n.article_url,
      impact_score: n.impact_score, symbols: n.affected_symbols ?? [], published_at: n.published_at ?? n.created_at,
    }));
    const highlightTitles = new Set(highlights.map(h => h.title.trim().toLowerCase()));

    // ── Cần theo dõi: tin vĩ mô/liên ngành tác động lớn, cân bằng dấu, loại trùng
    // với "Điểm nổi bật" ở trên (tránh 1 tin xuất hiện 2 lần trong cùng 1 card) ──
    const watchlistCandidates = dedupeByTitle(macroNewsRes.data ?? [])
      .filter(n => !highlightTitles.has(n.title.trim().toLowerCase()));
    const watchlist = pickBalanced(watchlistCandidates, 3).map((n: NewsRow) => ({
      title: n.title, source_name: n.source, source_url: n.article_url,
      impact_score: n.impact_score, news_type: n.news_type, published_at: n.published_at ?? n.created_at,
    }));

    return ok({ highlights, portfolio_insights: portfolioInsights, watchlist, generated_at: new Date().toISOString() });

  } catch (err) {
    console.error("dashboard-highlight error:", err);
    return ok({ highlights: [], portfolio_insights: [], watchlist: [], generated_at: new Date().toISOString() });
  }
});
