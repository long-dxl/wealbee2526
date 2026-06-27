"""
seed_kg_v2.py — Nạp TAXONOMY (event + ngành ICB) và BACKFILL Entity master cho KG v2.
Chạy SAU khi đã chạy migration_kg_v2.sql trên Supabase SQL Editor.

    python3 -m data.seed_kg_v2            # seed taxonomy + backfill entities + relations
    python3 -m data.seed_kg_v2 --taxonomy-only
"""
import os
import sys
import argparse
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

# ============================================================
# 1) TAXONOMY SỰ KIỆN (phân cấp: category gốc + leaf)
# ============================================================
EVENT_CATEGORIES = [
    ("CORPORATE",  "Hoạt động doanh nghiệp"), ("EARNINGS", "Kết quả kinh doanh"),
    ("CAPITAL",    "Vốn & cổ phiếu"),         ("GOVERNANCE", "Quản trị & nội bộ"),
    ("MA",         "M&A & hợp tác"),          ("REGULATORY", "Chính sách & pháp lý"),
    ("MACRO",      "Vĩ mô"),                  ("MARKET",   "Thị trường & dòng tiền"),
    ("SECTOR",     "Ngành"),                  ("RATING",   "Định hạng & khuyến nghị"),
    ("RISK",       "Rủi ro"),
]
EVENT_TYPES = [
    # code, name_vi, category, polarity
    ("EARN.RESULT",     "Công bố KQKD",               "EARNINGS",   "CONTEXT"),
    ("EARN.PROFIT_UP",  "Lợi nhuận tăng/vượt KH",     "EARNINGS",   "POSITIVE"),
    ("EARN.PROFIT_DOWN","Lợi nhuận giảm/lỗ",          "EARNINGS",   "NEGATIVE"),
    ("EARN.GUIDANCE",   "Kế hoạch/dự báo lợi nhuận",  "EARNINGS",   "CONTEXT"),
    ("CAPITAL.DIVIDEND","Cổ tức",                     "CAPITAL",    "POSITIVE"),
    ("CAPITAL.ESOP",    "Phát hành ESOP (pha loãng)", "CAPITAL",    "NEGATIVE"),
    ("CAPITAL.ISSUE",   "Phát hành/tăng vốn",         "CAPITAL",    "CONTEXT"),
    ("CAPITAL.BUYBACK", "Mua cổ phiếu quỹ",           "CAPITAL",    "POSITIVE"),
    ("MA.ACQUISITION",  "Thâu tóm/M&A",               "MA",         "CONTEXT"),
    ("MA.PARTNERSHIP",  "Hợp tác/liên doanh",         "MA",         "POSITIVE"),
    ("MA.DIVEST",       "Thoái vốn",                  "MA",         "CONTEXT"),
    ("CORP.CONTRACT",   "Ký hợp đồng/trúng thầu",     "CORPORATE",  "POSITIVE"),
    ("CORP.PROJECT",    "Dự án mới/khởi công",        "CORPORATE",  "POSITIVE"),
    ("CORP.EXPANSION",  "Mở rộng/đầu tư",             "CORPORATE",  "POSITIVE"),
    ("GOV.LEADERSHIP",  "Thay đổi nhân sự/lãnh đạo",  "GOVERNANCE", "CONTEXT"),
    ("GOV.INSIDER_BUY", "Nội bộ/cổ đông lớn MUA",     "GOVERNANCE", "POSITIVE"),
    ("GOV.INSIDER_SELL","Nội bộ/cổ đông lớn BÁN",     "GOVERNANCE", "NEGATIVE"),
    ("GOV.AGM",         "ĐHCĐ/nghị quyết",            "GOVERNANCE", "CONTEXT"),
    ("REG.POLICY",      "Chính sách/pháp lý",         "REGULATORY", "CONTEXT"),
    ("REG.SANCTION",    "Xử phạt/vi phạm",            "REGULATORY", "NEGATIVE"),
    ("REG.APPROVAL",    "Cấp phép/phê duyệt",         "REGULATORY", "POSITIVE"),
    ("RATING.UPGRADE",  "Nâng hạng/khuyến nghị MUA",  "RATING",     "POSITIVE"),
    ("RATING.DOWNGRADE","Hạ bậc/khuyến nghị BÁN",     "RATING",     "NEGATIVE"),
    ("MARKET.FOREIGN_BUY", "Khối ngoại mua ròng",     "MARKET",     "POSITIVE"),
    ("MARKET.FOREIGN_SELL","Khối ngoại bán ròng",     "MARKET",     "NEGATIVE"),
    ("MARKET.LISTING",  "Niêm yết/chuyển sàn",        "MARKET",     "CONTEXT"),
    ("MACRO.RATE",      "Lãi suất",                   "MACRO",      "CONTEXT"),
    ("MACRO.FX",        "Tỷ giá",                     "MACRO",      "CONTEXT"),
    ("MACRO.INFLATION", "Lạm phát/CPI",               "MACRO",      "CONTEXT"),
    ("MACRO.GDP",       "Tăng trưởng GDP",            "MACRO",      "POSITIVE"),
    ("MACRO.CREDIT",    "Tín dụng/chính sách tiền tệ","MACRO",      "CONTEXT"),
    ("MACRO.MKT_UPGRADE","Nâng hạng TT (FTSE/MSCI)",  "MACRO",      "POSITIVE"),
    ("MACRO.TRADE",     "Thương mại/thuế quan/XK",    "MACRO",      "CONTEXT"),
    ("SECTOR.PRICE",    "Giá hàng hóa ngành",         "SECTOR",     "CONTEXT"),
    ("SECTOR.REGULATION","Chính sách ngành",          "SECTOR",     "CONTEXT"),
    ("SECTOR.DEMAND",   "Cung-cầu ngành",             "SECTOR",     "CONTEXT"),
    ("RISK.LITIGATION", "Kiện tụng",                  "RISK",       "NEGATIVE"),
    ("RISK.DEFAULT",    "Vỡ nợ/nợ xấu",               "RISK",       "NEGATIVE"),
    ("RISK.LIQUIDITY",  "Rủi ro thanh khoản",         "RISK",       "NEGATIVE"),
]

