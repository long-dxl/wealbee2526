"""
seed_value_chain.py
-------------------
Phase B — Nối CHUỖI GIÁ TRỊ cho KG: mỗi ngành có INPUT (nguyên liệu) → OUTPUT (sản phẩm),
gắn với NGUỒN GIÁ GỐC (yfinance/Trading Economics qua get_commodity_prices).
Thêm node hàng hóa (commodity), cạnh IS_INPUT_COST_OF / AFFECTS_POSITIVE (output),
và các NGÀNH MỚI (phân bón, nhựa, dệt may, săm lốp, chăn nuôi) + cổ phiếu + Beta mặc định.

Chạy SAU seed_sector_graph.py (không cần migration mới):  python3 seed_value_chain.py
"""

import os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
sb: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
NOW = datetime.utcnow().isoformat() + "Z"


# ============================================================
# 1) NODE HÀNG HÓA (commodity) — gắn commodity_key để Agent gọi get_commodity_prices
#    entity_id -> (tên, commodity_key, primary_source, đơn vị)
# ============================================================
COMMODITY_NODES = {
    "GIA_THEP_HRC":        ("Giá thép HRC", "thép hrc", "CME (yfinance HRC=F)", "USD/tấn ngắn"),
    "GIA_QUANG_SAT":       ("Giá quặng sắt 62% Fe", "quặng sắt", "Trading Economics (CFR China)", "USD/tấn"),
    "GIA_NHIET_LIEU":      ("Giá than cốc", "than cốc", "Trading Economics (FOB Australia)", "USD/tấn"),
    "GIA_DAU_BRENT":       ("Giá dầu Brent", "dầu brent", "ICE (yfinance BZ=F)", "USD/thùng"),
    "GIA_SUA_NGUYEN_LIEU": ("Giá sữa bột nguyên liệu", "sữa bột", "GlobalDairyTrade/Trading Economics", "USD/tấn"),
    "GIA_DUONG":           ("Giá đường thô", "đường", "ICE Sugar #11 (yfinance SB=F)", "US cent/lb"),
    "GIA_NGO":             ("Giá ngô", "ngô", "CBOT (yfinance ZC=F)", "US cent/giạ"),
    "GIA_KHO_DAU":         ("Giá khô đậu tương (TĂCN)", "khô đậu", "CBOT (yfinance ZM=F)", "USD/tấn ngắn"),
    "GIA_HEO_HOI":         ("Giá heo hơi", "heo hơi", "CME Lean Hogs (proxy) + giá heo VN", "US cent/lb"),
    "GIA_BONG":            ("Giá bông", "bông", "ICE Cotton (yfinance CT=F)", "US cent/lb"),
    "GIA_URE":             ("Giá phân urea", "urea", "Trading Economics", "USD/tấn"),
    "GIA_CAO_SU":          ("Giá cao su tự nhiên", "cao su", "SICOM/TOCOM/Trading Economics", "USD/kg"),
    "GIA_KHI_GAS":         ("Giá khí tự nhiên", "khí", "NYMEX (yfinance NG=F)", "USD/MMBtu"),
    "GIA_DIESEL_JET":      ("Giá nhiên liệu bay (proxy)", "nhiên liệu bay", "NYMEX Heating Oil (HO=F)", "USD/gallon"),
}

# ============================================================
# 2) NGÀNH MỚI
# ============================================================
NEW_SECTORS = {
    "SECTOR_FERTILIZER":  "Ngành Phân bón - Hóa chất",
    "SECTOR_PLASTIC":     "Ngành Nhựa",
    "SECTOR_TEXTILE":     "Ngành Dệt may",
    "SECTOR_TIRE":        "Ngành Săm lốp - Cao su CN",
    "SECTOR_LIVESTOCK":   "Ngành Nông nghiệp - Chăn nuôi",
}

# ============================================================
# 3) CỔ PHIẾU MỚI: (ticker, tên, sector, beta_default)
# ============================================================
NEW_STOCKS = [
    ("DPM", "Đạm Phú Mỹ", "SECTOR_FERTILIZER", 1.00),
    ("DCM", "Đạm Cà Mau", "SECTOR_FERTILIZER", 1.05),
    ("DGC", "Hóa chất Đức Giang", "SECTOR_FERTILIZER", 1.20),
    ("BFC", "Phân bón Bình Điền", "SECTOR_FERTILIZER", 0.90),
    ("BMP", "Nhựa Bình Minh", "SECTOR_PLASTIC", 0.75),
    ("NTP", "Nhựa Tiền Phong", "SECTOR_PLASTIC", 0.80),
    ("AAA", "Nhựa An Phát Xanh", "SECTOR_PLASTIC", 1.20),
    ("TCM", "Dệt may Thành Công", "SECTOR_TEXTILE", 1.10),
    ("MSH", "May Sông Hồng", "SECTOR_TEXTILE", 1.00),
    ("TNG", "Dệt may TNG", "SECTOR_TEXTILE", 1.15),
    ("DRC", "Cao su Đà Nẵng", "SECTOR_TIRE", 1.05),
    ("CSM", "Casumina", "SECTOR_TIRE", 1.10),
    ("DBC", "Dabaco", "SECTOR_LIVESTOCK", 1.25),
    ("BAF", "Nông nghiệp BaF", "SECTOR_LIVESTOCK", 1.20),
    ("HAG", "Hoàng Anh Gia Lai", "SECTOR_LIVESTOCK", 1.40),
]

