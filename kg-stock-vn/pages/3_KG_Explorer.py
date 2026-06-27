"""
pages/3_KG_Explorer.py
---------------------------
Knowledge Graph Explorer — Khám phá đồ thị tri thức cổ phiếu VN.
"""

import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_ROOT / ".env")

import streamlit as st
import pandas as pd
from core.agent_config import get_supabase, TOP_10_TICKERS, get_universe_tickers
from design_system import inject_css, page_header, section_label, COLORS, disclaimer_footer, sidebar_toggle_button

try:
    from pyvis.network import Network
    import streamlit.components.v1 as _components
    _PYVIS_OK = True
except ImportError:
    _PYVIS_OK = False

st.set_page_config(page_title="Knowledge Graph — KG Stock VN", layout="wide",
                   initial_sidebar_state="expanded")
inject_css()
sidebar_toggle_button()

NODE_COLORS = {
    "STOCK":          "#AED6F1",
    "MACRO":          "#FAD7A0",
    "NEWS":           "#A9DFBF",
    "SECTOR":         "#D7BDE2",
    "COMPANY_FACTOR": "#F9E79F",
}

EDGE_COLORS = {
    "AFFECTS_NEGATIVE":  "#E74C3C",
    "AFFECTS_POSITIVE":  "#27AE60",
    "INPUT_COST_OF":     "#E67E22",
    "SUPPLIES_TO":       "#2980B9",
    "BELONGS_TO_SECTOR": "#95A5A6",
    "MENTIONS":          "#8E44AD",
    "CORRELATES_WITH":   "#16A085",
}

TICKERS_SORTED = sorted(get_universe_tickers() or TOP_10_TICKERS)   # toàn universe trong KG

NODE_TYPE_VI = {
    "STOCK":          "Cổ phiếu",
    "MACRO":          "Vĩ mô",
    "NEWS":           "Tin tức",
    "SECTOR":         "Ngành",
    "COMPANY_FACTOR": "Yếu tố DN",
}

EDGE_TYPE_VI = {
    "AFFECTS_NEGATIVE":  "Tác động tiêu cực",
    "AFFECTS_POSITIVE":  "Tác động tích cực",
    "INPUT_COST_OF":     "Chi phí đầu vào",
    "SUPPLIES_TO":       "Cung ứng cho",
    "BELONGS_TO_SECTOR": "Thuộc ngành",
    "MENTIONS":          "Đề cập",
    "CORRELATES_WITH":   "Tương quan với",
}


def build_graphviz_dot(network_data: dict) -> str:
    nodes = network_data.get("network_nodes", [])
    edges = network_data.get("network_edges", [])

    lines = [
        'digraph G {',
        '  rankdir=LR;',
        '  node [shape=box, style=filled, fontname="Arial", fontsize=11];',
        '  edge [fontname="Arial", fontsize=9];',
        '  graph [bgcolor="#F8F9FA", pad=0.5, nodesep=0.5, ranksep=1.0];',
    ]

    seen_ids = set()
    for n in nodes:
        eid   = str(n.get("entity_id", "")).replace('"', '\\"')
        etype = n.get("entity_type", "STOCK")
        name  = str(n.get("name", eid)).replace('"', '\\"')
        hop   = n.get("hop", 1)
        color = NODE_COLORS.get(etype, "#D5D8DC")

        label = f"{name}\\n[{etype}]"
        if hop == 0:
            attrs = f'label="{label}", fillcolor="{color}", color="#2C3E50", penwidth=2.5, fontsize=13, fontcolor="#1A252F"'
        else:
            attrs = f'label="{label}", fillcolor="{color}", color="#7F8C8D", penwidth=1.0'

        if eid not in seen_ids:
            lines.append(f'  "{eid}" [{attrs}];')
            seen_ids.add(eid)

    for e in edges:
        src  = str(e.get("from", "")).replace('"', '\\"')
        tgt  = str(e.get("to", "")).replace('"', '\\"')
        rel  = e.get("relationship", "")
        color = EDGE_COLORS.get(rel, "#ABB2B9")
        label = str(rel).replace('"', '\\"')
        lines.append(f'  "{src}" -> "{tgt}" [label="{label}", color="{color}", fontcolor="{color}"];')

    lines.append("}")
    return "\n".join(lines)


