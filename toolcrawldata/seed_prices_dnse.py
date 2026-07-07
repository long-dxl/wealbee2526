"""
seed_prices_dnse.py — Cập nhật giá OHLCV từ DNSE (entrade chart API).

Vì sao DNSE thay cho Yahoo:
  - Yahoo `.VN` vẫn có giá cổ phiếu, NHƯNG ticker chỉ số ^VNINDEX/^HNX đã chết
    (HTTP 404 "Quote not found") → không cập nhật được index.
  - DNSE entrade chart API (public, không cần auth) phủ CẢ cổ phiếu LẪN chỉ số,
    dữ liệu tới ngày giao dịch gần nhất. Đây cũng là nguồn giá VN-native của hệ thống.
  - DNSE trả giá LỊCH SỬ đã ĐIỀU CHỈNH sẵn (back-adjusted) mỗi khi có sự kiện chia
    cổ tức/phát hành (đã verify thực tế: gọi lại API hôm nay cho 1 mốc GDKHQ cổ tức
    cổ phiếu 21% quá khứ không hề có gap giá, khớp với dữ liệu đang lưu) — nghĩa là
    hệ thống KHÔNG cần tự viết logic tính hệ số điều chỉnh, chỉ cần re-pull sâu mỗi
    khi có sự kiện mới để đồng bộ lại các ngày đã lưu trước đó (xem seed_corporate_action_repull).

Đơn vị:
  - Cổ phiếu: DNSE trả giá theo NGHÌN đồng (vd MWG = 79.1) → nhân 1000 = VND (79.100),
    khớp convention bảng prices_daily.
  - Chỉ số: để nguyên điểm số (vd VNINDEX = 1869.04).

Ghi vào: prices_daily (symbol,date) + market_indices (index_code,date) — upsert idempotent.

Chạy:
  python seed_prices_dnse.py              # job hàng ngày: toàn bộ mã + 4 chỉ số, rolling 35 ngày,
                                           # + re-pull sâu các mã vừa có sự kiện cổ tức/phát hành
  python seed_prices_dnse.py --intraday   # cập nhật realtime trong phiên (toàn bộ 702 mã active
                                           # = full HOSE+HNX + 4 chỉ số) — tự bỏ qua nếu ngoài giờ
                                           # giao dịch/cuối tuần.
                                           # Cron nên gọi mỗi 5-10 phút trong 2 khung giờ giao dịch.
  python seed_prices_dnse.py --backfill   # chạy 1 LẦN: kéo sâu ~420 ngày (đủ >1 năm) cho TOÀN BỘ
                                           # mã + chỉ số, để phục vụ biểu đồ so sánh hiệu suất dài hạn.
"""

import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import time
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client, upsert_batch  # load .env + SUPABASE_SERVICE_KEY

DNSE_BASE   = "https://services.entrade.com.vn/chart-api/v2/ohlcs"
HEADERS     = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36"}
FETCH_DAYS  = 60          # cửa sổ kéo về hàng ngày (đủ lấp khoảng trống + overlap)
UPSERT_DAYS = 35          # job hàng ngày chỉ upsert các ngày trong khoảng này (đảm bảo change_pt có prev_close)
BACKFILL_DAYS = 420       # kéo sâu 1 lần cho lịch sử >1 năm, hoặc khi 1 mã vừa có sự kiện cổ tức/phát hành
DIVIDEND_LOOKBACK_DAYS = 10  # ex_date trong N ngày gần đây → coi là "vừa xảy ra", cần re-pull sâu

INDICES = {"VNINDEX": "VNINDEX", "HNX": "HNX", "VN30": "VN30", "UPCOM": "UPCOM"}  # index_code -> DNSE symbol

VN_TZ = timezone(timedelta(hours=7))
# Khung giờ giao dịch HOSE/HNX/UPCOM (giờ VN) — sáng 9h-11h30, chiều 13h-14h45.
SESSION_WINDOWS = [((9, 0), (11, 30)), ((13, 0), (14, 45))]


