"""
pages/6_Events.py
-----------------
Sự kiện & Tác động — Đồ thị Sự kiện (KG v2): sự kiện đã TRÍCH & DEDUPE từ tin tức,
kèm tác động lượng hóa lên cổ phiếu (chiều +/-, độ mạnh, cơ chế), xếp theo TRỌNG YẾU.
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_ROOT / ".env")

import streamlit as st
from core.agent_config import get_supabase
from design_system import (
    inject_css, page_header, section_label, stat_card_html, COLORS,
    disclaimer_footer, icon, sidebar_toggle_button,
)

st.set_page_config(page_title="Sự kiện & Tác động — KG Stock VN", layout="wide",
                   initial_sidebar_state="expanded")
inject_css()
sidebar_toggle_button()

SENT = {
    "POSITIVE": {"label": "Tích cực", "bg": "#ECFDF5", "color": "#059669", "ico": "↑"},
    "NEGATIVE": {"label": "Tiêu cực", "bg": "#FEF2F2", "color": "#DC2626", "ico": "↓"},
    "NEUTRAL":  {"label": "Trung lập", "bg": "#F1F5F9", "color": "#64748B", "ico": "→"},
}


@st.cache_data(ttl=120)
def load_events(limit: int = 150):
    sb = get_supabase()
    try:
        evs = sb.table("events").select(
            "event_id,event_type,scope,title,occurred_at,sentiment,materiality,"
            "primary_source_url,source_article_ids"
        ).order("occurred_at", desc=True).limit(limit).execute().data
    except Exception:
        return None, {}, {}, {}
    if not evs:
        return [], {}, {}, {}
    ids = [e["event_id"] for e in evs]
    impacts = sb.table("event_impacts").select(
        "event_id,entity_id,direction,strength,horizon,mechanism").in_("event_id", ids).execute().data
    tax = {r["code"]: r for r in sb.table("event_taxonomy").select("code,name_vi,category").execute().data}
    eids = list({i["entity_id"] for i in impacts})
    ents = sb.table("entities").select("entity_id,canonical_name,ticker").in_("entity_id", eids).execute().data if eids else []
    ename = {e["entity_id"]: (e.get("ticker") or e.get("canonical_name")) for e in ents}
    imp_by_ev = {}
    for i in impacts:
        imp_by_ev.setdefault(i["event_id"], []).append(i)
    return evs, imp_by_ev, tax, ename


_hcol, _bcol = st.columns([4, 1])
with _hcol:
    st.markdown(page_header("Sự kiện & Tác động",
                "Đồ thị Sự kiện (KG v2) · sự kiện đã trích & dedupe từ tin · xếp theo mức trọng yếu"),
                unsafe_allow_html=True)
with _bcol:
    st.write("")
    if st.button("Cập nhật tin & sự kiện", use_container_width=True, key="refresh_events",
                 help="Crawl tin mới nhất từ Vietstock + trích sự kiện (KG v2). Mất ~30-40s."):
        with st.status("Đang crawl tin & trích sự kiện mới...", expanded=True) as _rst:
            try:
                from data.sync_vietstock_news import run_pipeline   # noqa: PLC0415
                _rst.write("Crawl Vietstock → trích xuất AI → cập nhật dòng sự kiện...")
                run_pipeline(days_back=2, min_confidence=0.5)
                load_events.clear()
                _rst.update(label="Đã cập nhật — đang tải lại...", state="complete", expanded=False)
            except Exception as _e:
                _rst.update(label=f"Lỗi: {str(_e)[:80]}", state="error")
        st.rerun()

with st.spinner("Đang tải sự kiện..."):
    evs, imp_by_ev, tax, ename = load_events()

if evs is None:
    st.warning("Chưa có bảng `events` (KG v2). Hãy chạy migration_kg_v2.sql + seed_kg_v2.py + extract_events.py.")
    st.stop()
if not evs:
    st.markdown(
        f'<div style="text-align:center;padding:60px 20px;color:{COLORS["text_muted"]}">'
        f'<div style="margin-bottom:12px">{icon("sparkles", size=34, color=COLORS["text_muted"], stroke=1.6)}</div>'
        f'<div style="font-size:16px;font-weight:600">Chưa có sự kiện nào trong Đồ thị Sự kiện</div>'
        f'<div style="font-size:13px;margin-top:8px">Chạy <code>python3 extract_events.py</code> để trích sự kiện từ tin.</div>'
        f'</div>', unsafe_allow_html=True)
    st.stop()

# ── KPI ─────────────────────────────────────────────────────────────────────
all_imp = [i for v in imp_by_ev.values() for i in v]
n_pos = sum(i["direction"] == "POSITIVE" for i in all_imp)
n_neg = sum(i["direction"] == "NEGATIVE" for i in all_imp)
n_stocks = len({i["entity_id"] for i in all_imp})
k1, k2, k3, k4 = st.columns(4)
k1.markdown(stat_card_html("Sự kiện", str(len(evs))), unsafe_allow_html=True)
k2.markdown(stat_card_html("Tác động tích cực", str(n_pos), color=SENT["POSITIVE"]["color"]), unsafe_allow_html=True)
k3.markdown(stat_card_html("Tác động tiêu cực", str(n_neg), color=SENT["NEGATIVE"]["color"]), unsafe_allow_html=True)
k4.markdown(stat_card_html("Mã được nhắc", str(n_stocks)), unsafe_allow_html=True)
st.write("")

# ── Bộ lọc ──────────────────────────────────────────────────────────────────
cats = sorted({tax.get(e["event_type"], {}).get("category") for e in evs if e.get("event_type")} - {None})
all_tickers = sorted({ename.get(i["entity_id"], i["entity_id"]) for i in all_imp})
f1, f2, f3 = st.columns([2, 2, 2])
sel_cat = f1.multiselect("Nhóm sự kiện", cats, default=[])
sel_sent = f2.multiselect("Tác động", ["Tích cực", "Tiêu cực", "Trung lập"], default=[])
sel_tk = f3.selectbox("Cổ phiếu", ["Tất cả"] + all_tickers, index=0)
min_mat = st.slider("Mức trọng yếu tối thiểu", 0.0, 1.0, 0.0, 0.1)

_sent_rev = {"Tích cực": "POSITIVE", "Tiêu cực": "NEGATIVE", "Trung lập": "NEUTRAL"}
sel_sent_codes = {_sent_rev[s] for s in sel_sent}


def keep(e):
    if sel_cat and tax.get(e["event_type"], {}).get("category") not in sel_cat:
        return False
    if sel_sent_codes and e.get("sentiment") not in sel_sent_codes:
        return False
    if (e.get("materiality") or 0) < min_mat:
        return False
    if sel_tk != "Tất cả":
        tks = {ename.get(i["entity_id"], i["entity_id"]) for i in imp_by_ev.get(e["event_id"], [])}
        if sel_tk not in tks:
            return False
    return True


shown = [e for e in evs if keep(e)]
# xếp theo trọng yếu rồi mới đến ngày
shown.sort(key=lambda e: ((e.get("materiality") or 0), (e.get("occurred_at") or "")), reverse=True)

st.markdown(section_label(f"DÒNG SỰ KIỆN ({len(shown)})"), unsafe_allow_html=True)
st.write("")

for e in shown:
    s = SENT.get(e.get("sentiment"), SENT["NEUTRAL"])
    t = tax.get(e["event_type"], {})
    mat = e.get("materiality") or 0
    mat_w = int(mat * 100)
    # chips mã ảnh hưởng
    chips = ""
    for i in imp_by_ev.get(e["event_id"], [])[:6]:
        d = SENT.get(i["direction"], SENT["NEUTRAL"])
        chips += (f'<span style="display:inline-block;background:{d["bg"]};color:{d["color"]};'
                  f'font-size:12px;font-weight:700;padding:2px 9px;border-radius:7px;margin:2px 4px 2px 0">'
                  f'{ename.get(i["entity_id"], i["entity_id"])} {d["ico"]}</span>')
    mechs = [i.get("mechanism") for i in imp_by_ev.get(e["event_id"], []) if i.get("mechanism")]
    mech = mechs[0] if mechs else ""
    link = e.get("primary_source_url") or ""
    title_html = (f'<a href="{link}" target="_blank" style="color:{COLORS["text_primary"]};text-decoration:none">{e["title"]}</a>'
                  if link else e["title"])
    n_src = len(e.get("source_article_ids") or [])
    src_note = f' · {n_src} bài nguồn' if n_src > 1 else ""

    st.markdown(f"""
