"""
sync_fundamentals.py
--------------------
Sync dữ liệu cổ phiếu THỰC từ vnstock v4 và vĩ mô từ Vietcombank API
vào Supabase Knowledge Graph.  Thay thế mock data trong schema seed.

Nguồn:
  - vnstock.api.company.Company     → giá, vốn hóa, rating, 52w range
  - vnstock.api.financial.Finance   → doanh thu, lợi nhuận theo quý
  - vietcombank.com.vn/api          → tỷ giá USD/VND thực
  - vnstock.api.listing.Listing     → danh sách sàn (kiểm tra ticker hợp lệ)

Chạy:
  python3 -m data.sync_fundamentals              # sync tất cả
  python3 -m data.sync_fundamentals --dry-run    # chỉ in ra, không lưu
  python3 -m data.sync_fundamentals --ticker HPG # sync 1 mã
"""

import os
import sys
import io
import argparse
import contextlib
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ============================================================
# CẤU HÌNH
# ============================================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Rổ ƯU TIÊN (tiering) gom về hồ sơ thị trường — sync THƯỜNG XUYÊN. Universe đầy đủ: --universe.
from markets.vn.config import PRIORITY_TICKERS
TOP_10_TICKERS = list(PRIORITY_TICKERS)   # giữ thứ tự cũ (sync ổn định)

VNSTOCK_SOURCE = "VCI"  # Nguồn dữ liệu vnstock

# Tỷ giá: Vietcombank XML
VCB_EXRATE_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10"

# Lãi suất điều hành NHNN — cập nhật thủ công khi có thay đổi
# (SBV không có public API; nguồn: sbv.gov.vn)
SBV_BASE_RATE_PCT   = 4.5   # % (tháng 5/2025 — giữ nguyên đến nay)
SBV_REFI_RATE_PCT   = 4.5   # Lãi suất tái cấp vốn
SBV_DISC_RATE_PCT   = 3.0   # Lãi suất tái chiết khấu

# Lãi suất Fed — cập nhật thủ công
FED_RATE_PCT = 4.5  # % (tháng 6/2026 — Federal Funds Rate)