def build_pyvis_html(network_data: dict) -> str:
    """Build interactive pyvis HTML graph from network data."""
    nodes = network_data.get("network_nodes") or []
    edges = network_data.get("network_edges") or []

    net = Network(
        height="580px",
        width="100%",
        bgcolor="#F8FAFC",
        font_color="#0F172A",
        directed=True,
    )
    net.set_options("""
    {
      "nodes": {
        "borderWidth": 1.5,
        "font": {"size": 11, "face": "Montserrat, Helvetica"},
        "shadow": {"enabled": true, "size": 6}
      },
      "edges": {
        "arrows": {"to": {"enabled": true, "scaleFactor": 0.6}},
        "font": {"size": 9, "face": "Montserrat, Helvetica", "align": "middle"},
        "smooth": {"type": "curvedCW", "roundness": 0.2}
      },
      "physics": {
        "enabled": true,
        "solver": "forceAtlas2Based",
        "forceAtlas2Based": {"gravitationalConstant": -50, "springLength": 120},
        "stabilization": {"iterations": 150}
      },
      "interaction": {
        "hover": true,
        "tooltipDelay": 100,
        "navigationButtons": false,
        "zoomView": true
      }
    }
    """)

    NODE_SIZE = {"STOCK": 28, "MACRO": 22, "NEWS": 18, "SECTOR": 22, "COMPANY_FACTOR": 18}

    for n in nodes:
        eid   = n.get("entity_id", "")
        etype = n.get("entity_type", "STOCK")
        name  = n.get("name", eid)
        hop   = n.get("hop", 1)
        color = NODE_COLORS.get(etype, "#D5D8DC")
        size  = NODE_SIZE.get(etype, 18)

        if hop == 0:
            border = "#0F172A"
            bw = 3
            font_size = 14
        else:
            border = "#94A3B8"
            bw = 1.5
            font_size = 10

        label = f"{eid}\n{name[:20]}" if eid != name else name[:25]
        tooltip = f"<b>{eid}</b><br>Loại: {NODE_TYPE_VI.get(etype, etype)}<br>Tên: {name}"

        net.add_node(
            eid,
            label=label,
            title=tooltip,
            color={"background": color, "border": border},
            size=size,
            borderWidth=bw,
            font={"size": font_size},
        )

    for e in edges:
        src  = e.get("from", "")
        tgt  = e.get("to", "")
        rel  = e.get("relationship", "")
        color = EDGE_COLORS.get(rel, "#ABB2B9")
        label = EDGE_TYPE_VI.get(rel, rel)

        net.add_edge(
            src, tgt,
            label=label,
            title=f"{rel}",
            color={"color": color, "highlight": color},
            width=2,
        )

    import tempfile, os
    with tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode="w") as f:
        net.save_graph(f.name)
        fname = f.name
    with open(fname, "r", encoding="utf-8") as f:
        html = f.read()
    os.unlink(fname)
    return html


@st.cache_data(ttl=180)
def fetch_network(ticker: str) -> dict:
    try:
        r = get_supabase().rpc("get_financial_network", {"ticker_input": ticker}).execute()
        return r.data or {}
    except Exception as e:
        return {"error": str(e)}


@st.cache_data(ttl=180)
def fetch_all_nodes() -> list[dict]:
    try:
        r = get_supabase().table("graph_nodes").select(
            "entity_id, entity_type, name, properties, created_at, updated_at"
        ).execute()
        return r.data or []
    except Exception as e:
        st.error(f"Lỗi tải nodes: {e}")
        return []


@st.cache_data(ttl=180)
def fetch_all_edges() -> list[dict]:
    try:
        r = get_supabase().table("graph_edges").select(
            "source_id, target_id, relationship_type, properties"
        ).execute()
        return r.data or []
    except Exception as e:
        st.error(f"Lỗi tải edges: {e}")
        return []


st.markdown(page_header("Knowledge Graph Explorer", "Mạng lưới quan hệ tài chính — cổ phiếu, vĩ mô, tin tức, ngành"), unsafe_allow_html=True)
st.caption("Khám phá đồ thị tri thức tài chính — mạng lưới quan hệ giữa cổ phiếu, yếu tố vĩ mô, tin tức, và ngành nghề trên thị trường chứng khoán Việt Nam.")
st.divider()

