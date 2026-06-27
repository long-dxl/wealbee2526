"""
design_system.py
----------------
Design system dùng chung cho toàn bộ ứng dụng.
Import và gọi inject_css() ở đầu mỗi page.
"""

# ============================================================
# COLOR TOKENS
# ============================================================
COLORS = {
    "bg_app":        "#F1F5F9",     # Slate-100 — nền app
    "bg_card":       "#FFFFFF",     # Card surface
    "bg_sidebar":    "#FFFFFF",     # Sidebar
    "bg_input":      "#F8FAFC",     # Input background

    "text_primary":  "#0F172A",     # Slate-900
    "text_secondary":"#475569",     # Slate-600
    "text_muted":    "#94A3B8",     # Slate-400

    "accent":        "#1A56DB",     # Blue-700 — nút primary
    "accent_hover":  "#1C4ED8",
    "accent_light":  "#EFF6FF",     # Blue-50

    "gradient_start":"#0F2B46",     # Navy
    "gradient_end":  "#1A56DB",     # Blue

    "success":       "#059669",     # Emerald-600
    "success_light": "#ECFDF5",
    "danger":        "#DC2626",     # Red-600
    "danger_light":  "#FEF2F2",
    "warning":       "#D97706",     # Amber-600
    "warning_light": "#FFFBEB",

    "border":        "rgba(15, 23, 42, 0.08)",
    "border_strong": "rgba(15, 23, 42, 0.14)",
}

SHADOWS = {
    "sm": "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
    "md": "0 4px 6px rgba(15, 23, 42, 0.04), 0 10px 15px rgba(15, 23, 42, 0.07)",
    "lg": "0 10px 25px rgba(15, 23, 42, 0.08), 0 20px 48px rgba(15, 23, 42, 0.06)",
}

RADIUS = {
    "sm": "8px",
    "md": "12px",
    "lg": "16px",
    "xl": "20px",
}


