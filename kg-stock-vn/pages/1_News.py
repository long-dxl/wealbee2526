"""
pages/1_News.py
---------------
Tin tức — đọc bảng `news_articles` (đường tin NHANH, cloud cron giữ tươi 4×/ngày).
Lọc theo cổ phiếu / ngành / tác động / từ khoá. Mỗi tin có link nguồn bấm được.
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_ROOT / ".env")

import requests
import streamlit as st
from core.agent_config import get_supabase
from design_system import (
    inject_css, page_header, section_label, stat_card_html, COLORS,
    disclaimer_footer, icon, sidebar_toggle_button,
)

st.set_page_config(page_title="Tin tức — KG Stock VN", layout="wide",
                   initial_sidebar_state="expanded")
inject_css()
sidebar_toggle_button()

# Sentiment trong news_articles: AFFECTS_POSITIVE / AFFECTS_NEGATIVE / MENTIONS
SENT = {
    "AFFECTS_POSITIVE": {"label": "Tích cực", "bg": "#ECFDF5", "color": "#059669", "ico": "↑"},
    "AFFECTS_NEGATIVE": {"label": "Tiêu cực", "bg": "#FEF2F2", "color": "#DC2626", "ico": "↓"},
    "MENTIONS":         {"label": "Nhắc tới", "bg": "#F1F5F9", "color": "#64748B", "ico": "•"},
}
_SENT_REV = {"Tích cực": "AFFECTS_POSITIVE", "Tiêu cực": "AFFECTS_NEGATIVE", "Nhắc tới": "MENTIONS"}


@st.cache_data(ttl=60)
def load_news(days: int = 30, limit: int = 300):
    sb = get_supabase()
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        r = (sb.table("news_articles")
             .select("title,url,source,ticker,sector,published_at,sentiment,ai_reason,tags,pct_change,crawled_at")
             .gte("published_at", cutoff)
             .order("published_at", desc=True).limit(limit).execute())
        return r.data or []
    except Exception:
        return None


def _trigger_edge_crawl() -> str:
    """Gọi Edge Function sync-news (crawl tin mới nhất). Trả thông điệp kết quả."""
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/") + "/functions/v1/sync-news"
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or ""
    resp = requests.post(url, headers={"Authorization": f"Bearer {key}",
                                       "Content-Type": "application/json"},
                         json={}, timeout=130)
    resp.raise_for_status()
    d = resp.json()
    return f"Đã quét {d.get('pagesScanned','?')} trang · thêm {d.get('upserted',0)} tin mới"


# ── Header + nút cập nhật ────────────────────────────────────────────────────
_hcol, _bcol = st.columns([4, 1])
with _hcol:
    st.markdown(page_header("Tin tức",
                "Tin Vietstock theo cổ phiếu/ngành · cập nhật tự động 4×/ngày · lọc & trích nguồn"),
                unsafe_allow_html=True)
with _bcol:
    st.write("")
    if st.button("Cập nhật tin mới", use_container_width=True, key="refresh_news",
                 help="Crawl tin mới nhất từ Vietstock (Edge Function). ~30-70s."):
        with st.status("Đang crawl tin mới từ Vietstock...", expanded=True) as _rst:
            try:
                _rst.write(_trigger_edge_crawl())
                load_news.clear()
                _rst.update(label="Đã cập nhật — đang tải lại...", state="complete", expanded=False)
            except Exception as _e:
                _rst.update(label=f"Lỗi: {str(_e)[:80]}", state="error")
        st.rerun()

with st.spinner("Đang tải tin..."):
    news = load_news()

if news is None:
    st.warning("Chưa có bảng `news_articles`. Hãy chạy migration_news_table.sql.")
    st.stop()
if not news:
    st.markdown(
        f'<div style="text-align:center;padding:60px 20px;color:{COLORS["text_muted"]}">'
        f'<div style="margin-bottom:12px">{icon("newspaper", size=34, color=COLORS["text_muted"], stroke=1.6)}</div>'
        f'<div style="font-size:16px;font-weight:600">Chưa có tin trong 30 ngày</div>'
        f'<div style="font-size:13px;margin-top:8px">Bấm "Cập nhật tin mới" để crawl ngay.</div>'
        f'</div>', unsafe_allow_html=True)
    st.stop()

# ── KPI ─────────────────────────────────────────────────────────────────────
n_pos = sum(a.get("sentiment") == "AFFECTS_POSITIVE" for a in news)
n_neg = sum(a.get("sentiment") == "AFFECTS_NEGATIVE" for a in news)
n_tickers = len({a.get("ticker") for a in news if a.get("ticker")})
_latest = max((a.get("crawled_at") or a.get("published_at") or "") for a in news)[:16].replace("T", " ")
k1, k2, k3, k4 = st.columns(4)
k1.markdown(stat_card_html("Tổng tin (30 ngày)", str(len(news))), unsafe_allow_html=True)
k2.markdown(stat_card_html("Tác động tích cực", str(n_pos), color=SENT["AFFECTS_POSITIVE"]["color"]), unsafe_allow_html=True)
k3.markdown(stat_card_html("Tác động tiêu cực", str(n_neg), color=SENT["AFFECTS_NEGATIVE"]["color"]), unsafe_allow_html=True)
k4.markdown(stat_card_html("Mã được nhắc", str(n_tickers), sub=f"cập nhật {_latest}"), unsafe_allow_html=True)
st.write("")

# ── Bộ lọc ──────────────────────────────────────────────────────────────────
all_tickers = sorted({a["ticker"] for a in news if a.get("ticker")})
all_sectors = sorted({a["sector"] for a in news if a.get("sector")})
f1, f2, f3, f4 = st.columns([2, 2, 2, 3])
sel_tk = f1.selectbox("Cổ phiếu", ["Tất cả"] + all_tickers, index=0)
sel_sec = f2.selectbox("Ngành", ["Tất cả"] + all_sectors, index=0)
sel_sent = f3.multiselect("Tác động", ["Tích cực", "Tiêu cực", "Nhắc tới"], default=[])
kw = f4.text_input("Tìm trong tiêu đề", "", placeholder="vd: cổ tức, lãi suất, ESOP...")
sel_sent_codes = {_SENT_REV[s] for s in sel_sent}


def keep(a):
    if sel_tk != "Tất cả" and a.get("ticker") != sel_tk:
        return False
    if sel_sec != "Tất cả" and a.get("sector") != sel_sec:
        return False
    if sel_sent_codes and a.get("sentiment") not in sel_sent_codes:
        return False
    if kw and kw.lower() not in (a.get("title") or "").lower():
        return False
    return True


shown = [a for a in news if keep(a)]
st.markdown(section_label(f"DÒNG TIN ({len(shown)})"), unsafe_allow_html=True)
st.write("")

for a in shown:
    s = SENT.get(a.get("sentiment"), SENT["MENTIONS"])
    link = a.get("url") or ""
    title_html = (f'<a href="{link}" target="_blank" style="color:{COLORS["text_primary"]};'
                  f'text-decoration:none;font-weight:600">{a["title"]}</a>' if link else a["title"])
    day = (a.get("published_at") or "")[:10]
    tk = a.get("ticker")
    tk_chip = (f'<span style="background:{s["bg"]};color:{s["color"]};font-size:12px;font-weight:700;'
               f'padding:2px 9px;border-radius:7px;margin-right:6px">{tk} {s["ico"]}</span>' if tk else "")
    sec = f' · {a.get("sector")}' if a.get("sector") else ""
    reason = (f'<div style="font-size:12.5px;color:{COLORS["text_muted"]};margin-top:5px">'
              f'{a["ai_reason"]}</div>' if a.get("ai_reason") else "")
    tags = "".join(
        f'<span style="display:inline-block;background:{COLORS["bg_input"]};color:{COLORS["text_secondary"]};'
        f'font-size:11px;padding:1px 8px;border-radius:6px;margin:3px 4px 0 0">{t}</span>'
        for t in (a.get("tags") or [])[:5])
    st.markdown(f"""
<div style="background:{COLORS['bg_card']};border:1px solid {COLORS['border']};border-left:3px solid {s['color']};
            border-radius:12px;padding:13px 17px;margin-bottom:9px;box-shadow:0 1px 3px rgba(15,23,42,0.04)">
  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
    {tk_chip}
    <span style="font-size:11.5px;color:{COLORS['text_muted']}">{s['label']} · {day} · {a.get('source','Vietstock')}{sec}</span>
  </div>
  <div style="font-size:14.5px;line-height:1.45">{title_html}</div>
  {reason}
  <div>{tags}</div>
</div>""", unsafe_allow_html=True)

st.markdown(disclaimer_footer(), unsafe_allow_html=True)
