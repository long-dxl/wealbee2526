"""
Seed dữ liệu tài chính từ VCI (iq.vietcap.com.vn) vào Supabase.
Điền 3 bảng: financials_annual, dividends, insider_transactions
cho 50 mã cổ phiếu tiêu biểu nhất TTCK Việt Nam.

Chạy:
    python seed_financials.py
"""

import sys
import re
import time
import logging
import requests
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase_writer import get_client, upsert_batch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("seed_financials")

SYMBOLS = [
    # VN30 core (ngân hàng)
    "VCB", "BID", "CTG", "TCB", "VPB", "MBB", "HDB", "ACB", "VIB", "STB", "TPB", "LPB", "SHB", "EIB",
    # VN30 core (các ngành khác)
    "HPG", "VIC", "VHM", "VNM", "GAS", "MSN", "MWG", "FPT", "BVH", "VJC", "SSI", "SAB", "PLX", "VRE",
    # Bất động sản
    "NVL", "KDH", "PDR", "BCM",
    # Chứng khoán
    "VND", "HCM", "VCI", "BSI",
    # Hàng hóa & Công nghiệp
    "DGC", "DCM", "DPM", "GVR", "PHR",
    # Tiêu dùng & Bán lẻ
    "PNJ", "REE", "GMD",
    # Logistics & Cảng
    "HAH", "PVT",
    # Tiện ích
    "BWE", "KBC",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Referer": "https://iq.vietcap.com.vn/",
    "Origin": "https://iq.vietcap.com.vn",
}
BASE = "https://iq.vietcap.com.vn/api/iq-insight-service"
TIMEOUT = 15
DELAY   = 0.6


# ── Helpers ───────────────────────────────────────────────────────────────────

def get(url: str) -> dict | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        log.warning(f"  HTTP {r.status_code}: {url}")
    except Exception as e:
        log.warning(f"  Lỗi request: {e}")
    return None


def safe_float(v) -> float | None:
    try:
        return float(v) if v is not None and v != 0.0 else None
    except (TypeError, ValueError):
        return None


def safe_int(v) -> int | None:
    try:
        return int(str(v).replace(",", "")) if v is not None else None
    except (TypeError, ValueError):
        return None


def parse_date(s) -> str | None:
    if not s:
        return None
    try:
        return str(s)[:10]
    except Exception:
        return None


def extract_volume_from_title(title: str) -> int | None:
    """Parse '20,000 VCB' or 'mua 15.000 cổ phiếu' → int"""
    nums = re.findall(r"[\d][,.\d]*\d", title)
    for n in nums:
        try:
            clean = n.replace(",", "").replace(".", "")
            val = int(clean)
            if val > 100:  # tránh nhận nhầm tỷ lệ %
                return val
        except Exception:
            pass
    return None


def fetch_all_events(symbol: str) -> list[dict]:
    """Lấy toàn bộ corporate events (dùng page=0-based, size lớn)."""
    url = f"{BASE}/v1/events?ticker={symbol}&fromDate=2010-01-01&toDate=2030-01-01&page=0&size=200"
    data = get(url)
    if not data:
        return []
    return data.get("data", {}).get("content", []) or []


# ── Bước 1: financials_annual ─────────────────────────────────────────────────

def fetch_financials(symbol: str) -> list[dict]:
    """
    Kết hợp income-statement và statistics-financial.
    income-statement → revenue, net_profit, eps
    statistics-financial → pe, pb, roe, roa, debtToEquity
    """
    # ── income statement ──
    is_url = f"{BASE}/v1/company/{symbol}/financial-statement?section=INCOME_STATEMENT"
    is_data = get(is_url)
    time.sleep(0.3)

    # ── ratios ──
    rat_url = f"{BASE}/v1/company/{symbol}/statistics-financial"
    rat_data = get(rat_url)
    time.sleep(0.3)

    if not is_data and not rat_data:
        return []

    # Build ratio lookup: year → row
    rat_by_year: dict[int, dict] = {}
    if rat_data:
        for item in rat_data.get("data", []):
            y = safe_int(item.get("yearReport"))
            # ratioType="RATIO_TTM" and quarter=1 → annual summary
            if y and item.get("quarter") == 1:
                rat_by_year[y] = item

    # Build income lookup: year → row
    inc_by_year: dict[int, dict] = {}
    if is_data:
        years_list = is_data.get("data", {}).get("years", [])
        for item in years_list:
            y = safe_int(item.get("yearReport"))
            if y:
                inc_by_year[y] = item

    all_years = set(rat_by_year.keys()) | set(inc_by_year.keys())
    if not all_years:
        return []

    rows = []
    for year in sorted(all_years):
        inc = inc_by_year.get(year, {})
        rat = rat_by_year.get(year, {})

        # Revenue: isa3 (non-bank net sales) or isb38 (bank total operating income)
        revenue = safe_float(inc.get("isa3")) or safe_float(inc.get("isb38"))
        net_profit = safe_float(inc.get("isa20"))
        eps = safe_float(inc.get("isa23"))

        # Ratios
        pe     = safe_float(rat.get("pe"))
        pb     = safe_float(rat.get("pb"))
        roe    = safe_float(rat.get("roe"))
        roa    = safe_float(rat.get("roa"))
        de     = safe_float(rat.get("debtToEquity"))

        rows.append({
            "symbol":         symbol,
            "year":           year,
            "revenue":        revenue,
            "net_profit":     net_profit,
            "eps":            eps,
            "pe_ratio":       pe,
            "pb_ratio":       pb,
            "roe":            roe,
            "roa":            roa,
            "debt_to_equity": de,
        })

    return rows