# ============================================================
# GLOBAL CSS
# ============================================================
def _build_css() -> str:
    c = COLORS
    s = SHADOWS
    r = RADIUS
    return f"""
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');

/* ── Reset & Base ─────────────────────────────────── */
*, *::before, *::after {{
    font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif !important;
    box-sizing: border-box;
}}

html, body, .stApp {{
    background-color: {c['bg_app']} !important;
}}
/* GIỮ CHỖ THANH CUỘN cố định: khi Agent trả lời xong, nội dung dài ra làm xuất hiện
   thanh cuộn dọc → nếu không giữ chỗ, viewport hẹp đi ~15px khiến nút chọn model
   (neo position:fixed theo mép phải viewport) bị LỆCH ngang. scrollbar-gutter:stable
   luôn chừa sẵn rãnh cuộn → bố cục NHẤT QUÁN trước/sau khi trả lời. */
html, .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] {{
    scrollbar-gutter: stable !important;
}}

/* Ẩn phần thừa của Streamlit. LƯU Ý: KHÔNG ẩn cả <header> vì nút MỞ LẠI sidebar
   (stExpandSidebarButton) nằm trong header — ẩn header sẽ không mở lại được sidebar.
   Chỉ ẩn menu/footer/deploy + làm header trong suốt. */
/* KHÔNG ẩn cả stToolbar/header vì nút MỞ LẠI sidebar (stExpandSidebarButton) NẰM TRONG
   stToolbar — ẩn nó sẽ không mở lại được sidebar. Chỉ ẩn các phần thừa cụ thể. */
#MainMenu, footer, .stDeployButton, [data-testid="stAppDeployButton"],
[data-testid="stToolbarActions"], [data-testid="stStatusWidget"],
[data-testid="stDecoration"] {{ display: none !important; }}
/* Header/toolbar trong suốt + cao 0, KHÔNG clip con, KHÔNG chặn click. */
[data-testid="stHeader"], [data-testid="stToolbar"] {{
    background: transparent !important; height: 0 !important; min-height: 0 !important;
    overflow: visible !important; pointer-events: none !important;
}}

/* ── Typography ───────────────────────────────────── */
h1, h2, h3, h4, h5, h6 {{
    color: {c['text_primary']} !important;
    letter-spacing: -0.02em;
}}

p, span, div, label {{
    color: {c['text_primary']};
}}

.stCaption, .stCaption p {{
    color: {c['text_muted']} !important;
    font-size: 11.5px !important;
    font-weight: 500 !important;
    letter-spacing: 0.01em;
}}

/* ── Sidebar ──────────────────────────────────────── */
[data-testid="stSidebar"] {{
    background: {c['bg_sidebar']} !important;
    border-right: 1px solid {c['border']} !important;
}}

[data-testid="stSidebar"] > div:first-child {{
    padding-top: 20px;
    padding-bottom: 24px;
}}

/* Font icon Material của Streamlit không render → các icon nội bộ hiện ra CHỮ.
   Thay bằng glyph gọn cho nút thu gọn « (trong sidebar) và mũi tên expander. */
[data-testid="stSidebarCollapseButton"] [data-testid="stIconMaterial"],
[data-testid="stExpandSidebarButton"] [data-testid="stIconMaterial"],
[data-testid="stExpander"] [data-testid="stIconMaterial"] {{
    font-size: 0 !important;
    width: auto !important;
    display: inline-flex !important;
    align-items: center !important;
}}
[data-testid="stSidebarCollapseButton"] [data-testid="stIconMaterial"]::after {{
    content: "‹"; font-size: 22px; line-height: 1;
    font-family: 'Montserrat', sans-serif !important; color: {c['text_secondary']};
}}
/* Nút MỞ LẠI sidebar khi đang thu gọn — đặt cố định góc trên-trái, hiện rõ, dễ bấm. */
[data-testid="stExpandSidebarButton"] {{
    pointer-events: auto !important;
    position: fixed !important; top: 12px !important; left: 12px !important;
    z-index: 2147483646 !important;
    visibility: visible !important; opacity: 1 !important;
    background: {c['bg_card']} !important;
    border: 1px solid {c['border']} !important;
    border-radius: 11px !important;
    box-shadow: 0 4px 14px rgba(15,23,42,0.12) !important;
}}
[data-testid="stExpandSidebarButton"] [data-testid="stIconMaterial"]::after {{
    content: "›"; font-size: 22px; line-height: 1;
    font-family: 'Montserrat', sans-serif !important; color: {c['text_secondary']};
}}

/* ── Model picker: nút trigger gọn (kiểu "Flash ⌄") ───────────── */
[data-testid="stPopover"] > div > button {{
    border-radius: 999px !important;
    border: 1px solid {c['border_strong']} !important;
    background: {c['bg_card']} !important;
    padding: 5px 14px !important;
    min-height: 0 !important;
    font-size: 13px !important; font-weight: 600 !important;
    color: {c['text_secondary']} !important;
}}
[data-testid="stPopover"] > div > button:hover {{
    border-color: {c['accent']} !important; color: {c['accent']} !important;
}}
/* chevron của trigger: Material font không load → thay bằng glyph ⌄ */
[data-testid="stPopover"] > div > button [data-testid="stIconMaterial"] {{
    font-size: 0 !important; width: auto !important;
}}
[data-testid="stPopover"] > div > button [data-testid="stIconMaterial"]::after {{
    content: "⌄"; font-size: 15px; line-height: 1; position: relative; top: -2px;
    font-family: 'Montserrat', sans-serif !important; color: inherit;
}}
/* ── Menu chọn model trong popover: từng dòng như menu thả xuống ── */
[data-testid="stPopoverBody"] .stButton button {{
    display: flex !important; width: 100% !important;
    text-align: left !important;
    justify-content: flex-start !important;
    white-space: normal !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 9px 10px !important;
    min-height: 0 !important;
    border-radius: 10px !important;
    line-height: 1.35 !important;
    color: {c['text_secondary']} !important;
}}
[data-testid="stPopoverBody"] .stButton {{ width: 100% !important; }}
[data-testid="stPopoverBody"] .stButton button > div,
[data-testid="stPopoverBody"] .stButton button [data-testid="stMarkdownContainer"] {{
    text-align: left !important;
    margin: 0 !important;            /* bỏ margin:auto khiến nội dung bị căn giữa */
    flex: 1 1 auto !important;       /* lấp đầy chiều ngang nút → text căn trái thật sự */
    width: auto !important;
}}
/* dòng 1 = tên model (đậm), dòng 2 = mô tả (mờ, nhỏ) */
[data-testid="stPopoverBody"] .stButton button p {{
    margin: 0 !important; text-align: left !important;
    font-size: 13.5px !important; font-weight: 700 !important;
    color: {c['text_primary']} !important;
}}
[data-testid="stPopoverBody"] .stButton button p:last-child {{
    font-size: 11.5px !important; font-weight: 500 !important;
    color: {c['text_muted']} !important; margin-top: 1px !important;
}}
[data-testid="stPopoverBody"] .stButton button:hover {{
    background: {c['bg_input']} !important;
}}
[data-testid="stExpander"] [data-testid="stIconMaterial"]::after {{
    content: "▾"; font-size: 13px; line-height: 1;
    font-family: 'Montserrat', sans-serif !important; color: {c['text_muted']};
}}

/* Nút trong sidebar gọn hơn (cho danh sách câu hỏi/lịch sử) */
[data-testid="stSidebar"] .stButton button {{
    padding: 7px 12px !important;
    font-size: 12.5px !important;
    min-height: 0 !important;
    text-align: left !important;
    justify-content: flex-start !important;
}}

[data-testid="stSidebarNavItems"] {{
    padding: 0 !important;
}}

/* Sidebar nav links */
[data-testid="stSidebarNavLink"] {{
    border-radius: {r['sm']} !important;
    margin: 2px 8px !important;
    font-weight: 500 !important;
    font-size: 13px !important;
    color: {c['text_secondary']} !important;
    transition: all 0.15s ease !important;
}}

[data-testid="stSidebarNavLink"]:hover {{
    background: {c['accent_light']} !important;
    color: {c['accent']} !important;
}}

[data-testid="stSidebarNavLink"][aria-selected="true"] {{
    background: {c['accent_light']} !important;
    color: {c['accent']} !important;
    font-weight: 600 !important;
}}

/* ── Metric Cards ─────────────────────────────────── */
[data-testid="stMetric"] {{
    background: {c['bg_card']} !important;
    border-radius: {r['md']} !important;
    padding: 18px 20px 16px !important;
    border: 1px solid {c['border']} !important;
    box-shadow: {s['sm']} !important;
    transition: box-shadow 0.15s ease !important;
}}

[data-testid="stMetric"]:hover {{
    box-shadow: {s['md']} !important;
}}

[data-testid="stMetricLabel"] p {{
    font-size: 10.5px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    color: {c['text_muted']} !important;
}}

[data-testid="stMetricValue"] {{
    font-size: 24px !important;
    font-weight: 700 !important;
    color: {c['text_primary']} !important;
    letter-spacing: -0.02em !important;
}}

[data-testid="stMetricDelta"] {{
    font-size: 12px !important;
    font-weight: 600 !important;
}}

/* ── Buttons ──────────────────────────────────────── */
.stButton > button {{
    border-radius: {r['sm']} !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    letter-spacing: 0.01em !important;
    padding: 8px 16px !important;
    transition: all 0.15s ease !important;
    border: none !important;
}}

.stButton > button[kind="primary"],
.stButton > button[data-testid="baseButton-primary"] {{
    background: linear-gradient(135deg, {c['gradient_start']} 0%, {c['gradient_end']} 100%) !important;
    color: #FFFFFF !important;
    box-shadow: 0 2px 8px rgba(26, 86, 219, 0.28) !important;
}}

.stButton > button[kind="primary"]:hover,
.stButton > button[data-testid="baseButton-primary"]:hover {{
    box-shadow: 0 4px 14px rgba(26, 86, 219, 0.38) !important;
    transform: translateY(-1px) !important;
}}

.stButton > button[kind="secondary"],
.stButton > button[data-testid="baseButton-secondary"] {{
    background: {c['bg_card']} !important;
    color: {c['text_primary']} !important;
    border: 1px solid {c['border']} !important;
    box-shadow: {s['sm']} !important;
}}

.stButton > button[kind="secondary"]:hover {{
    border-color: {c['accent']} !important;
    color: {c['accent']} !important;
}}

/* ── Inputs ───────────────────────────────────────── */
.stTextInput input,
.stNumberInput input,
[data-testid="stNumberInput"] input {{
    border-radius: {r['sm']} !important;
    border: 1px solid {c['border']} !important;
    background: {c['bg_input']} !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    padding: 8px 12px !important;
    color: {c['text_primary']} !important;
    transition: border-color 0.15s ease !important;
}}

.stTextInput input:focus,
.stNumberInput input:focus {{
    border-color: {c['accent']} !important;
    box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.12) !important;
    outline: none !important;
}}

.stSelectbox [data-baseweb="select"] > div {{
    border-radius: {r['sm']} !important;
    border: 1px solid {c['border']} !important;
    background: {c['bg_input']} !important;
    font-size: 13px !important;
}}

/* ── Chat Messages ────────────────────────────────── */
.stChatMessage {{
    border-radius: {r['lg']} !important;
    border: 1px solid {c['border']} !important;
    box-shadow: {s['sm']} !important;
    background: {c['bg_card']} !important;
    padding: 16px 20px !important;
    margin-bottom: 10px !important;
}}

/* User message */
.stChatMessage[data-testid="user-message"] {{
    background: linear-gradient(135deg, {c['gradient_start']}08 0%, {c['gradient_end']}0D 100%) !important;
    border-color: {c['accent']}22 !important;
}}

.stChatMessage p, .stChatMessage li {{
    font-size: 15.5px !important;
    line-height: 1.7 !important;
    color: {c['text_primary']} !important;
}}
.stChatMessage [data-testid="stMarkdownContainer"] {{
    font-size: 15.5px !important;
}}

/* ── Expanders ────────────────────────────────────── */
[data-testid="stExpander"] {{
    border-radius: {r['md']} !important;
    border: 1px solid {c['border']} !important;
    background: {c['bg_card']} !important;
    box-shadow: {s['sm']} !important;
    overflow: hidden !important;
}}

[data-testid="stExpander"] summary {{
    font-weight: 600 !important;
    font-size: 13px !important;
    color: {c['text_secondary']} !important;
    padding: 14px 18px !important;
    background: {c['bg_app']} !important;
    letter-spacing: 0.01em !important;
}}

[data-testid="stExpander"] summary:hover {{
    color: {c['accent']} !important;
}}

/* ── Status / Spinner ─────────────────────────────── */
[data-testid="stStatusWidget"] {{
    border-radius: {r['md']} !important;
    border: 1px solid {c['border']} !important;
    background: {c['bg_card']} !important;
    box-shadow: {s['sm']} !important;
    font-size: 13px !important;
}}

/* ── Divider ──────────────────────────────────────── */
hr {{
    border: none !important;
    border-top: 1px solid {c['border']} !important;
    margin: 20px 0 !important;
}}

/* ── Dataframe / Table ────────────────────────────── */
[data-testid="stDataFrame"] {{
    border-radius: {r['md']} !important;
    overflow: hidden !important;
    border: 1px solid {c['border']} !important;
    box-shadow: {s['sm']} !important;
}}

/* ── Tabs ─────────────────────────────────────────── */
[data-testid="stTabs"] [data-baseweb="tab-list"] {{
    background: {c['bg_card']} !important;
    border-radius: {r['md']} !important;
    padding: 6px !important;
    gap: 4px !important;
    border: 1px solid {c['border']} !important;
    box-shadow: {s['sm']} !important;
}}

[data-testid="stTabs"] [data-baseweb="tab"] {{
    border-radius: {r['sm']} !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    color: {c['text_secondary']} !important;
    padding: 8px 16px !important;
    transition: all 0.15s ease !important;
}}

[data-testid="stTabs"] [data-baseweb="tab"][aria-selected="true"] {{
    background: linear-gradient(135deg, {c['gradient_start']} 0%, {c['gradient_end']} 100%) !important;
    color: #FFFFFF !important;
    box-shadow: 0 2px 8px rgba(26, 86, 219, 0.24) !important;
}}

/* ── Progress / Spinner ───────────────────────────── */
.stSpinner > div {{
    border-top-color: {c['accent']} !important;
}}

/* ── Toast ────────────────────────────────────────── */
[data-testid="stToast"] {{
    border-radius: {r['md']} !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    border: 1px solid {c['border']} !important;
    box-shadow: {s['md']} !important;
}}

/* ── Section label style (dùng qua st.markdown) ───── */
.section-label {{
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: {c['text_muted']};
    margin: 20px 0 8px 2px;
    display: block;
}}

/* ── Stat pill ────────────────────────────────────── */
.stat-pill {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: {c['bg_app']};
    border: 1px solid {c['border']};
    border-radius: 100px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    color: {c['text_secondary']};
}}

/* ── Badge ────────────────────────────────────────── */
.badge-buy  {{ background:#ECFDF5; color:#059669; font-size:11px; font-weight:700; padding:2px 8px; border-radius:100px; display:inline-block; }}
.badge-sell {{ background:#FEF2F2; color:#DC2626; font-size:11px; font-weight:700; padding:2px 8px; border-radius:100px; display:inline-block; }}
.badge-hold {{ background:#FFFBEB; color:#D97706; font-size:11px; font-weight:700; padding:2px 8px; border-radius:100px; display:inline-block; }}

/* ── Gradient card header ─────────────────────────── */
.card-gradient-header {{
    background: linear-gradient(135deg, {c['gradient_start']} 0%, {c['gradient_end']} 100%);
    border-radius: {r['md']} {r['md']} 0 0;
    padding: 20px 24px;
    color: white;
}}

/* ── Scrollbar ────────────────────────────────────── */
::-webkit-scrollbar {{ width: 5px; height: 5px; }}
::-webkit-scrollbar-track {{ background: transparent; }}
::-webkit-scrollbar-thumb {{ background: {c['border_strong']}; border-radius: 3px; }}
::-webkit-scrollbar-thumb:hover {{ background: {c['text_muted']}; }}

/* ── Radio buttons ────────────────────────────────── */
[data-testid="stRadio"] label {{
    font-size: 13px !important;
    font-weight: 500 !important;
    color: {c['text_secondary']} !important;
}}

/* ── Multiselect ──────────────────────────────────── */
[data-baseweb="tag"] {{
    background: {c['accent_light']} !important;
    border-radius: 100px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: {c['accent']} !important;
    border: 1px solid {c['accent']}22 !important;
}}

/* ── Number input arrows ──────────────────────────── */
[data-testid="stNumberInput"] button {{
    border-radius: 6px !important;
    background: {c['bg_app']} !important;
    border: 1px solid {c['border']} !important;
}}

/* ══ Chat composer 2 VÙNG — THUẦN CSS, KHÔNG move DOM (bền qua mọi rerun) ══
   Outer = thẻ bao bo góc. Nền GRADIENT 2 tông: trắng phần trên + dải xám đáy
   (≈54px) làm "thanh hành động". Nút gửi absolute + pill model fixed nằm trong
   dải xám đó. Không tạo div bar, không chuyển node → React không bao giờ crash. */
[data-testid="stChatInput"] {{
    position: relative !important;
    border: 1.5px solid {c['border_strong']} !important;
    border-radius: 16px !important;
    overflow: hidden !important;
    background:
        linear-gradient(to bottom,
            {c['bg_card']} 0, {c['bg_card']} calc(100% - 54px),
            {c['border']} calc(100% - 54px), {c['border']} calc(100% - 53px),
            {c['bg_app']} calc(100% - 53px), {c['bg_app']} 100%) !important;
}}
[data-testid="stChatInput"]:focus-within {{
    border-color: {c['accent']} !important;
    box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.10) !important;
}}
/* textarea + wrapper trong suốt (để gradient nền lộ ra), chừa DẢI ĐÁY 54px */
[data-testid="stChatInput"] [data-baseweb="textarea"],
[data-testid="stChatInput"] [data-baseweb="base-input"] {{
    background: transparent !important;
    border: none !important; box-shadow: none !important; border-radius: 0 !important;
}}
[data-testid="stChatInputTextArea"] {{
    border: none !important; border-radius: 0 !important;
    background: transparent !important;
    font-size: 16px !important;
    line-height: 1.55 !important;
    font-weight: 400 !important;
    padding: 16px 18px 62px 18px !important;   /* chừa 54px dải xám + đệm */
}}
[data-testid="stChatInputTextArea"]:focus {{ box-shadow: none !important; }}

/* nút gửi: HÌNH TRÒN xanh — GIỮ NGUYÊN vị trí native (KHÔNG move → không nhân đôi),
   CSS absolute đặt vào góc phải DẢI XÁM. */
[data-testid="stChatInput"] button[data-testid="stChatInputSubmitButton"] {{
    position: absolute !important;
    right: 12px !important; bottom: 9px !important; z-index: 3 !important;
    width: 36px !important; height: 36px !important;
    border-radius: 50% !important;
    background: {c['accent']} !important;
    border: none !important;
    box-shadow: 0 1px 4px rgba(26,86,219,0.30) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
}}
[data-testid="stChatInput"] button[data-testid="stChatInputSubmitButton"]:hover {{
    background: {c['accent_hover']} !important;
}}
[data-testid="stChatInput"] button[data-testid="stChatInputSubmitButton"] svg,
[data-testid="stChatInput"] button[data-testid="stChatInputSubmitButton"] [data-testid="stIconMaterial"] {{
    color: #FFFFFF !important; fill: #FFFFFF !important;
}}

/* ── Model picker: position:FIXED neo góc phải-dưới composer (KHÔNG move node).
   Composer ghim đáy viewport (layout wide → mép phải sát viewport) nên neo theo
   right/bottom ổn định. Thu gọn container gốc ở luồng main để không để lại khoảng trống. */
[data-testid="stElementContainer"]:has(> [data-testid="stPopover"]) {{
    height: 0 !important; min-height: 0 !important;
    margin: 0 !important; padding: 0 !important; overflow: visible !important;
}}
[data-testid="stPopover"] {{
    position: fixed !important;
    right: 169px !important; bottom: 67px !important;   /* trong DẢI XÁM, trái nút gửi */
    z-index: 1000 !important; width: auto !important; margin: 0 !important;
}}
[data-testid="stPopover"] > div > button {{
    padding: 4px 12px !important; font-size: 12.5px !important;
    box-shadow: 0 1px 4px rgba(15,23,42,0.08) !important;
}}
"""


