"""
app.py
------
Giao diện Streamlit cho AI Agent phân tích cổ phiếu Việt Nam.

Chạy: streamlit run app.py
"""

import time
import threading
import streamlit as st
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

from core.agent_config import (
    GEMINI_MODELS,
    GEMINI_MODEL_OPTIONS,
    GEMINI_DEFAULT_IDX,
    get_system_instruction,
    get_lean_instruction,
    sanitize_citations,
    ensure_disclaimer,
    get_supabase,
    query_graph_database   as _qgd,
    get_market_price       as _gmp,
    compare_stocks         as _cs,
    get_market_overview    as _gmo,
    get_stock_news_timeline as _gnt,
    fetch_fresh_news       as _ffn,
    get_stock_news          as _gsn,
    query_news              as _qn,
    query_events            as _qe,
    web_search             as _ws,
    read_article           as _ra,
    query_sector_impact         as _qsi,
    query_macro_propagation     as _qmp,
    query_stock_sector_context  as _qssc,
    get_financial_statements    as _gfs,
    get_commodity_prices        as _gcp,
    get_vn_domestic_price       as _gvn,
    get_sector_value_chain      as _gsvc,
)
from design_system import (
    inject_css, section_label, COLORS,
    feature_card_header, step_strip, trust_chips, avatar_data_uri,
    sidebar_toggle_button, agent_activity_timeline, evidence_strip, soft_error_notes,
    sources_panel,
)
import core.tool_translations as _tt
import core.agent_errors as _err
import functools

# ============================================================
# SESSION TOOL CACHE — tái sử dụng dữ liệu đã thu thập TRONG PHIÊN để
# KHÔNG fetch/search lại (tiết kiệm token, chi phí API, độ trễ).
#   • key = (tên tool + args đã chuẩn hoá); lưu trong st.session_state → bền qua các lượt.
#   • TTL theo độ "tươi" của dữ liệu; KHÔNG cache lỗi tạm thời (cho phép thử lại).
# ============================================================
_CACHE_TTL = {                       # giây
    "get_market_price": 600, "get_market_overview": 600,
    "get_commodity_prices": 1800, "get_vn_domestic_price": 1800,
    "web_search": 1800,
}
_CACHE_TTL_DEFAULT = 6 * 3600        # BCTC / tin / KG / sự kiện: ~ cả phiên


def _cache_norm(v):
    if isinstance(v, str):            return v.strip().lower()
    if isinstance(v, (list, tuple)):  return tuple(sorted(_cache_norm(x) for x in v))
    if isinstance(v, dict):           return tuple(sorted((k, _cache_norm(x)) for k, x in v.items()))
    return v


def _cache_key(name, args, kwargs):
    return name + "|" + repr((tuple(_cache_norm(a) for a in args),
                              tuple(sorted((k, _cache_norm(x)) for k, x in kwargs.items()))))


def _cacheable(v):
    """KHÔNG cache lỗi tạm thời (để lượt sau còn thử lại); cache kết quả OK & rỗng tất định."""
    if isinstance(v, dict):
        s = str(v.get("status", "")).upper()
        if s in {"DB_ERROR", "ERROR", "SEARCH_LIMIT", "TIMEOUT"}:
            return False
    return True


def _cache_wrap(name, fn):
    """Bọc 1 tool: cùng (tool,args) trong phiên → trả cache, bỏ qua fetch ngoài."""
    @functools.wraps(fn)
    def w(*a, **k):
        try:
            cache = st.session_state.setdefault("tool_cache", {})
        except Exception:
            return fn(*a, **k)        # ngoài ngữ cảnh session → không cache
        key = _cache_key(name, a, k)
        ttl = _CACHE_TTL.get(name, _CACHE_TTL_DEFAULT)
        ent = cache.get(key)
        if ent and (time.time() - ent["t"]) < ttl:
            st.session_state["cache_hits"] = st.session_state.get("cache_hits", 0) + 1
            return ent["v"]           # ♻ TÁI SỬ DỤNG — không fetch lại
        v = fn(*a, **k)
        if _cacheable(v):
            cache[key] = {"t": time.time(), "v": v}
        return v
    return w


# Bọc TẤT CẢ underlying tool (wrapper bên dưới tra global ở runtime → tự dùng bản đã bọc)
_qgd  = _cache_wrap("query_graph_database", _qgd)
_gmp  = _cache_wrap("get_market_price", _gmp)
_cs   = _cache_wrap("compare_stocks", _cs)
_gmo  = _cache_wrap("get_market_overview", _gmo)
_gnt  = _cache_wrap("get_stock_news_timeline", _gnt)
_ffn  = _cache_wrap("fetch_fresh_news", _ffn)
_gsn  = _cache_wrap("get_stock_news", _gsn)
_qn   = _cache_wrap("query_news", _qn)
_qe   = _cache_wrap("query_events", _qe)
_ws   = _cache_wrap("web_search", _ws)
_ra   = _cache_wrap("read_article", _ra)
_qsi  = _cache_wrap("query_sector_impact", _qsi)
_qmp  = _cache_wrap("query_macro_propagation", _qmp)
_qssc = _cache_wrap("query_stock_sector_context", _qssc)
_gfs  = _cache_wrap("get_financial_statements", _gfs)
_gcp  = _cache_wrap("get_commodity_prices", _gcp)
_gvn  = _cache_wrap("get_vn_domestic_price", _gvn)
_gsvc = _cache_wrap("get_sector_value_chain", _gsvc)

# Avatar chat tối giản (SVG line, không mặt/robot)
USER_AVATAR      = avatar_data_uri("user",     COLORS["text_secondary"], COLORS["bg_input"])
ASSISTANT_AVATAR = avatar_data_uri("activity", COLORS["accent"],         COLORS["accent_light"])

load_dotenv(Path(__file__).parent / ".env")

# ============================================================
# PAGE CONFIG
# ============================================================
st.set_page_config(
    page_title="Stock Intelligence — AI Agent",
    page_icon="chart_with_upwards_trend",
    layout="wide",
    initial_sidebar_state="expanded",
)
inject_css()
sidebar_toggle_button()
# UI TỐI GIẢN: ẩn page-nav đa trang mặc định của Streamlit (News/Dashboard/KG Explorer…) ở sidebar.
# Các trang vẫn truy cập được qua URL; sidebar chỉ còn: Trò chuyện mới + Lịch sử.
st.markdown("<style>[data-testid='stSidebarNav']{display:none}</style>", unsafe_allow_html=True)

# ============================================================
# HẰNG SỐ
# ============================================================
TICKER_INFO = {
    "HPG": ("Hòa Phát Group",      "Thép"),
    "VHM": ("Vinhomes",             "Bất động sản"),
    "VIC": ("Vingroup",             "Bất động sản"),
    "VCB": ("Vietcombank",          "Ngân hàng"),
    "TCB": ("Techcombank",          "Ngân hàng"),
    "BID": ("BIDV",                 "Ngân hàng"),
    "MSN": ("Masan Group",          "Tiêu dùng"),
    "VNM": ("Vinamilk",             "Tiêu dùng"),
    "MWG": ("Thế Giới Di Động",     "Bán lẻ"),
    "FPT": ("FPT Corp",             "Công nghệ"),
}

NODE_COLORS = {
    "STOCK":          "#AED6F1",
    "MACRO":          "#FAD7A0",
    "NEWS":           "#A9DFBF",
    "SECTOR":         "#D7BDE2",
    "COMPANY_FACTOR": "#FDFEFE",
}

EDGE_COLORS = {
    "AFFECTS_NEGATIVE": "#E74C3C",
    "AFFECTS_POSITIVE": "#27AE60",
    "INPUT_COST_OF":    "#E67E22",
    "SUPPLIES_TO":      "#2980B9",
    "BELONGS_TO_SECTOR":"#95A5A6",
    "MENTIONS":         "#8E44AD",
    "CORRELATES_WITH":  "#16A085",
}

# ============================================================
# GEMINI CLIENT (cache)
# ============================================================
@st.cache_resource
def _init_gemini():
    import os
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

_gemini = _init_gemini()


# ============================================================
# TOOL WRAPPERS
# ============================================================
def query_graph_database(ticker: str) -> dict:
    """
    Truy vấn Knowledge Graph trên Supabase để lấy mạng lưới quan hệ 2-hop.
    Trả về nodes, edges và summary để phân tích đầu tư.

    Args:
        ticker: Mã cổ phiếu (HPG, VCB, FPT, VHM, VIC, TCB, BID, MSN, VNM, MWG).
    """
    result = _qgd(ticker)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "query_graph_database", "ticker": ticker.upper(), "result": result
        })
    return result


def get_market_price(ticker: str) -> dict:
    """
    Lấy giá thị trường real-time, khối lượng và biến động giá 30 ngày từ vnstock.

    Args:
        ticker: Mã cổ phiếu (HPG, VCB, FPT ...).
    """
    result = _gmp(ticker)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_market_price", "ticker": ticker.upper(), "result": result
        })
    return result


def compare_stocks(tickers: list[str]) -> dict:
    """
    So sánh đồng thời nhiều cổ phiếu: giá, P/E, doanh thu, lợi nhuận, rating.

    Args:
        tickers: Danh sách mã cổ phiếu cần so sánh. Ví dụ: ["VCB", "TCB", "BID"]
    """
    result = _cs(tickers)
    if "tool_tracker" in st.session_state:
        t_list = tickers if isinstance(tickers, list) else [tickers]
        st.session_state.tool_tracker.append({
            "tool": "compare_stocks", "tickers": t_list, "result": result
        })
    return result


def get_market_overview() -> dict:
    """
    Lấy tổng quan thị trường: tỷ giá USD/VND, lãi suất, bảng giá Top 10 cổ phiếu.
    """
    result = _gmo()
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_market_overview", "result": result
        })
    return result


def get_stock_news_timeline(ticker: str, days_back: int = 90) -> dict:
    """
    Lấy dòng thời gian sự kiện/tin tức gần đây của 1 cổ phiếu từ Temporal KG,
    kèm source_url + evidence_quote để trích dẫn nguồn.

    Args:
        ticker:    Mã cổ phiếu (HPG, VCB, FPT ...).
        days_back: Số ngày nhìn lại (mặc định 90).
    """
    result = _gnt(ticker, days_back)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_stock_news_timeline", "ticker": ticker.upper(), "result": result
        })
    return result


def fetch_fresh_news(ticker: str, days_back: int = 14) -> dict:
    """
    Crawl trực tiếp Vietstock theo cửa sổ thời gian (tối đa 30 ngày), trích xuất + lưu
    KG, trả tin mới kèm nguồn. Dùng khi cần tin mới nhất/đầy đủ hơn cache KG.

    Args:
        ticker:    Mã cổ phiếu (HPG, VCB, FPT ...).
        days_back: Số ngày nhìn lại (mặc định 14, tối đa 30).
    """
    result = _ffn(ticker, days_back)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "fetch_fresh_news", "ticker": ticker.upper(), "result": result
        })
    return result