def _fetch(kind: str, symbol: str, days: int = FETCH_DAYS, resolution: str = "1D") -> list[dict]:
    """kind = 'stock' | 'index'. Trả về list dict OHLCV theo ngày/nến (đã sort tăng dần).
    resolution='1D' → nến ngày (chỉ có bar đã CHỐT, KHÔNG có bar của hôm nay khi thị trường
    chưa đóng cửa — đã verify thực tế). resolution='1' → nến 1 phút, cập nhật gần như tức thời
    trong phiên (verify thực tế: nến phút mới nhất chỉ trễ ~1-2 phút so với giờ thực)."""
    frm = int((datetime.now() - timedelta(days=days)).timestamp())
    to  = int((datetime.now() + timedelta(days=1)).timestamp())
    url = f"{DNSE_BASE}/{kind}?from={frm}&to={to}&symbol={symbol}&resolution={resolution}"
    r = requests.get(url, headers=HEADERS, timeout=25)
    r.raise_for_status()
    d = r.json()
    out = []
    for t, o, h, l, c, v in zip(d.get("t", []), d.get("o", []), d.get("h", []), d.get("l", []), d.get("c", []), d.get("v", [])):
        out.append({
            "date": datetime.fromtimestamp(t).strftime("%Y-%m-%d"),
            "o": o, "h": h, "l": l, "c": c, "v": int(v or 0),
        })
    return out


def _paged_symbols(sb, table: str, col: str = "symbol") -> set:
    """Đọc hết cột mã của 1 bảng (vượt giới hạn 1000 dòng)."""
    out, off = set(), 0
    while True:
        rows = sb.table(table).select(col).range(off, off + 999).execute().data
        if not rows:
            break
        out.update(x[col] for x in rows if x.get(col))
        if len(rows) < 1000:
            break
        off += 1000
    return out


def get_db_symbols() -> list[str]:
    """Danh sách mã cần cập nhật giá = mã đã có trong prices_daily HỢP với TOÀN BỘ mã
    trong `tickers` (401 HOSE) → đảm bảo phủ đủ 400+ HOSE, kể cả mã mới niêm yết."""
    sb = get_client()
    syms = _paged_symbols(sb, "prices_daily")
    try:
        syms |= _paged_symbols(sb, "tickers")   # đảm bảo đủ HOSE
    except Exception as e:
        print(f"  (không đọc được tickers, chỉ dùng prices_daily: {str(e)[:80]})")
    return sorted(syms)


def seed_stocks(symbols: list[str], days: int = FETCH_DAYS, upsert_days: int | None = UPSERT_DAYS) -> int:
    """upsert_days=None → ghi đè TOÀN BỘ bar fetch được (dùng cho backfill sâu / re-pull sau
    sự kiện cổ tức, vì DNSE tính lại giá điều chỉnh cho CẢ quá khứ, cần đồng bộ lại)."""
    cutoff = (datetime.now() - timedelta(days=upsert_days)).strftime("%Y-%m-%d") if upsert_days else None
    rows = []
    for sym in symbols:
        try:
            bars = _fetch("stock", sym, days=days)
            n = 0
            for b in bars:
                if cutoff and b["date"] < cutoff:
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


def seed_indices(days: int = FETCH_DAYS, upsert_days: int | None = UPSERT_DAYS) -> int:
    cutoff = (datetime.now() - timedelta(days=upsert_days)).strftime("%Y-%m-%d") if upsert_days else None
    rows = []
    for code, dnse_sym in INDICES.items():
        try:
            bars = _fetch("index", dnse_sym, days=days)
            prev = None
            n = 0
            for b in bars:
                c = b["c"]
                chg_pt  = round(c - prev, 2) if prev is not None else None
                chg_pct = round((c - prev) / prev * 100, 2) if prev else None
                if not cutoff or b["date"] >= cutoff:
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