<div style="background:{COLORS['bg_card']};border:1px solid {COLORS['border']};border-left:3px solid {s['color']};
            border-radius:12px;padding:14px 18px;margin-bottom:10px;box-shadow:0 1px 3px rgba(15,23,42,0.04)">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="background:{s['bg']};color:{s['color']};font-size:11px;font-weight:700;
                   padding:3px 10px;border-radius:8px">{t.get('name_vi', e['event_type'])}</span>
      <span style="font-size:11.5px;color:{COLORS['text_muted']}">{(e.get('occurred_at') or '')[:10]}{src_note}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;min-width:140px">
      <span style="font-size:10.5px;color:{COLORS['text_muted']};font-weight:600">TRỌNG YẾU</span>
      <div style="flex:1;height:6px;background:{COLORS['bg_input']};border-radius:99px;overflow:hidden;min-width:70px">
        <div style="width:{mat_w}%;height:100%;background:{s['color']}"></div></div>
      <span style="font-size:11px;font-weight:700;color:{s['color']}">{mat:.1f}</span>
    </div>
  </div>
  <div style="font-size:15px;font-weight:600;line-height:1.4;margin:9px 0 6px;color:{COLORS['text_primary']}">{title_html}</div>
  <div style="margin-bottom:4px">{chips}</div>
  {f'<div style="font-size:12.5px;color:{COLORS["text_secondary"]};line-height:1.5">⚙ {mech}</div>' if mech else ''}
</div>""", unsafe_allow_html=True)

st.write("")
st.markdown(disclaimer_footer(), unsafe_allow_html=True)
