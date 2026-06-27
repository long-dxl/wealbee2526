"""
scheduler.py
------------
Lịch chạy tự động cho hệ thống phân tích cổ phiếu VN.

Lịch mặc định:
  - Tin tức (sync_vietstock_news): mỗi ngày lúc 07:00 Asia/Ho_Chi_Minh
  - Cơ bản (sync_fundamentals):   mỗi thứ Hai lúc 07:30 Asia/Ho_Chi_Minh

Chạy:
  python3 -m data.scheduler                      # chạy scheduler (blocking)
  python3 -m data.scheduler --now news           # chạy đồng bộ tin tức ngay
  python3 -m data.scheduler --now fundamentals   # chạy đồng bộ cơ bản ngay
  python3 -m data.scheduler --now all            # chạy cả hai ngay
"""

import sys
import argparse
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

# Load .env từ ROOT repo (chạy dạng `python -m data.scheduler` với cwd=root)
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

TIMEZONE = "Asia/Ho_Chi_Minh"


# ─────────────────────────────────────────────
# Job functions
# ─────────────────────────────────────────────

def job_sync_news():
    """Đồng bộ tin tức Vietstock hàng ngày (Sprint 2: trích xuất có cấu trúc)."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{ts}] ▶ Bắt đầu đồng bộ tin tức Vietstock (days_back=2)...")
    try:
        from data.sync_vietstock_news import run_pipeline

        # run_pipeline: crawl Top-10 + vĩ mô/ngành → KG + bảng news_articles
        # (bảng CHỈ lưu tin tác động +/- , bỏ tin trung lập/thủ tục; KG min_confidence=0.5)
        run_pipeline(days_back=2, min_confidence=0.5)

        ts_end = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts_end}] ✓ Đồng bộ tin tức hoàn thành.")
    except Exception as e:
        ts_err = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts_err}] ✗ Lỗi khi đồng bộ tin tức: {e}")


def job_sync_fundamentals():
    """Đồng bộ dữ liệu cơ bản cổ phiếu hàng tuần."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{ts}] ▶ Bắt đầu đồng bộ dữ liệu cơ bản (fundamentals)...")
    try:
        from data.sync_fundamentals import run_full_sync

        run_full_sync()

        ts_end = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts_end}] ✓ Đồng bộ dữ liệu cơ bản hoàn thành.")
    except Exception as e:
        ts_err = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts_err}] ✗ Lỗi khi đồng bộ dữ liệu cơ bản: {e}")


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def print_schedule(scheduler: BlockingScheduler):
    """In bảng lịch chạy tiếp theo của các job."""
    jobs = scheduler.get_jobs()
    print("\n┌─────────────────────────────────────────────────────────────────────┐")
    print("│           Lịch chạy tự động — kg-stock-vn Scheduler                 │")
    print("├──────────────────────────────┬──────────────────────────────────────┤")
    print(f"│ {'Tên job':<28} │ {'Lần chạy tiếp theo':<36} │")
    print("├──────────────────────────────┼──────────────────────────────────────┤")
    for job in jobs:
        next_run = (
            job.next_run_time.strftime("%Y-%m-%d %H:%M:%S %Z")
            if job.next_run_time
            else "chưa xác định"
        )
        print(f"│ {job.name:<28} │ {next_run:<36} │")
    print("└──────────────────────────────┴──────────────────────────────────────┘")
    print()


# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Scheduler đồng bộ dữ liệu cổ phiếu VN",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--now",
        metavar="TARGET",
        choices=["news", "fundamentals", "all"],
        help=(
            "Chạy ngay lập tức (không theo lịch):\n"
            "  news         — đồng bộ tin tức\n"
            "  fundamentals — đồng bộ dữ liệu cơ bản\n"
            "  all          — cả hai"
        ),
    )
    args = parser.parse_args()

    # ── Chế độ chạy ngay (one-shot) ──────────────────────────────────────
    if args.now:
        target = args.now
        print(f"\n[--now {target}] Chạy ngay, không theo lịch...\n")
        if target in ("news", "all"):
            job_sync_news()
        if target in ("fundamentals", "all"):
            job_sync_fundamentals()
        print("\nHoàn tất.")
        return

    # ── Chế độ scheduler (blocking) ──────────────────────────────────────
    scheduler = BlockingScheduler(timezone=TIMEZONE)

    scheduler.add_job(
        job_sync_news,
        trigger=CronTrigger(hour=7, minute=0, timezone=TIMEZONE),
        id="sync_news",
        name="Tin tức Vietstock (hàng ngày 07:00)",
        replace_existing=True,
    )

    scheduler.add_job(
        job_sync_fundamentals,
        trigger=CronTrigger(day_of_week="mon", hour=7, minute=30, timezone=TIMEZONE),
        id="sync_fundamentals",
        name="Dữ liệu cơ bản (thứ Hai 07:30)",
        replace_existing=True,
    )

    print_schedule(scheduler)
    print("Scheduler đang chạy. Nhấn Ctrl+C để dừng.\n")

    try:
        scheduler.start()
    except KeyboardInterrupt:
        print("\nĐang tắt scheduler...")
        scheduler.shutdown()
        print("Scheduler đã dừng.")


if __name__ == "__main__":
    main()