def seed_corporate_action_repull() -> int:
    """Mã vừa có sự kiện chia cổ tức/phát hành (ex_date trong DIVIDEND_LOOKBACK_DAYS ngày
    gần đây) → DNSE có thể đã tính lại TOÀN BỘ chuỗi giá quá khứ (back-adjusted) cho mã đó
    → re-pull sâu BACKFILL_DAYS ngày, ghi đè lên dữ liệu cũ để đồng bộ lại đúng giá đã điều
    chỉnh (không giới hạn UPSERT_DAYS như job hàng ngày thường)."""
    sb = get_client()
    today = datetime.now().strftime("%Y-%m-%d")
    cutoff = (datetime.now() - timedelta(days=DIVIDEND_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    divs = (sb.table("dividends").select("symbol,ex_date")
              .gte("ex_date", cutoff).lte("ex_date", today).execute().data)
    symbols = sorted({d["symbol"] for d in divs})
    if not symbols:
        print("  (không có sự kiện cổ tức/phát hành nào gần đây cần re-pull)")
        return 0
    print(f"  Phát hiện {len(symbols)} mã vừa GDKHQ trong {DIVIDEND_LOOKBACK_DAYS} ngày qua "
          f"→ re-pull sâu {BACKFILL_DAYS} ngày: {', '.join(symbols)}")
    return seed_stocks(symbols, days=BACKFILL_DAYS, upsert_days=None)


def backfill_all(days: int = BACKFILL_DAYS) -> None:
    """Chạy 1 LẦN: kéo sâu lịch sử (mặc định ~420 ngày, đủ hơn 1 năm) cho TOÀN BỘ mã +
    chỉ số. Dùng cho lần backfill ban đầu hoặc khi cần bù lịch sử cho mã mới thêm."""
    symbols = get_db_symbols()
    print(f"🔁 BACKFILL sâu {days} ngày cho {len(symbols)} mã + {len(INDICES)} chỉ số...")
    seed_stocks(symbols, days=days, upsert_days=None)
    print()
    seed_indices(days=days, upsert_days=None)


def is_in_session(now_vn: datetime | None = None) -> bool:
    now_vn = now_vn or datetime.now(VN_TZ)
    if now_vn.weekday() >= 5:  # Thứ 7, CN
        return False
    hm = (now_vn.hour, now_vn.minute)
    return any(start <= hm <= end for start, end in SESSION_WINDOWS)


def _aggregate_today_bars(bars_1min: list[dict]) -> dict | None:
    """Gộp các nến 1 phút của hôm nay thành 1 OHLCV — vì DNSE resolution=1D KHÔNG trả
    bar của ngày đang giao dịch (chỉ có bar đã chốt), nên realtime trong phiên phải tự
    gộp từ nến phút."""
    if not bars_1min:
        return None
    return {
        "o": bars_1min[0]["o"],
        "h": max(b["h"] for b in bars_1min),
        "l": min(b["l"] for b in bars_1min),
        "c": bars_1min[-1]["c"],
        "v": sum(b["v"] for b in bars_1min),
    }


def _intraday_symbol_scope(sb) -> list[str]:
    """Phạm vi realtime: TOÀN BỘ mã active trong `tickers` (= full 2 sàn HOSE+HNX,
    702 mã — bảng `tickers` không có mã UPCOM nào) để Top tăng/giảm + heatmap ngành
    toàn thị trường luôn phản ánh đúng dữ liệu trong phiên, không chỉ riêng VN30/
    danh mục. Đổi từ phạm vi hẹp (VN30 ∪ portfolio) theo yêu cầu — đánh đổi là tải
    API DNSE cao hơn hẳn (702 vs ~30 mã mỗi lần chạy), cần giãn chu kỳ cron."""
    out, off = set(), 0
    while True:
        rows = (sb.table("tickers").select("symbol").eq("is_active", True)
                  .range(off, off + 999).execute().data)
        if not rows:
            break
        out.update(r["symbol"] for r in rows)
        if len(rows) < 1000:
            break
        off += 1000
    return sorted(out)


def seed_intraday(force: bool = False) -> int:
    """Cập nhật giá/khối lượng TRONG PHIÊN bằng nến 1 phút (gộp lại thành OHLCV của hôm
    nay), ghi đè liên tục vào đúng dòng ngày hôm nay — job EOD cuối ngày (resolution=1D,
    chạy trong main()) sẽ ghi đè lại 1 lần nữa bằng bar đã CHỐT chính thức, nên không
    xung đột. Tự bỏ qua nếu ngoài giờ giao dịch/cuối tuần/ngày lễ (DNSE trả rỗng cho ngày
    lễ y hệt cuối tuần — đã verify thực tế, không cần lịch nghỉ lễ riêng)."""
    now_vn = datetime.now(VN_TZ)
    if not force and not is_in_session(now_vn):
        print(f"⏭  Ngoài giờ giao dịch ({now_vn:%Y-%m-%d %H:%M %A}) — bỏ qua intraday refresh.")
        return 0

    sb = get_client()
    today_str = now_vn.strftime("%Y-%m-%d")
    symbols = _intraday_symbol_scope(sb)
    print(f"⚡ Intraday refresh lúc {now_vn:%H:%M:%S} — {len(symbols)} mã (full HOSE+HNX)")

    rows = []
    for sym in symbols:
        try:
            bars = [b for b in _fetch("stock", sym, days=1, resolution="1") if b["date"] == today_str]
            agg = _aggregate_today_bars(bars)
            if agg:
                rows.append({
                    "symbol": sym, "date": today_str,
                    "open": round(agg["o"] * 1000, 2), "high": round(agg["h"] * 1000, 2),
                    "low": round(agg["l"] * 1000, 2), "close": round(agg["c"] * 1000, 2),
                    "volume": agg["v"], "value": None,
                })
        except Exception as e:
            print(f"  {sym}: ERROR intraday — {e}")
        time.sleep(0.1)
    n_stocks = upsert_batch(sb, "prices_daily", rows, "symbol,date")
    print(f"  ✅ {n_stocks}/{len(symbols)} mã cập nhật (prices_daily)")

    idx_rows = []
    for code, dnse_sym in INDICES.items():
        try:
            bars = [b for b in _fetch("index", dnse_sym, days=1, resolution="1") if b["date"] == today_str]
            agg = _aggregate_today_bars(bars)
            if agg:
                prev_rows = (sb.table("market_indices").select("close").eq("index_code", code)
                               .lt("date", today_str).order("date", desc=True).limit(1).execute().data)
                prev_close = prev_rows[0]["close"] if prev_rows else None
                chg_pt  = round(agg["c"] - prev_close, 2) if prev_close else None
                chg_pct = round((agg["c"] - prev_close) / prev_close * 100, 2) if prev_close else None
                idx_rows.append({
                    "index_code": code, "date": today_str,
                    "open": round(agg["o"], 2), "high": round(agg["h"], 2), "low": round(agg["l"], 2),
                    "close": round(agg["c"], 2), "volume": agg["v"],
                    "change_pt": chg_pt, "change_pct": chg_pct,
                })
        except Exception as e:
            print(f"  {code}: ERROR intraday — {e}")
        time.sleep(0.1)
    n_idx = upsert_batch(sb, "market_indices", idx_rows, "index_code,date")
    print(f"  ✅ {n_idx}/{len(INDICES)} chỉ số cập nhật (market_indices)")
    return n_stocks + n_idx


def verify():
    sb = get_client()
    print("\n" + "=" * 55 + "\n  VERIFY\n" + "=" * 55)
    for s in ["MWG", "VCB", "FPT"]:
        r = sb.table("prices_daily").select("date,close").eq("symbol", s).order("date", desc=True).limit(1).execute().data
        print(f"  {s:8} mới nhất: {r[0]['date']}  close={r[0]['close']:,.0f}" if r else f"  {s}: none")
    for code in INDICES:
        r = sb.table("market_indices").select("date,close,change_pct").eq("index_code", code).order("date", desc=True).limit(1).execute().data
        if r:
            print(f"  {code:8} mới nhất: {r[0]['date']}  close={r[0]['close']:,.2f}  ({r[0]['change_pct']:+}%)" if r[0]['change_pct'] is not None
                  else f"  {code:8} mới nhất: {r[0]['date']}  close={r[0]['close']:,.2f}")


def main():
    print("=" * 55)
    print(f"📈  Cập nhật giá DNSE → hôm nay ({datetime.now():%d/%m/%Y %H:%M})")
    print("=" * 55)
    symbols = get_db_symbols()
    print(f"  {len(symbols)} mã trong DB\n")
    seed_stocks(symbols)
    print()
    seed_indices()
    print()
    print("— Kiểm tra sự kiện cổ tức/phát hành gần đây (re-pull sâu nếu có) —")
    seed_corporate_action_repull()
    verify()


if __name__ == "__main__":
    if "--intraday" in sys.argv:
        seed_intraday(force="--force" in sys.argv)
    elif "--backfill" in sys.argv:
        backfill_all()
    else:
        main()