with st.sidebar:
    st.markdown(section_label("BỘ LỌC"), unsafe_allow_html=True)
    mode = st.radio("Chế độ xem", ["Theo cổ phiếu (2-hop)", "Toàn bộ KG", "Theo loại node"], index=0)
    st.divider()

    if mode == "Theo cổ phiếu (2-hop)":
        selected_ticker = st.selectbox("Chọn mã cổ phiếu", options=TICKERS_SORTED,
            index=TICKERS_SORTED.index("HPG") if "HPG" in TICKERS_SORTED else 0)
        st.info(f"Đang xem mạng lưới 2-hop của **{selected_ticker}**")
    elif mode == "Toàn bộ KG":
        st.info("Hiển thị toàn bộ đồ thị tri thức")
    elif mode == "Theo loại node":
        all_types = list(NODE_TYPE_VI.keys())
        selected_types = st.multiselect("Chọn loại node", options=all_types, default=["STOCK"],
            format_func=lambda x: f"{x} — {NODE_TYPE_VI.get(x, x)}")
        if not selected_types:
            st.warning("Vui lòng chọn ít nhất một loại node.")

    st.divider()
    st.markdown(section_label("LOẠI NODE"), unsafe_allow_html=True)
    for ntype, color in NODE_COLORS.items():
        label = NODE_TYPE_VI.get(ntype, ntype)
        st.markdown(f'<span style="background:{color};padding:2px 8px;border-radius:4px;font-size:12px;">&#9632;</span> **{ntype}** — {label}', unsafe_allow_html=True)

    st.markdown(section_label("LOẠI QUAN HỆ"), unsafe_allow_html=True)
    for etype, color in EDGE_COLORS.items():
        label = EDGE_TYPE_VI.get(etype, etype)
        st.markdown(f'<span style="color:{color};font-size:16px;">&#8594;</span> <span style="font-size:12px;">**{etype}**</span><br><span style="font-size:11px;color:#666;">{label}</span>', unsafe_allow_html=True)


if mode == "Theo cổ phiếu (2-hop)":
    st.subheader(f"Mạng lưới 2-hop — {selected_ticker}")
    with st.spinner(f"Đang tải dữ liệu mạng lưới cho {selected_ticker}..."):
        network_data = fetch_network(selected_ticker)

    if not network_data:
        st.error("Không có dữ liệu. Vui lòng kiểm tra kết nối Supabase.")
        st.stop()
    if "error" in network_data:
        st.error(f"Lỗi: {network_data['error']}")
        st.stop()

    network_nodes = network_data.get("network_nodes", [])
    network_edges = network_data.get("network_edges", [])
    center_node   = network_data.get("center_node", {})
    summary       = network_data.get("summary", {})
    hop1_nodes = [n for n in network_nodes if n.get("hop") == 1]
    hop2_nodes = [n for n in network_nodes if n.get("hop") == 2]

    col_s1, col_s2, col_s3, col_s4 = st.columns(4)
    col_s1.metric("Tổng số node", len(network_nodes))
    col_s2.metric("Tổng số cạnh", len(network_edges))
    col_s3.metric("Node hop-1", len(hop1_nodes))
    col_s4.metric("Node hop-2", len(hop2_nodes))

    _, col_ai_btn = st.columns([5, 1])
    with col_ai_btn:
        if st.button(f"Hỏi AI về {selected_ticker}", type="primary", use_container_width=True):
            st.session_state["prefill_query"] = (
                f"Phân tích {selected_ticker}: Knowledge Graph network, "
                f"các yếu tố tác động tích cực/tiêu cực, và nhận định đầu tư"
            )
            st.switch_page("app.py")

    st.subheader("Bản đồ quan hệ")
    if network_nodes:
        if _PYVIS_OK:
            try:
                html_graph = build_pyvis_html(network_data)
                _components.html(html_graph, height=600, scrolling=False)
            except Exception as ex:
                st.error(f"Không thể hiển thị đồ thị: {ex}")
        else:
            # Fallback to graphviz if pyvis not installed
            try:
                dot_src = build_graphviz_dot(network_data)
                st.graphviz_chart(dot_src, use_container_width=True)
            except Exception as ex:
                st.error(f"Không thể hiển thị đồ thị: {ex}")
            st.info("Cài pyvis để xem đồ thị tương tác: `pip install pyvis`")
    else:
        st.warning("Không có node nào trong mạng lưới.")

    st.divider()
    col_left, col_right = st.columns(2)
    with col_left:
        st.subheader("Danh sách Node")
        if network_nodes:
            df_nodes = pd.DataFrame([{"entity_id": n.get("entity_id"), "entity_type": n.get("entity_type"), "name": n.get("name"), "hop": n.get("hop")} for n in network_nodes])
            st.dataframe(df_nodes, use_container_width=True, hide_index=True)
        else:
            st.info("Không có node.")
    with col_right:
        st.subheader("Danh sách Cạnh")
        if network_edges:
            df_edges = pd.DataFrame([{"from": e.get("from"), "to": e.get("to"), "relationship": e.get("relationship")} for e in network_edges])
            st.dataframe(df_edges, use_container_width=True, hide_index=True)
        else:
            st.info("Không có cạnh.")

    st.divider()
    with st.expander("Chi tiết node trung tâm (Center Node)", expanded=False):
        if center_node:
            st.json(center_node)
        else:
            st.info("Không có thông tin center node.")
    if summary:
        with st.expander("Tóm tắt mạng lưới (Summary)", expanded=False):
            st.json(summary)