# ============================================================
# 2) TAXONOMY NGÀNH — ICB gốc (+ map VSIC/GICS). Mở rộng dần.
# ============================================================
# (code ICB, name_vi, name_en, level, parent, vsic, gics)
INDUSTRY_TAXONOMY = [
    ("0001", "Dầu khí", "Oil & Gas", 1, None, "B", "10"),
    ("1000", "Vật liệu cơ bản", "Basic Materials", 1, None, "C", "15"),
    ("2000", "Công nghiệp", "Industrials", 1, None, "C", "20"),
    ("3000", "Hàng tiêu dùng", "Consumer Goods", 1, None, "C", "30"),
    ("5000", "Dịch vụ tiêu dùng", "Consumer Services", 1, None, "G", "25"),
    ("6000", "Viễn thông", "Telecommunications", 1, None, "J", "50"),
    ("7000", "Tiện ích", "Utilities", 1, None, "D", "55"),
    ("8000", "Tài chính", "Financials", 1, None, "K", "40"),
    ("9000", "Công nghệ", "Technology", 1, None, "J", "45"),
    # Sector (level 3) đang dùng trong dự án
    ("0530", "Dầu khí", "Oil & Gas Producers", 3, "0001", "B06", "1010"),
    ("1750", "Thép", "Industrial Metals & Mining", 3, "1000", "C24", "151040"),
    ("1350", "Hóa chất/Phân bón/Nhựa", "Chemicals", 3, "1000", "C20", "151010"),
    ("2350", "Xây dựng", "Construction & Materials", 3, "2000", "F", "201030"),
    ("2710", "Hàng không", "Airlines (Travel)", 3, "2000", "H51", "203020"),
    ("2770", "Logistics/Vận tải biển", "Industrial Transportation", 3, "2000", "H50", "203040"),
    ("3350", "Săm lốp/Ô tô phụ tùng", "Automobiles & Parts", 3, "3000", "C22", "251010"),
    ("3500", "Tiêu dùng (Thực phẩm-Đồ uống)", "Food & Beverage", 3, "3000", "C10", "302020"),
    ("3570", "Thủy sản/Chăn nuôi", "Farming & Fishing", 3, "3000", "A", "302020"),
    ("3760", "Dệt may", "Personal Goods (Apparel)", 3, "3000", "C13", "252030"),
    ("5330", "Bán lẻ", "Retail", 3, "5000", "G47", "255040"),
    ("7530", "Điện/Tiện ích", "Electricity", 3, "7000", "D35", "551010"),
    ("8350", "Ngân hàng", "Banks", 3, "8000", "K64", "401010"),
    ("8530", "Bảo hiểm", "Insurance", 3, "8000", "K65", "403010"),
    ("8630", "Bất động sản/KCN", "Real Estate", 3, "8000", "L68", "601010"),
    ("8770", "Chứng khoán", "Financial Services", 3, "8000", "K66", "402030"),
    ("9530", "Công nghệ", "Software & Computer Services", 3, "9000", "J62", "451030"),
]

