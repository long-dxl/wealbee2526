#!/usr/bin/env python3
"""
Import balance sheet + cash flow + income statement data from Simplize API into Supabase.
Fields match wealbee-platform FinancialYear interface exactly.

Balance sheet: total_assets, cash, total_debt, equity, current_ratio
Cash flow: operating_cf, capex, fcf, net_cash_change
financials_annual (new cols): gross_profit, ebt, current_ratio
"""

import json, subprocess, time, calendar

TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJuZ3RwaHVjMEBnbWFpbC5jb20iLCJhdXRoIjoiUk9MRV9VU0VSIiwidWlkIjoyMzgyOTEsInNpZCI6Ijc4ODkyN2E4LWUyOTEtNGI2Yi1hMDEyLTA4Y2ZmYjNmMGM4ZSIsInJlcXVpcmVkUGhvbmVOdW1iZXIiOnRydWUsInBlIjpmYWxzZSwiZXhwIjoxNzgyMTQ4NzU1fQ.F-4y4SyM51NyVlvf707_nnjcDh_Fj4Gvub2MHHFgzBNumtgFTElHjuZQUwh6KW9gMkP5CPtHAvklMO1Mrz68Vw"
SUPABASE_URL = "https://fkwsvyzguehtsjpwmttb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrd3N2eXpndWVodHNqcHdtdHRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQyNzM1NiwiZXhwIjoyMDkxMDAzMzU2fQ.dd2jG1FUDGlLwUhIdgEOnkK2HPnfkTTdnfYcNcwWTOo"

VN30 = [
    "ACB","BCM","BID","BVH","CTG","FPT","GAS","GVR",
    "HDB","HPG","LPB","MBB","MSN","MWG","PLX","POW",
    "SAB","SHB","SSI","STB","TCB","TPB","VCB","VHM",
    "VIB","VIC","VJC","VNM","VPB","VRE",
]

def fetch(url):
    r = subprocess.run([
        "curl","-s", url,
        "-H", f"authorization: Bearer {TOKEN}",
        "-H", "origin: https://simplize.vn",
        "-H", "referer: https://simplize.vn/",
        "-H", "accept: application/json",
        "-H", "user-agent: Mozilla/5.0",
    ], capture_output=True, text=True, timeout=15)
    return json.loads(r.stdout)

def period_to_date(period_date: str) -> str:
    y, m = period_date.split("-")
    last = calendar.monthrange(int(y), int(m))[1]
    return f"{y}-{m}-{last:02d}"

def to_ty(v):
    if v is None or v == 0.0:
        return None
    return round(v / 1e9, 2)

def upsert(table, rows, on_conflict="symbol,period"):
    if not rows:
        return
    r = subprocess.run([
        "curl","-s","-X","POST",
        f"{SUPABASE_URL}/rest/v1/{table}",
        "-H", f"apikey: {SUPABASE_KEY}",
        "-H", f"Authorization: Bearer {SUPABASE_KEY}",
        "-H", "Content-Type: application/json",
        "-H", "Prefer: resolution=merge-duplicates",
        "-d", json.dumps(rows),
    ], capture_output=True, text=True, timeout=30)
    if r.stdout and "error" in r.stdout.lower()[:100]:
        print(f"  [WARN] {table}: {r.stdout[:200]}")

def upsert_annual(rows):
    """Upsert financials_annual: only update gross_profit, ebt, current_ratio"""
    for row in rows:
        r = subprocess.run([
            "curl","-s","-X","PATCH",
            f"{SUPABASE_URL}/rest/v1/financials_annual?symbol=eq.{row['symbol']}&year=eq.{row['year']}",
            "-H", f"apikey: {SUPABASE_KEY}",
            "-H", f"Authorization: Bearer {SUPABASE_KEY}",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({
                "gross_profit": row.get("gross_profit"),
                "ebt": row.get("ebt"),
                "current_ratio": row.get("current_ratio"),
            }),
        ], capture_output=True, text=True, timeout=15)