def inject_css() -> None:
    """Inject toàn bộ design system CSS vào trang hiện tại."""
    import streamlit as st
    st.markdown(f"<style>{_build_css()}</style>", unsafe_allow_html=True)


def sidebar_toggle_button() -> None:
    """
    No-op (giữ cho tương thích import). Trước đây dùng nút JS tùy biến vì header bị ẩn;
    nay header được giữ lại (trong suốt) nên nút mở/thu sidebar NATIVE của Streamlit
    (stExpandSidebarButton / stSidebarCollapseButton) hoạt động bình thường và đã được
    style trong inject_css(). Không cần JS nữa.
    """
    return None


# ============================================================
# HTML COMPONENTS
# ============================================================

# ============================================================
# ICON SYSTEM — SVG line icons (phong cách Lucide, đơn sắc, 24x24)
# Dùng cho HTML tự render. Với widget Streamlit (button/page_link/info)
# dùng shortcode Material ":material/<name>:" trực tiếp.
# ============================================================
_ICON_PATHS = {
    # Tính năng & hành động
    "search":      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "newspaper":   '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
    "network":     '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    # Vĩ mô / dòng dữ liệu
    "exchange":    '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    "bank":        '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    "bar_chart":   '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    "trending_up": '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    "trending_down":'<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    # Trạng thái / điều hướng
    "arrow_right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "shield_check":'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "alert":       '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    "info":        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "sparkles":    '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/>',
    "database":    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    "activity":    '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    # user: đầu + vai, KHÔNG có nét mặt (tối giản, không phải "mặt")
    "user":        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    # Phase icons cho Agent Activity Timeline
    "target":      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    "list":        '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    "document":    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    "scale":       '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    "check":       '<polyline points="20 6 9 17 4 12"/>',
}