def get_stock_news(ticker: str, max_items: int = 10, recent_days: int = 0) -> dict:
    """
    Lấy TIN TỨC của MỘT cổ phiếu — tự GOM TỪ NHIỀU NGUỒN (KG → Vietstock → web) tới khi đủ,
    tự leo thang nếu một nguồn trống, có circuit breaker chống tốn token.
    LUÔN dùng tool này khi hỏi "tin tức về [1 mã]".

    Args:
        ticker:      Mã cổ phiếu (HPG, FPT ...).
        max_items:   Số tin mong muốn (mặc định 10).
        recent_days: Cửa sổ ngày user hỏi (1=hôm nay, 7=tuần, 30=tháng; 0=không lọc). Nếu >0 và
                     Vietstock/KG không có tin trong cửa sổ → tool TỰ tìm thêm trên web.
    """
    result = _gsn(ticker, max_items, recent_days)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_stock_news", "ticker": ticker.upper(), "result": result
        })
    return result


def query_news(scope: str = None, sector: str = None, ticker: str = None,
               sentiment: str = None, tag: str = None, days: int = 30,
               limit: int = 15) -> dict:
    """
    Tra cứu TIN theo BỘ LỌC (scope vĩ mô/ngành/DN, ngành, sentiment +/-, nhãn chủ đề) từ bảng
    news_articles — chỉ tin TÁC ĐỘNG thật. Dùng cho câu hỏi cấp chủ đề/ngành/vĩ mô.

    Args:
        scope: 'macro'|'sector'|'stock'. sector: tên ngành. ticker: mã. sentiment: tích cực/tiêu cực.
        tag: nhãn chủ đề. days: số ngày (mặc định 30). limit: số tin (mặc định 15).
    """
    result = _qn(scope, sector, ticker, sentiment, tag, days, limit)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({"tool": "query_news",
            "args": {"scope": scope, "sector": sector, "ticker": ticker,
                     "sentiment": sentiment, "tag": tag}, "result": result})
    return result


def query_events(ticker: str = None, event_category: str = None, event_type: str = None,
                 direction: str = None, scope: str = None, min_materiality: float = 0.0,
                 days: int = 60, limit: int = 15) -> dict:
    """
    Truy vấn ĐỒ THỊ SỰ KIỆN (KG v2): sự kiện đã trích & dedupe + tác động lượng hóa lên cổ phiếu
    (chiều +/-, độ mạnh, cơ chế), xếp theo mức trọng yếu. Dùng cho câu hỏi theo SỰ KIỆN.

    Args:
        ticker: lọc sự kiện tác động tới mã. event_category: CORPORATE/EARNINGS/MA/REGULATORY/MACRO/
        MARKET/SECTOR/RATING/RISK... event_type: mã loại. direction: tích cực/tiêu cực. scope: company/
        sector/macro. min_materiality: ngưỡng trọng yếu. days/limit.
    """
    result = _qe(ticker, event_category, event_type, direction, scope, min_materiality, days, limit)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({"tool": "query_events",
            "args": {"ticker": ticker, "event_category": event_category, "event_type": event_type,
                     "direction": direction, "scope": scope}, "result": result})
    return result


def web_search(query: str, num_results: int = 5, recent: bool = False,
               news: bool = False, intl: bool = False) -> dict:
    """
    Tìm kiếm Google (SerpAPI) lấy thông tin web cập nhật ngoài phạm vi KG/vnstock,
    trả kết quả kèm link nguồn để trích dẫn.

    Args:
        query:       TỪ KHÓA cốt lõi (KHÔNG nhồi ngày/tháng/"hôm nay"/"mới nhất" vào query).
        num_results: Số kết quả (mặc định 5, tối đa 10).
        recent:      True để ưu tiên tin gần đây (giá/cước/tỷ giá).
        news:        True để tìm trên Google News (tin tức về 1 công ty/chủ đề, đúng & có ngày).
        intl:        True để tìm nguồn QUỐC TẾ (tiếng Anh) — giá hàng hóa/vĩ mô thế giới.
    """
    # CIRCUIT BREAKER cứng: chặn vòng lặp search vô tận trong 1 lượt hỏi (đã từng 20+ lần).
    _MAX_WEB = 8   # nới cho câu so sánh/chuyên sâu (vẫn chặn loop vô tận)
    _done = [c for c in st.session_state.get("tool_tracker", []) if c.get("tool") == "web_search"]
    if len(_done) >= _MAX_WEB:
        result = {
            "status": "SEARCH_LIMIT",
            "error": (f"Đã đạt giới hạn {_MAX_WEB} lượt tìm web cho câu hỏi này. DỪNG tìm thêm và "
                      "TRẢ LỜI NGAY với dữ liệu đã có; chỉ số nào chưa có thì ghi rõ "
                      "'(chưa có số cập nhật)'. KHÔNG gọi web_search nữa."),
            "results": [],
        }
        if "tool_tracker" in st.session_state:
            st.session_state.tool_tracker.append({"tool": "web_search", "query": query, "result": result})
        return result

    result = _ws(query, num_results, recent, news, intl)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "web_search", "query": query, "result": result
        })
    return result


def read_article(url: str, focus: str = "") -> dict:
    """Đọc NỘI DUNG THẬT của 1 bài báo/URL rồi trích các CÂU CHỨA SỐ LIỆU (%, tỷ đồng,
    giá, tỷ giá, khối lượng…) để trả lời KÈM CON SỐ. Dùng khi snippet từ web_search/
    get_stock_news chưa đủ số → mở bài quan trọng nhất để moi số thật.

    Args:
        url:   Link http(s) thật của bài (từ kết quả web_search/get_stock_news/query_news).
        focus: (tùy chọn) cụm từ cần lấy số cho nó → ưu tiên câu chứa cụm này.
    """
    # CIRCUIT BREAKER: chặn mở quá nhiều bài trong 1 lượt (tốn thời gian + token).
    _MAX_READ = 5   # nới nhẹ cho câu chuyên sâu cần đọc nhiều bài driver
    _done = [c for c in st.session_state.get("tool_tracker", []) if c.get("tool") == "read_article"]
    if len(_done) >= _MAX_READ:
        result = {"status": "READ_LIMIT",
                  "error": (f"Đã đọc {_MAX_READ} bài cho câu hỏi này. DỪNG mở thêm và TRẢ LỜI NGAY "
                            "bằng số đã có; thiếu số thì ghi '(nguồn chưa nêu con số cụ thể)'.")}
        if "tool_tracker" in st.session_state:
            st.session_state.tool_tracker.append({"tool": "read_article", "url": url, "result": result})
        return result

    result = _ra(url, focus)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "read_article", "url": url, "result": result})
    return result


def get_financial_statements(ticker: str, period: str = "quarter") -> dict:
    """Báo cáo tài chính THẬT từ vnstock tới quý gần nhất (doanh thu, LNST, biên, tài sản,
    vốn CSH, ROE/ROA TTM, nợ). Dùng cho mọi câu hỏi về số liệu tài chính của 1 mã.

    Args:
        ticker: Mã cổ phiếu (vd HAH, HPG, FPT).
        period: "quarter" (theo quý) hoặc "year" (theo năm).
    """
    result = _gfs(ticker, period)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_financial_statements", "ticker": ticker.upper(), "result": result})
    return result


def get_commodity_prices(commodities: str = "") -> dict:
    """Giá hàng hóa THẬT từ sàn (Yahoo): thép HRC, dầu Brent/WTI, vàng, đồng, nhôm, khí.

    Args:
        commodities: tên hàng hóa cách nhau dấu phẩy (vd "thép hrc, dầu brent"). Trống = rổ mặc định.
    """
    result = _gcp(commodities)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_commodity_prices", "query": commodities, "result": result})
    return result


def get_vn_domestic_price(items: str = "") -> dict:
    """Giá NỘI ĐỊA VIỆT NAM thật (nguồn chuyên ngành VN): thép xây dựng, heo hơi, cá tra/tôm,
    đường, urea, xi măng, cao su, gạo, điện EVN. Dùng cho GIÁ ĐẦU RA của doanh nghiệp VN.

    Args:
        items: tên mặt hàng cách nhau dấu phẩy (vd "thép xây dựng, heo hơi").
    """
    result = _gvn(items)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_vn_domestic_price", "query": items, "result": result})
    return result


def get_sector_value_chain(sector: str) -> dict:
    """Chuỗi giá trị ngành: nguyên liệu đầu vào + sản phẩm đầu ra, kèm chỉ dẫn lấy giá đúng nguồn
    (quốc tế cho input, nội địa VN cho output).

    Args:
        sector: tên ngành (vd "thép", "chăn nuôi", "phân bón").
    """
    result = _gsvc(sector)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "get_sector_value_chain", "sector": sector, "result": result})
    return result


def query_sector_impact(sector: str) -> dict:
    """Bản đồ ngành: vĩ mô tác động + cổ phiếu kèm Beta.

    Args:
        sector: Tên ngành (vd "ngân hàng", "bất động sản", "thép") hoặc entity_id.
    """
    result = _qsi(sector)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "query_sector_impact", "sector": sector, "result": result})
    return result


def query_macro_propagation(macro: str) -> dict:
    """Cú sốc vĩ mô lan truyền tới vĩ mô hạ nguồn + ngành nào.

    Args:
        macro: Tên yếu tố vĩ mô (vd "Fed", "tỷ giá", "giá dầu", "FTSE") hoặc entity_id.
    """
    result = _qmp(macro)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "query_macro_propagation", "macro": macro, "result": result})
    return result


def query_stock_sector_context(ticker: str) -> dict:
    """Cổ phiếu → ngành + Beta + driver vĩ mô của ngành.

    Args:
        ticker: Mã cổ phiếu (vd HPG, VHM, SSI).
    """
    result = _qssc(ticker)
    if "tool_tracker" in st.session_state:
        st.session_state.tool_tracker.append({
            "tool": "query_stock_sector_context", "ticker": ticker.upper(), "result": result})
    return result


# ============================================================
# PERSISTENT CHAT HELPERS
# ============================================================

def _compact_tool_calls(tool_calls: list) -> list:
    out = []
    for c in tool_calls:
        tool = c.get("tool", "query_graph_database")
        if tool == "query_graph_database":
            out.append({"tool": tool, "ticker": c.get("ticker", "?")})
        elif tool == "get_market_price":
            r = c.get("result") or {}
            out.append({"tool": tool, "ticker": c.get("ticker", "?"),
                        "price": r.get("price"), "change_pct": r.get("price_change_pct")})
        elif tool == "compare_stocks":
            out.append({"tool": tool, "tickers": c.get("tickers", [])})
        elif tool == "get_market_overview":
            macro = (c.get("result") or {}).get("macro") or {}
            out.append({"tool": tool, "usd_vnd": macro.get("usd_vnd")})
        else:
            out.append({"tool": tool})
    return out


def db_load_session(session_key: str) -> list:
    try:
        r = get_supabase().table("chat_sessions").select("messages").eq(
            "session_key", session_key
        ).order("updated_at", desc=True).limit(1).execute()
        if r.data:
            return r.data[0]["messages"] or []
    except Exception:
        pass
    return []