# ============================================================
# LAZY SINGLETON CLIENTS
# ============================================================
_supabase: Client | None = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ============================================================
# SUPPRESS VNSTOCK BANNER
# ============================================================
@contextlib.contextmanager
def _suppress_stdout():
    """Tắt stdout tạm thời để không in banner quảng cáo của vnstock."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        yield


def _import_vnstock():
    """Import vnstock v4 lazily, tắt banner."""
    with _suppress_stdout():
        from vnstock.api.company import Company
        from vnstock.api.financial import Finance
    return Company, Finance


# ============================================================
# BƯỚC 1: LẤY DỮ LIỆU CỔ PHIẾU TỪ VNSTOCK
# ============================================================

def fetch_stock_fundamentals(ticker: str) -> dict | None:
    """
    Lấy dữ liệu cơ bản của một cổ phiếu từ vnstock v4.

    Returns dict với các fields:
      price, market_cap_vnd, 52w_high, 52w_low,
      revenue_q, net_profit_q, gross_profit_q, latest_quarter,
      analyst_rating, target_price, upside_pct,
      foreigner_pct, avg_volume_1m, dividend_vnd, description
    """
    Company, Finance = _import_vnstock()

    try:
        # ── Company overview ─────────────────────────────────
        c = Company(symbol=ticker, source=VNSTOCK_SOURCE)
        with _suppress_stdout():
            ov = c.overview()

        if ov is None or ov.empty:
            print(f"  ⚠️  {ticker}: không tìm thấy company overview")
            return None

        row = ov.iloc[0]

        def _safe(key, default=None):
            v = row.get(key, default)
            if v != v:  # NaN check
                return default
            return v

        market_cap   = _safe("market_cap")
        current_price = _safe("current_price")
        issue_share  = _safe("issue_share")

        # ── Financial statements ─────────────────────────────
        revenue_q    = None
        gross_q      = None
        net_profit_q = None
        latest_q     = None
        pe_computed  = None

        try:
            f = Finance(symbol=ticker, source=VNSTOCK_SOURCE)
            with _suppress_stdout():
                income = f.income_statement(period="quarter", lang="vi")

            data_cols = [c for c in income.columns if c not in ("item", "item_en", "item_id")]
            if data_cols:
                latest_q = data_cols[0]  # Mới nhất nằm đầu tiên

                def _get_income_row(en_name: str):
                    mask = income["item_en"] == en_name
                    if mask.any():
                        v = income.loc[mask, latest_q].values[0]
                        return float(v) if v == v else None
                    return None

                revenue_q    = _get_income_row("Net sales")
                gross_q      = _get_income_row("Gross Profit")
                net_profit_q = _get_income_row("Net profit/(loss) after tax")

                # Tính P/E từ vốn hóa / (4x lợi nhuận quý) như TTM proxy
                if market_cap and net_profit_q and net_profit_q > 0:
                    pe_computed = round(market_cap / (4 * net_profit_q), 2)

        except Exception as fe:
            print(f"  ⚠️  {ticker}: finance error — {fe}")

        # ── Analyst insight ──────────────────────────────────
        prev_insight = _safe("prev_insight") or {}
        if isinstance(prev_insight, dict):
            analyst_rating = prev_insight.get("rating") or _safe("rating")
            target_from_insight = prev_insight.get("targetPrice")
        else:
            analyst_rating = _safe("rating")
            target_from_insight = None

        target_price = target_from_insight or _safe("target_price")

        return {
            # Giá thị trường
            "price":               int(current_price) if current_price else None,
            "price_date":          datetime.now(timezone.utc).strftime("%Y-%m-%d"),

            # Vốn hóa
            "market_cap_vnd":      int(market_cap) if market_cap else None,
            "market_cap_trillion": round(market_cap / 1e12, 1) if market_cap else None,
            "issue_shares_mil":    round(float(issue_share) / 1e6, 1) if issue_share else None,

            # Biên độ giá 52 tuần
            "price_52w_high":      int(_safe("highest_price1_year")) if _safe("highest_price1_year") else None,
            "price_52w_low":       int(_safe("lowest_price1_year")) if _safe("lowest_price1_year") else None,

            # Tài chính theo quý (đơn vị: tỷ VND)
            "latest_quarter":      latest_q,
            "revenue_q_bn":        round(revenue_q / 1e9, 1) if revenue_q else None,
            "gross_profit_q_bn":   round(gross_q / 1e9, 1) if gross_q else None,
            "net_profit_q_bn":     round(net_profit_q / 1e9, 1) if net_profit_q else None,

            # Định giá
            "pe_ttm":              pe_computed,

            # Khuyến nghị analyst
            "analyst_rating":      analyst_rating,
            "analyst_name":        _safe("analyst"),
            "target_price":        int(target_price) if target_price else None,
            "upside_pct":          round(float(_safe("upside_to_target_percent", 0)) * 100, 1),

            # Thanh khoản & cổ đông
            "avg_volume_1m":       int(_safe("average_match_volume1_month")) if _safe("average_match_volume1_month") else None,
            "foreigner_pct":       round(float(_safe("foreigner_percentage", 0)) * 100, 1),
            "max_foreign_pct":     round(float(_safe("maximum_foreign_percentage", 0)) * 100, 1),
            "state_pct":           round(float(_safe("state_percentage", 0)) * 100, 1),
            "dividend_vnd":        int(_safe("dividend_per_share_tsr")) if _safe("dividend_per_share_tsr") else None,

            # Mô tả
            "description":         _safe("company_profile", ""),
            "sector_en":           _safe("sector", ""),

            # Metadata
            "data_source":         f"vnstock/{VNSTOCK_SOURCE}",
            "synced_at":           datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        print(f"  ❌ {ticker}: {e}")
        return None


# ============================================================
# BƯỚC 2: LẤY TỶ GIÁ USD/VND TỪ VIETCOMBANK
# ============================================================

def fetch_usd_vnd() -> dict | None:
    """Lấy tỷ giá USD/VND từ Vietcombank XML API."""
    try:
        r = requests.get(VCB_EXRATE_URL, timeout=8)
        r.raise_for_status()
        root = ET.fromstring(r.text)

        updated_str = root.findtext("DateTime") or ""
        for exrate in root.findall("Exrate"):
            if exrate.get("CurrencyCode") == "USD":
                buy_str      = exrate.get("Buy", "0").replace(",", "")
                transfer_str = exrate.get("Transfer", "0").replace(",", "")
                sell_str     = exrate.get("Sell", "0").replace(",", "")
                return {
                    "value":       round(float(transfer_str)),
                    "buy":         round(float(buy_str)),
                    "sell":        round(float(sell_str)),
                    "unit":        "VND per USD",
                    "source":      "Vietcombank",
                    "as_of":       updated_str.strip(),
                    "synced_at":   datetime.now(timezone.utc).isoformat(),
                }
    except Exception as e:
        print(f"  ❌ Vietcombank API lỗi: {e}")
    return None


# ============================================================
# BƯỚC 3: UPSERT VÀO SUPABASE
# ============================================================

def upsert_stock_node(ticker: str, data: dict, dry_run: bool = False) -> bool:
    """Cập nhật properties của STOCK node trong graph_nodes."""
    if dry_run:
        print(f"  [DRY-RUN] Sẽ upsert {ticker}: price={data.get('price')}, "
              f"pe={data.get('pe_ttm')}, rev={data.get('revenue_q_bn')}B")
        return True
    try:
        get_supabase().table("graph_nodes").update(
            {"properties": data, "updated_at": "now()"}
        ).eq("entity_id", ticker).eq("entity_type", "STOCK").execute()
        return True
    except Exception as e:
        print(f"  ❌ Upsert {ticker}: {e}")
        return False


def upsert_macro_node(entity_id: str, data: dict, dry_run: bool = False) -> bool:
    """Cập nhật properties của MACRO node trong graph_nodes."""
    if dry_run:
        print(f"  [DRY-RUN] Sẽ upsert macro {entity_id}: {data}")
        return True
    try:
        get_supabase().table("graph_nodes").update(
            {"properties": data, "updated_at": "now()"}
        ).eq("entity_id", entity_id).eq("entity_type", "MACRO").execute()
        return True
    except Exception as e:
        print(f"  ❌ Upsert macro {entity_id}: {e}")
        return False


# ============================================================
# PIPELINE CHÍNH
# ============================================================

def sync_stock_fundamentals(tickers: list[str], dry_run: bool = False) -> dict:
    """Sync fundamentals cho danh sách tickers."""
    print(f"\n{'='*60}")
    print(f"  BƯỚC 1: Sync fundamentals cổ phiếu ({len(tickers)} mã)")
    print(f"  Nguồn: vnstock/{VNSTOCK_SOURCE}")
    print(f"{'='*60}")

    stats = {"ok": 0, "err": 0}
    for ticker in tickers:
        sys.stdout.write(f"  Đang lấy {ticker}... ")
        sys.stdout.flush()
        data = fetch_stock_fundamentals(ticker)
        if data:
            ok = upsert_stock_node(ticker, data, dry_run)
            if ok:
                stats["ok"] += 1
                print(f"✅  giá={data.get('price'):,}đ  "
                      f"P/E={data.get('pe_ttm')}  "
                      f"doanh thu Q={data.get('revenue_q_bn')}B  "
                      f"({data.get('latest_quarter')})")
            else:
                stats["err"] += 1
        else:
            stats["err"] += 1
            print("❌")

    return stats


def sync_macro_data(dry_run: bool = False) -> dict:
    """Sync dữ liệu vĩ mô: tỷ giá + lãi suất."""
    print(f"\n{'='*60}")
    print(f"  BƯỚC 2: Sync dữ liệu vĩ mô")
    print(f"{'='*60}")
    stats = {"ok": 0, "err": 0}

    # ── Tỷ giá USD/VND ──────────────────────────────────────
    sys.stdout.write("  TY_GIA_USD_VND (Vietcombank)... ")
    sys.stdout.flush()
    usd_data = fetch_usd_vnd()
    if usd_data:
        usd_data["current_approx"] = usd_data["value"]  # backward compat
        ok = upsert_macro_node("TY_GIA_USD_VND", usd_data, dry_run)
        if ok:
            stats["ok"] += 1
            print(f"✅  mua={usd_data['buy']:,}  bán={usd_data['sell']:,}  as_of={usd_data['as_of']}")
        else:
            stats["err"] += 1
    else:
        stats["err"] += 1
        print("❌ không lấy được")

    # ── Lãi suất NHNN ────────────────────────────────────────
    sys.stdout.write("  LAI_SUAT_VN (NHNN — manual update)... ")
    sys.stdout.flush()
    sbv_data = {
        "base_rate_pct":    SBV_BASE_RATE_PCT,
        "refi_rate_pct":    SBV_REFI_RATE_PCT,
        "discount_rate_pct": SBV_DISC_RATE_PCT,
        "unit":             "percent",
        "set_by":           "SBV",
        "note":             "Manual — check sbv.gov.vn for latest",
        "synced_at":        datetime.now(timezone.utc).isoformat(),
    }
    ok = upsert_macro_node("LAI_SUAT_VN", sbv_data, dry_run)
    if ok:
        stats["ok"] += 1
        print(f"✅  base={SBV_BASE_RATE_PCT}%  refi={SBV_REFI_RATE_PCT}%")
    else:
        stats["err"] += 1; print("❌")

    # ── Lãi suất Fed ─────────────────────────────────────────
    sys.stdout.write("  LAI_SUAT_FED (manual update)... ")
    sys.stdout.flush()
    fed_data = {
        "value":    FED_RATE_PCT,
        "unit":     "percent",
        "impact":   "global",
        "note":     "Federal Funds Rate — manual update. Check federalreserve.gov",
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
    ok = upsert_macro_node("LAI_SUAT_FED", fed_data, dry_run)
    if ok:
        stats["ok"] += 1
        print(f"✅  fed={FED_RATE_PCT}%")
    else:
        stats["err"] += 1; print("❌")

    return stats


def run_full_sync(tickers: list[str] | None = None, dry_run: bool = False):
    """Pipeline đầy đủ: stocks + macro."""
    target = tickers or TOP_10_TICKERS
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    print(f"\n{'🔄 ' * 15}")
    print(f"  PIPELINE: SYNC FUNDAMENTALS → KNOWLEDGE GRAPH")
    print(f"  Thời gian : {now}")
    print(f"  Mục tiêu  : {', '.join(target)}")
    if dry_run:
        print(f"  Chế độ   : DRY-RUN (không lưu)")
    print(f"{'🔄 ' * 15}")

    s1 = sync_stock_fundamentals(target, dry_run)
    s2 = sync_macro_data(dry_run)

    total_ok  = s1["ok"] + s2["ok"]
    total_err = s1["err"] + s2["err"]

    print(f"\n{'='*60}")
    print(f"  ✅ HOÀN THÀNH")
    print(f"  Cổ phiếu : {s1['ok']}/{len(target)} thành công  ({s1['err']} lỗi)")
    print(f"  Vĩ mô    : {s2['ok']}/3 thành công  ({s2['err']} lỗi)")
    print(f"  Tổng     : {total_ok} ✅  {total_err} ❌")
    print(f"{'='*60}\n")

    return {"stocks": s1, "macro": s2}


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Sync fundamentals vào Knowledge Graph")
    ap.add_argument("--dry-run",  action="store_true", help="Chỉ in ra, không lưu")
    ap.add_argument("--ticker",   type=str, default=None, help="Chỉ sync 1 mã (vd: HPG)")
    ap.add_argument("--universe", action="store_true",
                    help="Sync TẦNG ĐẦY ĐỦ: toàn bộ universe trong KG (thay vì rổ ưu tiên)")
    args = ap.parse_args()

    if args.ticker:
        tickers = [args.ticker.upper()]
    elif args.universe:
        from core.agent_config import get_universe_tickers
        tickers = get_universe_tickers() or None
        print(f"  Tầng ĐẦY ĐỦ: {len(tickers or [])} mã trong universe")
    else:
        tickers = None   # mặc định = rổ ưu tiên (PRIORITY_TICKERS)
    run_full_sync(tickers=tickers, dry_run=args.dry_run)
