"""
seed_sector_graph.py — SEEDER: đẩy tri thức KG + VN30 lên Supabase (bootstrap DB mới).

⚠️ TRI THỨC nhân-quả (node vĩ mô/ngành + cạnh dấu/trọng số/độ trễ/cơ chế + lan truyền) nay là
CODE CANONICAL ở **markets/vn/knowledge.py**. File này KHÔNG còn giữ literal tri thức — chỉ
SEED tri thức đó + danh sách VN30 (Beta mặc định) lên DB. Helper upsert dùng chung ở
**data/graph_utils.py** (gỡ trùng). Sửa tri thức → sửa knowledge.py, KHÔNG sửa ở đây.

Chạy:  python3 -m data.seed_sector_graph
"""
from data.graph_utils import get_node_id, get_sb, get_timestamp, upsert_edge, upsert_node  # noqa: F401 (re-export cho seed_universe)
from markets.vn.knowledge import MACRO_NODES, SECTOR_EDGES, SECTOR_NODES, TRANSMIT_EDGES

NOW = get_timestamp()

# ============================================================
# VN30 (gồm Top 10): (ticker, name, sector_id, beta_default)
# Beta mặc định theo kinh nghiệm — compute_beta.py sẽ thay bằng số thật. (= DỮ LIỆU, không phải tri thức)
# ============================================================
VN30 = [
    # Ngân hàng
    ("VCB","Vietcombank","SECTOR_BANKING",0.95), ("BID","BIDV","SECTOR_BANKING",1.00),
    ("CTG","VietinBank","SECTOR_BANKING",1.05), ("TCB","Techcombank","SECTOR_BANKING",1.20),
    ("ACB","ACB","SECTOR_BANKING",1.00), ("MBB","MB Bank","SECTOR_BANKING",1.15),
    ("VPB","VPBank","SECTOR_BANKING",1.25), ("STB","Sacombank","SECTOR_BANKING",1.20),
    ("HDB","HDBank","SECTOR_BANKING",1.15), ("TPB","TPBank","SECTOR_BANKING",1.20),
    ("VIB","VIB","SECTOR_BANKING",1.10), ("SHB","SHB","SECTOR_BANKING",1.25),
    ("SSB","SeABank","SECTOR_BANKING",0.90), ("LPB","LPBank","SECTOR_BANKING",1.15),
    # Bất động sản
    ("VHM","Vinhomes","SECTOR_REALESTATE",1.30), ("VIC","Vingroup","SECTOR_REALESTATE",1.35),
    ("VRE","Vincom Retail","SECTOR_REALESTATE",1.20), ("BCM","Becamex","SECTOR_REALESTATE",1.00),
    # Chứng khoán
    ("SSI","Chứng khoán SSI","SECTOR_SECURITIES",1.60),
    # Thép
    ("HPG","Hòa Phát","SECTOR_STEEL",1.30),
    # Công nghệ
    ("FPT","FPT","SECTOR_TECH",1.05),
    # Tiêu dùng - Bán lẻ
    ("VNM","Vinamilk","SECTOR_CONSUMER",0.70), ("SAB","Sabeco","SECTOR_CONSUMER",0.80),
    ("MSN","Masan","SECTOR_CONSUMER",1.30), ("MWG","Thế Giới Di Động","SECTOR_CONSUMER",1.20),
    # Dầu khí
    ("GAS","PV Gas","SECTOR_OIL_GAS",1.00), ("PLX","Petrolimex","SECTOR_OIL_GAS",1.00),
    # Hàng không
    ("VJC","Vietjet Air","SECTOR_AVIATION",1.25),
    # Bảo hiểm
    ("BVH","Bảo Việt","SECTOR_INSURANCE",1.10),
    # KCN - Xuất khẩu
    ("GVR","Cao su Việt Nam","SECTOR_INDUSTRIAL",1.30),
    # Vận tải - Cảng biển - Logistics (ngoài VN30, thêm để phủ ngành)
    ("GMD","Gemadept","SECTOR_LOGISTICS",1.00),
    ("HAH","Vận tải Hải An","SECTOR_LOGISTICS",1.20),
    ("VSC","Container Việt Nam (Viconship)","SECTOR_LOGISTICS",1.00),
    ("PVT","PVTrans","SECTOR_LOGISTICS",0.90),
    ("VOS","Vosco","SECTOR_LOGISTICS",1.30),
]


def run():
    print("="*60); print("SEED KNOWLEDGE GRAPH (tri thức từ markets/vn/knowledge.py)"); print("="*60)

    print("\n[1] Node vĩ mô / chính sách / hàng hóa...")
    for eid, (name, scope, extra) in MACRO_NODES.items():
        upsert_node(eid, "MACRO", name, {"scope": scope, "last_synced": NOW, **(extra or {})})
    print(f"   ✅ {len(MACRO_NODES)} node vĩ mô")

    print("\n[2] Node ngành...")
    for eid, name in SECTOR_NODES.items():
        upsert_node(eid, "SECTOR", name, {"last_synced": NOW})
    print(f"   ✅ {len(SECTOR_NODES)} node ngành")

    print("\n[3] Cạnh nhân quả NGÀNH × VĨ MÔ...")
    ok = 0
    for macro, sector, rel, sign, weight, lag, mech in SECTOR_EDGES:
        props = {"sign": sign, "weight": weight, "lag": lag, "mechanism": mech}
        if upsert_edge(macro, sector, rel, props, confidence=weight): ok += 1
    print(f"   ✅ {ok}/{len(SECTOR_EDGES)} cạnh ngành×vĩ mô")

    print("\n[4] Chuỗi lan truyền vĩ mô (TRANSMITS_TO)...")
    ok = 0
    for src, tgt, sign, mech in TRANSMIT_EDGES:
        props = {"sign": sign, "mechanism": mech}
        if upsert_edge(src, tgt, "TRANSMITS_TO", props, confidence=0.7): ok += 1
    print(f"   ✅ {ok}/{len(TRANSMIT_EDGES)} cạnh lan truyền")

    print("\n[5] VN30: node cổ phiếu + Beta + BELONGS_TO_SECTOR...")
    ok = 0
    for ticker, name, sector, beta in VN30:
        upsert_node(ticker, "STOCK", name, {"sector": sector, "beta_vnindex": beta,
                                            "beta_source": "expert_default", "last_synced": NOW})
        if upsert_edge(ticker, sector, "BELONGS_TO_SECTOR",
                       {"weight": 1.0}, confidence=1.0, data_source="expert_seed"): ok += 1
    print(f"   ✅ {len(VN30)} cổ phiếu VN30, {ok} membership")

    n = get_sb().table("graph_nodes").select("id", count="exact").execute()
    e = get_sb().table("graph_edges").select("id", count="exact").execute()
    print(f"\n📊 Tổng DB: {n.count} nodes / {e.count} edges")
    print("\n💡 Sau đó chạy: python3 -m data.seed_universe (mở universe) + python3 -m data.compute_beta (Beta thật)")


if __name__ == "__main__":
    run()