def db_save_session(session_key: str, msgs: list, title: str = "") -> None:
    try:
        compact_msgs = []
        for m in msgs:
            compact_msgs.append({
                "role":       m["role"],
                "content":    m["content"],
                "tool_calls": _compact_tool_calls(m.get("tool_calls") or []),
            })

        existing = get_supabase().table("chat_sessions").select("id").eq(
            "session_key", session_key
        ).limit(1).execute()

        if existing.data:
            get_supabase().table("chat_sessions").update({
                "messages":   compact_msgs,
                "title":      title[:100],
                "updated_at": "now()",
            }).eq("session_key", session_key).execute()
        else:
            get_supabase().table("chat_sessions").insert({
                "session_key": session_key,
                "messages":    compact_msgs,
                "title":       title[:100],
            }).execute()
    except Exception:
        pass


def db_list_recent_sessions(limit: int = 8) -> list:
    try:
        r = get_supabase().table("chat_sessions").select(
            "session_key, title, updated_at"
        ).order("updated_at", desc=True).limit(limit).execute()
        return r.data or []
    except Exception:
        return []


# ============================================================
# KNOWLEDGE GRAPH HELPERS
# ============================================================

@st.cache_data(ttl=300)
def load_graph_stats() -> tuple:
    try:
        n = get_supabase().table("graph_nodes").select("entity_type").execute()
        e = get_supabase().table("graph_edges").select("relationship_type").execute()
        node_types: dict = {}
        for row in n.data:
            t = row["entity_type"]
            node_types[t] = node_types.get(t, 0) + 1
        return len(n.data), len(e.data), node_types
    except Exception:
        return 0, 0, {}


def build_graphviz_dot(network_data: dict) -> str:
    nodes = network_data.get("network_nodes") or []
    edges = network_data.get("network_edges") or []

    if not nodes:
        return 'digraph { label="Không có dữ liệu"; }'

    lines = [
        "digraph KG {",
        "  rankdir=LR;",
        "  bgcolor=transparent;",
        '  node [fontname=Helvetica fontsize=9 shape=box style="filled,rounded" margin="0.08,0.04"];',
        "  edge [fontname=Helvetica fontsize=7];",
    ]

    for node in nodes:
        nid   = node["entity_id"].replace("-", "_").replace("/", "_")
        label = f'{node["entity_id"]}\\n{node["name"][:22]}'
        fc    = NODE_COLORS.get(node.get("entity_type", "STOCK"), "#FFFFFF")
        pw    = 3 if node.get("hop", 1) == 0 else 1
        lines.append(f'  {nid} [label="{label}" fillcolor="{fc}" penwidth={pw}];')

    for edge in edges:
        src = edge["from"].replace("-", "_").replace("/", "_")
        tgt = edge["to"].replace("-", "_").replace("/", "_")
        rel = edge.get("relationship", "")
        col = EDGE_COLORS.get(rel, "#555555")
        lbl = rel.replace("_", "\\n")
        lines.append(f'  {src} -> {tgt} [label="{lbl}" color="{col}" fontcolor="{col}"];')

    lines.append("}")
    return "\n".join(lines)


# ============================================================
# TOOL RENDER FUNCTIONS
# ============================================================

def _render_graph_tool(call: dict, i: int):
    ticker = call.get("ticker", "?")
    result = call.get("result") or {}
    st.markdown(f"**Bước {i} — `query_graph_database('{ticker}')`**")
    if result.get("error"):
        st.error(result["error"]); return

    summary = result.get("summary") or {}
    if summary:
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Ticker",        summary.get("ticker", ticker))
        c2.metric("Nodes",         summary.get("total_nodes", 0))
        c3.metric("Hop-1 edges",   summary.get("hop1_count", 0))
        c4.metric("Timestamp",     str(summary.get("query_timestamp", ""))[:16])

    st.markdown("**Mạng lưới quan hệ 2-hop**")
    st.graphviz_chart(build_graphviz_dot(result), use_container_width=True)

    with st.expander("Chú thích màu"):
        leg = [
            ("AFFECTS_NEGATIVE", "Tác động tiêu cực"),
            ("AFFECTS_POSITIVE", "Tác động tích cực"),
            ("INPUT_COST_OF",    "Chi phí đầu vào"),
            ("SUPPLIES_TO",      "Cung cấp vốn/tín dụng"),
            ("BELONGS_TO_SECTOR","Thuộc ngành"),
            ("MENTIONS",         "Tin tức đề cập"),
        ]
        cols = st.columns(3)
        for j, (rel, desc) in enumerate(leg):
            color = EDGE_COLORS.get(rel, "#555")
            cols[j % 3].caption(
                f'<span style="color:{color};font-weight:700">{rel}</span> — {desc}',
            )

    with st.expander("Raw JSON"):
        st.json({"center_node": result.get("center_node"), "summary": summary,
                 "edge_count": len(result.get("network_edges") or []),
                 "node_count": len(result.get("network_nodes") or [])})


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def _fmt_money(v, suffix="đ"):
    return f"{v:,}{suffix}" if _is_num(v) else "—"

def _fmt_tn(v):
    return f"{v:.1f}T" if _is_num(v) else "—"

def _fmt_pct(v, sign=False):
    if _is_num(v):
        return f"{v:+.2f}%" if sign else f"{v}%"
    return "—"


def _render_price_tool(call: dict, i: int):
    ticker = call.get("ticker", "?")
    r = call.get("result") or {}
    st.markdown(f"**Bước {i} — `get_market_price('{ticker}')`**")
    if r.get("error"):
        st.error(r["error"]); return

    c1, c2, c3, c4, c5 = st.columns(5)
    chg = r.get("price_change_pct")
    c1.metric("Giá",         _fmt_money(r.get("price")),
              delta=_fmt_pct(chg, sign=True), delta_color="normal")
    c2.metric("Vốn hóa",    _fmt_tn(r.get("market_cap_trillion")))
    c3.metric("Volume",      _fmt_money(r.get("volume_today"), ""))
    c4.metric("Target",      _fmt_money(r.get("target_price")))
    c5.metric("Rating",      r.get("analyst_rating") or "—")

    col_a, col_b = st.columns(2)
    col_a.caption(f"52w High: **{_fmt_money(r.get('price_52w_high'))}**  |  Low: **{_fmt_money(r.get('price_52w_low'))}**")
    fp = r.get("foreigner_pct")
    col_b.caption(f"Nước ngoài: **{_fmt_pct(fp)}**  |  Tính đến: {(r.get('as_of') or '')[:10]}")


def _render_compare_tool(call: dict, i: int):
    tickers = call.get("tickers", [])
    r = call.get("result") or {}
    st.markdown(f"**Bước {i} — `compare_stocks({tickers})`**")
    if r.get("error"):
        st.error(r["error"]); return

    comparison = r.get("comparison", [])
    if not comparison:
        st.info("Không có dữ liệu so sánh"); return

    cols = st.columns(len(comparison))
    for col, s in zip(cols, comparison):
        with col:
            tk = s.get("ticker", "?")
            ticker_name = TICKER_INFO.get(tk, (tk, ""))[0]
            st.markdown(f"**{tk}**  \n_{ticker_name}_")
            st.metric("Giá",       _fmt_money(s.get("current_price") or s.get("price")))
            st.metric("P/E",       f"{s.get('pe_ttm')}" if s.get("pe_ttm") not in (None, "") else "—")
            st.metric("Vốn hóa",   _fmt_tn(s.get("market_cap_trillion")))
            rev = s.get("revenue_q_bn")
            st.metric("Doanh thu Q", f"{rev:,.0f}B" if _is_num(rev) else "—")
            net = s.get("net_profit_q_bn")
            st.metric("Lợi nhuận Q", f"{net:,.0f}B" if _is_num(net) else "—")
            rating = s.get("analyst_rating") or "—"
            tp = s.get("target_price")
            st.caption(f"{rating}  |  Target: {_fmt_money(tp)}" if _is_num(tp) else rating)


def _render_overview_tool(call: dict, i: int):
    r = call.get("result") or {}
    st.markdown(f"**Bước {i} — `get_market_overview()`**")
    if r.get("error"):
        st.error(r["error"]); return

    def _num(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool)

    macro = r.get("macro") or {}
    _usd = macro.get("usd_vnd")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("USD/VND",     f"{_usd:,}" if _num(_usd) else str(_usd or "—"))
    c2.metric("NHNN rate",   f"{macro.get('sbv_base_rate_pct', '—')}%")
    c3.metric("Fed rate",    f"{macro.get('fed_rate_pct', '—')}%")
    c4.caption(f"Tỷ giá cập nhật: {macro.get('usd_vnd_as_of', '—')}")

    stocks = r.get("top10_stocks") or []
    if stocks:
        st.markdown("**Top 10 cổ phiếu**")
        chunks = [stocks[idx:idx+5] for idx in range(0, len(stocks), 5)]
        for chunk in chunks:
            cols = st.columns(5)
            for col, s in zip(cols, chunk):
                p  = s.get("price")
                mc = s.get("market_cap_trillion")
                pe = s.get("pe_ttm")
                col.metric(s.get("ticker", "?"), f"{p:,}đ" if _num(p) else "—",
                           delta=f"PE {pe}" if pe not in (None, "") else "PE —")
                mc_str = f"{mc:.1f}T" if _num(mc) else "—"
                col.caption(f"{mc_str}  {s.get('analyst_rating', '') or ''}")


def _render_timeline_tool(call: dict, i: int):
    r = call.get("result") or {}
    ticker = call.get("ticker", "?")
    _tool = call.get("tool", "get_stock_news_timeline")
    if _tool == "fetch_fresh_news":
        st.markdown(f"**Bước {i} — `fetch_fresh_news('{ticker}', {r.get('days_back', '?')}d)` "
                    f"· crawl trực tiếp Vietstock**")
        if r.get("note"):
            st.caption(r["note"])
    else:
        st.markdown(f"**Bước {i} — `get_stock_news_timeline('{ticker}')`**")
    if r.get("error"):
        st.error(r["error"]); return
    events = r.get("events") or []
    if not events:
        st.caption(f"Không có sự kiện tin tức nào cho {ticker} trong {r.get('days_back', 90)} ngày.")
        return
    st.caption(f"{len(events)} sự kiện gần đây ({r.get('days_back', 90)} ngày)")
    _ICON = {"AFFECTS_POSITIVE": "↑", "AFFECTS_NEGATIVE": "↓", "MENTIONS": "→"}
    for ev in events[:8]:
        rel = ev.get("relationship", "MENTIONS")
        icon = _ICON.get(rel, "•")
        when = (ev.get("observed_at") or "")[:10]
        conf = ev.get("confidence")
        conf_s = f" · tin cậy {conf:.0%}" if isinstance(conf, (int, float)) else ""
        quote = ev.get("evidence_quote") or ""
        url = ev.get("source_url") or ""
        line = f"{icon} **{when}**{conf_s} — {quote}"
        if url and url.startswith("http"):
            line += f"  [(nguồn)]({url})"
        st.markdown(line)


