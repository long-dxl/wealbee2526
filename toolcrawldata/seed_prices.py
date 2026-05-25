"""
seed_prices.py — Fetch giá OHLCV từ Yahoo Finance → upsert vào prices_daily + market_indices
Chạy: python3 seed_prices.py
"""

import time
import warnings
import yfinance as yf
from datetime import datetime, timedelta
from supabase import create_client

warnings.filterwarnings("ignore")

# ─── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://fkwsvyzguehtsjpwmttb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrd3N2eXpndWVodHNqcHdtdHRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQyNzM1NiwiZXhwIjoyMDkxMDAzMzU2fQ.dd2jG1FUDGlLwUhIdgEOnkK2HPnfkTTdnfYcNcwWTOo"

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# 25 mã VN30 → Yahoo Finance suffix .VN
VN30 = [
    "ACB","BID","BVH","CTG","FPT","GAS","HDB","HPG","MBB","MSN",
    "MWG","PLX","SAB","SSI","STB","TCB","TPB","VCB","VHM","VIB",
    "VIC","VJC","VNM","VPB","VRE"
]

# Indices Yahoo Finance
INDICES = {
    "VNINDEX": "^VNINDEX",
    "HNX":     "^HNX",
}

START_DATE = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
END_DATE   = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

# ─── Fetch + parse stock prices ───────────────────────────────────────────────

def fetch_stock(symbol: str):
    yf_ticker = f"{symbol}.VN"
    try:
        df = yf.download(yf_ticker, start=START_DATE, end=END_DATE,
                         progress=False, auto_adjust=True)
        if df.empty:
            print(f"  {symbol}: no data")
            return []

        # Flatten MultiIndex nếu có
        if hasattr(df.columns, "levels"):
            df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

        rows = []
        for date, row in df.iterrows():
            close = float(row.get("Close", 0) or 0)
            if close <= 0:
                continue
            rows.append({
                "symbol": symbol,
                "date":   date.strftime("%Y-%m-%d"),
                "open":   round(float(row.get("Open",  close) or close), 2),
                "high":   round(float(row.get("High",  close) or close), 2),
                "low":    round(float(row.get("Low",   close) or close), 2),
                "close":  round(close, 2),
                "volume": int(row.get("Volume", 0) or 0),
                "value":  None,
            })
        print(f"  {symbol}: {len(rows)} ngày")
        return rows
    except Exception as e:
        print(f"  {symbol}: ERROR — {e}")
        return []


def fetch_index(index_code: str, yf_symbol: str):
    try:
        df = yf.download(yf_symbol, start=START_DATE, end=END_DATE,
                         progress=False, auto_adjust=True)
        if df.empty:
            print(f"  {index_code}: no data")
            return []

        if hasattr(df.columns, "levels"):
            df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

        rows = []
        prev_close = None
        for date, row in df.iterrows():
            close = float(row.get("Close", 0) or 0)
            if close <= 0:
                continue
            change_pt  = round(close - prev_close, 2) if prev_close else None
            change_pct = round(change_pt / prev_close * 100, 2) if prev_close else None
            rows.append({
                "index_code": index_code,
                "date":       date.strftime("%Y-%m-%d"),
                "open":       round(float(row.get("Open",  close) or close), 2),
                "high":       round(float(row.get("High",  close) or close), 2),
                "low":        round(float(row.get("Low",   close) or close), 2),
                "close":      round(close, 2),
                "volume":     int(row.get("Volume", 0) or 0),
                "change_pt":  change_pt,
                "change_pct": change_pct,
            })
            prev_close = close
        print(f"  {index_code}: {len(rows)} ngày")
        return rows
    except Exception as e:
        print(f"  {index_code}: ERROR — {e}")
        return []

# ─── Upsert helpers ───────────────────────────────────────────────────────────

def upsert_batch(table: str, records: list, conflict: str):
    if not records:
        return 0
    total = 0
    for i in range(0, len(records), 500):
        chunk = records[i:i+500]
        sb.table(table).upsert(chunk, on_conflict=conflict).execute()
        total += len(chunk)
    return total

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print(f"📈  Fetch giá VN30 từ Yahoo Finance ({START_DATE} → {END_DATE})")
    print("=" * 55)

    all_price_rows = []
    for sym in VN30:
        rows = fetch_stock(sym)
        all_price_rows.extend(rows)
        time.sleep(0.2)

    n = upsert_batch("prices_daily", all_price_rows, "symbol,date")
    print(f"\n✅ prices_daily: {n} rows upserted")

    print("\n" + "=" * 55)
    print("📊  Fetch VN-Index, HNX từ Yahoo Finance")
    print("=" * 55)

    all_index_rows = []
    for code, yf_sym in INDICES.items():
        rows = fetch_index(code, yf_sym)
        all_index_rows.extend(rows)
        time.sleep(0.2)

    n = upsert_batch("market_indices", all_index_rows, "index_code,date")
    print(f"\n✅ market_indices: {n} rows upserted")

    # ── Verify ──
    pd_res = sb.table("prices_daily").select("*", count="exact").limit(1).execute()
    mi_res = sb.table("market_indices").select("*", count="exact").limit(1).execute()

    # Sample để kiểm tra
    sample = sb.table("prices_daily") \
        .select("symbol,date,close,volume") \
        .eq("symbol", "VCB") \
        .order("date", desc=True) \
        .limit(3) \
        .execute()

    vnidx = sb.table("market_indices") \
        .select("index_code,date,close,change_pct") \
        .eq("index_code", "VNINDEX") \
        .order("date", desc=True) \
        .limit(3) \
        .execute()

    print(f"\n📋 prices_daily total:   {pd_res.count} rows")
    print(f"📋 market_indices total: {mi_res.count} rows")
    print(f"\n--- VCB gần nhất ---")
    for r in sample.data:
        print(f"  {r['date']}  close={r['close']:,.0f}  vol={r['volume']:,}")
    print(f"\n--- VNINDEX gần nhất ---")
    for r in vnidx.data:
        chg = f"{r['change_pct']:+.2f}%" if r['change_pct'] else "N/A"
        print(f"  {r['date']}  close={r['close']:,.2f}  {chg}")

if __name__ == "__main__":
    main()
