"""markets/graph.py — ENGINE SUY LUẬN đồ thị tri thức IN-MEMORY (market-agnostic).

Tri thức chuyên gia (ngành · vĩ mô · chính sách · quan hệ nhân-quả · lan truyền) được khai báo
DẠNG CODE trong từng thị trường (vd markets/vn/knowledge.py) — chuyên gia/dev sửa qua git+PR,
KHÔNG đẩy vào DB nhiều bảng. Engine dựng graph trong bộ nhớ và suy luận:
  - get_sector_network(sid)  → bản đồ vĩ mô tác động 1 ngành (TẦNG TRI THỨC, shape = RPC cũ).
  - get_macro_propagation(mid)→ 1 cú sốc vĩ mô lan tới ngành nào + chuỗi hạ nguồn (shape = RPC cũ).
  - propagate(mid)           → traversal ĐA-HOP (Fed→DXY→tỷ giá→…) lộ chuỗi phi hiển nhiên.

Đồ thị ngành–vĩ mô RẤT NHỎ (chục node, ~trăm cạnh) → in-memory tức thì, không cần SQL/RPC.
Tầng DỮ LIỆU khối lượng lớn (mã/Beta/giá trị vĩ mô hiện tại) KHÔNG ở đây — engine nhận qua
tham số `stocks` (do provider lấy từ DB) để giữ ranh giới tri-thức vs dữ-liệu.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional


# Quan hệ nhân-quả ngành×vĩ mô đã hỗ trợ (mở rộng được khi thêm chính sách/cổ đông/sự kiện).
_CAUSAL_RELS = {"AFFECTS_POSITIVE", "AFFECTS_NEGATIVE", "DRIVES_DEMAND_OF", "IS_INPUT_COST_OF"}


@dataclass
class MarketGraph:
    """Đồ thị tri thức 1 thị trường, dựng từ khai báo chuyên gia (code).

    macro_nodes:   {eid: (name, scope, props)}            — node vĩ mô (+chính sách)
    sector_nodes:  {eid: name}                            — node ngành
    sector_edges:  [(macro, sector, rel, sign, weight, lag, mechanism)]  — nhân-quả ngành×vĩ mô
    transmit_edges:[(src, tgt, sign, mechanism)]          — lan truyền vĩ mô→vĩ mô (TRANSMITS_TO)
    transmit_confidence: độ tin mặc định cho cạnh lan truyền (giữ = seed cũ 0.7).
    """
    macro_nodes: dict = field(default_factory=dict)
    sector_nodes: dict = field(default_factory=dict)
    sector_edges: list = field(default_factory=list)
    transmit_edges: list = field(default_factory=list)
    transmit_confidence: float = 0.7

    # ── Tra cứu node ──
    def _macro(self, eid: str) -> Optional[tuple]:
        return self.macro_nodes.get(eid)

    def _macro_props(self, eid: str) -> dict:
        m = self.macro_nodes.get(eid)
        if not m:
            return {}
        name, scope, extra = m
        return {"scope": scope, **(extra or {})}

    # ── get_sector_network: bản đồ vĩ mô tác động 1 NGÀNH (shape = RPC get_sector_network) ──
    def get_sector_network(self, sector_input: str, stocks: list | None = None) -> dict:
        sid = (sector_input or "").upper()
        if sid not in self.sector_nodes:
            return {"error": f"Không tìm thấy ngành: {sector_input}", "status": "NOT_FOUND"}
        drivers = []
        for macro, sector, rel, sign, weight, lag, mech in self.sector_edges:
            if sector != sid:
                continue
            name, scope, _ = self.macro_nodes.get(macro, (macro, None, {}))
            drivers.append({
                "macro": macro, "macro_name": name, "scope": scope,
                "relationship": rel, "sign": sign, "weight": _s(weight),
                "lag": lag, "mechanism": mech, "confidence": weight, "source": None,
            })
        drivers.sort(key=lambda d: _f(d["weight"]), reverse=True)
        return {
            "sector": {"entity_id": sid, "name": self.sector_nodes[sid], "properties": {}},
            "macro_drivers": drivers,
            "stocks": stocks or [],   # TẦNG DỮ LIỆU: provider bơm từ DB (mã + Beta)
            "status": "OK",
        }

    # ── get_macro_propagation: 1 cú sốc vĩ mô → ngành nào + hạ nguồn (shape = RPC) ──
    def get_macro_propagation(self, macro_input: str) -> dict:
        mid = (macro_input or "").upper()
        if mid not in self.macro_nodes:
            return {"error": f"Không tìm thấy yếu tố vĩ mô: {macro_input}", "status": "NOT_FOUND"}
        name, scope, props = self.macro_nodes[mid]
        transmits = [{
            "to": tgt, "to_name": self.macro_nodes.get(tgt, (tgt, None, {}))[0],
            "sign": sign, "mechanism": mech,
            "confidence": self.transmit_confidence, "source": None,
        } for src, tgt, sign, mech in self.transmit_edges if src == mid]
        affected = []
        for macro, sector, rel, sign, weight, lag, mech in self.sector_edges:
            if macro != mid:
                continue
            affected.append({
                "sector": sector, "sector_name": self.sector_nodes.get(sector, sector),
                "relationship": rel, "sign": sign, "weight": _s(weight),
                "lag": lag, "mechanism": mech, "confidence": weight, "source": None,
            })
        affected.sort(key=lambda d: _f(d["weight"]), reverse=True)
        return {
            "macro": {"entity_id": mid, "name": name, "scope": scope,
                      "properties": {"scope": scope, **(props or {})}},
            "transmits_to": transmits,
            "affected_sectors": affected,
            "status": "OK",
        }

    # ── propagate: traversal ĐA-HOP (NĂNG LỰC MỚI) — lộ chuỗi vĩ mô phi hiển nhiên ──
    def propagate(self, macro_input: str, max_hops: int = 3) -> dict:
        """BFS theo TRANSMITS_TO từ 1 cú sốc → các vĩ mô hạ nguồn (kèm dấu tích lũy & đường đi),
        rồi liệt kê NGÀNH bị chạm ở từng mốc. Dùng cho 'phân tích lan tỏa sự kiện/nguyên nhân'."""
        mid = (macro_input or "").upper()
        if mid not in self.macro_nodes:
            return {"error": f"Không tìm thấy yếu tố vĩ mô: {macro_input}", "status": "NOT_FOUND"}
        # adjacency cho TRANSMITS_TO
        adj: dict = {}
        for src, tgt, sign, mech in self.transmit_edges:
            adj.setdefault(src, []).append((tgt, sign, mech))
        chains, seen = [], {mid}
        frontier = [(mid, 0, "+", [mid])]  # (node, hop, dấu tích lũy, đường đi)
        while frontier:
            node, hop, csign, path = frontier.pop(0)
            if hop >= max_hops:
                continue
            for tgt, sign, mech in adj.get(node, []):
                eff = "+" if (csign == "+") == (sign == "+") else "-"   # nhân dấu
                chains.append({"to": tgt, "to_name": self.macro_nodes.get(tgt, (tgt,))[0],
                               "hop": hop + 1, "effect_sign": eff,
                               "path": path + [tgt], "mechanism": mech})
                if tgt not in seen:
                    seen.add(tgt)
                    frontier.append((tgt, hop + 1, eff, path + [tgt]))
        # ngành bị chạm bởi BẤT KỲ vĩ mô nào trong chuỗi (gồm gốc)
        touched = sorted(seen)
        sectors = []
        for macro, sector, rel, sign, weight, lag, mech in self.sector_edges:
            if macro in touched:
                sectors.append({"via_macro": macro, "sector": sector,
                                "sector_name": self.sector_nodes.get(sector, sector),
                                "sign": sign, "weight": _f(weight), "mechanism": mech})
        sectors.sort(key=lambda d: d["weight"], reverse=True)
        return {"macro": mid, "transmits_chain": chains, "touched_macros": touched,
                "affected_sectors": sectors, "status": "OK"}

    # ── thống kê (cho smoke/health) ──
    def stats(self) -> dict:
        return {"macro_nodes": len(self.macro_nodes), "sector_nodes": len(self.sector_nodes),
                "sector_edges": len(self.sector_edges), "transmit_edges": len(self.transmit_edges)}


def _s(v) -> str:
    """Khớp RPC cũ: properties->>'weight' trả TEXT."""
    return str(v)


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