def _render_websearch_tool(call: dict, i: int):
    r = call.get("result") or {}
    q = call.get("query", "?")
    st.markdown(f"**Bước {i} — `web_search('{q}')` · Google/SerpAPI**")
    if r.get("error"):
        st.warning(r["error"]); return
    ab = r.get("answer_box")
    if ab and ab.get("answer"):
        st.success(f"**Trả lời nhanh:** {ab['answer']}"
                   + (f"  [(nguồn)]({ab['link']})" if ab.get("link") else ""))
    results = r.get("results") or []
    if not results:
        st.caption("Không có kết quả."); return
    st.caption(f"{len(results)} kết quả web:")
    for res in results[:5]:
        title = res.get("title") or "(không tiêu đề)"
        link  = res.get("link") or ""
        snip  = res.get("snippet") or ""
        when  = f" · {res.get('date')}" if res.get("date") else ""
        st.markdown(f"- **[{title}]({link})**{when}<br><span style='font-size:12px;color:#64748B'>{snip}</span>",
                    unsafe_allow_html=True)


def _render_readarticle_tool(call: dict, i: int):
    r = call.get("result") or {}
    url = call.get("url", "")
    st.markdown(f"**Bước {i} — `read_article` · đọc thân bài, trích số liệu**")
    if r.get("error"):
        st.warning(r["error"]); return
    title = r.get("tieu_de") or url
    head  = f"[{title}]({url})" if url.startswith("http") else title
    st.markdown(f"Bài: **{head}**", unsafe_allow_html=True)
    nums = r.get("so_lieu") or []
    if not nums:
        st.caption(r.get("note") or "Bài không chứa số liệu định lượng rõ ràng.")
        return
    st.caption(f"{len(nums)} câu chứa số liệu trích từ bài:")
    for s in nums[:14]:
        st.markdown(f"- <span style='font-size:12.5px'>{s}</span>", unsafe_allow_html=True)


def _render_stocknews_tool(call: dict, i: int):
    r = call.get("result") or {}
    tk = call.get("ticker", "?")
    st.markdown(f"**Bước {i} — `get_stock_news('{tk}')` · gom đa nguồn (KG→Vietstock→web)**")
    if r.get("error"):
        st.warning(r["error"]); return
    srcs = r.get("nguon") or []
    st.caption(f"{r.get('count', 0)} tin · nguồn đã gom: {', '.join(srcs) or '—'}")
    for n in (r.get("news") or [])[:12]:
        title = n.get("tieu_de") or "(không tiêu đề)"
        link  = n.get("link") or ""
        when  = f" · {n.get('ngay')}" if n.get("ngay") else ""
        src   = f" — {n.get('nguon')}" if n.get("nguon") else ""
        head  = f"[{title}]({link})" if link else title
        st.markdown(f"- **{head}**{when}"
                    f"<span style='font-size:12px;color:#64748B'>{src}</span>",
                    unsafe_allow_html=True)


def _render_querynews_tool(call: dict, i: int):
    r = call.get("result") or {}
    a = call.get("args") or {}
    flt = " · ".join(f"{k}={v}" for k, v in a.items() if v)
    st.markdown(f"**Bước {i} — `query_news({flt})` · lọc tin tác động**")
    if r.get("error"):
        st.warning(r["error"]); return
    st.caption(f"{r.get('count', 0)} tin (đã lọc CHỈ tác động +/-)")
    for n in (r.get("news") or [])[:12]:
        title = n.get("tieu_de") or "(không tiêu đề)"
        link  = n.get("link") or ""
        head  = f"[{title}]({link})" if link else title
        meta  = " · ".join(x for x in [n.get("ngay"), n.get("ma") or n.get("nganh"),
                                       n.get("pham_vi"), n.get("tac_dong")] if x)
        st.markdown(f"- **{head}**<br><span style='font-size:12px;color:#64748B'>{meta}</span>",
                    unsafe_allow_html=True)


def _render_events_tool(call: dict, i: int):
    r = call.get("result") or {}
    a = call.get("args") or {}
    flt = " · ".join(f"{k}={v}" for k, v in a.items() if v)
    st.markdown(f"**Bước {i} — `query_events({flt})` · Đồ thị Sự kiện (KG v2)**")
    if r.get("error"):
        st.warning(r["error"]); return
    st.caption(f"{r.get('count', 0)} sự kiện (đã dedupe · xếp theo trọng yếu)")
    for e in (r.get("events") or [])[:10]:
        title = e.get("tieu_de") or "(?)"
        link  = e.get("link") or ""
        head  = f"[{title}]({link})" if link else title
        imp = " · ".join(f"{t.get('thuc_the')} {t.get('chieu')}" for t in (e.get("tac_dong") or [])[:4])
        st.markdown(
            f"- **{head}**<br><span style='font-size:12px;color:#64748B'>"
            f"`{e.get('loai_su_kien')}` · {e.get('ngay')} · trọng yếu {e.get('trong_yeu')} "
            f"· tác động: {imp}</span>", unsafe_allow_html=True)


def _render_sector_tool(call: dict, i: int):
    r = call.get("result") or {}
    tool = call.get("tool")
    arg = call.get("sector") or call.get("macro") or call.get("ticker") or "?"
    st.markdown(f"**Bước {i} — `{tool}('{arg}')`**")
    if r.get("error"):
        st.warning(r["error"]); return

    if tool == "query_sector_impact":
        drivers = r.get("macro_drivers") or []
        if drivers:
            st.caption("Yếu tố vĩ mô tác động:")
            for m in drivers[:8]:
                st.markdown(f"- {m.get('macro')} **{m.get('sign')}** (w={m.get('weight')}, "
                            f"{m.get('scope')}) — {m.get('mechanism','')}")
        stocks = r.get("stocks") or []
        if stocks:
            st.caption("Cổ phiếu trong ngành (Beta):")
            st.markdown(" · ".join(f"**{s.get('ticker')}**={s.get('beta_vnindex')}" for s in stocks))

    elif tool == "query_macro_propagation":
        tt = r.get("transmits_to") or []
        if tt:
            st.caption("Lan truyền sang vĩ mô:")
            for t in tt:
                st.markdown(f"- → {t.get('to')} **{t.get('sign')}** — {t.get('mechanism','')}")
        secs = r.get("affected_sectors") or []
        if secs:
            st.caption("Ngành chịu tác động:")
            for s in secs[:10]:
                st.markdown(f"- {s.get('sector')} **{s.get('sign')}** (w={s.get('weight')}) "
                            f"— {s.get('mechanism','')}")

    elif tool == "query_stock_sector_context":
        st.markdown(f"**{r.get('ticker')}** · ngành: {r.get('sector_name') or r.get('sector')} "
                    f"· **Beta = {r.get('beta_vnindex')}** ({r.get('beta_source')})")
        for m in (r.get("macro_drivers") or [])[:6]:
            st.markdown(f"- {m.get('macro')} **{m.get('sign')}** (w={m.get('weight')}) — {m.get('mechanism','')}")


def _render_financials_tool(call: dict, i: int):
    r = call.get("result") or {}
    ticker = call.get("ticker", "?")
    st.markdown(f"**Bước {i} — `get_financial_statements('{ticker}')` · vnstock**")
    if r.get("error"):
        st.warning(r["error"]); return
    _kq = r.get("ky_cap_nhat_nhat")
    st.caption(f"Báo cáo tài chính thật · trend năm tới {r.get('latest_period','?')}"
               + (f" · quý mới nhất {_kq}" if _kq else "") + " · đơn vị tỷ VND")
    # Kết quả QUÝ MỚI NHẤT (số cập nhật nhất)
    _qm = (r.get("ratios") or {}).get("quy_moi_nhat")
    if _qm:
        _qoq = (f" · DT QoQ {_qm.get('doanh_thu_qoq_pct')}% · LNST QoQ {_qm.get('lnst_qoq_pct')}%"
                if _qm.get("doanh_thu_qoq_pct") is not None else "")
        st.caption(f"📌 Quý {_qm.get('ky')}: DT {_qm.get('doanh_thu_ty')} tỷ · "
                   f"LNST {_qm.get('lnst_ty')} tỷ · biên LNST {_qm.get('bien_lnst_pct')}%{_qoq}")
    rows = r.get("by_period") or []
    if rows:
        import pandas as _pd
        df = _pd.DataFrame([{
            "Kỳ": p["period"], "Doanh thu": p["doanh_thu_thuan_ty"],
            "LNST": p["lnst_ty"], "Biên gộp %": p.get("bien_gop_pct"),
            "Biên EBIT %": p.get("bien_ebit_pct"), "Biên LNST %": p["bien_lnst_pct"],
            "ROE %": p.get("roe_pct"), "Vốn CSH": p["von_chu_so_huu_ty"],
        } for p in rows])
        st.dataframe(df, use_container_width=True, hide_index=True)
    ra = r.get("ratios") or {}
    if ra:
        _peband = f" ({ra['pe_vung_thi_truong']})" if ra.get("pe_vung_thi_truong") else ""
        st.caption(
            f"Định giá — P/E: {ra.get('pe','—')}{_peband} · PEG: {ra.get('peg','—')}"
            f"{' · ' + ra['peg_danh_gia'] if ra.get('peg_danh_gia') else ''} · P/B: {ra.get('pb','—')} · "
            f"P/S: {ra.get('ps','—')} · EV/EBITDA: {ra.get('ev_tren_ebitda','—')} · "
            f"ROE TTM: {ra.get('roe_ttm_pct','—')}% · Nợ/VCSH: {ra.get('no_tren_vcsh','—')}"
        )
        # CHẤT LƯỢNG LỢI NHUẬN — dồn tích / cờ đỏ trên bảng cân đối (mọi loại hình)
        _flags = ra.get("co_dau_hieu_dong_tich") or []
        if _flags or ra.get("danh_gia_chat_luong_ln"):
            _dg = ra.get("danh_gia_chat_luong_ln")
            st.caption(
                f"Chất lượng LN — {(_dg + ' · ') if _dg else ''}"
                f"Dồn tích TTM: {ra.get('accruals_ttm_ty','—')} tỷ"
                + (f" (×{ra['accruals_tren_lnst']} LNST)" if ra.get("accruals_tren_lnst") is not None else "")
            )
            for _f in _flags:
                st.caption(f"⚠️ {_f.get('khoan_muc')}: {_f.get('gia_tri_ky_moi_ty')} tỷ · {_f.get('ghi_chu')}")
        # Snapshot chuyên sâu (chỉ DN sản xuất/DV mới có các field này)
        if any(k in ra for k in ("dong_tien_tu_do_fcf_ty", "no_vay_rong_ty", "he_so_thanh_toan_hien_hanh")):
            st.caption(
                f"Thanh khoản — Current ratio: {ra.get('he_so_thanh_toan_hien_hanh','—')} · "
                f"Vốn lưu động: {ra.get('von_luu_dong_ty','—')} tỷ · "
                f"Nợ vay ròng: {ra.get('no_vay_rong_ty','—')} tỷ ({ra.get('trang_thai_tien_mat','—')})"
            )
            st.caption(
                f"Dòng tiền — CFO/LNST: {ra.get('cfo_tren_lnst','—')} · CAPEX: {ra.get('dau_tu_capex_ty','—')} tỷ · "
                f"FCF: {ra.get('dong_tien_tu_do_fcf_ty','—')} tỷ (biên {ra.get('bien_fcf_pct','—')}%) · "
                f"Cổ tức TM: {ra.get('co_tuc_tien_mat_ty','—')} tỷ"
            )
        # Chẩn đoán analyst (DuPont/ROIC/coverage/CCC)
        _cd = ra.get("chan_doan") or {}
        if _cd:
            _dp = _cd.get("dupont") or {}
            if _dp:
                st.caption(f"DuPont — ROE {_dp.get('roe_suy_ra_pct')}% = biên {_dp.get('bien_lnst_pct')}% × "
                           f"vòng quay {_dp.get('vong_quay_tai_san')} × đòn bẩy {_dp.get('don_bay_tai_san')}")
            st.caption(
                f"Chẩn đoán — ROIC: {_cd.get('roic_pct','—')}% · trả lãi: {_cd.get('kha_nang_tra_lai_vay','—')}× · "
                f"nợ ròng/EBITDA: {_cd.get('no_rong_tren_ebitda','—')} · CCC: {_cd.get('chu_ky_tien_mat_ngay','—')} ngày "
                f"(DIO/DSO/DPO {_cd.get('dio_dso_dpo_ngay','—')})"
            )
        _csn = ra.get("chi_so_chuyen_nganh_tinh") or {}
        if _csn:
            _parts = [f"{k.replace('_pct','').replace('_',' ')}: {v}{'%' if k.endswith('_pct') else ''}"
                      for k, v in _csn.items() if k != "luu_y"]
            if _parts:
                st.caption("🏦 Chỉ số chuyên ngành (tính từ BCTC): " + " · ".join(_parts))
        _iv = ra.get("dinh_gia_noi_tai") or {}
        if _iv.get("vung_bao_thu_vnd"):
            _vr = _iv["vung_bao_thu_vnd"]
            st.caption(f"💎 Vùng giá trị bảo thủ (tham khảo): **{_vr[0]:,}–{_vr[1]:,} VND** · "
                       f"giá {_iv.get('gia_hien_tai_vnd','—'):,} → {_iv.get('vi_tri','')} "
                       f"(EPV+Graham · {_iv.get('co_so_eps','')} · COE {_iv.get('gia_dinh',{}).get('COE_pct','—')}%)")
        _dvh = ra.get("dinh_gia_vs_lich_su") or {}
        if _dvh.get("pe"):
            _pe = _dvh["pe"]
            st.caption(f"📈 P/E vs lịch sử chính mã: hiện **{_pe['hien_tai']}** vs trung vị {_pe['trung_vi']} "
                       f"({_pe['min']}–{_pe['max']}) → {_pe['vi_the']}")