# Map SECTOR_ID (đang dùng trong KG cũ, vd properties.sector='SECTOR_STEEL') → mã ICB
SECTOR_ID_TO_ICB = {
    "SECTOR_STEEL": "1750", "SECTOR_BANKING": "8350", "SECTOR_REALESTATE": "8630",
    "SECTOR_SECURITIES": "8770", "SECTOR_INSURANCE": "8530", "SECTOR_TECH": "9530",
    "SECTOR_OIL_GAS": "0530", "SECTOR_UTILITIES": "7530", "SECTOR_CONSUMER": "3500",
    "SECTOR_AVIATION": "2710", "SECTOR_CONSTRUCTION": "2350", "SECTOR_SEAFOOD": "3570",
    "SECTOR_LIVESTOCK": "3570", "SECTOR_INDUSTRIAL": "8630", "SECTOR_FERTILIZER": "1350",
    "SECTOR_PLASTIC": "1350", "SECTOR_TEXTILE": "3760", "SECTOR_TIRE": "3350",
    "SECTOR_LOGISTICS": "2770",
}


def _upsert(table, rows, conflict):
    for i in range(0, len(rows), 200):
        sb.table(table).upsert(rows[i:i+200], on_conflict=conflict).execute()


def seed_taxonomy():
    print("→ Seed event_taxonomy...")
    cat_rows = [{"code": c, "name_vi": n, "category": c, "parent_code": None} for c, n in EVENT_CATEGORIES]
    leaf_rows = [{"code": c, "name_vi": n, "category": cat, "parent_code": cat,
                  "default_polarity": pol} for c, n, cat, pol in EVENT_TYPES]
    _upsert("event_taxonomy", cat_rows, "code")
    _upsert("event_taxonomy", leaf_rows, "code")
    print(f"   event_taxonomy: {len(cat_rows)} nhóm + {len(leaf_rows)} loại")

    print("→ Seed industry_taxonomy (ICB)...")
    ind_rows = [{"code": c, "name_vi": nv, "name_en": ne, "level": lv,
                 "parent_code": p, "vsic_code": vs, "gics_code": gi}
                for c, nv, ne, lv, p, vs, gi in INDUSTRY_TAXONOMY]
    # seed level 1 trước (parent FK)
    _upsert("industry_taxonomy", [r for r in ind_rows if r["level"] == 1], "code")
    _upsert("industry_taxonomy", [r for r in ind_rows if r["level"] != 1], "code")
    print(f"   industry_taxonomy: {len(ind_rows)} ngành/nhóm ngành")


