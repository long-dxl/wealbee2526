"""
compute_beta.py
---------------
Tính Beta THẬT của từng cổ phiếu so với VN-Index từ dữ liệu giá vnstock, rồi
cập nhật vào properties.beta_vnindex của STOCK node (thay Beta mặc định chuyên gia).

Beta = Cov(r_stock, r_index) / Var(r_index)   — hồi quy lợi suất ngày, cửa sổ ~1 năm.
Beta > 1: nhạy hơn thị trường · Beta < 1: phòng thủ hơn.

Chạy SAU seed_sector_graph.py:  python3 -m data.compute_beta [--days 365]
"""

import os
import sys
import time
import argparse
import contextlib
import io
from datetime import datetime, timezone, timedelta

REQ_DELAY = 3.5   # giây giữa mỗi lần gọi vnstock (free tier ~20 req/phút)
FORCE = False     # tính lại cả mã đã có Beta thật (đặt qua --force)
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
sb: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))


@contextlib.contextmanager
def _quiet():
    with contextlib.redirect_stdout(io.StringIO()):
        yield


def _history(symbol: str, start: str, end: str):
    """Lấy chuỗi giá đóng cửa ngày từ vnstock (VCI). Bắt cả SystemExit (rate-limit)."""
    try:
        with _quiet():
            from vnstock.api.quote import Quote
            df = Quote(symbol=symbol, source="VCI").history(start=start, end=end, interval="1D")
        if df is None or df.empty:
            return None
        return df[["time", "close"]].copy()
    except BaseException as e:   # gồm SystemExit khi vnstock báo rate-limit
        print(f"  ⚠️ {symbol}: {str(e)[:60]}")
        return None


def compute_betas(days_back: int = 365):
    import pandas as pd

    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days_back)
    s, e = start.isoformat(), end.isoformat()

    print("="*60); print("COMPUTE BETA (vnstock vs VN-Index)"); print("="*60)
    print(f"Cửa sổ: {s} → {e}\n")

    # 1) Lợi suất VN-Index
    idx = _history("VNINDEX", s, e)
    if idx is None or len(idx) < 30:
        print("❌ Không lấy được dữ liệu VN-Index — dừng."); return
    idx = idx.rename(columns={"close": "idx"})
    idx["ret_idx"] = idx["idx"].astype(float).pct_change()
    var_idx = idx["ret_idx"].var()
    print(f"VN-Index: {len(idx)} phiên, var={var_idx:.6f}\n")

    # 2) Các mã STOCK trong KG
    stocks = sb.table("graph_nodes").select("entity_id,properties").eq("entity_type", "STOCK").execute()
    tickers = [r["entity_id"] for r in (stocks.data or [])]
    print(f"Tính Beta cho {len(tickers)} mã...\n")

    # Bản đồ properties hiện tại để biết mã nào đã có Beta thật
    props_map = {r["entity_id"]: (r.get("properties") or {}) for r in (stocks.data or [])}

    updated, skipped = 0, 0
    for t in tickers:
        # Bỏ qua mã đã tính Beta thật (tránh tốn request) trừ khi --force
        if not FORCE and props_map.get(t, {}).get("beta_source") == "computed":
            print(f"  ↪ {t}: đã có Beta thật ({props_map[t].get('beta_vnindex')}), bỏ qua")
            continue
        time.sleep(REQ_DELAY)   # giãn nhịp tránh rate-limit
        h = _history(t, s, e)
        if h is None or len(h) < 30:
            print(f"  - {t}: thiếu dữ liệu, giữ Beta cũ"); skipped += 1; continue
        h = h.rename(columns={"close": "px"})
        h["ret"] = h["px"].astype(float).pct_change()
        m = pd.merge(h[["time", "ret"]], idx[["time", "ret_idx"]], on="time", how="inner").dropna()
        if len(m) < 30 or var_idx == 0:
            print(f"  - {t}: không đủ điểm khớp, bỏ qua"); skipped += 1; continue
        cov = m["ret"].cov(m["ret_idx"])
        beta = round(cov / var_idx, 2)

        # cập nhật properties (giữ các trường khác)
        cur = next((r["properties"] for r in stocks.data if r["entity_id"] == t), {}) or {}
        cur["beta_vnindex"] = beta
        cur["beta_source"] = "computed"
        cur["beta_window_days"] = days_back
        cur["beta_computed_at"] = datetime.now(timezone.utc).isoformat()
        try:
            sb.table("graph_nodes").update({"properties": cur}).eq("entity_id", t).execute()
            print(f"  ✅ {t}: Beta = {beta}  ({len(m)} phiên)")
            updated += 1
        except Exception as ex:
            print(f"  ❌ {t}: lỗi cập nhật {ex}"); skipped += 1

    print(f"\n📊 Đã cập nhật Beta thật cho {updated} mã ({skipped} giữ mặc định).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--force", action="store_true", help="Tính lại cả mã đã có Beta thật")
    args = ap.parse_args()
    FORCE = args.force
    compute_betas(days_back=args.days)