def _render_commodity_tool(call: dict, i: int):
    r = call.get("result") or {}
    st.markdown(f"**Bước {i} — `get_commodity_prices()` · giá sàn (Yahoo Finance)**")
    if r.get("error"):
        st.warning(r["error"]); return
    rows = r.get("results") or []
    for x in rows:
        chg = x.get("thay_doi_pct")
        clr = "#059669" if (chg or 0) >= 0 else "#DC2626"
        src = f"[{x['san']}]({x['link']})" if x.get("link") else x.get("san", "")
        st.markdown(
            f"- **{x['ten']}:** {x['gia']} {x['don_vi']} "
            f"<span style='color:{clr}'>({chg:+}%)</span> · {x['ngay']} · {src}",
            unsafe_allow_html=True)
    bm = r.get("benchmark_quoc_te") or []
    if bm:
        st.caption("Benchmark quốc tế (leo thang nguồn — số thật):")
        for b in bm:
            val = f"{b.get('gia')} {b.get('don_vi') or ''}".strip() if b.get("gia") else (b.get("trich") or "")
            st.markdown(
                f"- **{b.get('ve')}:** {val} · {b.get('ngay')} · "
                f"[{b.get('nguon')}]({b.get('link')})", unsafe_allow_html=True)
    if r.get("khong_co_san") and not bm:
        st.caption("⚠ Chưa có giá sàn miễn phí: " + ", ".join(r["khong_co_san"]))


def _render_valuechain_tool(call: dict, i: int):
    r = call.get("result") or {}
    st.markdown(f"**Bước {i} — `get_sector_value_chain('{call.get('sector','?')}')`**")
    if r.get("error"):
        st.warning(r["error"]); return
    inp = r.get("inputs") or []; outp = r.get("outputs") or []
    if inp:
        st.caption("Nguyên liệu ĐẦU VÀO (giá quốc tế):")
        st.markdown(" · ".join(f"**{x['ten']}** ({x.get('market')})" for x in inp))
    if outp:
        st.caption("Sản phẩm ĐẦU RA (giá nội địa VN nếu có):")
        st.markdown(" · ".join(f"**{x['ten']}**" + (f" → VN:{x.get('vn_key')}" if x.get('vn_key') else "") for x in outp))


def _render_vndomestic_tool(call: dict, i: int):
    r = call.get("result") or {}
    st.markdown(f"**Bước {i} — `get_vn_domestic_price()` · giá nội địa VN (nguồn chuyên ngành)**")
    if r.get("error"):
        st.warning(r["error"]); return
    for x in (r.get("results") or []):
        val = f"{x.get('gia')} {x.get('don_vi') or ''}".strip() if x.get("gia") else (x.get("trich") or "")
        st.markdown(f"- **{x.get('ve')}:** {val} · {x.get('ngay_trong_bai')} · "
                    f"[{x.get('nguon')}]({x.get('link')})", unsafe_allow_html=True)


def render_tool_calls(tool_calls: list, expanded: bool = False):
    RENDERERS = {
        "query_graph_database":    _render_graph_tool,
        "get_market_price":        _render_price_tool,
        "compare_stocks":          _render_compare_tool,
        "get_market_overview":     _render_overview_tool,
        "get_stock_news":          _render_stocknews_tool,
        "query_news":              _render_querynews_tool,
        "query_events":            _render_events_tool,
        "get_stock_news_timeline": _render_timeline_tool,
        "fetch_fresh_news":        _render_timeline_tool,
        "web_search":              _render_websearch_tool,
        "read_article":            _render_readarticle_tool,
        "query_sector_impact":         _render_sector_tool,
        "query_macro_propagation":     _render_sector_tool,
        "query_stock_sector_context":  _render_sector_tool,
        "get_financial_statements":    _render_financials_tool,
        "get_commodity_prices":        _render_commodity_tool,
        "get_vn_domestic_price":       _render_vndomestic_tool,
        "get_sector_value_chain":      _render_valuechain_tool,
    }
    for i, call in enumerate(tool_calls, 1):
        tool_name = call.get("tool", "query_graph_database")
        renderer  = RENDERERS.get(tool_name, _render_graph_tool)
        renderer(call, i)
        if i < len(tool_calls):
            st.divider()


def _dev_mode() -> bool:
    """Layer 3 (raw tool trace) chỉ bật khi ?dev=1 — ẩn với end-user."""
    try:
        return st.query_params.get("dev") == "1"
    except Exception:
        return False


def render_agent_trace(tool_calls: list, default_open: bool = False, reuse: int = 0) -> None:
    """
    Hiển thị quá trình Agent theo 3 TẦNG (thay cho 'Suy luận Agent — N tool call(s)'):
      L1: dòng tóm tắt + evidence strip (luôn hiện)
      L2: timeline hoạt động ĐÃ DỊCH & GOM (disclosure)
      L3: raw tool calls — chỉ khi ?dev=1
    reuse: số dữ liệu TÁI SỬ DỤNG từ cache phiên (hiện "♻ N tái sử dụng").
    """
    if not tool_calls:
        return
    summary = _tt.run_summary(tool_calls)
    acts    = _tt.group_activities(tool_calls)

    # L1 — tóm tắt + nguồn
    st.markdown(
        evidence_strip(summary["sources"], summary["activity_count"],
                       summary["step_count"], reuse=reuse),
        unsafe_allow_html=True,
    )
    # L2 — timeline đã dịch (disclosure gọn)
    with st.expander(
        f"Xem cách phân tích — {summary['activity_count']} hoạt động · "
        f"{summary['step_count']} bước",
        expanded=default_open,
    ):
        st.markdown(agent_activity_timeline(acts), unsafe_allow_html=True)
        # Soft-error notes (amber) — lỗi KHÔNG chặn, đã tiếp tục với phần còn lại
        _soft = _err.collect_soft_notes(tool_calls)
        if _soft:
            st.markdown(soft_error_notes(_soft), unsafe_allow_html=True)
        # SourcesPanel — nguồn THẬT đã đánh số [1][2]… (tiền tệ niềm tin)
        _src = _tt.extract_sources(tool_calls)
        if _src:
            st.markdown(sources_panel(_src), unsafe_allow_html=True)
        # L3 — raw trace cho developer (gated)
        if _dev_mode():
            with st.expander("Developer trace (raw tool calls)", expanded=False):
                render_tool_calls(tool_calls, expanded=True)


def new_chat_session(model_idx: int = 0):
    return _gemini.chats.create(
        model=GEMINI_MODELS[model_idx % len(GEMINI_MODELS)],
        config=types.GenerateContentConfig(
            system_instruction=get_system_instruction(),
            tools=[get_market_price, compare_stocks,
                   get_market_overview, get_stock_news, query_news, query_events,
                   web_search, read_article, query_sector_impact, query_macro_propagation,
                   query_stock_sector_context, get_financial_statements,
                   get_commodity_prices,
                   get_vn_domestic_price,
                   get_sector_value_chain],
            temperature=0.2,
            max_output_tokens=16384,   # nâng từ 8192 → tránh CẮT câu trả lời dài (phân tích 7c)
        ),
    )


def _model_label(idx: int) -> str:
    return GEMINI_MODEL_OPTIONS[idx]["label"]


import re as _re_dedupe

def _dedupe_answer(txt: str) -> str:
    """
    Bỏ trường hợp model LẶP cả câu trả lời (câu phức hợp dài → đôi khi model viết LẠI toàn bộ,
    kể cả với CẤU TRÚC/CÂU MỞ ĐẦU KHÁC). Hai tín hiệu:
    (A) Disclaimer bắt buộc "không phải khuyến nghị" là DẤU KẾT THÚC — nếu xuất hiện >=2 lần thì
        đã lặp → giữ bản 1 (tới điểm bản lặp bắt đầu lại), cắt phần sau.
    (B) Câu mở đầu (>=25 ký tự) lặp y hệt ở nửa sau (lặp giống hệt).
    An toàn: chỉ kích hoạt khi có tín hiệu lặp RÕ; không cắt nhầm nội dung khác nhau.
    """
    if not txt or len(txt) < 500:
        return txt
    low = txt.lower()
    # (A) Disclaimer xuất hiện >= 2 lần
    discl = "không phải khuyến nghị"
    occ = [m.start() for m in _re_dedupe.finditer(_re_dedupe.escape(discl), low)]
    if len(occ) >= 2:
        after = occ[0] + len(discl)
        # Tìm nơi BẢN LẶP bắt đầu lại sau disclaimer thứ nhất: câu re-intro "MÃ (MÃ) là",
        # "Chào bạn", "Dưới đây là phân tích", hoặc heading đánh số mới (## 1.)
        m = _re_dedupe.search(
            r"(?m)^\s*(?:[A-ZĐ0-9]{2,5}\s*\([A-ZĐ0-9]{2,5}\)\s|Chào bạn|Dưới đây là phân tích|"
            r"#{1,4}\s*\d+\.\s|#{1,4}\s*📊)",
            txt[after:],
        )
        if m:
            return txt[:after + m.start()].rstrip()
        # fallback: cắt về đầu DÒNG chứa disclaimer thứ 2
        ls = txt.rfind("\n", 0, occ[1])
        return txt[: ls if ls != -1 else occ[1]].rstrip()
    # (B) Câu mở đầu lặp y hệt
    opener = next((l.strip() for l in txt.split("\n") if len(l.strip()) >= 25), None)
    if opener:
        first = txt.find(opener)
        second = txt.find(opener, first + len(opener))
        if second != -1 and second > len(txt) * 0.4:
            return txt[:second].rstrip()
    return txt