elif mode == "Toàn bộ KG":
    st.subheader("Toàn bộ Knowledge Graph")
    with st.spinner("Đang tải toàn bộ dữ liệu KG..."):
        all_nodes = fetch_all_nodes()
        all_edges = fetch_all_edges()

    if not all_nodes and not all_edges:
        st.warning("Chưa có dữ liệu trong Knowledge Graph.")
        st.stop()

    col_a, col_b = st.columns(2)
    col_a.metric("Tổng số Node", len(all_nodes))
    col_b.metric("Tổng số Edge", len(all_edges))
    st.divider()

    col_chart1, col_chart2 = st.columns(2)
    with col_chart1:
        st.subheader("Node theo loại")
        if all_nodes:
            df_nodes_all = pd.DataFrame(all_nodes)
            node_counts = (df_nodes_all.groupby("entity_type").size().reset_index(name="Số lượng")
                .rename(columns={"entity_type": "Loại node"}).sort_values("Số lượng", ascending=False))
            node_counts["Tên loại"] = node_counts["Loại node"].map(lambda x: NODE_TYPE_VI.get(x, x))
            st.bar_chart(node_counts.set_index("Loại node")["Số lượng"], use_container_width=True)
            st.dataframe(node_counts, hide_index=True, use_container_width=True)
    with col_chart2:
        st.subheader("Edge theo loại quan hệ")
        if all_edges:
            df_edges_all = pd.DataFrame(all_edges)
            edge_counts = (df_edges_all.groupby("relationship_type").size().reset_index(name="Số lượng")
                .rename(columns={"relationship_type": "Loại quan hệ"}).sort_values("Số lượng", ascending=False))
            edge_counts["Tên quan hệ"] = edge_counts["Loại quan hệ"].map(lambda x: EDGE_TYPE_VI.get(x, x))
            st.bar_chart(edge_counts.set_index("Loại quan hệ")["Số lượng"], use_container_width=True)
            st.dataframe(edge_counts, hide_index=True, use_container_width=True)

    st.divider()
    st.subheader("Tìm kiếm Node")
    search_q = st.text_input("Tìm kiếm theo tên hoặc entity_id", placeholder="Ví dụ: HPG, thép, tỷ giá...")
    if all_nodes:
        df_nodes_display = pd.DataFrame([{"entity_id": n.get("entity_id"), "entity_type": n.get("entity_type"), "name": n.get("name"), "created_at": n.get("created_at", ""), "updated_at": n.get("updated_at", "")} for n in all_nodes])
        if search_q.strip():
            q_lower = search_q.strip().lower()
            mask = (df_nodes_display["entity_id"].str.lower().str.contains(q_lower, na=False) | df_nodes_display["name"].str.lower().str.contains(q_lower, na=False))
            df_nodes_display = df_nodes_display[mask]
        st.dataframe(df_nodes_display, use_container_width=True, hide_index=True)
        st.caption(f"Hiển thị {len(df_nodes_display)} / {len(all_nodes)} node")

    st.divider()
    st.subheader("Tóm tắt Edge")
    if all_edges:
        df_edges_summary = pd.DataFrame(all_edges)
        edge_summary = (df_edges_summary.groupby("relationship_type").size().reset_index(name="Số cạnh")
            .rename(columns={"relationship_type": "Loại quan hệ"}))
        edge_summary["Mô tả"] = edge_summary["Loại quan hệ"].map(lambda x: EDGE_TYPE_VI.get(x, x))
        edge_summary["Màu"] = edge_summary["Loại quan hệ"].map(lambda x: EDGE_COLORS.get(x, "#ABB2B9"))
        edge_summary = edge_summary.sort_values("Số cạnh", ascending=False)
        st.dataframe(edge_summary[["Loại quan hệ", "Mô tả", "Số cạnh"]], use_container_width=True, hide_index=True)


