"""
Seed dividends + dividend_announcements + insider_transactions từ VCI
(iq.vietcap.com.vn) vào Supabase, cho TOÀN BỘ mã active trong bảng `tickers`
(không giới hạn VN30/48 mã tiêu biểu).

dividend_announcements: cổ tức MỚI CÔNG BỐ Ý ĐỊNH, VCI chưa chốt exrightDate
(UI hiện "Dự kiến" thay ngày GDKHQ). Khi VCI cập nhật exrightDate thật, dòng
tương ứng tự chuyển sang `dividends` và bị xoá khỏi bảng này (cleanup_
dividend_announcements). Tự hết hạn sau ANNOUNCEMENT_MAX_AGE_DAYS (60 ngày)
nếu VCI vẫn chưa xác nhận — tránh hiện "Dự kiến" vô thời hạn cho sự kiện có
thể đã xảy ra rồi (verify thực tế case OPC 07/2026: GDKHQ đã qua 1+ ngày mà
VCI vẫn chưa cập nhật exrightDate).

Lưu ý: KHÔNG còn seed `financials_annual` — bảng này đã bị thay thế bởi tầng
`financial_statements`/`financial_ratios` mới (xem comment trong
agent-scheduler/index.ts: "thay cho query financials_annual cũ, đông cứng,
khác số với tầng mới"). Loại bỏ 2 API call/mã (income-statement +
statistics-financial) vốn không còn ai đọc — giảm ~50% thời gian chạy.

Nguồn: 1 API call/mã (`/v1/events`) trả về TOÀN BỘ sự kiện doanh nghiệp, dùng
chung cho cả cổ tức (DIV/ISS) và giao dịch nội bộ (DDIND cá nhân/DDINS tổ
chức/DDRP người liên quan — cả 3 loại, DDRP từng bị bỏ sót hoàn toàn) — đã
verify API phủ tốt cả mã nhỏ/thanh khoản thấp, không giới hạn riêng VN30.

Lưu ý: dữ liệu insider từ nguồn này là NGÀY ĐĂNG KÝ GIAO DỊCH (đã công bố),
không phải ngày thực hiện xác nhận — VCI không tách riêng sự kiện "đã hoàn
tất" trong feed events công khai này.

Chạy:
    python seed_financials.py            # cron VPS 1 lần/ngày — INCREMENTAL,
                                          # chỉ quét lại 90 ngày gần nhất/mã
                                          # (nhanh, đủ bắt sự kiện mới; lịch sử
                                          # cũ không đổi nên không cần quét lại).
    python seed_financials.py --backfill # chạy 1 LẦN: quét lịch sử từ 2015
                                          # cho toàn bộ mã — dùng khi mới thêm
                                          # mã hoặc cần bù lịch sử ban đầu.
"""

import sys
import re
import time
import logging
import requests
from pathlib import Path
from datetime import date, timedelta

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
INCREMENTAL_DAYS = 90   # chạy định kỳ: chỉ cần quét lại 90 ngày gần nhất — cổ
                        # tức/giao dịch nội bộ CŨ không đổi, đủ dư để bắt sự
                        # kiện mới kể cả lỡ vài lần cron.


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