def _format_price(tk: str, mp: dict):
    """Render câu trả lời GIÁ deterministic (KHÔNG vòng model) → nhanh nhất. None nếu thiếu giá."""
    if not isinstance(mp, dict) or not mp.get("price"):
        return None
    p = mp
    chg = p.get("price_change_pct") or 0
    arrow = "🔺" if chg > 0 else "🔻" if chg < 0 else "➖"
    L = [f"**{tk}** — **{p['price']:,.0f} VND** {arrow} **{chg:+.2f}%** "
         f"({p.get('price_change_vnd', 0):+,.0f}) *(cập nhật {str(p.get('as_of', ''))[:10]})*"]
    if p.get("low_today") and p.get("high_today"):
        L.append(f"- Trong phiên: {p['low_today']:,.0f}–{p['high_today']:,.0f} VND"
                 + (f" · KL {p['volume_today']:,.0f}" if p.get("volume_today") else ""))
    if p.get("price_52w_low") and p.get("price_52w_high"):
        L.append(f"- 52 tuần: {p['price_52w_low']:,.0f}–{p['price_52w_high']:,.0f} VND"
                 + (f" · cách đỉnh **{p['pct_vs_dinh_52w']}%**" if p.get("pct_vs_dinh_52w") is not None else ""))
    if p.get("market_cap_trillion"):
        L.append(f"- Vốn hóa: ~**{p['market_cap_trillion']:,.1f} nghìn tỷ**"
                 + (f" · KN sở hữu {p['foreigner_pct']}%" if p.get("foreigner_pct") is not None else ""))
    L.append("\n⚠️ Thông tin tham khảo, không phải khuyến nghị đầu tư.")
    return "\n".join(L)


def _seed_chat_turn(chat, start_idx: int, user_query: str, answer: str):
    """Ghi 1 lượt (user→answer) vào CHAT SESSION Gemini — để câu FOLLOW-UP (luồng model-driven) có
    NGỮ CẢNH. Các path ĐETERMINISTIC (orchestrator/lean) trả lời NGOÀI chat session, nên nếu không seed
    thì follow-up không nêu lại mã sẽ MẤT ngữ cảnh (model hỏi lại mã). Trả về chat (tạo mới nếu None)."""
    try:
        if chat is None:
            chat = new_chat_session(start_idx)
        chat.record_history(
            user_input=types.Content(role="user", parts=[types.Part(text=user_query)]),
            model_output=[types.Content(role="model", parts=[types.Part(text=answer)])],
            automatic_function_calling_history=[],
            is_valid=True,
        )
    except Exception:
        pass
    return chat


def send_and_track(user_query: str, chat, start_idx: int) -> tuple[str, list, object, int]:
    """
    Gửi câu hỏi tới model NGƯỜI DÙNG CHỌN (start_idx). Nếu model đó hết hạn mức (429),
    đánh dấu 'hết lượt' trong phiên + thông báo, rồi tự fallback sang các model CÒN LƯỢT
    (theo thứ tự đăng ký) để câu hỏi vẫn được trả lời. Trả thêm chỉ số model ĐÃ trả lời.
    """
    st.session_state.tool_tracker = []
    st.session_state.cache_hits = 0          # đếm số lần TÁI SỬ DỤNG dữ liệu trong lượt này
    exhausted = st.session_state.setdefault("exhausted_models", set())

    # ── FAST PATH 0: câu CHỈ hỏi GIÁ 1 mã → trả lời DETERMINISTIC (1 call vnstock, KHÔNG vòng model) ──
    # ~3s thay vì ~14s (bỏ 2 vòng model tuần tự). Lỗi/không khớp → rơi xuống các path dưới.
    try:
        import core.analysis_orchestrator as _orch_p
        if _orch_p.is_price_query(user_query):
            _tk = _orch_p.extract_tickers(user_query)[0]
            _pa = _format_price(_tk, get_market_price(_tk))   # wrapper → tự ghi tool_tracker
            if _pa:
                return _pa, list(st.session_state.tool_tracker), chat, start_idx
    except Exception:
        pass

    # ── NHỚ MÃ ĐÃ HỎI (last_tickers) → để follow-up không nêu mã vẫn biết mã (vd "đọc sâu báo cáo") ──
    try:
        import core.analysis_orchestrator as _orch_t
        _cur_tk = _orch_t.extract_tickers(user_query)
        if _cur_tk:
            st.session_state.last_tickers = _cur_tk
    except Exception:
        _cur_tk = []

    # ── FAST PATH R: ĐỌC SÂU BÁO CÁO CTCK → ÉP read_article báo cáo thật (PDF) → grounded, chống bịa ──
    try:
        import core.analysis_orchestrator as _orch_r
        if _orch_r.is_report_query(user_query) and not _orch_r.is_sector_query(user_query):
            _rtk = (_cur_tk or st.session_state.get("last_tickers") or [None])[0]
            if _rtk:
                def _prog_r(_c):
                    try: st.session_state.tool_tracker.append(_c)
                    except Exception: pass
                _ra, _rc = _orch_r.run_report(user_query, _rtk, _gemini, GEMINI_MODELS[start_idx],
                                              types, on_progress=_prog_r)
                if _ra and len(_ra) > 150:
                    st.session_state.tool_tracker = list(_rc)
                    _final = _dedupe_answer(_ra)
                    chat = _seed_chat_turn(chat, start_idx, user_query, _final)
                    return _final, list(_rc), chat, start_idx
    except Exception:
        pass

    # ── FAST PATH: câu PHÂN TÍCH SÂU / SO SÁNH → ORCHESTRATOR (pre-fetch SONG SONG + 1 vòng model) ──
    # Thay vì để model gọi ~16 tool TUẦN TỰ (~207s), mình tự gather song song + gộp 1 vòng synthesis
    # (~100-120s, robust). Lỗi/không khớp intent → rơi xuống luồng model-driven cũ (an toàn tuyệt đối).
    try:
        import core.analysis_orchestrator as _orch
        if (_orch.is_deep_analysis(user_query) or _orch.is_sector_query(user_query)
                or _orch.is_macro_query(user_query)):
            # callback đẩy TỪNG bước gather vào tool_tracker → timeline cập nhật LIVE (main thread poll)
            def _prog(_call):
                try:
                    st.session_state.tool_tracker.append(_call)
                except Exception:
                    pass
            _ans, _calls = _orch.run(user_query, _gemini, GEMINI_MODELS[start_idx], types, on_progress=_prog)
            if _ans and len(_ans) > 200:
                st.session_state.tool_tracker = list(_calls)
                _final = _dedupe_answer(_ans)
                chat = _seed_chat_turn(chat, start_idx, user_query, _final)  # follow-up có ngữ cảnh
                return _final, list(_calls), chat, start_idx
    except Exception:
        pass   # bất kỳ trục trặc → dùng luồng model-driven cũ

    # ── FAST PATH 2: câu ĐƠN GIẢN (giá/tin/thị trường) → LEAN PROMPT (~2K token thay vì ~21K) ──
    # Câu dễ không cần playbook BCTC/knowledge cards → cắt mạnh token đầu vào → nhanh & rẻ hơn nhiều.
    # Lỗi → rơi xuống chat đầy đủ (an toàn). Tool wrappers vẫn ghi tool_tracker (timeline/sources live).
    try:
        import core.analysis_orchestrator as _orch_s
        if _orch_s.is_simple_query(user_query):
            _resp = _gemini.models.generate_content(
                model=GEMINI_MODELS[start_idx], contents=user_query,
                config=types.GenerateContentConfig(
                    system_instruction=get_lean_instruction(),
                    tools=[get_market_price, get_stock_news, get_market_overview, query_news,
                           query_events, query_stock_sector_context, get_commodity_prices,
                           get_vn_domestic_price, web_search],
                    temperature=0.2, max_output_tokens=4096))
            _txt = ensure_disclaimer(sanitize_citations(_resp.text or ""))
            if _txt and len(_txt) > 30:
                _final = _dedupe_answer(_txt)
                chat = _seed_chat_turn(chat, start_idx, user_query, _final)  # follow-up có ngữ cảnh
                return _final, list(st.session_state.tool_tracker), chat, start_idx
    except Exception:
        pass   # lỗi → dùng luồng chat đầy đủ

    # Thứ tự thử: model đã chọn TRƯỚC (kể cả nếu từng hết lượt — quota có thể đã reset),
    # rồi tới các model khác CÒN LƯỢT.
    order = [start_idx] + [i for i in range(len(GEMINI_MODELS))
                           if i != start_idx and GEMINI_MODELS[i] not in exhausted]

    for pos, i in enumerate(order):
        model = GEMINI_MODELS[i]
        try:
            # Dùng lại chat đang có nếu đúng model đã chọn; nếu fallback sang model khác
            # thì tạo phiên mới cho model đó.
            if i != start_idx or chat is None:
                chat = new_chat_session(i)
                st.toast(f"Chuyển sang {_model_label(i)}...")

            response = chat.send_message(user_query)
            exhausted.discard(model)  # gọi được → model còn lượt
            return (_dedupe_answer(sanitize_citations(response.text)),
                    list(st.session_state.tool_tracker), chat, i)

        except Exception as e:
            err = str(e)
            is_overload = "503" in err or "UNAVAILABLE" in err or "overloaded" in err.lower()
            is_quota    = "429" in err or "RESOURCE_EXHAUSTED" in err or "quota" in err.lower()

            if is_quota:
                exhausted.add(model)
                st.toast(f"⚠ {_model_label(i)} đã hết lượt hôm nay.")
            elif is_overload and pos < len(order) - 1:
                st.toast(f"{_model_label(i)} đang quá tải, thử model khác...")
                time.sleep(min(2 ** pos, 4))

            if pos < len(order) - 1:
                continue

            # Đã thử hết
            if is_quota:
                return (
                    "Tất cả model bạn có đều đã hết hạn mức miễn phí hôm nay. "
                    "Hãy thử lại sau ít phút, hoặc dùng API key trả phí "
                    "(https://ai.google.dev). Bạn vẫn xem được dữ liệu ở trang News và KG Explorer."
                ), [], chat, i
            # KHÔNG lộ chuỗi lỗi thô — dịch sang thông điệp thân thiện (Deliverable 7)
            return _err.friendly_global_error(err, _model_label(i)), [], chat, i

    return "Tất cả model đều quá tải hoặc hết hạn mức. Vui lòng thử lại sau.", [], chat, start_idx


# ============================================================
# SESSION STATE INIT
# ============================================================
import uuid as _uuid