# ============================================================
# 4) CẠNH CHUỖI GIÁ TRỊ: (commodity_id, sector_id, role)
#    role = "input"  -> IS_INPUT_COST_OF, dấu '-' (giá tăng → chi phí tăng)
#    role = "output" -> AFFECTS_POSITIVE,  dấu '+' (giá bán tăng → lợi nhuận tăng)
# ============================================================
VALUE_CHAIN = [
    # Thép
    ("GIA_QUANG_SAT", "SECTOR_STEEL", "input"), ("GIA_NHIET_LIEU", "SECTOR_STEEL", "input"),
    ("GIA_THEP_HRC", "SECTOR_STEEL", "output"),
    # Xây dựng & BĐS (đầu vào thép)
    ("GIA_THEP_HRC", "SECTOR_CONSTRUCTION", "input"), ("GIA_THEP_HRC", "SECTOR_REALESTATE", "input"),
    # Dầu khí (thượng nguồn: dầu là đầu ra)
    ("GIA_DAU_BRENT", "SECTOR_OIL_GAS", "output"),
    # Hàng không (nhiên liệu bay)
    ("GIA_DIESEL_JET", "SECTOR_AVIATION", "input"), ("GIA_DAU_BRENT", "SECTOR_AVIATION", "input"),
    # Điện - tiện ích (than, khí)
    ("GIA_NHIET_LIEU", "SECTOR_UTILITIES", "input"), ("GIA_KHI_GAS", "SECTOR_UTILITIES", "input"),
    # Phân bón (khí là đầu vào urea; urea là đầu ra)
    ("GIA_KHI_GAS", "SECTOR_FERTILIZER", "input"), ("GIA_URE", "SECTOR_FERTILIZER", "output"),
    # Tiêu dùng (sữa, đường đầu vào)
    ("GIA_SUA_NGUYEN_LIEU", "SECTOR_CONSUMER", "input"), ("GIA_DUONG", "SECTOR_CONSUMER", "input"),
    # Chăn nuôi (khô đậu + ngô đầu vào; heo hơi đầu ra)
    ("GIA_KHO_DAU", "SECTOR_LIVESTOCK", "input"), ("GIA_NGO", "SECTOR_LIVESTOCK", "input"),
    ("GIA_HEO_HOI", "SECTOR_LIVESTOCK", "output"),
    # Thủy sản (thức ăn = khô đậu)
    ("GIA_KHO_DAU", "SECTOR_SEAFOOD", "input"),
    # Dệt may (bông đầu vào)
    ("GIA_BONG", "SECTOR_TEXTILE", "input"),
    # Săm lốp (cao su đầu vào) + Cao su CN GVR (cao su đầu ra)
    ("GIA_CAO_SU", "SECTOR_TIRE", "input"), ("GIA_CAO_SU", "SECTOR_INDUSTRIAL", "output"),
    # Nhựa (hạt nhựa ~ dầu)
    ("GIA_DAU_BRENT", "SECTOR_PLASTIC", "input"),
]

# Macro × ngành mới (gọn): (macro, sector, rel, sign, weight, mechanism)
NEW_SECTOR_MACRO = [
    ("GDP_VN", "SECTOR_FERTILIZER", "DRIVES_DEMAND_OF", "+", 0.5, "Sản xuất nông nghiệp kéo cầu phân bón"),
    ("DAU_TU_CONG", "SECTOR_PLASTIC", "DRIVES_DEMAND_OF", "+", 0.5, "Hạ tầng/BĐS kéo cầu ống nhựa"),
    ("LAI_SUAT_VN", "SECTOR_PLASTIC", "AFFECTS_NEGATIVE", "-", 0.4, "Cầu BĐS nhạy lãi suất"),
    ("THUE_QUAN_MY_VN", "SECTOR_TEXTILE", "AFFECTS_NEGATIVE", "-", 0.8, "Dệt may xuất khẩu chịu thuế Mỹ"),
    ("TY_GIA_USD_VND", "SECTOR_TEXTILE", "AFFECTS_POSITIVE", "+", 0.55, "Doanh thu xuất khẩu quy đổi VND tăng"),
    ("GDP_VN", "SECTOR_TIRE", "DRIVES_DEMAND_OF", "+", 0.5, "Vận tải/ô tô kéo cầu lốp"),
    ("CPI_VN", "SECTOR_LIVESTOCK", "AFFECTS_POSITIVE", "+", 0.5, "Giá thực phẩm trong CPI hỗ trợ doanh thu"),
]


