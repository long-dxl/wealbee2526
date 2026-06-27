"""
seed_universe.py — AUTO-SEED universe (VN100) vào KG để scale phân tích lên 100 mã.
=================================================================================
Mỗi mã: lấy vnstock overview → map NGÀNH qua ICB `sector` → upsert STOCK node +
BELONGS_TO_SECTOR + (Beta tính sau bằng compute_beta). Idempotent: mã ĐÃ có sector
curated thì GIỮ (không ghi đè). Rate-limit aware (key 60/phút).

Chạy:  python3 -m data.seed_universe            # seed full VN100 + tính Beta
       python3 -m data.seed_universe --limit 10 # seed thử 10 mã đầu (verify)
       python3 -m data.seed_universe --no-beta  # bỏ bước tính Beta
"""
import argparse
import contextlib
import io
import time
import warnings

warnings.filterwarnings("ignore")

from core.agent_config import get_supabase
from data.seed_sector_graph import upsert_node, upsert_edge

# vnstock ICB `sector` (tiếng Anh) → SECTOR_* node trong KG (19 ngành). None = bỏ qua (mã vẫn tạo node,
# không gắn ngành → agent fallback web_search cho ngành mã đó). Mã đã curated sẵn được GIỮ nguyên.
_ICB_SECTOR = {
    "Banks": "SECTOR_BANKING",
    "Financial Services": "SECTOR_SECURITIES",
    "Insurance": "SECTOR_INSURANCE",
    "Real Estate": "SECTOR_REALESTATE",
    "Basic Resources": "SECTOR_STEEL",
    "Construction & Materials": "SECTOR_CONSTRUCTION",
    "Food & Beverage": "SECTOR_CONSUMER",
    "Personal & Household Goods": "SECTOR_CONSUMER",
    "Retail": "SECTOR_CONSUMER",
    "Technology": "SECTOR_TECH",
    "Telecommunications": "SECTOR_TECH",
    "Oil & Gas": "SECTOR_OIL_GAS",
    "Utilities": "SECTOR_UTILITIES",
    "Industrial Goods & Services": "SECTOR_INDUSTRIAL",
    "Chemicals": "SECTOR_FERTILIZER",
    "Travel & Leisure": "SECTOR_AVIATION",
    "Automobiles & Parts": "SECTOR_TIRE",
}


def get_vn100() -> list[str]:
    from vnstock.api.listing import Listing
    with contextlib.redirect_stdout(io.StringIO()):
        syms = Listing(source="VCI").symbols_by_group("VN100")
    return [str(s).strip().upper() for s in syms]


def _overview(sym: str):
    from vnstock.api.company import Company
    for attempt in range(3):
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                ov = Company(symbol=sym, source="VCI").overview()
            return ov.iloc[0] if (ov is not None and not ov.empty) else None
        except (Exception, SystemExit):
            time.sleep(4)
    return None


def seed(tickers: list[str], compute_beta: bool = True) -> dict:
    sb = get_supabase()
    # mã đã có sector curated → giữ nguyên (không auto-override)
    existing = {}
    try:
        for n in sb.table("graph_nodes").select("entity_id,properties").eq("entity_type", "STOCK").execute().data or []:
            existing[n["entity_id"]] = (n.get("properties") or {}).get("sector")
    except Exception:
        pass
    valid_sectors = set(_ICB_SECTOR.values()) | set(existing.values())
    stat = {"seeded": 0, "kept": 0, "no_sector": 0, "membership": 0, "fail": 0, "unmapped": []}

    for i, tk in enumerate(tickers, 1):
        if existing.get(tk):                       # đã có ngành curated → giữ
            stat["kept"] += 1
            continue
        row = _overview(tk)
        if row is None:
            stat["fail"] += 1
            print(f"  [{i}/{len(tickers)}] {tk}: ✗ không lấy được overview")
            continue
        icb = str(row.get("sector") or "").strip()
        name = str(row.get("short_name") or row.get("organ_name") or tk)[:120]
        sector = _ICB_SECTOR.get(icb)
        mc = row.get("market_cap")
        props = {"beta_vnindex": 1.0, "beta_source": "default"}
        if mc:
            try:
                props["market_cap_trillion"] = round(float(mc) / 1e12, 2)
            except Exception:
                pass
        if sector:
            props["sector"] = sector
        upsert_node(tk, "STOCK", name, props)
        if sector:
            # data_source PHẢI thuộc CHECK chk_data_source (expert_seed|macro_logic|news) — dùng expert_seed
            if upsert_edge(tk, sector, "BELONGS_TO_SECTOR",
                           {"role": "member", "via": "icb_auto"}, 0.9, data_source="expert_seed"):
                stat["membership"] += 1
            stat["seeded"] += 1
            print(f"  [{i}/{len(tickers)}] {tk} ({name[:24]}) → {sector}  [ICB: {icb}]")
        else:
            stat["no_sector"] += 1
            stat["unmapped"].append(f"{tk}({icb})")
            print(f"  [{i}/{len(tickers)}] {tk}: ⚠ ngành '{icb}' chưa map → node tạo, KHÔNG gắn ngành")
        time.sleep(1.1)                            # nhẹ nhàng với vnstock

    print(f"\n  ✅ seeded {stat['seeded']} (membership {stat['membership']}) · giữ {stat['kept']} "
          f"· chưa map ngành {stat['no_sector']} · lỗi {stat['fail']}")
    if stat["unmapped"]:
        print("  ⚠ ICB chưa map:", ", ".join(stat["unmapped"]))

    if compute_beta and stat["seeded"]:
        print("\n  ▶ Tính Beta thật cho mã mới...")
        try:
            from data.compute_beta import compute_betas
            compute_betas()                        # tự bỏ qua mã đã có beta computed
        except Exception as e:
            print(f"  ⚠ Bỏ qua compute_beta: {str(e)[:120]}")
    return stat


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="chỉ seed N mã đầu (verify)")
    ap.add_argument("--no-beta", action="store_true")
    args = ap.parse_args()
    uni = get_vn100()
    print(f"VN100: {len(uni)} mã. {'Seed thử ' + str(args.limit) if args.limit else 'Seed FULL'}.")
    seed(uni[:args.limit] if args.limit else uni, compute_beta=not args.no_beta)