def avatar_data_uri(icon_name: str, color: str, bg: str) -> str:
    """
    Trả về data-URI ảnh SVG dùng làm avatar chat tối giản:
    một vòng tròn nền + icon line ở giữa (không dùng emoji/mặt mặc định).
    """
    import urllib.parse
    paths = _ICON_PATHS.get(icon_name, "")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">'
        f'<circle cx="12" cy="12" r="12" fill="{bg}"/>'
        '<g transform="translate(4.8,4.8) scale(0.6)" fill="none" '
        f'stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
        f'{paths}</g></svg>'
    )
    return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)


def _svg_data_uri(name: str, color: str, stroke: float) -> str:
    """Dựng SVG icon line → data-URI (để nhúng vào <img>)."""
    import urllib.parse
    paths = _ICON_PATHS.get(name, "")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        f'stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" '
        f'stroke-linejoin="round">{paths}</svg>'
    )
    return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)


def icon(name: str, size: int = 18, color: str = "", stroke: float = 2) -> str:
    """
    Trả về thẻ <img> data-URI cho 1 icon line (KHÔNG dùng <svg> inline vì Streamlit
    markdown escape nó thành chữ). <img> data-URI luôn render đúng thành hình.
    color: mã màu cụ thể (mặc định text_primary) — currentColor không dùng được trong <img>.
    """
    color = color or COLORS["text_primary"]
    uri = _svg_data_uri(name, color, stroke)
    return (
        f'<img src="{uri}" width="{size}" height="{size}" alt="" '
        f'style="display:inline-block;vertical-align:middle"/>'
    )


