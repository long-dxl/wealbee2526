"""
detect_exchange_anomalies.py — Lớp 1 phát hiện chủ động mã bị gán sai sàn.

Vì sao cần: `stocks.exchange` không có cơ chế đồng bộ lại sau khi seed 1 lần
(xem migration 20260712010000_exchange_review_queue.sql). Kịch bản đã xảy ra
thực tế (2026-07-12): SDA/AAV/DDG/VAF bị hủy niêm yết HOSE/HNX → chuyển UPCoM,
nhưng `exchange` vẫn giữ giá trị cũ nhiều tháng liền → lộ ra ở Top tăng/giảm
dashboard vì %biến động vượt trần sàn đang gán — điều KHÔNG THỂ xảy ra nếu
đúng sàn (biên độ được sàn khớp lệnh enforce ở nguồn), nên đây là tín hiệu
đáng tin cậy để phát hiện, không cần nguồn dữ liệu ngoài nào khác.

Logic: mỗi phiên, so %thay đổi giá đóng cửa hôm nay vs hôm trước của MỌI mã
với trần biên độ của SÀN ĐANG GÁN trong `stocks` (HOSE ±6.9%/HNX ±9.9%/
UPCoM ±14.9% — PHẢI khớp ceilFloorThreshold() ở dashboard-new.tsx để nhất
quán). Vượt trần → ghi vào `exchange_review_queue` để review — KHÔNG tự sửa
`stocks.exchange`, vì biết sai không đồng nghĩa biết đúng là sàn nào.

Chạy: cron sau job giá EOD (15:00 T2-T6), xem kg-stock-vn/deploy/crontab.txt.
    python detect_exchange_anomalies.py
"""

import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client, upsert_batch  # load .env + SUPABASE_SERVICE_KEY

# Trần biên độ QUY ĐỊNH thật của từng sàn (7%/10%/15%) CỘNG buffer nhỏ (0.5đ%)
# để tránh làm tròn. LƯU Ý: đây KHÁC ceilFloorThreshold() ở dashboard-new.tsx
# (6.9/9.9/14.9) — chỗ đó cố tình thấp hơn trần thật 1 chút để TÔ MÀU UI "gần
# trần", còn ở đây cần đúng trần THẬT để không báo nhầm 1 phiên tăng/giảm trần
# hợp lệ (vd HOSE +6.99% là bình thường, không phải lỗi gán sai sàn).
THRESHOLDS = {"HOSE": 7.5, "HNX": 10.5, "UPCoM": 15.5, "UPCOM": 15.5}
DEFAULT_THRESHOLD = 7.5  # sàn lạ/rỗng/None → coi chặt nhất (HOSE), ít bỏ sót nhất

WINDOW_DAYS = 10  # đủ bao cuối tuần/lễ dài để lấy được 2 phiên gần nhất mỗi mã


def _paged(sb, table: str, cols: str, build=None) -> list[dict]:
    """Đọc hết 1 bảng/query, vượt giới hạn cứng 1000 dòng/request của PostgREST."""
    out: list[dict] = []
    off = 0
    while True:
        q = sb.table(table).select(cols)
        if build:
            q = build(q)
        rows = q.range(off, off + 999).execute().data
        if not rows:
            break
        out.extend(rows)
        if len(rows) < 1000:
            break
        off += 1000
    return out


def detect() -> int:
    sb = get_client()

    exchange_map: dict[str, str] = {}
    for r in _paged(sb, "stocks", "symbol,exchange"):
        exchange_map[r["symbol"]] = (r.get("exchange") or "").strip()

    cutoff = (datetime.now() - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
    prices = _paged(
        sb, "prices_daily", "symbol,date,close",
        build=lambda q: q.gte("date", cutoff).order("date", desc=True).order("id", desc=True),
    )

    by_sym: dict[str, list[dict]] = {}
    for p in prices:
        by_sym.setdefault(p["symbol"], []).append(p)

    flagged = []
    for sym, rows in by_sym.items():
        rows.sort(key=lambda r: r["date"], reverse=True)
        latest = rows[0]
        prev = rows[1] if len(rows) > 1 else None
        if not prev or not prev.get("close") or float(prev["close"]) <= 0:
            continue
        pct = (float(latest["close"]) - float(prev["close"])) / float(prev["close"]) * 100
        exch = exchange_map.get(sym, "")
        threshold = THRESHOLDS.get(exch, DEFAULT_THRESHOLD)
        if abs(pct) > threshold:
            flagged.append({
                "symbol": sym, "date": latest["date"], "pct_change": round(pct, 2),
                "assigned_exchange": exch or "(trống)", "threshold_pct": threshold,
            })

    if flagged:
        n = upsert_batch(sb, "exchange_review_queue", flagged, "symbol,date")
        print(f"⚠️  Phát hiện {n} mã có %biến động vượt trần sàn đang gán — đã ghi vào exchange_review_queue:")
        for f in sorted(flagged, key=lambda f: -abs(f["pct_change"]))[:20]:
            print(f"   {f['symbol']:8} {f['pct_change']:+.2f}%  (gán: {f['assigned_exchange']}, trần: ±{f['threshold_pct']}%)  ngày {f['date']}")
        if len(flagged) > 20:
            print(f"   … và {len(flagged) - 20} mã khác")
    else:
        print("✅ Không phát hiện mã nào vượt trần sàn đang gán.")

    return len(flagged)


def main():
    print("=" * 55)
    print(f"🔍  Kiểm tra bất thường sàn niêm yết ({datetime.now():%d/%m/%Y %H:%M})")
    print("=" * 55)
    detect()


if __name__ == "__main__":
    main()