def backfill_entities():
    """Tạo Entity master từ graph_nodes hiện có (STOCK/SECTOR/MACRO) + map ngành ICB."""
    print("→ Backfill entities từ graph_nodes...")
    nodes = sb.table("graph_nodes").select("entity_id,name,entity_type,properties").execute().data
    ents = []
    for n in nodes:
        et, eid, name = n["entity_type"], n["entity_id"], n["name"]
        props = n.get("properties") or {}
        if et == "STOCK":
            icb = SECTOR_ID_TO_ICB.get(props.get("sector"))
            ents.append({
                "entity_id": f"CO_{eid}", "entity_type": "COMPANY", "canonical_name": name,
                "aliases": list({eid, name}),
                "ticker": eid, "exchange": "HOSE", "industry_code": icb, "country": "VN",
                "attributes": {k: props.get(k) for k in ("beta_vnindex", "market_cap_trillion", "pe_ttm") if props.get(k) is not None},
            })
        elif et == "SECTOR":
            icb = SECTOR_ID_TO_ICB.get(eid)
            ents.append({"entity_id": f"SEC_{eid}", "entity_type": "SECTOR",
                         "canonical_name": name, "aliases": [eid, name], "industry_code": icb})
        elif et == "MACRO":
            ents.append({"entity_id": f"MAC_{eid}", "entity_type": "MACRO",
                         "canonical_name": name, "aliases": [eid, name],
                         "attributes": {k: props.get(k) for k in ("value", "as_of", "scope") if props.get(k) is not None}})
    _upsert("entities", ents, "entity_id")
    print(f"   entities: {len(ents)} ({sum(e['entity_type']=='COMPANY' for e in ents)} COMPANY, "
          f"{sum(e['entity_type']=='SECTOR' for e in ents)} SECTOR, {sum(e['entity_type']=='MACRO' for e in ents)} MACRO)")
    return {e_old: e_new for e_old, e_new in
            [(n["entity_id"], (f"CO_{n['entity_id']}" if n["entity_type"]=="STOCK"
              else f"SEC_{n['entity_id']}" if n["entity_type"]=="SECTOR"
              else f"MAC_{n['entity_id']}")) for n in nodes]}


def backfill_relations(idmap):
    """Chuyển cạnh CẤU TRÚC (expert_seed/macro_logic) từ graph_edges → entity_relations."""
    print("→ Backfill entity_relations (cạnh cấu trúc)...")
    # map uuid → entity_id cũ
    nodes = sb.table("graph_nodes").select("id,entity_id,entity_type").execute().data
    uuid2old = {n["id"]: n["entity_id"] for n in nodes}
    edges = sb.table("graph_edges").select(
        "source_id,target_id,relationship_type,confidence,properties,data_source"
    ).neq("data_source", "news").execute().data   # bỏ cạnh news (sẽ thành event sau)
    rels, seen = [], set()
    REL_MAP = {"BELONGS_TO_SECTOR": "BELONGS_TO_INDUSTRY", "INPUT_COST_OF": "INPUT_COST_OF",
               "OUTPUT_PRODUCT_OF": "OUTPUT_PRODUCT_OF", "SUPPLIES_TO": "SUPPLIES_TO",
               "AFFECTS_POSITIVE": "AFFECTS", "AFFECTS_NEGATIVE": "AFFECTS",
               "CORRELATES_WITH": "PEER_OF", "COMPETES_WITH": "COMPETES_WITH"}
    for e in edges:
        s = idmap.get(uuid2old.get(e["source_id"])); t = idmap.get(uuid2old.get(e["target_id"]))
        if not s or not t or s == t:
            continue
        rt = REL_MAP.get(e["relationship_type"], e["relationship_type"])
        key = (s, t, rt)
        if key in seen:
            continue
        seen.add(key)
        props = e.get("properties") or {}
        sign = "+" if e["relationship_type"] == "AFFECTS_POSITIVE" else ("-" if e["relationship_type"] == "AFFECTS_NEGATIVE" else None)
        rels.append({"source_id": s, "target_id": t, "rel_type": rt,
                     "weight": props.get("weight"), "confidence": e.get("confidence"),
                     "sign": sign, "properties": props, "data_source": e.get("data_source") or "expert_seed"})
    _upsert("entity_relations", rels, "source_id,target_id,rel_type")
    print(f"   entity_relations: {len(rels)} cạnh cấu trúc")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--taxonomy-only", action="store_true")
    args = ap.parse_args()
    seed_taxonomy()
    if not args.taxonomy_only:
        idmap = backfill_entities()
        backfill_relations(idmap)
    print("\n✅ Seed KG v2 hoàn tất.")