def fetch_all_events(symbol: str, from_date: str = "2015-01-01") -> list[dict]:
    """Lấy corporate events từ `from_date` (mặc định 2015 = đủ lịch sử liên
    quan, chỉ dùng cho --backfill — dữ liệu trước 2015 không cần thiết cho
    phân tích hiện tại). Chạy định kỳ nên dùng from_date gần đây
    (INCREMENTAL_DAYS) — cổ tức/giao dịch nội bộ CŨ không đổi, không cần quét
    lại toàn bộ lịch sử mỗi lần chạy (nhanh hơn nhiều, giảm tải API VCI, đủ để
    bắt sự kiện MỚI)."""
    url = f"{BASE}/v1/events?ticker={symbol}&fromDate={from_date}&toDate=2030-01-01&page=0&size=200"
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

        # BẮT BUỘC phải có exrightDate (ngày GDKHQ đã CHỐT lịch) — không fallback
        # sang displayDate1/publicDate. Đã verify thực tế trên MBS: 1 sự kiện
        # "Trả cổ tức - Cả năm 2025" chỉ mới ĐƯỢC CÔNG BỐ Ý ĐỊNH (publicDate=
        # 01/07/2026), CHƯA chốt ngày GDKHQ thật (theo báo chí ngày GDKHQ thật
        # là 18/08/2026) — nếu fallback sang displayDate1 sẽ tạo ra 1 dòng cổ
        # tức với ngày GDKHQ SAI/BỊA (01/07 thay vì 18/08, hoặc chưa tồn tại).
        # Bỏ qua hẳn sự kiện này, đợi lần chạy sau khi VCI cập nhật exrightDate
        # thật (incremental mode 90 ngày sẽ tự bắt được).
        ex_date = parse_date(ev.get("exrightDate"))
        if not ex_date:
            continue

        if code == "DIV":
            amount = safe_float(ev.get("valuePerShare"))
            if not amount or amount <= 0:
                continue
            div_type = "cash"
            payment_date = parse_date(ev.get("payoutDate"))
            # amount vào khoá: 1 mã có thể trả CÙNG lúc 2 đợt cổ tức khác tỷ lệ
            # trên CÙNG 1 ngày GDKHQ (đã verify MBS 10/08/2023: vừa 3% vừa 12%
            # cùng ngày) — nếu chỉ khoá theo (symbol,ex_date,type) sẽ mất 1 đợt.
            key = (symbol, ex_date, "cash", round(amount, 2))
        else:
            # ISS = phát hành cổ phiếu thưởng / cổ tức cổ phiếu / quyền mua cho
            # cổ đông hiện hữu. VCI đặt tên các sự kiện này là "Cổ phiếu thưởng"
            # /"Bonus Issue" hoặc "Quyền mua CP cho Cổ đông hiện hữu"/"Rights
          # issue" — KHÔNG dùng chữ "dividend"/"cổ tức" — filter cũ chỉ khớp
            # "dividend"/"cổ tức" nên bỏ sót gần như MỌI đợt (đã verify PNJ mất
            # đợt chia thưởng 2:1, MBS mất đợt quyền mua 50%). Loại trừ rõ
            # ESOP/phát hành riêng lẻ — không phải quyền lợi cho cổ đông hiện hữu.
            title = (ev.get("eventTitleEn", "") or ev.get("eventTitleVi", "")).lower()
            is_rights_issue = any(k in title for k in ("quyền mua", "rights issue"))
            is_bonus_share = any(k in title for k in ("dividend", "co tuc", "cổ tức", "thưởng", "bonus"))
            is_non_dividend_issue = any(k in title for k in ("esop", "cbcnv", "riêng lẻ", "private placement", "employee"))
            if is_non_dividend_issue or not (is_rights_issue or is_bonus_share):
                continue
            ratio = safe_float(ev.get("exerciseRatio"))
            if not ratio or ratio <= 0:
                continue
            amount = ratio
            # "rights" (quyền mua, cổ đông TRẢ TIỀN theo giá phát hành) tách
            # riêng khỏi "stock" (cổ phiếu thưởng, MIỄN PHÍ) — 2 loại kinh tế
            # khác nhau, và thực tế hay xảy ra CÙNG 1 ngày GDKHQ cho cùng 1 mã
            # (đã verify MBS 24/09/2025: vừa thưởng 3% vừa quyền mua 12% cùng
            # lúc) — nếu gộp chung "stock" sẽ đụng khoá UNIQUE(symbol,ex_date,
            # dividend_type) và 1 trong 2 sự kiện bị ghi đè mất.
            div_type = "rights" if is_rights_issue else "stock"
            # payoutDate không tồn tại cho sự kiện ISS — displayDate2 thực chất
            # trùng publicDate (ngày công bố, TRƯỚC ex-date, vô nghĩa nếu coi
            # là "ngày thực hiện"). listingDate (ngày cổ phiếu mới được niêm
            # yết/giao dịch) là proxy gần đúng nhất có sẵn trong nguồn này.
            payment_date = parse_date(ev.get("listingDate"))
            key = (symbol, ex_date, div_type, round(amount, 6))

        if key in seen:
            continue
        seen.add(key)

        rows.append({
            "symbol":        symbol,
            "ex_date":       ex_date,
            "payment_date":  payment_date,
            "dividend_type": div_type,
            "amount":        amount,
        })

    return rows


# ── Dividend announcements (đã công bố ý định, CHƯA chốt exrightDate) ───────────

ANNOUNCEMENT_MAX_AGE_DAYS = 60  # quá hạn này mà VCI vẫn chưa xác nhận exrightDate
                                # thì ẩn "Dự kiến" khỏi UI thay vì hiện vô thời hạn
                                # — đã verify thực tế case OPC: GDKHQ thật đã qua
                                # 1+ ngày nhưng VCI vẫn CHƯA cập nhật exrightDate.


