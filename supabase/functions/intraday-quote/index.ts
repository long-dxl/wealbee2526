/**
 * intraday-quote — Nến 1 phút TRONG PHIÊN cho 1 mã, lấy trực tiếp từ DNSE
 * (entrade chart API, public không cần auth) mỗi khi user mở tab "1D" trên
 * chart nến (xem PriceChartLW) — KHÔNG lưu vào DB, chỉ trả về ngay cho FE vẽ.
 * Cùng nguồn/đơn vị với pipeline toolcrawldata/seed_prices_dnse.py: DNSE trả
 * giá theo NGHÌN đồng, nhân 1000 = VND.
 *
 * POST { symbol: string }
 * Response: { symbol, bars: { time, open, high, low, close, volume }[], asOf }
 *   time = unix giây (dùng thẳng làm UTCTimestamp cho lightweight-charts)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DNSE_BASE = "https://services.entrade.com.vn/chart-api/v2/ohlcs";
const DNSE_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36" };

// Mốc 00:00 giờ VN (UTC+7) của "hôm nay", quy về unix giây UTC — để chỉ lấy
// đúng nến phút của phiên hôm nay, không kéo cả hôm qua.
function todayStartVnUnix(): number {
  const nowVn = new Date(Date.now() + 7 * 3600_000);
  const y = nowVn.getUTCFullYear(), m = nowVn.getUTCMonth(), d = nowVn.getUTCDate();
  return Math.floor(Date.UTC(y, m, d, 0, 0, 0) / 1000) - 7 * 3600;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const ok  = (data: object) => new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });
  const bad = (msg: string, status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    if (!symbol) return bad("Thiếu symbol");
    if (!/^[A-Z0-9]{2,6}$/.test(symbol)) return bad("Mã không hợp lệ");

    const from = todayStartVnUnix();
    const to   = Math.floor(Date.now() / 1000) + 60;
    const url  = `${DNSE_BASE}/stock?from=${from}&to=${to}&symbol=${symbol}&resolution=1`;

    const r = await fetch(url, { headers: DNSE_HEADERS });
    if (!r.ok) return bad(`DNSE lỗi (${r.status})`, 502);
    const d = await r.json();

    const t: number[] = d.t ?? [], o: number[] = d.o ?? [], h: number[] = d.h ?? [];
    const l: number[] = d.l ?? [], c: number[] = d.c ?? [], v: number[] = d.v ?? [];
    const bars = t.map((time, i) => ({
      time,
      open:  Math.round(o[i] * 1000 * 100) / 100,
      high:  Math.round(h[i] * 1000 * 100) / 100,
      low:   Math.round(l[i] * 1000 * 100) / 100,
      close: Math.round(c[i] * 1000 * 100) / 100,
      volume: Math.round(v[i] ?? 0),
    }));

    return ok({ symbol, bars, asOf: Math.floor(Date.now() / 1000) });
  } catch (e) {
    return bad(`Lỗi server: ${(e as Error).message}`, 500);
  }
});
