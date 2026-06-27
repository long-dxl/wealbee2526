"""data/graph_utils.py — helper UPSERT Knowledge Graph dùng chung cho mọi seeder.

Gỡ trùng: trước đây upsert_node/upsert_edge bị sao chép ở seed_sector_graph + seed_value_chain
(+ sync_top10_graph đã archive). Nay 1 nguồn duy nhất. Client Supabase lazy → import không cần creds.
"""
import os
from datetime import datetime

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()
_sb: Client | None = None


def get_sb() -> Client:
    global _sb
    if _sb is None:
        _sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
    return _sb


def get_timestamp() -> str:
    return datetime.utcnow().isoformat() + "Z"


def upsert_node(entity_id: str, entity_type: str, name: str, properties: dict) -> bool:
    """Upsert node, MERGE properties với dữ liệu cũ (không ghi đè fundamentals/macro sẵn có)."""
    try:
        existing = get_sb().table("graph_nodes").select("properties").eq("entity_id", entity_id).execute()
        merged = (existing.data[0].get("properties") or {}) if existing.data else {}
        merged.update(properties)   # giá trị mới ghi đè cùng key, giữ key cũ
        get_sb().table("graph_nodes").upsert(
            {"entity_id": entity_id, "entity_type": entity_type, "name": name, "properties": merged},
            on_conflict="entity_id").execute()
        return True
    except Exception as e:
        print(f"  ❌ node {entity_id}: {e}"); return False


def get_node_id(entity_id: str) -> str | None:
    try:
        r = get_sb().table("graph_nodes").select("id").eq("entity_id", entity_id).single().execute()
        return r.data["id"] if r.data else None
    except Exception:
        return None


def upsert_edge(src: str, tgt: str, rel: str, props: dict, confidence: float,
                data_source: str = "macro_logic") -> bool:
    """Upsert cạnh theo (src, tgt, rel). data_source PHẢI thuộc CHECK: expert_seed|macro_logic|news."""
    sid, tid = get_node_id(src), get_node_id(tgt)
    if not sid or not tid:
        print(f"  ⚠️ thiếu node {src} hoặc {tgt}"); return False
    try:
        ex = (get_sb().table("graph_edges").select("id").eq("source_id", sid).eq("target_id", tid)
              .eq("relationship_type", rel).execute())
        payload = {"source_id": sid, "target_id": tid, "relationship_type": rel,
                   "properties": props, "data_source": data_source,
                   "confidence": confidence, "observed_at": get_timestamp()}
        if ex.data:
            get_sb().table("graph_edges").update(payload).eq("id", ex.data[0]["id"]).execute()
        else:
            get_sb().table("graph_edges").insert(payload).execute()
        return True
    except Exception as e:
        print(f"  ❌ edge {src}->{tgt}: {e}"); return False


# Alias tương thích tên cũ (seed_sector_graph dùng _node_id)
_node_id = get_node_id