if "session_key" not in st.session_state:
    _url_key = st.query_params.get("s", "")
    if _url_key:
        _loaded_msgs = db_load_session(_url_key)
        st.session_state.session_key = _url_key
        st.session_state.msgs        = _loaded_msgs
    else:
        _new_key = str(_uuid.uuid4())[:8]
        st.session_state.session_key = _new_key
        st.query_params["s"]         = _new_key
        st.session_state.msgs        = []

for key, val in [
    ("msgs",         []),
    ("chat",         None),
    ("tool_tracker", []),
    ("do_sync",      None),
    ("last_sync",    None),
    ("model_idx",        GEMINI_DEFAULT_IDX),
    ("exhausted_models", set()),
]:
    if key not in st.session_state:
        st.session_state[key] = val


# ============================================================
# SIDEBAR
# ============================================================
with st.sidebar:
    _cur_key = st.session_state.get("session_key", "")

    # ── Brand (gọn) ──────────────────────────────────────────
    st.markdown(
        f"""
        <div style="display:flex;align-items:center;gap:10px;padding:2px 0 16px">
            <div style="width:30px;height:30px;border-radius:9px;flex:0 0 auto;
                        background:linear-gradient(135deg,{COLORS['gradient_start']},{COLORS['gradient_end']});
                        display:flex;align-items:center;justify-content:center;
                        color:#fff;font-weight:800;font-size:15px;letter-spacing:-0.04em">SI</div>
            <div>
                <div style="font-size:15px;font-weight:800;letter-spacing:-0.03em;
                            color:{COLORS['text_primary']};line-height:1.1">Stock Intelligence</div>
                <div style="font-size:10.5px;font-weight:500;color:{COLORS['text_muted']}">
                    Knowledge Graph · Vietnam</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ── Hành động chính ──────────────────────────────────────
    if st.button("＋  Trò chuyện mới", use_container_width=True, type="primary",
                 key="new_session_btn"):
        import uuid as _uuid2
        st.query_params["s"] = str(_uuid2.uuid4())[:8]
        for _k in ("chat", "msgs", "session_key"):
            st.session_state.pop(_k, None)
        st.rerun()

    st.write("")

    # ── Lịch sử trò chuyện ───────────────────────────────────
    st.markdown(section_label("LỊCH SỬ TRÒ CHUYỆN"), unsafe_allow_html=True)
    _sessions = db_list_recent_sessions(12)
    if _sessions:
        for _s in _sessions:
            _skey  = _s["session_key"]
            _title = (_s.get("title") or "Phiên trò chuyện")[:30]
            _is_cur = _skey == _cur_key
            if st.button(("●  " if _is_cur else "○  ") + _title,
                         use_container_width=True, key=f"sess_{_skey}",
                         type="primary" if _is_cur else "secondary"):
                if _skey != _cur_key:
                    st.query_params["s"] = _skey
                    for _k in ("chat", "msgs", "session_key"):
                        st.session_state.pop(_k, None)
                    st.rerun()
    else:
        st.caption("Chưa có phiên nào.")

    st.write("")

    # ── Công cụ & dữ liệu (gom vào expander, đỡ rối) ─────────
    n_nodes, n_edges, _ = load_graph_stats()
    with st.expander(f"Công cụ & dữ liệu · {n_nodes} nodes / {n_edges} edges", expanded=False):
        st.caption("Cập nhật TIN + DÒNG SỰ KIỆN từ Vietstock (KG, bảng tin, sự kiện):")
        _days = int(st.number_input("Số ngày gần nhất", 1, 14, 2, 1, key="sync_days"))
        if st.button("Cập nhật ngay", use_container_width=True, key="sync_news_btn"):
            st.session_state.do_sync = _days
            st.rerun()
        if st.session_state.get("last_sync"):
            st.caption(f"Lần cuối: {st.session_state['last_sync']}")

        st.divider()
        if st.button("Xóa nội dung phiên hiện tại", use_container_width=True, key="clear_btn"):
            st.session_state.msgs = []
            st.session_state.chat = None
            db_save_session(_cur_key, [], "")
            st.rerun()

    # Chạy pipeline ĐẦY ĐỦ nếu được yêu cầu (tin + KG + bảng news_articles + SỰ KIỆN + vĩ mô)
    if st.session_state.get("do_sync"):
        _d = st.session_state.pop("do_sync")
        with st.status(f"Đang cập nhật tin & sự kiện ({_d} ngày)...", expanded=True) as _st:
            try:
                import datetime as _dt
                from data.sync_vietstock_news import run_pipeline  # noqa: PLC0415
                _st.write("Crawl Vietstock → trích xuất AI → cập nhật KG, bảng tin & dòng sự kiện...")
                # run_pipeline: crawl → KG → news_articles → extract_events (bảng events) → vĩ mô
                run_pipeline(days_back=_d, min_confidence=0.5)
                load_graph_stats.clear()
                st.cache_data.clear()        # xoá cache đọc events/news để trang hiện số MỚI
                _now = _dt.datetime.now().strftime("%H:%M %d/%m")
                _st.update(label=f"Đã cập nhật tin & sự kiện · {_now}", state="complete", expanded=False)
                st.toast("Cập nhật tin & sự kiện thành công")
                st.session_state["last_sync"] = _now
            except Exception as _e:
                _st.update(label=f"Lỗi: {str(_e)[:80]}", state="error")

    # ── HỌC LIÊN TỤC (P2+P3): chấm kết quả + tự đánh giá + đề xuất cải tiến ──
    with st.expander("🎓 Học & tự cải tiến", expanded=False):
        st.caption("P2 — Chấm nhận định đã đủ horizon (giá thực vs VN-Index) → rút bài học tiêm lại lần sau:")
        if st.button("Chấm kết quả & học", use_container_width=True, key="score_btn"):
            with st.status("Đang chấm kết quả thị trường…", expanded=True) as _ss:
                try:
                    import core.agent_learning as _al
                    _r = _al.score_pending_outcomes()
                    if _r.get("error"):
                        _ss.update(label=f"Lỗi: {_r['error'][:80]}", state="error")
                    else:
                        _ss.update(label=(f"Đã chấm {_r['scored']} nhận định "
                                          f"(đúng {_r['correct']}) · {_r['lessons']} bài học mới"),
                                   state="complete", expanded=False)
                except Exception as _e:
                    _ss.update(label=f"Lỗi: {str(_e)[:80]}", state="error")
        st.caption("P3 — Tự đánh giá chất lượng (LLM-judge) + đề xuất cải tiến (chờ bạn duyệt):")
        if st.button("Tự đánh giá & đề xuất", use_container_width=True, key="eval_btn"):
            with st.status("Đang tự đánh giá & đề xuất…", expanded=True) as _es:
                try:
                    import core.agent_learning as _al
                    _e1 = _al.evaluate_pending_runs()
                    _e2 = _al.propose_improvements()
                    _e3 = _al.propose_tool_policy()   # P4: tối ưu chính sách tool
                    _es.update(label=(f"Đã chấm {_e1.get('evaluated',0)} câu (TB {_e1.get('avg_overall')}) · "
                                      f"{_e2.get('proposals',0)+_e3.get('proposals',0)} đề xuất mới"),
                               state="complete", expanded=False)
                except Exception as _e:
                    _es.update(label=f"Lỗi: {str(_e)[:80]}", state="error")
        # P4: sức khỏe tool (rỗng/lỗi/chậm) — nhận diện tool lãng phí
        try:
            import core.agent_learning as _al
            _tu = _al.analyze_tool_usage()
            _bad = {k: v for k, v in (_tu.get("tools") or {}).items()
                    if v["calls"] >= 5 and (v["empty_rate"] + v["error_rate"] >= 0.4)}
            if _bad:
                st.caption("🔧 Tool cần xem (rỗng/lỗi cao):")
                for k, v in list(_bad.items())[:4]:
                    st.markdown(f"- `{k}`: rỗng {int(v['empty_rate']*100)}% · lỗi {int(v['error_rate']*100)}%"
                                + (f" · ~{v['avg_ms']}ms" if v.get('avg_ms') else ""))
        except Exception:
            pass
        # Xem đề xuất DRAFT (human-gated — chưa áp tự động)
        try:
            import core.agent_learning as _al
            _props = (_al._sb().table("improvement_proposals").select("kind,title,rationale")
                      .eq("status", "draft").order("created_at", desc=True).limit(5).execute().data) or []
            if _props:
                st.caption("📋 Đề xuất chờ duyệt:")
                for _p in _props:
                    st.markdown(f"- **[{_p.get('kind')}]** {_p.get('title')}")
        except Exception:
            pass

    # ── Disclaimer (footer nhỏ) ──────────────────────────────
    st.markdown(
        f'<div style="margin-top:10px;font-size:10.5px;line-height:1.5;color:{COLORS["text_muted"]}">'
        f'Thông tin tham khảo, KHÔNG phải khuyến nghị đầu tư.</div>',
        unsafe_allow_html=True,
    )


# ============================================================
# MAIN AREA
# ============================================================
st.markdown(
    f"""
    <div style="margin-bottom:14px">
        <span style="font-size:15px;font-weight:800;letter-spacing:-0.02em;
                     color:{COLORS['text_primary']}">Stock Intelligence</span>
        <span style="font-size:12px;color:{COLORS['text_muted']};margin-left:8px">
            · Phân tích cổ phiếu VN có nguồn, không khuyến nghị</span>
    </div>
    """,
    unsafe_allow_html=True,
)

# ── INPUT (chat) RESOLVE SỚM: lấy câu hỏi + GHI user msg TRƯỚC khi render welcome/history ──
# Vì khối welcome gate bằng `not msgs`: nếu chờ tới cuối trang mới append user msg thì ở LƯỢT sinh
# câu trả lời đầu tiên (msgs còn rỗng), welcome/hero VẪN render → hiện "card mờ" chèn dưới câu hỏi
# mới khi đang phân tích. Resolve sớm → msgs non-empty ngay đầu lượt → welcome ẩn → hết ghost.
# (st.chat_input vẫn TỰ neo đáy trang; CSS composer bám data-testid + pill position:fixed nên KHÔNG
#  phụ thuộc vị trí gọi.)
_cur = GEMINI_MODEL_OPTIONS[st.session_state.model_idx]
typed_input = st.chat_input(
    placeholder=f"Hỏi {_cur['label']} về HPG, VCB, FPT... hoặc yếu tố vĩ mô...",
    key="main_chat_input",   # KEY cố định → đổi model (đổi placeholder) KHÔNG mount lại widget
)
user_input: str | None = None
if typed_input:
    user_input = typed_input
elif "pending_query" in st.session_state:
    user_input = st.session_state.pop("pending_query")
if user_input:
    st.session_state.msgs.append({"role": "user", "content": user_input})

# ── EMPTY STATE (TỐI GIẢN, CHUYÊN NGHIỆP): lời chào căn trái + 5 câu hỏi đề xuất ─────
if not st.session_state.msgs:
    # căn lề TRÁI cho nút gợi ý (mặc định Streamlit căn giữa) — chuyên nghiệp, kiểu danh sách
    st.markdown(
        "<style>[class*='st-key-sc_'] button{justify-content:flex-start!important;"
        "text-align:left!important;padding:14px 18px!important;font-weight:600!important}</style>",
        unsafe_allow_html=True,
    )
    st.markdown(
        f'<div style="margin:30px 0 4px">'
        f'<div style="font-size:24px;font-weight:800;letter-spacing:-0.03em;'
        f'color:{COLORS["text_primary"]};line-height:1.3">Bạn muốn phân tích cổ phiếu gì hôm nay?</div>'
        f'<div style="font-size:13.5px;color:{COLORS["text_muted"]};margin-top:10px;line-height:1.7">'
        f'Định giá, so sánh ngành, đọc báo cáo công ty chứng khoán, vĩ mô, tiềm năng doanh nghiệp. '
        f'Mọi số liệu đều <b>truy được nguồn</b>, không khuyến nghị mua bán.</div></div>',
        unsafe_allow_html=True,
    )
    st.write("")
    st.markdown(section_label("CÂU HỎI GỢI Ý"), unsafe_allow_html=True)
    _showcase = [
        ("Định giá FPT, TCB, HPG: luận điểm đầu tư và rủi ro",
         "Định giá FPT, TCB, HPG hiện nay, luận điểm đầu tư và rủi ro cần chú ý"),
        ("Đánh giá ngành thép và so sánh HPG với đối thủ cùng ngành",
         "Đánh giá ngành thép hiện nay, động lực tăng trưởng thời gian tới và so sánh HPG với các đối thủ ngành"),
        ("Đọc sâu báo cáo công ty chứng khoán về VCB: khuyến nghị, giá mục tiêu, key metric",
         "Đọc sâu báo cáo phân tích VCB: khuyến nghị, giá mục tiêu và các key metric cần chú ý"),
        ("Lãi suất Fed ảnh hưởng thế nào tới chứng khoán Việt Nam?",
         "Lãi suất Fed hiện nay là bao nhiêu và ảnh hưởng thế nào tới chứng khoán Việt Nam?"),
        ("Tiềm năng và các dự án tương lai của Hòa Phát",
         "Tiềm năng tương lai của Hòa Phát có những dự án gì?"),
    ]
    for _i, (_lbl, _q) in enumerate(_showcase):
        if st.button(_lbl, use_container_width=True, key=f"sc_{_i}"):
            st.session_state.pending_query = _q
            st.rerun()

@st.fragment
def _feedback_widget(rid: str):
    """👍/👎 trong FRAGMENT → click chỉ RERUN RIÊNG cụm nút (KHÔNG reload cả trang → KHÔNG ngắt mạch chat).
    Gọi ở history loop (mọi câu, kể cả câu cũ section trước) + ngay dưới câu mới. Cho ĐỔI đánh giá: nút đã
    chọn tô đậm (primary), bấm lại nút kia để đổi → luôn HIỆN, không biến mất."""
    def _set(r):
        try:
            import core.agent_learning as _al
            _al.record_feedback(rid, rating=r)
        except Exception:
            pass
        st.session_state[f"fbdone_{rid}"] = r
    cur = st.session_state.get(f"fbdone_{rid}", 0)
    c1, c2, c3 = st.columns([1, 1, 10])
    c1.button("👍", key=f"fbup_{rid}", help="Hữu ích",
              type="primary" if cur == 1 else "secondary", on_click=_set, args=(1,))
    c2.button("👎", key=f"fbdn_{rid}", help="Chưa tốt",
              type="primary" if cur == -1 else "secondary", on_click=_set, args=(-1,))
    if cur:
        c3.caption("👍 Đã ghi nhận — cảm ơn!" if cur == 1
                   else "👎 Đã ghi nhận — agent sẽ rút kinh nghiệm.")


# Chat history
for msg in st.session_state.msgs:
    with st.chat_message(msg["role"],
                         avatar=USER_AVATAR if msg["role"] == "user" else ASSISTANT_AVATAR):
        st.markdown(_err.sanitize(msg["content"]) if msg["role"] == "assistant"
                    else msg["content"])
        if msg["role"] == "assistant" and msg.get("tool_calls"):
            render_agent_trace(msg["tool_calls"], default_open=False,
                               reuse=msg.get("reuse", 0))
        if msg["role"] == "assistant" and msg.get("model"):
            st.caption(f"Trả lời bởi {msg['model']}")
        # 👍/👎 trong FRAGMENT (emoji — không dùng st.feedback/Material icon vì font lỗi "thumbup").
        # Click chỉ rerun cụm nút → KHÔNG reload trang, không ngắt mạch chat; hiện ở MỌI câu (cả câu cũ).
        if msg["role"] == "assistant" and msg.get("run_id"):
            _feedback_widget(msg["run_id"])

# ── MODEL SELECTOR — nút "⌄" NẰM BÊN TRONG ô chat (CSS định vị, kiểu Gemini) ──
_cur = GEMINI_MODEL_OPTIONS[st.session_state.model_idx]
_cur_spent = _cur["id"] in st.session_state.exhausted_models

_trigger = _cur['short'] + ("  • hết lượt" if _cur_spent else "")
with st.popover(_trigger, use_container_width=False):
    st.markdown(
        f"<div style='font-size:11px;font-weight:700;letter-spacing:.06em;"
        f"color:{COLORS['text_muted']};margin-bottom:6px'>CHỌN MÔ HÌNH AI</div>",
        unsafe_allow_html=True,
    )
    _labels = [o["label"] for o in GEMINI_MODEL_OPTIONS]
    _caps   = [
        o["note"] + (" · hết lượt hôm nay"
                     if o["id"] in st.session_state.exhausted_models else "")
        for o in GEMINI_MODEL_OPTIONS
    ]
    # on_change chạy NGAY ĐẦU lần rerun (trước khi render nhãn model/placeholder phía trên)
    # → đổi model áp dụng trong 1 lần chạy duy nhất, KHÔNG cần st.rerun() thủ công (tránh
    #   chạy lại trang 2 lần gây giật/nháy như reload).
    def _apply_model_pick():
        _new = st.session_state.model_radio
        if _new != st.session_state.model_idx:
            st.session_state.model_idx = _new   # đổi model → phiên chat mới ở lượt sau
            st.session_state.chat = None
    st.radio(
        "Mô hình AI",
        options=list(range(len(GEMINI_MODEL_OPTIONS))),
        format_func=lambda i: _labels[i],
        captions=_caps,
        index=st.session_state.model_idx,
        label_visibility="collapsed",
        key="model_radio",
        on_change=_apply_model_pick,
    )

# user_input đã được RESOLVE + GHI vào msgs ở ĐẦU trang (trên welcome) → history loop phía trên đã
# render câu hỏi của user; ở đây CHỈ sinh câu trả lời (không append/không render user msg lần nữa).
if user_input:
    if st.session_state.chat is None:
        st.session_state.chat = new_chat_session(st.session_state.model_idx)

    _t0_turn = time.time()   # đo độ trễ lượt (P1 telemetry)
    with st.chat_message("assistant", avatar=ASSISTANT_AVATAR):
        # ── Trạng thái "đang nghiên cứu" — LiveTimeline STREAM realtime theo phase.
        #    Chạy agent trong THREAD (gắn script-run-ctx) để main thread poll
        #    tool_tracker & cập nhật timeline từng bước. Fallback đồng bộ nếu lỗi.
        with st.status("Đang nghiên cứu & phân tích…", expanded=True) as live_status:
            _tl = st.empty()
            _tl.markdown(agent_activity_timeline(_tt.thinking_plan(), running_idx=2),
                         unsafe_allow_html=True)

            _box: dict = {}
            def _agent_worker():
                try:
                    _box["r"] = send_and_track(
                        user_input, st.session_state.chat, st.session_state.model_idx)
                except Exception as _e:   # worker luôn để lại kết quả (kể cả lỗi)
                    _box["r"] = (_err.friendly_global_error(
                        _e, _model_label(st.session_state.model_idx)),
                        [], st.session_state.chat, st.session_state.model_idx)

            _th = None
            try:
                from streamlit.runtime.scriptrunner import (
                    add_script_run_ctx, get_script_run_ctx)
                _th = threading.Thread(target=_agent_worker, daemon=True)
                add_script_run_ctx(_th, get_script_run_ctx())
                _th.start()
                while _th.is_alive():
                    try:
                        _acts, _ridx = _tt.streaming_state(
                            list(st.session_state.get("tool_tracker", [])))
                        _tl.markdown(agent_activity_timeline(_acts, running_idx=_ridx),
                                     unsafe_allow_html=True)
                    except Exception:
                        pass
                    time.sleep(0.4)
                _th.join()
            except Exception:
                pass

            if _th is not None and _th.is_alive():
                _th.join()
            if "r" in _box:                       # đã chạy trong thread
                resp_text, tool_calls, updated_chat, answered_idx = _box["r"]
            else:                                 # thread không khởi động được → đồng bộ
                resp_text, tool_calls, updated_chat, answered_idx = send_and_track(
                    user_input, st.session_state.chat, st.session_state.model_idx)

            st.session_state.chat = updated_chat
            _final, _ = _tt.streaming_state(list(st.session_state.get("tool_tracker", [])))
            _tl.markdown(agent_activity_timeline(_final, running_idx=-1),
                         unsafe_allow_html=True)   # khung cuối: mọi phase ✓
            live_status.update(label="Phân tích hoàn tất", state="complete", expanded=False)

        # Câu trả lời lên TRƯỚC (Layer 1), trace 3-tầng đặt DƯỚI (đã dịch & gom)
        st.markdown(_err.sanitize(resp_text))
        if tool_calls:
            render_agent_trace(tool_calls, default_open=True,
                               reuse=st.session_state.get("cache_hits", 0))

        _ans_label = _model_label(answered_idx)
        if answered_idx != st.session_state.model_idx:
            st.caption(
                f"↪ {_model_label(st.session_state.model_idx)} đã hết lượt — "
                f"câu này được trả lời bởi **{_ans_label}**."
            )
        else:
            st.caption(f"Trả lời bởi {_ans_label}")

        # ── P1 LỚP HỌC: ghi nhận lượt + nhận định datable (best-effort, không vỡ app) ──
        _run_id = None
        try:
            import core.agent_learning as _al, core.analysis_orchestrator as _orch2
            _run_id = _al.log_run(
                session_id=st.session_state.get("session_key", ""),
                user_query=user_input,
                tickers=_orch2.extract_tickers(user_input),
                intent="deep_analysis" if _orch2.is_deep_analysis(user_input) else "simple",
                model=_ans_label, tool_calls=tool_calls,
                latency_ms=(time.time() - _t0_turn) * 1000, answer=resp_text)
        except Exception:
            pass
        # Nút 👍/👎 hiện NGAY dưới câu mới (cùng fragment dùng ở history loop → click không reload trang).
        if _run_id:
            _feedback_widget(_run_id)

    st.session_state.msgs.append({
        "role":       "assistant",
        "content":    resp_text,
        "tool_calls": tool_calls,
        "model":      _model_label(answered_idx),
        "reuse":      st.session_state.get("cache_hits", 0),
        "run_id":     _run_id,
    })

    _session_key = st.session_state.get("session_key", "")
    _title = st.session_state.msgs[0]["content"][:60] if st.session_state.msgs else ""
    if _session_key:
        db_save_session(_session_key, st.session_state.msgs, _title)
