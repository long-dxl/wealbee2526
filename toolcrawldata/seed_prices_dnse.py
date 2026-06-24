"""
seed_prices_dnse.py — Cập nhật giá OHLCV đến HÔM NAY từ DNSE (entrade chart API).

Vì sao DNSE thay cho Yahoo:
  - Yahoo `.VN` vẫn có giá cổ phiếu, NHƯNG ticker chỉ số ^VNINDEX/^HNX đã chết
    (HTTP 404 "Quote not found") → không cập nhật được index.
  - DNSE entrade chart API (public, không cần auth) phủ CẢ cổ phiếu LẪN chỉ số,
    dữ liệu tới ngày giao dịch gần nhất. Đây cũng là nguồn giá VN-native của hệ thống.

Đơn vị:
  - Cổ phiếu: DNSE trả giá theo NGHÌN đồng (vd MWG = 79.1) → nhân 1000 = VND (79.100),
    khớp convention bảng prices_daily.
  - Chỉ số: để nguyên điểm số (vd VNINDEX = 1869.04).

Ghi vào: prices_daily (symbol,date) + market_indices (index_code,date) — upsert idempotent.
Chạy: python seed_prices_dnse.py
"""

import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import time
import requests
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client, upsert_batch  # load .env + SUPABASE_SERVICE_KEY

DNSE_BASE   = "https://services.entrade.com.vn/chart-api/v2/ohlcs"
HEADERS     = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36"}
FETCH_DAYS  = 60          # cửa sổ kéo về (đủ lấp khoảng trống + overlap)
UPSERT_DAYS = 35          # chỉ upsert các ngày trong khoảng này (đảm bảo change_pt có prev_close)

INDICES = {"VNINDEX": "VNINDEX", "HNX": "HNX"}   # index_code -> DNSE symbol


def _fetch(kind: str, symbol: str) -> list[dict]:
    """kind = 'stock' | 'index'. Trả về list dict OHLCV theo ngày (đã sort tăng dần)."""
    frm = int((datetime.now() - timedelta(days=FETCH_DAYS)).timestamp())
    to  = int((datetime.now() + timedelta(days=1)).timestamp())
    url = f"{DNSE_BASE}/{kind}?from={frm}&to={to}&symbol={symbol}&resolution=1D"
    r = requests.get(url, headers=HEADERS, timeout=25)
    r.raise_for_status()
    d = r.json()
    out = []
    for t, o, h, l, c, v in zip(d.get("t", []), d["o"], d["h"], d["l"], d["c"], d["v"]):
        out.append({
            "date": datetime.fromtimestamp(t).strftime("%Y-%m-%d"),
            "o": o, "h": h, "l": l, "c": c, "v": int(v or 0),
        })
    return out


def get_db_symbols() -> list[str]:
    """Lấy toàn bộ mã đang có trong prices_daily (vượt giới hạn 1000 dòng mặc định)."""
    sb = get_client()
    syms, off = set(), 0
    while True:
        rows = sb.table("prices_daily").select("symbol").range(off, off + 999).execute().data
        if not rows:
            break
        syms.update(x["symbol"] for x in rows)
        if len(rows) < 1000:
            break
        off += 1000
    return sorted(syms)


def seed_stocks(symbols: list[str]) -> int:
    cutoff = (datetime.now() - timedelta(days=UPSERT_DAYS)).strftime("%Y-%m-%d")
    rows = []
    for sym in symbols:
        try:
            bars = _fetch("stock", sym)
            n = 0
            for b in bars:
                if b["date"] < cutoff:
                    continue
                rows.append({
                    "symbol": sym,
                    "date":   b["date"],
                    "open":   round(b["o"] * 1000, 2),
                    "high":   round(b["h"] * 1000, 2),
                    "low":    round(b["l"] * 1000, 2),
                    "close":  round(b["c"] * 1000, 2),
                    "volume": b["v"],
                    "value":  None,
                })
                n += 1
            last = bars[-1]["date"] if bars else "—"
            print(f"  {sym}: {n} ngày (mới nhất {last})")
        except Exception as e:
            print(f"  {sym}: ERROR — {e}")
        time.sleep(0.15)
    n = upsert_batch(get_client(), "prices_daily", rows, "symbol,date")
    print(f"\n✅ prices_daily: {n} rows upserted ({len(symbols)} mã)")
    return n


def seed_indices() -> int:
    cutoff = (datetime.now() - timedelta(days=UPSERT_DAYS)).strftime("%Y-%m-%d")
    rows = []
    for code, dnse_sym in INDICES.items():
        try:
            bars = _fetch("index", dnse_sym)
            prev = None
            n = 0
            for b in bars:
                c = b["c"]
                chg_pt  = round(c - prev, 2) if prev is not None else None
                chg_pct = round((c - prev) / prev * 100, 2) if prev else None
                if b["date"] >= cutoff:
                    rows.append({
                        "index_code": code,
                        "date":       b["date"],
                        "open":       round(b["o"], 2),
                        "high":       round(b["h"], 2),
                        "low":        round(b["l"], 2),
                        "close":      round(c, 2),
                        "volume":     b["v"],
                        "change_pt":  chg_pt,
                        "change_pct": chg_pct,
                    })
                    n += 1
                prev = c
            last = bars[-1]["date"] if bars else "—"
            print(f"  {code}: {n} ngày (mới nhất {last}, close {bars[-1]['c'] if bars else 0:,.2f})")
        except Exception as e:
            print(f"  {code}: ERROR — {e}")
        time.sleep(0.15)
    n = upsert_batch(get_client(), "market_indices", rows, "index_code,date")
    print(f"\n✅ market_indices: {n} rows upserted")
    return n


def verify():
    sb = get_client()
    print("\n" + "=" * 55 + "\n  VERIFY\n" + "=" * 55)
    for s in ["MWG", "VCB", "FPT"]:
        r = sb.table("prices_daily").select("date,close").eq("symbol", s).order("date", desc=True).limit(1).execute().data
        print(f"  {s:8} mới nhất: {r[0]['date']}  close={r[0]['close']:,.0f}" if r else f"  {s}: none")
    for code in ["VNINDEX", "HNX"]:
        r = sb.table("market_indices").select("date,close,change_pct").eq("index_code", code).order("date", desc=True).limit(1).execute().data
        if r:
            print(f"  {code:8} mới nhất: {r[0]['date']}  close={r[0]['close']:,.2f}  ({r[0]['change_pct']:+}%)")


def main():
    print("=" * 55)
    print(f"📈  Cập nhật giá DNSE → hôm nay ({datetime.now():%d/%m/%Y %H:%M})")
    print("=" * 55)
    symbols = get_db_symbols()
    print(f"  {len(symbols)} mã trong DB: {', '.join(symbols)}\n")
    seed_stocks(symbols)
    print()
    seed_indices()
    verify()


if __name__ == "__main__":
    main()