elif mode == "Theo loại node":
    st.subheader("Khám phá Node theo loại")
    if not selected_types:
        st.warning("Vui lòng chọn ít nhất một loại node ở sidebar.")
        st.stop()
    with st.spinner("Đang tải dữ liệu..."):
        all_nodes = fetch_all_nodes()
    if not all_nodes:
        st.warning("Chưa có dữ liệu nodes.")
        st.stop()
    filtered_nodes = [n for n in all_nodes if n.get("entity_type") in selected_types]
    if not filtered_nodes:
        st.info(f"Không có node nào thuộc loại: {', '.join(selected_types)}")
        st.stop()
    st.caption(f"Tìm thấy **{len(filtered_nodes)}** node thuộc loại: {', '.join(selected_types)}")

    for ntype in selected_types:
        nodes_of_type = [n for n in filtered_nodes if n.get("entity_type") == ntype]
        if not nodes_of_type:
            continue
        type_label = NODE_TYPE_VI.get(ntype, ntype)
        color      = NODE_COLORS.get(ntype, "#D5D8DC")
        st.markdown(section_label(f"{ntype} — {type_label} ({len(nodes_of_type)})"), unsafe_allow_html=True)

        rows = []
        for n in nodes_of_type:
            props = n.get("properties") or {}
            base = {"entity_id": n.get("entity_id"), "name": n.get("name")}
            if ntype == "STOCK":
                base.update({"Giá (VND)": props.get("price"), "P/E TTM": props.get("pe_ttm"), "Vốn hóa (nghìn tỷ)": props.get("market_cap_trillion"), "Doanh thu Q (tỷ)": props.get("revenue_q_bn"), "LNST Q (tỷ)": props.get("net_profit_q_bn"), "Quý gần nhất": props.get("latest_quarter"), "Rating": props.get("analyst_rating"), "Giá mục tiêu": props.get("target_price"), "Upside (%)": props.get("upside_pct")})
            elif ntype == "NEWS":
                base.update({"Tiêu đề": props.get("title"), "Cổ phiếu": props.get("ticker"), "Sentiment": props.get("sentiment"), "Nguồn": props.get("source"), "Ngày": props.get("published_at") or props.get("date")})
            elif ntype == "MACRO":
                base.update({"Giá trị": props.get("value"), "Đơn vị": props.get("unit"), "Cập nhật lúc": props.get("as_of") or props.get("updated_at"), "Mô tả": props.get("description")})
            elif ntype == "SECTOR":
                base.update({"Mô tả": props.get("description"), "Mã ngành": props.get("sector_code"), "Số cổ phiếu": props.get("stock_count")})
            elif ntype == "COMPANY_FACTOR":
                base.update({"Giá trị": props.get("value"), "Đơn vị": props.get("unit"), "Loại": props.get("factor_type"), "Cổ phiếu": props.get("ticker")})
            rows.append(base)

        df_type = pd.DataFrame(rows)
        st.dataframe(df_type, use_container_width=True, hide_index=True)

        with st.expander(f"Xem properties thô — {ntype}", expanded=False):
            for n in nodes_of_type[:20]:
                eid   = n.get("entity_id", "")
                name  = n.get("name", eid)
                props = n.get("properties") or {}
                if props:
                    st.markdown(f"**{eid}** — {name}")
                    st.json(props, expanded=False)
        st.divider()

st.markdown(disclaimer_footer(), unsafe_allow_html=True)
