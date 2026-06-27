"""
pages/2_Dashboard.py
--------------------
Dashboard tổng quan thị trường chứng khoán Việt Nam — Top 10 HoSE.
"""

import sys
import os
from pathlib import Path

# ── Load .env từ thư mục cha ─────────────────────────────────────────────────
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from dotenv import load_dotenv
load_dotenv(_root / ".env")

# ── Imports ───────────────────────────────────────────────────────────────────
import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from core.agent_config import (
    get_market_overview,
    get_market_price,
    TOP_10_TICKERS,
    get_universe_tickers,
)
from design_system import inject_css, page_header, section_label, stat_card_html, COLORS, sidebar_toggle_button

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Market Dashboard — KG Stock VN",
    layout="wide",
    initial_sidebar_state="expanded",
)

inject_css()
sidebar_toggle_button()

# ── Sector map ────────────────────────────────────────────────────────────────
SECTOR_MAP: dict[str, str] = {
    "HPG": "Thép",
    "VHM": "Bất động sản",
    "VIC": "Bất động sản",
    "VCB": "Ngân hàng",
    "TCB": "Ngân hàng",
    "BID": "Ngân hàng",
    "MSN": "Tiêu dùng",
    "VNM": "Tiêu dùng",
    "MWG": "Tiêu dùng",
    "FPT": "Công nghệ",
}

TOP_10_LIST = sorted(get_universe_tickers() or TOP_10_TICKERS)   # toàn universe, fallback rổ ưu tiên


# ── Cached data loaders ───────────────────────────────────────────────────────
@st.cache_data(ttl=300)
def load_overview() -> dict:
    return get_market_overview()


@st.cache_data(ttl=300)
def load_price(ticker: str) -> dict:
    return get_market_price(ticker)


# ── Helper: format number ─────────────────────────────────────────────────────
def _fmt_price(value) -> str:
    if value is None:
        return "N/A"
    try:
        return f"{int(value):,}"
    except (ValueError, TypeError):
        return str(value)


def _fmt_float(value, decimals: int = 1) -> str:
    if value is None:
        return "N/A"
    try:
        return f"{float(value):.{decimals}f}"
    except (ValueError, TypeError):
        return str(value)