def section_label(text: str) -> str:
    """HTML cho section label kiểu Apple (uppercase, spaced)."""
    return f'<span class="section-label">{text}</span>'


def badge(text: str, variant: str = "buy") -> str:
    """HTML cho badge nhỏ: variant = buy | sell | hold."""
    _v = variant.lower()
    if "buy" in text.lower():
        cls = "badge-buy"
    elif "sell" in text.lower():
        cls = "badge-sell"
    else:
        cls = "badge-hold"
    return f'<span class="{cls}">{text}</span>'


def stat_card_html(label: str, value: str, sub: str = "", color: str = "") -> str:
    """HTML card dạng stat với gradient accent line."""
    c = COLORS
    accent_line = f"background: linear-gradient(135deg, {c['gradient_start']} 0%, {c['gradient_end']} 100%);"
    sub_html = f'<div style="font-size:11px;font-weight:500;color:{c["text_muted"]};margin-top:4px">{sub}</div>' if sub else ""
    val_color = color if color else c["text_primary"]
    return f"""
<div style="
    background:{c['bg_card']};
    border-radius:{RADIUS['md']};
    padding:18px 20px 16px;
    border:1px solid {c['border']};
    box-shadow:{SHADOWS['sm']};
    position:relative;
    overflow:hidden;
">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;{accent_line}"></div>
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:{c['text_muted']};margin-bottom:8px">{label}</div>
    <div style="font-size:24px;font-weight:700;letter-spacing:-0.02em;color:{val_color};line-height:1.1">{value}</div>
    {sub_html}
</div>"""