# ── Helpers ──
def upsert_node(eid, etype, name, props):
    try:
        ex = sb.table("graph_nodes").select("properties").eq("entity_id", eid).execute()
        merged = (ex.data[0].get("properties") or {}) if ex.data else {}
        merged.update(props)
        sb.table("graph_nodes").upsert({"entity_id": eid, "entity_type": etype, "name": name,
                                        "properties": merged}, on_conflict="entity_id").execute()
        return True
    except Exception as e:
        print(f"  ❌ node {eid}: {e}"); return False

def _nid(eid):
    try:
        r = sb.table("graph_nodes").select("id").eq("entity_id", eid).single().execute()
        return r.data["id"] if r.data else None
    except Exception:
        return None

def upsert_edge(src, tgt, rel, props, conf, data_source="expert_seed"):
    sid, tid = _nid(src), _nid(tgt)
    if not sid or not tid:
        print(f"  ⚠️ thiếu node {src}/{tgt}"); return False
    try:
        ex = sb.table("graph_edges").select("id").eq("source_id", sid).eq("target_id", tid)\
               .eq("relationship_type", rel).execute()
        payload = {"source_id": sid, "target_id": tid, "relationship_type": rel,
                   "properties": props, "data_source": data_source, "confidence": conf, "observed_at": NOW}
        if ex.data:
            sb.table("graph_edges").update(payload).eq("id", ex.data[0]["id"]).execute()
        else:
            sb.table("graph_edges").insert(payload).execute()
        return True
    except Exception as e:
        print(f"  ❌ edge {src}->{tgt} ({rel}): {e}"); return False


def run():
    print("="*60); print("SEED CHUỖI GIÁ TRỊ (Phase B)"); print("="*60)

    print("\n[1] Node hàng hóa (commodity) + nguồn giá gốc...")
    for eid, (name, key, src, unit) in COMMODITY_NODES.items():
        upsert_node(eid, "MACRO", name, {"scope": "commodity", "commodity_key": key,
                                         "primary_source": src, "unit": unit, "last_synced": NOW})
    print(f"   ✅ {len(COMMODITY_NODES)} commodity nodes")

    print("\n[2] Ngành mới...")
    for eid, name in NEW_SECTORS.items():
        upsert_node(eid, "SECTOR", name, {"last_synced": NOW})
    print(f"   ✅ {len(NEW_SECTORS)} ngành")

    print("\n[3] Cổ phiếu mới + Beta + BELONGS_TO_SECTOR...")
    ok = 0
    for tk, name, sec, beta in NEW_STOCKS:
        upsert_node(tk, "STOCK", name, {"sector": sec, "beta_vnindex": beta,
                                        "beta_source": "expert_default", "last_synced": NOW})
        if upsert_edge(tk, sec, "BELONGS_TO_SECTOR", {"weight": 1.0}, 1.0): ok += 1
    print(f"   ✅ {len(NEW_STOCKS)} mã, {ok} membership")

    print("\n[4] Cạnh CHUỖI GIÁ TRỊ (input/output)...")
    ok = 0
    for cm, sec, role in VALUE_CHAIN:
        if role == "input":
            rel, sign, mech = "IS_INPUT_COST_OF", "-", "Nguyên liệu đầu vào → giá tăng làm tăng chi phí, giảm biên LN"
        else:
            rel, sign, mech = "AFFECTS_POSITIVE", "+", "Sản phẩm đầu ra → giá bán tăng làm tăng doanh thu/lợi nhuận"
        props = {"sign": sign, "role": role, "mechanism": mech, "weight": 0.7}
        if upsert_edge(cm, sec, rel, props, 0.7, data_source="macro_logic"): ok += 1
    print(f"   ✅ {ok}/{len(VALUE_CHAIN)} cạnh input/output")

    print("\n[5] Macro × ngành mới...")
    ok = 0
    for mac, sec, rel, sign, w, mech in NEW_SECTOR_MACRO:
        if upsert_edge(mac, sec, rel, {"sign": sign, "weight": w, "mechanism": mech}, w, data_source="macro_logic"):
            ok += 1
    print(f"   ✅ {ok}/{len(NEW_SECTOR_MACRO)} cạnh")

    n = sb.table("graph_nodes").select("id", count="exact").execute()
    e = sb.table("graph_edges").select("id", count="exact").execute()
    print(f"\n📊 Tổng DB: {n.count} nodes / {e.count} edges")
    print("💡 Chạy compute_beta.py để tính Beta thật cho 15 mã mới.")


if __name__ == "__main__":
    run()