# ── Card row renderer ─────────────────────────────────────────────────────────
def _render_stock_row(row: dict, usd_vnd_val) -> None:
    """Render one stock as a card row with 52w range bar."""
    c = COLORS  # from design_system

    ticker     = row.get("ticker", "")
    name       = row.get("name", "")
    price      = row.get("price") or 0
    upside     = row.get("upside_pct")
    pe         = row.get("pe_ttm")
    mc         = row.get("market_cap_trillion") or 0
    rating     = str(row.get("analyst_rating") or "").upper()
    target     = row.get("target_price") or 0
    hi52       = row.get("price_52w_high") or 0
    lo52       = row.get("price_52w_low") or 0

    # Rating badge color
    if "BUY" in rating or "OUTPERFORM" in rating:
        badge_bg, badge_color = "#ECFDF5", "#059669"
    elif "SELL" in rating or "UNDERPERFORM" in rating:
        badge_bg, badge_color = "#FEF2F2", "#DC2626"
    else:
        badge_bg, badge_color = "#FFFBEB", "#D97706"

    # Upside color
    upside_color = "#059669" if (upside or 0) >= 0 else "#DC2626"

    # 52w range pct
    range_pct = 0
    if hi52 > lo52 and price > 0:
        range_pct = min(100, max(0, (price - lo52) / (hi52 - lo52) * 100))

    col_ticker, col_name, col_price, col_pe, col_mc, col_range, col_rating, col_ai = st.columns([1, 2.5, 1.8, 1, 1.2, 2, 1.5, 1.2])

    with col_ticker:
        st.markdown(
            f'<div style="background:linear-gradient(135deg,#0F2B46,#1A56DB);color:white;'
            f'border-radius:8px;padding:6px 10px;font-size:13px;font-weight:800;'
            f'text-align:center;letter-spacing:0.02em">{ticker}</div>',
            unsafe_allow_html=True,
        )

    with col_name:
        st.markdown(
            f'<div style="font-size:13px;font-weight:600;color:#0F172A;line-height:1.3">{name}</div>'
            f'<div style="font-size:11px;color:#94A3B8;margin-top:2px">{SECTOR_MAP.get(ticker,"")}</div>',
            unsafe_allow_html=True,
        )

    with col_price:
        upside_str = f'{upside:+.1f}%' if upside is not None else '—'
        st.markdown(
            f'<div style="font-size:14px;font-weight:700;color:#0F172A">{int(price):,}đ</div>'
            f'<div style="font-size:11px;font-weight:600;color:{upside_color}">{upside_str} upside</div>',
            unsafe_allow_html=True,
        )

    with col_pe:
        pe_str = f'{float(pe):.1f}x' if pe is not None else '—'
        st.markdown(
            f'<div style="font-size:13px;font-weight:600;color:#475569">{pe_str}</div>'
            f'<div style="font-size:10px;color:#94A3B8">P/E TTM</div>',
            unsafe_allow_html=True,
        )

    with col_mc:
        st.markdown(
            f'<div style="font-size:13px;font-weight:600;color:#475569">{float(mc):.1f}T</div>'
            f'<div style="font-size:10px;color:#94A3B8">Vốn hóa</div>',
            unsafe_allow_html=True,
        )

    with col_range:
        # 52-week range bar
        if hi52 > 0 and lo52 > 0:
            st.markdown(
                f'<div style="padding-top:2px">'
                f'<div style="width:100%;background:#E2E8F0;border-radius:4px;height:5px;position:relative">'
                f'<div style="width:{range_pct:.0f}%;background:#1A56DB;height:5px;border-radius:4px"></div>'
                f'</div>'
                f'<div style="display:flex;justify-content:space-between;margin-top:3px">'
                f'<span style="font-size:9.5px;color:#94A3B8">{int(lo52):,}</span>'
                f'<span style="font-size:9.5px;color:#94A3B8">{int(hi52):,}</span>'
                f'</div></div>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown('<div style="font-size:11px;color:#94A3B8">—</div>', unsafe_allow_html=True)

    with col_rating:
        target_str = f'{int(target):,}đ' if target else '—'
        st.markdown(
            f'<div style="background:{badge_bg};color:{badge_color};border-radius:100px;'
            f'padding:3px 10px;font-size:11px;font-weight:700;display:inline-block">{rating or "—"}</div>'
            f'<div style="font-size:10px;color:#94A3B8;margin-top:3px">Target: {target_str}</div>',
            unsafe_allow_html=True,
        )

    with col_ai:
        if st.button("Hỏi AI", key=f"ai_{ticker}", use_container_width=True, type="secondary"):
            st.session_state["prefill_query"] = (
                f"Phân tích toàn diện {ticker} ({name}): "
                f"xem Knowledge Graph, giá thực, và đưa ra nhận định đầu tư"
            )
            st.switch_page("app.py")


# ─────────────────────────────────────────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────────────────────────────────────────
overview = load_overview()
macro = overview.get("macro", {})
stocks: list[dict] = overview.get("top10_stocks", [])

# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(section_label("DỮ LIỆU VĨ MÔ"), unsafe_allow_html=True)

    usd_vnd      = macro.get("usd_vnd", "N/A")
    usd_vnd_sell = macro.get("usd_vnd_sell", "N/A")
    sbv_rate     = macro.get("sbv_base_rate_pct", "N/A")
    fed_rate     = macro.get("fed_rate_pct", "N/A")
    usd_as_of    = macro.get("usd_vnd_as_of", "")

    st.metric(
        label="USD/VND (mua)",
        value=f"{_fmt_price(usd_vnd)} ₫" if usd_vnd != "N/A" else "N/A",
        help="Tỷ giá mua USD/VND từ Vietcombank",
    )
    st.metric(
        label="USD/VND (bán)",
        value=f"{_fmt_price(usd_vnd_sell)} ₫" if usd_vnd_sell != "N/A" else "N/A",
    )
    st.metric(
        label="Lãi suất NHNN",
        value=f"{sbv_rate}%" if sbv_rate != "N/A" else "N/A",
        help="Lãi suất điều hành Ngân hàng Nhà nước Việt Nam",
    )
    st.metric(
        label="Fed Funds Rate",
        value=f"{fed_rate}%" if fed_rate != "N/A" else "N/A",
        help="Lãi suất cơ sở của Cục Dự trữ Liên bang Mỹ",
    )

    if usd_as_of:
        st.caption(f"Tỷ giá cập nhật: {usd_as_of[:10]}")

    st.divider()

    if stocks:
        synced_at = stocks[0].get("synced_at", "")
        if synced_at:
            st.caption(f"Dữ liệu đồng bộ lần cuối:\n{synced_at[:19].replace('T', ' ')} UTC")

    st.divider()

    if st.button("Làm mới dữ liệu", use_container_width=True, type="primary"):
        st.cache_data.clear()
        st.rerun()


# ─────────────────────────────────────────────────────────────────────────────
# HEADER
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(page_header("Market Dashboard", "Real-time data · Top 10 HoSE"), unsafe_allow_html=True)

# P1.3 — Data Freshness Badge
if stocks:
    synced_raw = stocks[0].get("synced_at", "")
    if synced_raw:
        st.markdown(
            f'<div style="display:inline-flex;align-items:center;gap:6px;'
            f'background:#F1F5F9;border:1px solid rgba(15,23,42,0.08);border-radius:100px;'
            f'padding:4px 12px;font-size:11px;font-weight:600;color:#64748B;margin-bottom:16px">'
            f'<span style="width:6px;height:6px;border-radius:50%;background:#059669;display:inline-block"></span>'
            f'Dữ liệu đồng bộ: {synced_raw[:10]}'
            f'</div>',
            unsafe_allow_html=True,
        )

st.divider()

# ─────────────────────────────────────────────────────────────────────────────
# TOP METRICS
# ─────────────────────────────────────────────────────────────────────────────
col1, col2, col3, col4 = st.columns(4)

total_mc = sum(float(s.get("market_cap_trillion") or 0) for s in stocks)
pe_values = [float(s["pe_ttm"]) for s in stocks if s.get("pe_ttm") is not None]
avg_pe = sum(pe_values) / len(pe_values) if pe_values else None
buy_count = sum(1 for s in stocks if str(s.get("analyst_rating", "")).upper() in ("BUY", "STRONG BUY", "OUTPERFORM"))

with col1:
    st.metric(label="Tổng vốn hóa Top 10", value=f"{total_mc:,.0f} nghìn tỷ")
with col2:
    st.metric(label="P/E trung bình", value=f"{avg_pe:.1f}x" if avg_pe is not None else "N/A")
with col3:
    st.metric(label="Cổ phiếu BUY", value=f"{buy_count} / {len(stocks)}")
with col4:
    st.metric(label="USD/VND", value=f"{_fmt_price(usd_vnd)} ₫" if usd_vnd != "N/A" else "N/A")

st.divider()

# ─────────────────────────────────────────────────────────────────────────────
# TOP 10 TABLE — P2.2 Card Table
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(section_label("BẢNG GIÁ TOP 10 HOSE"), unsafe_allow_html=True)

# Table header
h1, h2, h3, h4, h5, h6, h7, h8 = st.columns([1, 2.5, 1.8, 1, 1.2, 2, 1.5, 1.2])
for col, label in zip(
    [h1, h2, h3, h4, h5, h6, h7, h8],
    ["Mã", "Tên công ty", "Giá / Upside", "P/E", "Vốn hóa", "Dải 52 tuần", "Rating", "AI"],
):
    col.markdown(
        f'<div style="font-size:10px;font-weight:700;text-transform:uppercase;'
        f'letter-spacing:0.08em;color:#94A3B8;padding:4px 0">{label}</div>',
        unsafe_allow_html=True,
    )

st.markdown('<hr style="margin:6px 0 12px;opacity:0.4">', unsafe_allow_html=True)

if stocks:
    df_stocks = pd.DataFrame(stocks)
    df_stocks = df_stocks.sort_values(by="market_cap_trillion", ascending=False, na_position="last").reset_index(drop=True)
    for _, row in df_stocks.iterrows():
        _render_stock_row(row.to_dict(), usd_vnd)
        st.markdown('<hr style="margin:8px 0;opacity:0.2">', unsafe_allow_html=True)
else:
    st.warning("Không có dữ liệu cổ phiếu.")

st.divider()

# ─────────────────────────────────────────────────────────────────────────────
# PRICE CHART
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(section_label("BIỂU ĐỒ GIÁ 30 NGÀY"), unsafe_allow_html=True)

# P2.3 — Context Bridge: selectbox + AI button
col_sel, col_ai_btn = st.columns([4, 1])
with col_sel:
    selected_ticker = st.selectbox("Chọn cổ phiếu", options=TOP_10_LIST, index=0, label_visibility="collapsed")
with col_ai_btn:
    if st.button(f"Hỏi AI về {selected_ticker}", type="primary", use_container_width=True):
        st.session_state["prefill_query"] = f"Phân tích chi tiết {selected_ticker}: Knowledge Graph, giá 30 ngày, và outlook đầu tư"
        st.switch_page("app.py")

if selected_ticker:
    with st.spinner(f"Đang tải dữ liệu {selected_ticker}..."):
        price_data = load_price(selected_ticker)

    if price_data.get("status") == "OK" or "price" in price_data:
        pm1, pm2, pm3, pm4 = st.columns(4)
        current_price  = price_data.get("price")
        change_pct     = price_data.get("price_change_pct")
        change_vnd     = price_data.get("price_change_vnd")
        high_30d       = price_data.get("high_30d")
        low_30d        = price_data.get("low_30d")
        avg_vol        = price_data.get("avg_volume_30d")

        with pm1:
            delta_str = None
            if change_pct is not None and change_vnd is not None:
                delta_str = f"{change_pct:+.2f}% ({_fmt_price(change_vnd)} ₫)"
            st.metric(label=f"Giá {selected_ticker}", value=f"{_fmt_price(current_price)} ₫" if current_price else "N/A", delta=delta_str)
        with pm2:
            st.metric(label="Cao nhất 30 ngày", value=f"{_fmt_price(high_30d)} ₫" if high_30d else "N/A")
        with pm3:
            st.metric(label="Thấp nhất 30 ngày", value=f"{_fmt_price(low_30d)} ₫" if low_30d else "N/A")
        with pm4:
            st.metric(label="KL giao dịch TB 30 ngày", value=f"{avg_vol:,.0f}" if avg_vol else "N/A")

        history = price_data.get("price_history_30d", [])
        if history:
            df_hist = pd.DataFrame(history)
            df_hist["date"] = pd.to_datetime(df_hist["date"])
            df_hist = df_hist.sort_values("date")

            fig = make_subplots(
                rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.08,
                row_heights=[0.7, 0.3],
                subplot_titles=(f"Giá đóng cửa — {selected_ticker}", "Khối lượng giao dịch"),
            )
            fig.add_trace(go.Scatter(x=df_hist["date"], y=df_hist["close"], mode="lines+markers",
                name="Giá đóng cửa", line=dict(color="#2563eb", width=2), marker=dict(size=4),
                hovertemplate="%{x|%d/%m/%Y}<br>Giá: %{y:,.0f} ₫<extra></extra>"), row=1, col=1)
            fig.add_trace(go.Bar(x=df_hist["date"], y=df_hist["volume"], name="Khối lượng",
                marker_color="#93c5fd", hovertemplate="%{x|%d/%m/%Y}<br>KL: %{y:,.0f}<extra></extra>"), row=2, col=1)
            fig.update_layout(
                height=500, showlegend=False, hovermode="x unified",
                plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
                margin=dict(l=10, r=10, t=40, b=10),
                font=dict(family="Montserrat, sans-serif", size=11),
                xaxis2=dict(tickformat="%d/%m"),
            )
            fig.update_yaxes(tickformat=",.0f", row=1, col=1, title_text="VND")
            fig.update_yaxes(row=2, col=1, title_text="CP")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Không có dữ liệu lịch sử giá để hiển thị biểu đồ.")
    else:
        err = price_data.get("error", "Không xác định")
        st.error(f"Lỗi tải dữ liệu {selected_ticker}: {err}")

st.divider()

# ─────────────────────────────────────────────────────────────────────────────
# SECTOR ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(section_label("PHÂN TÍCH THEO NGÀNH"), unsafe_allow_html=True)

if stocks:
    sector_rows = []
    for s in stocks:
        ticker = s.get("ticker", "")
        sector = SECTOR_MAP.get(ticker, "Khác")
        mc     = s.get("market_cap_trillion")
        if mc is not None:
            sector_rows.append({"Ngành": sector, "ticker": ticker, "Vốn hóa (T)": float(mc)})

    if sector_rows:
        df_sector = pd.DataFrame(sector_rows)
        df_agg = (
            df_sector.groupby("Ngành", as_index=False)["Vốn hóa (T)"]
            .sum().sort_values("Vốn hóa (T)", ascending=False)
        )
        SECTOR_COLORS = {
            "Ngân hàng": "#2563eb", "Bất động sản": "#16a34a",
            "Tiêu dùng": "#d97706", "Thép": "#7c3aed",
            "Công nghệ": "#0891b2", "Khác": "#6b7280",
        }
        bar_colors = [SECTOR_COLORS.get(n, "#6b7280") for n in df_agg["Ngành"]]
        fig_sector = go.Figure(go.Bar(
            x=df_agg["Ngành"], y=df_agg["Vốn hóa (T)"], marker_color=bar_colors,
            text=[f"{v:,.1f}T" for v in df_agg["Vốn hóa (T)"]], textposition="outside",
            hovertemplate="%{x}<br>Vốn hóa: %{y:,.1f} nghìn tỷ VND<extra></extra>",
        ))
        fig_sector.update_layout(
            title="Vốn hóa thị trường theo ngành (nghìn tỷ VND)",
            xaxis_title="Ngành", yaxis_title="Vốn hóa (nghìn tỷ VND)",
            plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
            height=400,
            margin=dict(l=10, r=10, t=50, b=10),
            showlegend=False,
            font=dict(family="Montserrat, sans-serif", size=11),
        )
        fig_sector.update_yaxes(tickformat=",.0f")
        st.plotly_chart(fig_sector, use_container_width=True)

        with st.expander("Xem chi tiết từng cổ phiếu theo ngành"):
            df_detail = df_sector[["Ngành", "ticker", "Vốn hóa (T)"]].sort_values(
                ["Ngành", "Vốn hóa (T)"], ascending=[True, False]
            ).rename(columns={"ticker": "Mã CK"})
            st.dataframe(df_detail, use_container_width=True, hide_index=True)
    else:
        st.info("Không đủ dữ liệu vốn hóa để vẽ biểu đồ ngành.")
else:
    st.info("Không có dữ liệu cổ phiếu cho phân tích ngành.")

st.divider()
st.caption("KG Stock VN — Dữ liệu từ vnstock (VCI) & Supabase Knowledge Graph. Không phải khuyến nghị đầu tư.")