def page_header(title: str, subtitle: str = "") -> str:
    """HTML header cho mỗi trang."""
    c = COLORS
    sub_html = f'<p style="margin:6px 0 0;font-size:13px;font-weight:500;color:{c["text_muted"]}">{subtitle}</p>' if subtitle else ""
    return f"""
<div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid {c['border']}">
    <h1 style="margin:0;font-size:26px;font-weight:800;color:{c['text_primary']};letter-spacing:-0.03em">{title}</h1>
    {sub_html}
</div>"""


def feature_card_header(icon_name: str, eyebrow: str, title: str, desc: str,
                        accent: str = "") -> str:
    """
    HTML phần đầu của thẻ giới thiệu tính năng (đặt trong st.container(border=True)).
    icon_name: tên icon SVG · eyebrow: nhãn nhỏ · title: tên tính năng · desc: mô tả.
    """
    c = COLORS
    accent = accent or c["accent"]
    icon_svg = icon(icon_name, size=22, color=accent, stroke=2)
    return f"""
<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:6px">
    <div style="flex:0 0 auto;width:44px;height:44px;border-radius:{RADIUS['md']};
                display:flex;align-items:center;justify-content:center;
                background:linear-gradient(135deg,{accent}14,{accent}28);
                border:1px solid {accent}33">{icon_svg}</div>
    <div style="flex:1">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.08em;color:{accent};margin-bottom:2px">{eyebrow}</div>
        <div style="font-size:17px;font-weight:800;letter-spacing:-0.02em;
                    color:{c['text_primary']};line-height:1.25">{title}</div>
    </div>
</div>
<div style="font-size:13px;line-height:1.6;color:{c['text_secondary']};margin-bottom:14px">{desc}</div>"""


