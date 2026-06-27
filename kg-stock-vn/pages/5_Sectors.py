"""
pages/5_Sectors.py
------------------
Ngành & Beta — Khám phá backbone suy luận: mỗi NGÀNH chịu tác động bởi yếu tố
VĨ MÔ nào (trong nước + quốc tế), và cổ phiếu trong ngành nhạy mạnh/yếu ra sao
theo hệ số BETA.
"""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_ROOT / ".env")

import streamlit as st
import plotly.graph_objects as go
from core.agent_config import get_supabase
from design_system import inject_css, page_header, section_label, COLORS, disclaimer_footer, sidebar_toggle_button

st.set_page_config(page_title="Ngành & Beta — KG Stock VN", layout="wide",
                   initial_sidebar_state="expanded")
inject_css()
sidebar_toggle_button()

st.markdown(page_header("Ngành & Beta",
            "Vĩ mô → Ngành → Cổ phiếu (× Beta) · Xương sống suy luận của AI"),
            unsafe_allow_html=True)


@st.cache_data(ttl=300)
def load_sectors() -> list[dict]:
    try:
        r = get_supabase().table("graph_nodes").select("entity_id,name")\
              .eq("entity_type", "SECTOR").order("name").execute()
        return r.data or []
    except Exception as e:
        st.error(f"Lỗi tải ngành: {e}"); return []


@st.cache_data(ttl=120)
def load_sector_network(sector_id: str) -> dict:
    try:
        return get_supabase().rpc("get_sector_network", {"sector_input": sector_id}).execute().data or {}
    except Exception as e:
        return {"error": str(e)}


sectors = load_sectors()
if not sectors:
    st.info("Chưa có dữ liệu ngành. Chạy seed_sector_graph.py để nạp.")
    st.stop()

# ── Chọn ngành ──────────────────────────────────────────────
names = [s["name"] for s in sectors]
id_by_name = {s["name"]: s["entity_id"] for s in sectors}
choice = st.selectbox("Chọn ngành", names, index=names.index("Ngành Ngân hàng") if "Ngành Ngân hàng" in names else 0)
data = load_sector_network(id_by_name[choice])

if data.get("error"):
    st.error(data["error"]); st.stop()

drivers = data.get("macro_drivers") or []
stocks  = data.get("stocks") or []

# ── Metrics nhanh ───────────────────────────────────────────
betas = [float(s["beta_vnindex"]) for s in stocks if s.get("beta_vnindex") is not None]
c1, c2, c3 = st.columns(3)
c1.metric("Yếu tố vĩ mô tác động", len(drivers))
c2.metric("Số cổ phiếu", len(stocks))
c3.metric("Beta trung bình", f"{sum(betas)/len(betas):.2f}" if betas else "—")
st.divider()

col_macro, col_beta = st.columns([1, 1], gap="large")

# ── Cột trái: yếu tố vĩ mô tác động ─────────────────────────
SIGN_CFG = {"+": ("#059669", "#ECFDF5", "Tích cực"), "-": ("#DC2626", "#FEF2F2", "Tiêu cực")}
with col_macro:
    st.markdown(section_label("YẾU TỐ VĨ MÔ TÁC ĐỘNG"), unsafe_allow_html=True)
    if not drivers:
        st.caption("Chưa có dữ liệu.")
    for m in drivers:
        sign = (m.get("sign") or "+")
        color, bg, lbl = SIGN_CFG.get(sign, ("#64748B", "#F1F5F9", "Trung lập"))
        scope = "Trong nước" if m.get("scope") == "domestic" else "Quốc tế"
        try:
            w = float(m.get("weight") or 0)
        except (TypeError, ValueError):
            w = 0
        st.markdown(
            f'<div style="background:{COLORS["bg_card"]};border:1px solid {COLORS["border"]};'
            f'border-left:3px solid {color};border-radius:10px;padding:12px 14px;margin-bottom:8px">'
            f'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
            f'<span style="font-weight:700;font-size:13.5px;color:{COLORS["text_primary"]}">{m.get("macro_name") or m.get("macro")}</span>'
            f'<span style="background:{bg};color:{color};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">{lbl}</span>'
            f'</div>'
            f'<div style="margin-top:6px;height:5px;background:{COLORS["bg_input"]};border-radius:3px;overflow:hidden">'
            f'<div style="width:{int(w*100)}%;height:100%;background:{color}"></div></div>'
            f'<div style="display:flex;justify-content:space-between;margin-top:5px">'
            f'<span style="font-size:11px;color:{COLORS["text_muted"]}">{scope} · trọng số {w:.2f}</span>'
            f'<span style="font-size:11px;color:{COLORS["text_muted"]}">trễ: {m.get("lag","-")}</span></div>'
            f'<div style="font-size:12px;color:{COLORS["text_secondary"]};margin-top:6px;line-height:1.5">{m.get("mechanism","")}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

# ── Cột phải: Beta cổ phiếu ─────────────────────────────────
with col_beta:
    st.markdown(section_label("CỔ PHIẾU & ĐỘ NHẠY (BETA vs VN-INDEX)"), unsafe_allow_html=True)
    if not stocks:
        st.caption("Chưa có cổ phiếu gắn ngành này.")
    else:
        rows = sorted(
            [(s["ticker"], float(s["beta_vnindex"])) for s in stocks if s.get("beta_vnindex") is not None],
            key=lambda x: x[1])
        tickers = [r[0] for r in rows]
        vals    = [r[1] for r in rows]
        colors  = ["#DC2626" if v >= 1.2 else ("#D97706" if v >= 1.0 else "#059669") for v in vals]
        fig = go.Figure(go.Bar(
            x=vals, y=tickers, orientation="h",
            marker_color=colors,
            text=[f"{v:.2f}" for v in vals], textposition="outside",
        ))
        fig.add_vline(x=1.0, line_dash="dash", line_color="#94A3B8",
                      annotation_text="Thị trường (β=1)", annotation_position="top")
        fig.update_layout(
            height=max(220, 34 * len(tickers)),
            plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
            font=dict(family="Montserrat, sans-serif", size=11),
            margin=dict(l=10, r=40, t=24, b=10),
            xaxis=dict(title="Beta", range=[0, max(vals) * 1.25 if vals else 2]),
            yaxis=dict(title=""),
        )
        st.plotly_chart(fig, use_container_width=True)
        st.caption("🔴 β≥1.2 nhạy rất mạnh · 🟠 1.0–1.2 nhạy hơn thị trường · 🟢 β<1.0 phòng thủ")

st.divider()
st.markdown(
    f'<div style="font-size:12.5px;color:{COLORS["text_secondary"]};line-height:1.6">'
    f'<b>Cách AI dùng trang này:</b> khi một yếu tố vĩ mô biến động, AI xác định ngành chịu '
    f'tác động (dấu &amp; trọng số ở cột trái), rồi nhân với <b>Beta</b> từng cổ phiếu (cột phải) '
    f'để biết mã nào biến động mạnh/yếu hơn ngành — <b>tác động ≈ tín hiệu ngành × Beta</b>.'
    f'</div>',
    unsafe_allow_html=True,
)
st.markdown(disclaimer_footer(), unsafe_allow_html=True)