def import_symbol(symbol):
    print(f"  {symbol} ...", end=" ", flush=True)

    # ── Fetch all 3 endpoints in parallel (sequential here for simplicity) ──
    bs_resp = fetch(f"https://api2.simplize.vn/api/company/fi/bs/{symbol}?type=null&period=Q&size=12")
    cf_resp = fetch(f"https://api2.simplize.vn/api/company/fi/cf/{symbol}?type=null&period=Q&size=12")
    is_resp = fetch(f"https://api2.simplize.vn/api/company/fi/is/{symbol}?type=null&period=Q&size=12")

    if bs_resp.get("status") != 200:
        print(f"BS-ERR:{bs_resp.get('status')}")
        return

    bs_items = bs_resp["data"]["items"]
    cf_items = cf_resp["data"]["items"] if cf_resp.get("status") == 200 else []
    is_items = is_resp["data"]["items"] if is_resp.get("status") == 200 else []

    # ── Balance Sheet (quarterly) ────────────────────────────────────────────
    bs_rows = []
    for item in bs_items:
        ca = item.get("bs2")   # current assets
        cl = item.get("bs8")   # current liabilities
        cr = round(ca / cl, 2) if ca and cl and cl != 0 else None
        bs_rows.append({
            "symbol": symbol,
            "period": item["periodDateName"],
            "period_date": period_to_date(item["periodDate"]),
            "total_assets":  to_ty(item.get("bs1")),
            "cash":          to_ty(item.get("bs13")),
            "total_debt":    to_ty(item.get("bs6")),   # total liabilities
            "equity":        to_ty(item.get("bs10")),
            "current_ratio": cr,
        })
    if bs_rows:
        upsert("balance_sheet", bs_rows)
        # PATCH current_ratio separately (merge-duplicates skips existing nulls)
        for row in bs_rows:
            if row.get("current_ratio") is not None:
                period_enc = row["period"].replace("/", "%2F")
                subprocess.run([
                    "curl","-s","-X","PATCH",
                    f"{SUPABASE_URL}/rest/v1/balance_sheet?symbol=eq.{symbol}&period=eq.{period_enc}",
                    "-H", f"apikey: {SUPABASE_KEY}",
                    "-H", f"Authorization: Bearer {SUPABASE_KEY}",
                    "-H", "Content-Type: application/json",
                    "-d", json.dumps({"current_ratio": row["current_ratio"]}),
                ], capture_output=True, timeout=10)

    # ── Cash Flow (quarterly) ────────────────────────────────────────────────
    cf_rows = []
    for item in cf_items:
        op  = to_ty(item.get("cf12"))
        cap = to_ty(item.get("cf22"))
        fcf = round(op + cap, 2) if op is not None and cap is not None else None
        cf_rows.append({
            "symbol": symbol,
            "period": item["periodDateName"],
            "period_date": period_to_date(item["periodDate"]),
            "operating_cf":    op,
            "capex":           cap,
            "fcf":             fcf,
            "net_cash_change": to_ty(item.get("cf37")),
        })
    if cf_rows:
        upsert("cash_flow_statement", cf_rows)

    # ── Annual aggregates → update financials_annual ─────────────────────────
    # Group quarters by year
    def items_for_year(items_list, yr):
        return [r for r in items_list if f"/{yr}" in r.get("periodDateName", "")]

    annual_rows = []
    for yr in range(2023, 2027):
        is_qs  = items_for_year(is_items,  str(yr))
        cf_qs  = items_for_year(cf_items,  str(yr))
        bs_qs  = items_for_year(bs_items,  str(yr))

        if not is_qs:
            continue

        # Gross profit = Σ(is4 + is8) — stored in VND (same unit as revenue/net_profit)
        gross_profit = sum((r.get("is4") or 0) + (r.get("is8") or 0) for r in is_qs)
        gross_profit = round(gross_profit, 2) if gross_profit != 0 else None

        # EBT = Σ(cf1) — lợi nhuận trước thuế, stored in VND
        ebt = sum(r.get("cf1") or 0 for r in cf_qs)
        ebt = round(ebt, 2) if ebt != 0 else None

        # Current ratio from Q4 balance sheet of that year
        q4_bs = [r for r in bs_qs if r.get("periodDateName", "").startswith("Q4/")]
        cr = None
        if q4_bs:
            r4 = q4_bs[0]
            ca = r4.get("bs2")
            cl = r4.get("bs8")
            cr = round(ca / cl, 2) if ca and cl and cl != 0 else None

        annual_rows.append({
            "symbol": symbol,
            "year": yr,
            "gross_profit": gross_profit,
            "ebt": ebt,
            "current_ratio": cr,
        })

    if annual_rows:
        upsert_annual(annual_rows)

    bs_n  = len(bs_rows)
    cf_n  = len(cf_rows)
    is_n  = len(is_items)
    ann_n = len([r for r in annual_rows if r["gross_profit"]])
    print(f"BS:{bs_n} CF:{cf_n} IS:{is_n} annual_upd:{ann_n}")

def main():
    print(f"Importing financials for {len(VN30)} VN30 symbols...")
    ok, fail = 0, []
    for symbol in VN30:
        try:
            import_symbol(symbol)
            ok += 1
            time.sleep(0.4)
        except Exception as e:
            fail.append(symbol)
            print(f"ERROR: {e}")
    print(f"\nDone: {ok} ok, {len(fail)} failed: {fail}")

if __name__ == "__main__":
    main()