def step_strip(steps: list[tuple[str, str]]) -> str:
    """
    HTML dải "cách hoạt động": list (tiêu đề, mô tả). Hiển thị số thứ tự + mũi tên nối.
    """
    c = COLORS
    items = []
    for i, (title, desc) in enumerate(steps):
        arrow = (f'<div style="padding:0 4px;align-self:center">'
                 f'{icon("arrow_right", size=18, color=c["text_muted"])}</div>') if i > 0 else ""
        items.append(arrow + f"""
<div style="flex:1;min-width:150px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="width:22px;height:22px;border-radius:50%;background:{c['accent']};
                    color:#fff;font-size:12px;font-weight:700;display:flex;
                    align-items:center;justify-content:center">{i+1}</div>
        <div style="font-size:13px;font-weight:700;color:{c['text_primary']}">{title}</div>
    </div>
    <div style="font-size:12px;line-height:1.55;color:{c['text_muted']};padding-left:30px">{desc}</div>
</div>""")
    return (f'<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;'
            f'background:{c["bg_card"]};border:1px solid {c["border"]};'
            f'border-radius:{RADIUS["md"]};padding:18px 20px;box-shadow:{SHADOWS["sm"]}">'
            + "".join(items) + "</div>")


def trust_chips(items: list[str]) -> str:
    """HTML hàng chip 'tin cậy' nhỏ (vd: Dữ liệu thật · Trích nguồn · Không khuyến nghị)."""
    c = COLORS
    _check = icon("shield_check", size=13, color=c["success"], stroke=2.2)
    chips = "".join(
        f'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;'
        f'font-weight:600;color:{c["success"]};background:{c["success_light"]};'
        f'border:1px solid {c["success"]}22;border-radius:999px;padding:4px 11px">'
        f'{_check}{t}</span>'
        for t in items
    )
    return f'<div style="display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 4px">{chips}</div>'


# Nội dung disclaimer chuẩn (dùng lại ở mọi trang) — yêu cầu pháp lý sản phẩm tài chính
DISCLAIMER_TEXT = (
    "Thông tin được tổng hợp tự động từ Knowledge Graph và các nguồn dữ liệu công khai "
    "(Vietstock, vnstock/VCI, SBV…), chỉ mang tính tham khảo, KHÔNG phải khuyến nghị "
    "mua/bán hay tư vấn đầu tư. Nhà đầu tư tự chịu trách nhiệm với quyết định của mình."
)


def agent_activity_timeline(activities: list, running_idx: int = -1) -> str:
    """
    HTML cho Agent Activity Timeline (Layer 2) — đã DỊCH & GOM theo phase.
    activities: list dict {key, icon, label, detail, count} (từ tool_translations).
    running_idx: -1 nghĩa là đã hoàn tất (mọi dòng ✓); >=0 thì dòng đó đang chạy (⟳).
    Không lộ tên hàm/tham số — chỉ ngôn ngữ nghiệp vụ.
    """
    c = COLORS
    rows = []
    for i, a in enumerate(activities):
        is_running = (i == running_idx)
        is_done    = (running_idx < 0) or (i < running_idx)
        # marker: ✓ xanh khi xong, vòng quay accent khi đang chạy, chấm mờ khi chờ
        if is_running:
            marker = (f'<span style="display:inline-block;width:14px;height:14px;'
                      f'border:2px solid {c["accent"]};border-top-color:transparent;'
                      f'border-radius:50%;animation:kgspin .9s linear infinite"></span>')
            lbl_color = c["text_primary"]
        elif is_done:
            marker = icon("check", size=14, color=c["success"], stroke=3)
            lbl_color = c["text_primary"]
        else:
            marker = (f'<span style="display:inline-block;width:8px;height:8px;'
                      f'border-radius:50%;background:{c["text_muted"]};opacity:.45;'
                      f'margin:3px"></span>')
            lbl_color = c["text_muted"]
        ph_icon = icon(a["icon"], size=15,
                       color=c["accent"] if (is_running or is_done) else c["text_muted"])
        detail = (f'<div style="font-size:12px;color:{c["text_muted"]};margin-top:1px">'
                  f'{a["detail"]}</div>') if a.get("detail") else ""
        is_last = (i == len(activities) - 1)
        rail_line = ("" if is_last else
                     f'<div style="position:absolute;left:6px;top:18px;bottom:-10px;'
                     f'width:2px;background:{c["border"]}"></div>')
        rows.append(f"""
<div style="position:relative;display:flex;gap:12px;padding-bottom:{0 if is_last else 12}px">
  <div style="position:relative;flex:0 0 14px;display:flex;justify-content:center;
              align-items:flex-start;padding-top:2px">{marker}{rail_line}</div>
  <div style="flex:1 1 auto;min-width:0">
    <div style="display:flex;align-items:center;gap:7px">
      {ph_icon}
      <span style="font-size:13.5px;font-weight:600;color:{lbl_color}">{a["label"]}</span>
    </div>
    {detail}
  </div>
</div>""")
    return (f'<div style="padding:4px 2px">{"".join(rows)}</div>'
            '<style>@keyframes kgspin{to{transform:rotate(360deg)}}</style>')