# ── Bước 2: dividends ─────────────────────────────────────────────────────────

def fetch_dividends(symbol: str, events: list[dict]) -> list[dict]:
    """Lọc DIV events → dividends rows."""
    rows = []
    seen = set()

    for ev in events:
        code = ev.get("eventCode", "")
        if code not in ("DIV", "ISS"):
            continue

        ex_date = parse_date(ev.get("exrightDate") or ev.get("displayDate1"))
        if not ex_date:
            continue

        if code == "DIV":
            amount = safe_float(ev.get("valuePerShare"))
            if not amount or amount <= 0:
                continue
            div_type = "cash"
            key = (symbol, ex_date, "cash")
        else:
            # ISS = phát hành cổ phiếu thưởng / cổ tức cổ phiếu
            title = ev.get("eventTitleEn", "") or ev.get("eventTitleVi", "")
            if "dividend" not in title.lower() and "co tuc" not in title.lower() and "cổ tức" not in title.lower():
                continue
            ratio = safe_float(ev.get("exerciseRatio"))
            if not ratio or ratio <= 0:
                continue
            amount = ratio
            div_type = "stock"
            key = (symbol, ex_date, "stock")

        if key in seen:
            continue
        seen.add(key)

        rows.append({
            "symbol":        symbol,
            "ex_date":       ex_date,
            "payment_date":  parse_date(ev.get("payoutDate") or ev.get("displayDate2")),
            "dividend_type": div_type,
            "amount":        amount,
        })

    return rows


# ── Bước 3: insider_transactions ──────────────────────────────────────────────

def fetch_insider(symbol: str, events: list[dict]) -> list[dict]:
    """Lọc DDIND / DDINS events → insider_transactions rows."""
    rows = []
    seen = set()

    for ev in events:
        code = ev.get("eventCode", "")
        if code not in ("DDIND", "DDINS"):
            continue

        trade_date = parse_date(ev.get("publicDate") or ev.get("displayDate1"))
        if not trade_date:
            continue

        title_vi = ev.get("eventTitleVi", "") or ""
        title_en = ev.get("eventTitleEn", "") or ""

        # Extract insider name (first part before " - ")
        name_parts = title_vi.split(" - ")
        insider_name = name_parts[0].strip() if name_parts else ""

        action_en = (ev.get("actionTypeEn") or "").lower()
        if "buy" in action_en or "mua" in (ev.get("actionTypeVi") or "").lower():
            trade_type = "buy"
        elif "sell" in action_en or "bán" in (ev.get("actionTypeVi") or "").lower():
            trade_type = "sell"
        else:
            trade_type = action_en or "unknown"

        volume = extract_volume_from_title(title_en or title_vi)

        key = (symbol, trade_date, insider_name, trade_type)
        if key in seen:
            continue
        seen.add(key)

        rows.append({
            "symbol":       symbol,
            "trade_date":   trade_date,
            "insider_name": insider_name,
            "position":     "",
            "trade_type":   trade_type,
            "volume":       volume,
            "price":        None,
            "total_value":  None,
            "source_url":   None,
        })

    return rows


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    sb = get_client()

    total_fin = total_div = total_ins = 0
    failed: list[str] = []

    log.info("=" * 55)
    log.info(f"  SEED FINANCIALS — {len(SYMBOLS)} mã cổ phiếu (VCI API)")
    log.info("=" * 55)

    for i, symbol in enumerate(SYMBOLS, 1):
        log.info(f"  [{i:02d}/{len(SYMBOLS)}] {symbol}")

        # ── financials_annual ──
        try:
            rows = fetch_financials(symbol)
            if rows:
                upsert_batch(sb, "financials_annual", rows, on_conflict="symbol,year")
                log.info(f"    financials_annual: {len(rows)} năm")
                total_fin += len(rows)
            else:
                log.warning(f"    financials_annual: không có data")
        except Exception as e:
            log.error(f"    financials_annual lỗi: {e}")
            failed.append(f"{symbol}/financials")

        time.sleep(DELAY)

        # ── fetch events once (reuse for dividends + insider) ──
        events: list[dict] = []
        try:
            events = fetch_all_events(symbol)
        except Exception as e:
            log.warning(f"    events lỗi: {e}")

        time.sleep(0.3)

        # ── dividends ──
        try:
            rows = fetch_dividends(symbol, events)
            if rows:
                upsert_batch(sb, "dividends", rows, on_conflict="symbol,ex_date,dividend_type")
                log.info(f"    dividends: {len(rows)} kỳ")
                total_div += len(rows)
            else:
                log.info(f"    dividends: không có data")
        except Exception as e:
            log.error(f"    dividends lỗi: {e}")
            failed.append(f"{symbol}/dividends")

        # ── insider_transactions ──
        try:
            rows = fetch_insider(symbol, events)
            if rows:
                upsert_batch(sb, "insider_transactions", rows, on_conflict="symbol,trade_date,insider_name,trade_type")
                log.info(f"    insider: {len(rows)} giao dịch")
                total_ins += len(rows)
            else:
                log.info(f"    insider: không có data")
        except Exception as e:
            log.error(f"    insider lỗi: {e}")
            failed.append(f"{symbol}/insider")

        time.sleep(DELAY)

    log.info("=" * 55)
    log.info(f"  HOÀN THÀNH")
    log.info(f"  financials_annual    : {total_fin} rows")
    log.info(f"  dividends            : {total_div} rows")
    log.info(f"  insider_transactions : {total_ins} rows")
    if failed:
        log.warning(f"  Thất bại ({len(failed)}): {', '.join(failed)}")
    log.info("=" * 55)


if __name__ == "__main__":
    main()