def fetch_dividend_announcements(symbol: str, events: list[dict]) -> list[dict]:
    """Lọc DIV/ISS events CHƯA có exrightDate (mới công bố ý định, chưa chốt
    lịch) → dividend_announcements rows. Soi gương fetch_dividends() nhưng
    ĐẢO NGƯỢC điều kiện exrightDate. Dùng cùng bộ keyword lọc ISS để tránh lẫn
    ESOP/phát hành riêng lẻ (không phải quyền lợi cổ đông)."""
    cutoff = (date.today() - timedelta(days=ANNOUNCEMENT_MAX_AGE_DAYS)).isoformat()
    rows = []
    seen = set()

    for ev in events:
        code = ev.get("eventCode", "")
        if code not in ("DIV", "ISS"):
            continue
        if ev.get("exrightDate"):
            continue  # đã chốt lịch thật — thuộc về fetch_dividends(), không phải "Dự kiến"

        announced_date = parse_date(ev.get("publicDate") or ev.get("displayDate1"))
        if not announced_date or announced_date < cutoff:
            continue  # quá cũ mà vẫn chưa chốt — có thể VCI trễ cập nhật hoặc sự
                      # kiện đã bị huỷ, không nên tiếp tục hiện "Dự kiến" vô thời hạn

        if code == "DIV":
            amount = safe_float(ev.get("valuePerShare"))
            if not amount or amount <= 0:
                continue
            div_type = "cash"
        else:
            title = (ev.get("eventTitleEn", "") or ev.get("eventTitleVi", "")).lower()
            is_rights_issue = any(k in title for k in ("quyền mua", "rights issue"))
            is_bonus_share = any(k in title for k in ("dividend", "co tuc", "cổ tức", "thưởng", "bonus"))
            is_non_dividend_issue = any(k in title for k in ("esop", "cbcnv", "riêng lẻ", "private placement", "employee"))
            if is_non_dividend_issue or not (is_rights_issue or is_bonus_share):
                continue
            ratio = safe_float(ev.get("exerciseRatio"))
            if not ratio or ratio <= 0:
                continue
            amount = ratio
            div_type = "rights" if is_rights_issue else "stock"

        key = (symbol, div_type, round(amount, 6))
        if key in seen:
            continue
        seen.add(key)

        rows.append({
            "symbol":         symbol,
            "dividend_type":  div_type,
            "amount":         amount,
            "announced_date": announced_date,
        })

    return rows


CONFIRMED_LOOKBACK_DAYS = 150  # đủ rộng để phủ: announced_date cũ nhất còn hợp lệ
                                # (60 ngày) + độ trễ xác nhận dài nhất từng đo được
                                # (vài tuần) — dùng để giới hạn query `dividends`
                                # khi đối chiếu, không cần quét toàn bộ lịch sử.


def cleanup_dividend_announcements(sb, symbol: str) -> None:
    """Xoá dòng 'Dự kiến' khi (1) đã có bản ghi CHÍNH THỨC CÙNG dividend_type
    với ex_date rơi TỪ announced_date trở về sau (tra thẳng bảng `dividends`
    trong DB — KHÔNG dựa vào kết quả fetch_dividends() của riêng lần chạy này,
    vì sự kiện có thể đã được 1 lần chạy TRƯỚC đó ghi nhận rồi), hoặc (2) đã
    quá hạn ANNOUNCEMENT_MAX_AGE_DAYS mà vẫn chưa chốt.

    CỐ Ý KHÔNG so khớp theo amount — đã verify thực tế BID 17/06/2026: tỷ lệ cổ
    phiếu ở giai đoạn công bố (6.84%) và tỷ lệ khi chốt chính thức (7%) LỆCH
    NHAU dù là CÙNG 1 đợt (VCI làm tròn khi chốt). So khớp theo amount làm sót,
    để dòng "Dự kiến" trùng ngay bên trên dòng ngày thật đã chốt."""
    cutoff = (date.today() - timedelta(days=ANNOUNCEMENT_MAX_AGE_DAYS)).isoformat()
    lookback = (date.today() - timedelta(days=CONFIRMED_LOOKBACK_DAYS)).isoformat()

    announcements = (
        sb.table("dividend_announcements")
        .select("id,dividend_type,announced_date")
        .eq("symbol", symbol)
        .execute()
        .data
        or []
    )
    if not announcements:
        return

    confirmed = (
        sb.table("dividends")
        .select("dividend_type,ex_date")
        .eq("symbol", symbol)
        .gte("ex_date", lookback)
        .execute()
        .data
        or []
    )

    stale_ids = [
        a["id"] for a in announcements
        if a["announced_date"] < cutoff
        or any(c["dividend_type"] == a["dividend_type"] and c["ex_date"] >= a["announced_date"] for c in confirmed)
    ]
    if stale_ids:
        sb.table("dividend_announcements").delete().in_("id", stale_ids).execute()


# ── Insider transactions ────────────────────────────────────────────────────────

MIN_INSIDER_DATE = "2020-01-01"  # insider cũ hơn không còn giá trị phân tích (tín
                                  # hiệu giao dịch nội bộ chỉ hữu ích khi gần thời
                                  # điểm hiện tại) — lọc ngay tại nguồn để không phí
                                  # dung lượng DB, KHÁC với dividends (giữ từ 2015,
                                  # lịch sử cổ tức vẫn có giá trị tra cứu dài hạn).


