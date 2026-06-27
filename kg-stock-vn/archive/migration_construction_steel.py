"""
migration_construction_steel.py
-------------------------------
FIX logic chuỗi giá trị: ngành BĐS & Xây dựng đang lấy "thép HRC" (CME quốc tế) làm chi phí
đầu vào — SAI. Vật liệu xây nhà là THÉP XÂY DỰNG (thép thanh/rebar) NỘI ĐỊA, không phải HRC
(cuộn cán nóng dùng cho tôn/ống/ô tô). Tạo node GIA_THEP_XAY_DUNG (nội địa) + chuyển cạnh
IS_INPUT_COST_OF của SECTOR_REALESTATE/SECTOR_CONSTRUCTION từ HRC → thép xây dựng.
NGÀNH THÉP giữ NGUYÊN (HRC là input/output đúng của nhà sản xuất thép).

Chạy 1 lần: python3 migration_construction_steel.py
"""
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
from agent_config import get_supabase

sb = get_supabase()
NOW = datetime.now(timezone.utc).isoformat()


def _nid(eid):
    r = sb.table("graph_nodes").select("id").eq("entity_id", eid).execute().data
    return r[0]["id"] if r else None


def run():
    print("=" * 60)
    print("FIX chuỗi giá trị: thép xây dựng nội địa cho BĐS & Xây dựng")
    print("=" * 60)

    # 1) Node hàng hóa NỘI ĐỊA: thép xây dựng (rebar) — lấy giá qua get_vn_domestic_price
    props = {"scope": "commodity", "commodity_key": "thép xây dựng", "vn_key": "thép xây dựng",
             "market": "vietnam", "primary_source": "SteelOnline/VSA (giá thép xây dựng VN)",
             "unit": "đồng/kg", "last_synced": NOW}
    ex = sb.table("graph_nodes").select("properties").eq("entity_id", "GIA_THEP_XAY_DUNG").execute().data
    merged = (ex[0].get("properties") or {}) if ex else {}
    merged.update(props)
    sb.table("graph_nodes").upsert({"entity_id": "GIA_THEP_XAY_DUNG", "entity_type": "MACRO",
                                    "name": "Giá thép xây dựng (nội địa)", "properties": merged},
                                   on_conflict="entity_id").execute()
    print("  ✅ node GIA_THEP_XAY_DUNG (thép xây dựng nội địa, đồng/kg)")

    new_src = _nid("GIA_THEP_XAY_DUNG")
    hrc_src = _nid("GIA_THEP_HRC")

    # 2) Chuyển cạnh input của BĐS & Xây dựng: HRC → thép xây dựng
    for sec in ("SECTOR_REALESTATE", "SECTOR_CONSTRUCTION"):
        tgt = _nid(sec)
        if not tgt:
            print(f"  ⚠️ thiếu node {sec}"); continue
        # xóa cạnh cũ HRC -> sector (input)
        old = sb.table("graph_edges").select("id,properties").eq("source_id", hrc_src)\
                .eq("target_id", tgt).eq("relationship_type", "IS_INPUT_COST_OF").execute().data
        old_props = (old[0].get("properties") if old else None) or \
            {"sign": "-", "mechanism": "Giá vật liệu (thép) ảnh hưởng biên lợi nhuận thi công"}
        for e in old:
            sb.table("graph_edges").delete().eq("id", e["id"]).execute()
        # thêm cạnh mới: thép xây dựng -> sector (input)
        exists = sb.table("graph_edges").select("id").eq("source_id", new_src)\
                   .eq("target_id", tgt).eq("relationship_type", "IS_INPUT_COST_OF").execute().data
        payload = {"source_id": new_src, "target_id": tgt, "relationship_type": "IS_INPUT_COST_OF",
                   "properties": old_props, "data_source": "expert_seed", "confidence": 0.7,
                   "observed_at": NOW}
        if exists:
            sb.table("graph_edges").update(payload).eq("id", exists[0]["id"]).execute()
        else:
            sb.table("graph_edges").insert(payload).execute()
        print(f"  ✅ {sec}: input thép = thép xây dựng nội địa (gỡ HRC, xóa {len(old)} cạnh cũ)")

    print("\n✅ XONG. Ngành Thép giữ nguyên HRC. Kiểm tra lại bằng get_sector_value_chain.")


if __name__ == "__main__":
    run()
