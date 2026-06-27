// ============================================================
// Supabase Edge Function: sync-news
// ------------------------------------------------------------
// Crawl tin Vietstock HÀNG NGÀY chạy TRÊN CLOUD (always-on, không phụ thuộc laptop).
// Đường GHI NHANH cho bảng news_articles mà AI Agent đọc.
//   • Đọc WATCHLIST động từ DB (active=true) → mở rộng phạm vi = thêm dòng, không sửa code.
//   • Lọc feed Vietstock theo watchlist (1 lần quét feed, KHÔNG gọi API per-ticker).
//   • Dedup theo NỘI DUNG (tiêu đề chuẩn hoá) — cross-URL/cross-run.
//   • Upsert on_conflict=url. Sentiment gán bằng heuristic từ khoá (nhẹ, không cần Gemini).
//
// Deploy:  supabase functions deploy sync-news --no-verify-jwt
// Secrets: supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
// Lịch:    đặt qua pg_cron (xem migration_pgcron_news.sql).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VIETSTOCK_API = "https://vietstock.vn/_Partials/GetStockNewsByMarketPaging";
const VIETSTOCK_SITE = "https://vietstock.vn";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Content-Type": "application/json; charset=UTF-8",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://vietstock.vn/chu-de/1-8/tat-ca.htm",
  "Origin": "https://vietstock.vn",
};
const ITEMS_PER_PAGE = 15;
const MAX_PAGES = 20;         // feed toàn thị trường rất nhiều tin; độ trễ cross-region cao → giới hạn nhỏ, chạy thường xuyên
const DAYS_BACK = 2;          // chạy 2-3×/ngày → mỗi lượt chỉ cần phủ tin mới
const FETCH_TIMEOUT_MS = 12000;   // chặn 1 trang treo
const WALL_BUDGET_MS = 80000;     // tổng thời gian tối đa (an toàn dưới giới hạn Edge)

// Tiêu đề chuẩn hoá (khớp normalize_title bên Python) → khoá chống trùng theo nội dung
function normalizeTitle(t: string): string {
  let s = (t || "").trim();
  s = s.replace(/^[A-Z]{2,4}\s*[:\-–]\s*/, "");   // bỏ tiền tố mã "HPG:"
  s = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}
async function titleHash(t: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeTitle(t));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const POS = ["lãi", "tăng", "kỷ lục", "vượt", "trúng thầu", "cổ tức", "mở rộng", "ký kết", "khởi công"];
const NEG = ["lỗ", "giảm", "nợ xấu", "sụt", "thua lỗ", "bị phạt", "điều tra", "rút", "thu hồi", "cảnh báo"];
function guessSentiment(title: string): string {
  const s = (title || "").toLowerCase();
  if (NEG.some((k) => s.includes(k))) return "AFFECTS_NEGATIVE";
  if (POS.some((k) => s.includes(k))) return "AFFECTS_POSITIVE";
  return "MENTIONS";
}

function parseVietstockTime(s: string): Date | null {
  // Vietstock trả "/Date(1718000000000)/" hoặc "dd/MM/yyyy HH:mm"
  const m = (s || "").match(/\/Date\((\d+)\)\//);
  if (m) return new Date(parseInt(m[1]));
  const d = (s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (d) return new Date(`${d[3]}-${d[2]}-${d[1]}T00:00:00Z`);
  return null;
}

Deno.serve(async () => {
  // SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY được Supabase TỰ TIÊM vào Edge Function
  // → KHÔNG cần set secret thủ công.
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) WATCHLIST động (fallback Top-10 nếu bảng trống)
  let watch = new Set<string>();
  try {
    const { data } = await sb.from("watchlist").select("ticker").eq("active", true);
    watch = new Set((data ?? []).map((r: any) => (r.ticker || "").toUpperCase()));
  } catch (_) { /* fallback dưới */ }
  if (watch.size === 0) {
    watch = new Set(["HPG", "VHM", "VIC", "VCB", "TCB", "BID", "MSN", "VNM", "MWG", "FPT"]);
  }

  // 2) content_hash gần đây → dedup cross-run
  const cutoff = new Date(Date.now() - DAYS_BACK * 864e5);
  const existing = new Set<string>();
  try {
    const { data } = await sb.from("news_articles").select("content_hash")
      .gte("published_at", cutoff.toISOString()).limit(3000);
    (data ?? []).forEach((r: any) => r.content_hash && existing.add(r.content_hash));
  } catch (_) { /* ok */ }

  // 3) Quét feed Vietstock, lọc watchlist, dedup (có timeout mỗi trang + ngân sách thời gian)
  const rows: any[] = [];
  const seen = new Set<string>();
  const t0 = Date.now();
  let pagesScanned = 0;
  let stop = false;
  for (let page = 1; page <= MAX_PAGES && !stop; page++) {
    if (Date.now() - t0 > WALL_BUDGET_MS) break;   // hết ngân sách → dừng, trả phần đã có
    let data: any;
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(VIETSTOCK_API, {
        method: "POST", headers: HEADERS, signal: ctl.signal,
        body: JSON.stringify({ item: ITEMS_PER_PAGE, martket: "1", row: page }),
      });
      data = await resp.json();
      clearTimeout(tm);
    } catch (_) { break; }
    pagesScanned = page;
    if (data?.Code !== 200 || !data?.Data?.length) break;

    for (const art of data.Data) {
      const pub = parseVietstockTime(art.PublishTime || "");
      if (!pub) continue;
      if (pub < cutoff) { stop = true; break; }
      const ticker = (art.StockCode || "").trim().toUpperCase();
      if (!watch.has(ticker)) continue;            // chỉ giữ mã trong watchlist
      const title = (art.Title || "").trim();
      let url = art.URL || "";
      if (url && !url.startsWith("http")) url = VIETSTOCK_SITE + url;
      if (!url || !title) continue;
      const chash = await titleHash(title);
      if (seen.has(chash) || existing.has(chash)) continue;   // dedup nội dung
      seen.add(chash);
      rows.push({
        url, title, source: "Vietstock", ticker,
        published_at: pub.toISOString(),
        sentiment: guessSentiment(title),
        close_price: art.ClosePrice ?? null,
        pct_change: art.PerChange ?? null,
        content_hash: chash,
      });
    }
  }

  // 4) Upsert theo lô
  let ok = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await sb.from("news_articles").upsert(batch, { onConflict: "url" });
    if (!error) ok += batch.length;
  }

  return new Response(
    JSON.stringify({
      watchlist: watch.size, pagesScanned, fetched: rows.length, upserted: ok,
      elapsedMs: Date.now() - t0,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