def sources_panel(sources: list) -> str:
    """
    HTML SourcesPanel (Layer 2) — nguồn THẬT đã đánh số [1][2]… để trích dẫn.
    sources: list {title, link, date, source} từ tool_translations.extract_sources().
    """
    if not sources:
        return ""
    c = COLORS
    rows = []
    for i, s in enumerate(sources, 1):
        title = s.get("title", "")
        if len(title) > 110:
            title = title[:110].rstrip() + "…"
        link = s.get("link", "")
        date = f' · {s["date"]}' if s.get("date") else ""
        src  = s.get("source", "")
        title_html = (f'<a href="{link}" target="_blank" '
                      f'style="color:{c["text_primary"]};text-decoration:none;font-weight:600">'
                      f'{title} <span style="color:{c["accent"]};font-size:11px">↗</span></a>'
                      if link else
                      f'<span style="color:{c["text_primary"]};font-weight:600">{title}</span>')
        rows.append(f"""
<div style="display:flex;gap:9px;padding:7px 0;border-top:1px solid {c['border']}">
  <span style="flex:0 0 22px;height:20px;display:inline-flex;align-items:center;
               justify-content:center;font-size:11px;font-weight:700;color:{c['accent']};
               background:{c['accent_light']};border-radius:6px">{i}</span>
  <div style="flex:1 1 auto;min-width:0;font-size:13px;line-height:1.45">
    {title_html}
    <div style="font-size:11.5px;color:{c['text_muted']};margin-top:1px">{src}{date}</div>
  </div>
</div>""")
    _ic = icon("document", size=14, color=c["accent"])
    return (f'<div style="margin-top:12px">'
            f'<div style="display:flex;align-items:center;gap:7px;font-size:11px;'
            f'font-weight:700;letter-spacing:.06em;text-transform:uppercase;'
            f'color:{c["text_muted"]};margin-bottom:2px">{_ic}Nguồn dẫn chứng</div>'
            f'{"".join(rows)}</div>')


def soft_error_notes(notes: list) -> str:
    """HTML các dòng amber nhẹ cho lỗi KHÔNG chặn (1 nguồn rỗng/gián đoạn)."""
    if not notes:
        return ""
    c = COLORS
    _ic = icon("alert", size=13, color=c["warning"], stroke=2)
    rows = "".join(
        f'<div style="display:flex;align-items:flex-start;gap:7px;font-size:12.5px;'
        f'line-height:1.5;color:{c["warning"]};margin-top:6px">{_ic}'
        f'<span style="color:{c["text_secondary"]}">{n}</span></div>'
        for n in notes
    )
    return (f'<div style="margin-top:10px;padding:8px 10px;border-radius:8px;'
            f'background:{c["warning_light"]};border:1px solid {c["warning"]}22">{rows}</div>')


def evidence_strip(sources: list, activity_count: int, step_count: int,
                   reuse: int = 0) -> str:
    """HTML 1 dòng Layer 1: số nguồn + danh sách nguồn (+ ♻ tái sử dụng nếu có)."""
    c = COLORS
    _doc = icon("document", size=13, color=c["accent"])
    src_txt = " · ".join(sources[:5]) if sources else "dữ liệu nội bộ"
    reuse_html = (
        f'&nbsp;·&nbsp;<span style="color:{c["success"]};font-weight:600" '
        f'title="Dữ liệu lấy từ câu trước trong phiên — không truy vấn lại">'
        f'♻ {reuse} tái sử dụng</span>' if reuse else "")
    return f"""
<div style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;
            background:{c['bg_input']};border:1px solid {c['border']};border-radius:999px;
            font-size:12.5px;color:{c['text_secondary']}">
  {_doc}<span><b style="color:{c['text_primary']}">{len(sources) or '—'} nguồn</b>
  &nbsp;·&nbsp;{src_txt}{reuse_html}</span>
</div>"""


def disclaimer_footer() -> str:
    """HTML khối disclaimer đặt cuối trang."""
    c = COLORS
    _alert = icon("alert", size=13, color=c["text_muted"], stroke=2)
    return f"""
<div style="margin-top:36px;padding:14px 16px;border-top:1px solid {c['border']};
            background:{c.get('bg_subtle', '#F8FAFC')};border-radius:8px">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;
                color:{c['text_muted']};text-transform:uppercase;letter-spacing:0.06em;
                margin-bottom:4px">{_alert}Miễn trừ trách nhiệm</div>
    <div style="font-size:12px;line-height:1.6;color:{c['text_muted']}">{DISCLAIMER_TEXT}</div>
</div>"""
