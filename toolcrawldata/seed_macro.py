#!/usr/bin/env python3
"""
seed_macro.py — Kéo CHỈ SỐ VĨ MÔ toàn cầu (nguồn FREE: Yahoo Finance, không cần API key)
→ upsert vào bảng `macro_indicators` trên Supabase. Cron 1 lần/ngày (giống seed_prices_dnse.py).

Vĩ mô kéo: tỷ giá USD/VND, chỉ số USD (DXY), lợi suất TPCP Mỹ 10 năm (proxy lãi suất Fed),
dầu Brent, vàng, S&P500, VIX (khẩu vị rủi ro). VN-Index/HNX đã có ở market_indices — KHÔNG lặp.

Chạy: python seed_macro.py
"""
import os
import time
import requests
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

# code -> (yahoo_symbol, tên VN, đơn vị)
INDICATORS = {
    "usdvnd": ("USDVND=X", "Tỷ giá USD/VND",              "VND"),
    "dxy":    ("DX-Y.NYB", "Chỉ số USD (DXY)",            "index"),
    "us10y":  ("^TNX",     "Lợi suất TPCP Mỹ 10 năm",     "%"),
    "brent":  ("BZ=F",     "Dầu Brent",                   "USD/thùng"),
    "gold":   ("GC=F",     "Vàng",                        "USD/oz"),
    "sp500":  ("^GSPC",    "S&P 500 (chứng khoán Mỹ)",    "index"),
    "vix":    ("^VIX",     "VIX (khẩu vị rủi ro)",        "index"),
}

HEADERS = {"User-Agent": "Mozilla/5.0"}


def fetch_yahoo(symbol: str) -> dict | None:
    """Giá + %ngày + %YTD (từ đầu năm) + %YoY (từ ~1 năm trước). None nếu lỗi."""
    try:
        url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
               f"{requests.utils.quote(symbol)}?range=1y&interval=1d")
        r = requests.get(url, headers=HEADERS, timeout=20)
        if not r.ok:
            return None
        res = (r.json().get("chart", {}).get("result") or [None])[0]
        if not res:
            return None
        closes = res.get("indicators", {}).get("quote", [{}])[0].get("close") or []
        ts = res.get("timestamp") or []
        pts = [(c, ts[i]) for i, c in enumerate(closes) if c is not None]
        if not pts:
            return None
        cur, cur_ts = pts[-1]
        prev = pts[-2][0] if len(pts) > 1 else None
        year_ago = pts[0][0]
        cur_year = datetime.utcfromtimestamp(cur_ts).year
        ytd = next((c for c, t in pts if datetime.utcfromtimestamp(t).year == cur_year), year_ago)
        pct = lambda a, b: round((a - b) / b * 100, 2) if b else None
        return {
            "value": round(cur, 2),
            "day_pct": pct(cur, prev) if prev else None,
            "ytd_pct": pct(cur, ytd),
            "yoy_pct": pct(cur, year_ago),
            "as_of": datetime.utcfromtimestamp(cur_ts).strftime("%Y-%m-%d"),
        }
    except Exception as e:
        print(f"  {symbol}: ERROR {e}")
        return None


def main():
    print("=" * 55)
    print(f"📊  Kéo chỉ số vĩ mô (Yahoo, free) — {datetime.now():%d/%m/%Y %H:%M}")
    print("=" * 55)
    rows, ok = [], 0
    for code, (sym, name, unit) in INDICATORS.items():
        q = fetch_yahoo(sym)
        if not q:
            print(f"  {code:8} ({sym}): bỏ qua (không lấy được)")
            continue
        rows.append({"code": code, "name": name, "unit": unit, "source": "Yahoo Finance",
                     "updated_at": datetime.utcnow().isoformat(), **q})
        ok += 1
        print(f"  {code:8} {q['value']:>12} {unit:10} | YTD {q['ytd_pct']}% | YoY {q['yoy_pct']}% | {q['as_of']}")
        time.sleep(0.2)
    if rows:
        sb.table("macro_indicators").upsert(rows, on_conflict="code").execute()
    print(f"\n✅ {ok}/{len(INDICATORS)} chỉ số cập nhật (macro_indicators)")


if __name__ == "__main__":
    main()