def fetch_insider(symbol: str, events: list[dict]) -> list[dict]:
    """Lọc DDIND / DDINS / DDRP events → insider_transactions rows.

    QUAN TRỌNG — giới hạn nguồn: VCI's events API chỉ có sự kiện "Đăng kí
    Mua/Bán" (ý định đăng ký), KHÔNG có sự kiện "đã hoàn tất" tách riêng với
    khối lượng thực hiện thật (đã verify: 100% event MBS/MBB gần đây chỉ có
    chữ "Đăng kí" trong title, không có bản ghi xác nhận kết quả). volume ở
    đây là KL ĐĂNG KÝ, có thể khác KL thực hiện thật ngoài đời (case MBB Phạm
    Thị Trung Hà: đăng ký bán 1.000.000, thực tế bán 678.900 — VCI không có
    con số 678.900 này). reg_start_date/reg_end_date lấy từ startDate/endDate
    — khoảng thời gian ĐĂNG KÝ, đã verify khớp đúng cột "Ngày đăng ký" trên
    trang tham chiếu."""
    rows = []
    seen = set()

    for ev in events:
        code = ev.get("eventCode", "")
        # DDIND = cá nhân nội bộ, DDINS = tổ chức, DDRP = NGƯỜI LIÊN QUAN (thân
        # nhân lãnh đạo — luật CK VN bắt buộc công bố, trước đây bị bỏ sót hoàn
        # toàn vì code khác DDIND/DDINS, dù đây là loại giao dịch có tín hiệu
        # quan trọng không kém).
        if code not in ("DDIND", "DDINS", "DDRP"):
            continue

        trade_date = parse_date(ev.get("publicDate") or ev.get("displayDate1"))
        if not trade_date or trade_date < MIN_INSIDER_DATE:
            continue

        reg_start_date = parse_date(ev.get("startDate"))
        reg_end_date = parse_date(ev.get("endDate"))

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
            "symbol":         symbol,
            "trade_date":     trade_date,
            "reg_start_date": reg_start_date,
            "reg_end_date":   reg_end_date,
            "insider_name":   insider_name,
            "position":       "Người liên quan" if code == "DDRP" else "",
            "trade_type":     trade_type,
            "volume":         volume,
            "price":          None,
            "total_value":    None,
            "source_url":     None,
        })

    return rows


# ── Main ──────────────────────────────────────────────────────────────────────

def main(backfill: bool = False):
    sb = get_client()
    symbols = get_active_symbols()

    if backfill:
        from_date = "2015-01-01"
    else:
        from_date = (date.today() - timedelta(days=INCREMENTAL_DAYS)).isoformat()

    total_div = total_ins = total_ann = 0
    failed: list[str] = []

    log.info("=" * 55)
    mode = "BACKFILL (full lịch sử)" if backfill else f"INCREMENTAL ({INCREMENTAL_DAYS} ngày gần nhất)"
    log.info(f"  SEED DIVIDENDS + INSIDER — {len(symbols)} mã active — {mode}")
    log.info("=" * 55)

    for i, symbol in enumerate(symbols, 1):
        log.info(f"  [{i:03d}/{len(symbols)}] {symbol}")

        events: list[dict] = []
        try:
            events = fetch_all_events(symbol, from_date=from_date)
        except Exception as e:
            log.warning(f"    events lỗi: {e}")

        # ── dividends ──
        div_rows: list[dict] = []
        try:
            div_rows = fetch_dividends(symbol, events)
            if div_rows:
                upsert_batch(sb, "dividends", div_rows, on_conflict="symbol,ex_date,dividend_type,amount")
                total_div += len(div_rows)
        except Exception as e:
            log.error(f"    dividends lỗi: {e}")
            failed.append(f"{symbol}/dividends")

        # ── dividend_announcements ("Dự kiến" — công bố nhưng chưa chốt GDKHQ) ──
        try:
            ann_rows = fetch_dividend_announcements(symbol, events)
            if ann_rows:
                upsert_batch(sb, "dividend_announcements", ann_rows, on_conflict="symbol,dividend_type,amount")
                total_ann += len(ann_rows)
            cleanup_dividend_announcements(sb, symbol)
        except Exception as e:
            log.error(f"    dividend_announcements lỗi: {e}")
            failed.append(f"{symbol}/dividend_announcements")

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
    log.info(f"  dividends             : {total_div} rows")
    log.info(f"  dividend_announcements: {total_ann} rows")
    log.info(f"  insider_transactions  : {total_ins} rows")
    if failed:
        log.warning(f"  Thất bại ({len(failed)}): {', '.join(failed)}")
    log.info("=" * 55)


if __name__ == "__main__":
    main(backfill="--backfill" in sys.argv)
