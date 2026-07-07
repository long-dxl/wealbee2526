"""
Seed dividends + insider_transactions từ VCI (iq.vietcap.com.vn) vào Supabase,
cho TOÀN BỘ mã active trong bảng `tickers` (không giới hạn VN30/48 mã tiêu biểu).

Lưu ý: KHÔNG còn seed `financials_annual` — bảng này đã bị thay thế bởi tầng
`financial_statements`/`financial_ratios` mới (xem comment trong
agent-scheduler/index.ts: "thay cho query financials_annual cũ, đông cứng,
khác số với tầng mới"). Loại bỏ 2 API call/mã (income-statement +
statistics-financial) vốn không còn ai đọc — giảm ~50% thời gian chạy.

Nguồn: 1 API call/mã (`/v1/events`) trả về TOÀN BỘ sự kiện doanh nghiệp, dùng
chung cho cả cổ tức (DIV/ISS) và giao dịch nội bộ (DDIND/DDINS) — đã verify
API phủ tốt cả mã nhỏ/thanh khoản thấp, không giới hạn riêng VN30.

Chạy:
    python seed_financials.py            # cron VPS 1 lần/ngày là đủ dư — cổ
                                          # tức/giao dịch nội bộ không biến
                                          # động theo phút như giá.
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


def get_active_symbols() -> list[str]:
    """Toàn bộ mã active trong `tickers` — tự động phủ mã mới niêm yết,
    không cần bảo trì danh sách tay như trước (SYMBOLS hardcode)."""
    sb = get_client()
    out, off = set(), 0
    while True:
        rows = sb.table("tickers").select("symbol").eq("is_active", True).range(off, off + 999).execute().data
        if not rows:
            break
        out.update(r["symbol"] for r in rows)
        if len(rows) < 1000:
            break
        off += 1000
    return sorted(out)


# ── Dividends ─────────────────────────────────────────────────────────────────

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


# ── Insider transactions ────────────────────────────────────────────────────────

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
    symbols = get_active_symbols()

    total_div = total_ins = 0
    failed: list[str] = []

    log.info("=" * 55)
    log.info(f"  SEED DIVIDENDS + INSIDER — {len(symbols)} mã active (VCI API)")
    log.info("=" * 55)

    for i, symbol in enumerate(symbols, 1):
        log.info(f"  [{i:03d}/{len(symbols)}] {symbol}")

        events: list[dict] = []
        try:
            events = fetch_all_events(symbol)
        except Exception as e:
            log.warning(f"    events lỗi: {e}")

        # ── dividends ──
        try:
            rows = fetch_dividends(symbol, events)
            if rows:
                upsert_batch(sb, "dividends", rows, on_conflict="symbol,ex_date,dividend_type")
                total_div += len(rows)
        except Exception as e:
            log.error(f"    dividends lỗi: {e}")
            failed.append(f"{symbol}/dividends")

        # ── insider_transactions ──
        try:
            rows = fetch_insider(symbol, events)
            if rows:
                upsert_batch(sb, "insider_transactions", rows, on_conflict="symbol,trade_date,insider_name,trade_type")
                total_ins += len(rows)
        except Exception as e:
            log.error(f"    insider lỗi: {e}")
            failed.append(f"{symbol}/insider")

        time.sleep(DELAY)

    log.info("=" * 55)
    log.info(f"  HOÀN THÀNH — {len(symbols)} mã")
    log.info(f"  dividends            : {total_div} rows")
    log.info(f"  insider_transactions : {total_ins} rows")
    if failed:
        log.warning(f"  Thất bại ({len(failed)}): {', '.join(failed)}")
    log.info("=" * 55)


if __name__ == "__main__":
    main()
