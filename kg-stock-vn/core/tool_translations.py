"""
Tool Translation Framework — P1 của redesign UX "AI Financial Analyst".

Mục tiêu: KHÔNG bao giờ lộ tên hàm/tham số kỹ thuật ra UI người dùng.
Mỗi tool call được DỊCH sang ngôn ngữ nghiệp vụ ở 2 thì (đang làm / đã làm),
gắn vào 1 trong các PHASE cố định, rồi GOM các call cùng phase thành 1 activity.

Module thuần dữ liệu/logic — KHÔNG phụ thuộc Streamlit → test được độc lập.
"""

from __future__ import annotations

# ──────────────────────────────────────────────────────────────────────
# PHASES — khung tư duy cố định của một analyst (thể hiện "có kế hoạch")
#   key, nhãn (thì quá khứ cho timeline), nhãn (thì hiện tại cho live), icon
# ──────────────────────────────────────────────────────────────────────
PHASES: list[dict] = [
    {"key": "understand", "past": "Hiểu yêu cầu",            "live": "Đang hiểu yêu cầu",            "icon": "target",   "synthetic": True},
    {"key": "plan",       "past": "Lập kế hoạch phân tích",   "live": "Đang lập kế hoạch",            "icon": "list",     "synthetic": True},
    {"key": "collect",    "past": "Thu thập dữ liệu",         "live": "Đang thu thập dữ liệu",        "icon": "document", "synthetic": False},
    {"key": "context",    "past": "Nghiên cứu bối cảnh ngành","live": "Đang nghiên cứu bối cảnh ngành","icon": "network",  "synthetic": False},
    {"key": "news",       "past": "Đọc tin tức & sự kiện",    "live": "Đang đọc tin tức & sự kiện",   "icon": "newspaper","synthetic": False},
    {"key": "valuate",    "past": "Đối chiếu & định giá",     "live": "Đang đối chiếu định giá",      "icon": "scale",    "synthetic": False},
    {"key": "synthesize", "past": "Tổng hợp nhận định",       "live": "Đang tổng hợp nhận định",      "icon": "sparkles", "synthetic": True},
]
_PHASE_BY_KEY = {p["key"]: p for p in PHASES}
# thứ tự để sort các phase thật khi hiển thị
_PHASE_ORDER = {p["key"]: i for i, p in enumerate(PHASES)}


# ──────────────────────────────────────────────────────────────────────
# REGISTRY — nguồn chân lý cho 18 tool đang chạy.
#   phase    : phase nghiệp vụ
#   gerund   : nhãn "đang làm"
#   past     : nhãn "đã làm" (cho từng call lẻ; activity gom dùng nhãn phase)
#   obj      : key trong call dict để lấy ĐỐI TƯỢNG (mã/ngành) hiển thị
#   redact   : True → tuyệt đối không hiện đối tượng (vd query thô của web_search)
#   source   : nhãn nguồn (dùng cho EvidenceStrip ở P3)
# ──────────────────────────────────────────────────────────────────────
TOOL_META: dict[str, dict] = {
    "get_financial_statements":   {"phase": "collect", "gerund": "Đang thu thập báo cáo tài chính", "past": "Đã thu thập BCTC",            "obj": "ticker",  "source": "BCTC doanh nghiệp"},
    "get_market_price":           {"phase": "collect", "gerund": "Đang lấy giá thị trường",          "past": "Đã lấy giá hiện tại",        "obj": "ticker",  "source": "Giá thị trường"},
    "get_market_overview":        {"phase": "collect", "gerund": "Đang đọc tổng quan thị trường",    "past": "Đã nắm bối cảnh vĩ mô",      "obj": None,      "source": "Tổng quan thị trường"},
    "get_commodity_prices":       {"phase": "collect", "gerund": "Đang tra giá hàng hóa",            "past": "Đã cập nhật giá hàng hóa",   "obj": None,      "source": "Giá hàng hóa"},
    "get_vn_domestic_price":      {"phase": "collect", "gerund": "Đang tra giá nội địa VN",          "past": "Đã cập nhật giá nội địa",    "obj": None,      "source": "Giá nội địa VN"},

    "query_stock_sector_context": {"phase": "context", "gerund": "Đang phân tích bối cảnh ngành",    "past": "Đã phân tích vị thế ngành",  "obj": "ticker",  "source": "Knowledge Graph"},
    "query_sector_impact":        {"phase": "context", "gerund": "Đang đánh giá tác động ngành",     "past": "Đã đánh giá tác động ngành", "obj": "sector",  "source": "Knowledge Graph"},
    "query_macro_propagation":    {"phase": "context", "gerund": "Đang truy vết lan truyền vĩ mô",   "past": "Đã truy vết tác động vĩ mô", "obj": "macro",   "source": "Knowledge Graph"},
    "get_sector_value_chain":     {"phase": "context", "gerund": "Đang dựng chuỗi giá trị ngành",    "past": "Đã phân tích chuỗi giá trị", "obj": "sector",  "source": "Knowledge Graph"},
    "query_graph_database":       {"phase": "context", "gerund": "Đang tra Đồ thị Tri thức",         "past": "Đã truy vấn quan hệ KG",     "obj": "ticker",  "source": "Knowledge Graph"},

    "get_stock_news":             {"phase": "news",    "gerund": "Đang rà tin tức liên quan",        "past": "Đã rà soát tin tức",         "obj": "ticker",  "source": "Tin tức"},
    "query_news":                 {"phase": "news",    "gerund": "Đang lọc tin tác động",            "past": "Đã lọc tin tác động",        "obj": None,      "source": "Tin tức"},
    "query_events":               {"phase": "news",    "gerund": "Đang quét sự kiện ảnh hưởng",      "past": "Đã phân tích sự kiện",       "obj": None,      "source": "Đồ thị Sự kiện"},
    "fetch_fresh_news":           {"phase": "news",    "gerund": "Đang cập nhật tin mới nhất",       "past": "Đã cập nhật tin mới",        "obj": "ticker",  "source": "Tin tức"},
    "get_stock_news_timeline":    {"phase": "news",    "gerund": "Đang dựng dòng sự kiện",           "past": "Đã dựng dòng sự kiện",       "obj": "ticker",  "source": "Tin tức"},
    "web_search":                 {"phase": "news",    "gerund": "Đang tìm thông tin mới",           "past": "Đã tìm trên web",            "obj": "query", "redact": True, "source": "Web"},
    "read_article":               {"phase": "news",    "gerund": "Đang đọc bài viết",                "past": "Đã đọc & trích số liệu",     "obj": None,      "source": "Báo chí"},

    "compare_stocks":             {"phase": "valuate", "gerund": "Đang đối chiếu chỉ số doanh nghiệp","past": "Đã so sánh định giá",        "obj": "tickers", "source": "Tính toán nội bộ"},
}

# Fallback cho tool MỚI chưa khai báo (scale tới hàng trăm tool) ─ theo tiền tố
_VERB_MAP: dict[str, tuple[str, str]] = {
    "get_":      ("Đang lấy", "Đã lấy"),
    "fetch_":    ("Đang tải", "Đã tải"),
    "query_":    ("Đang truy vấn", "Đã truy vấn"),
    "search_":   ("Đang tìm", "Đã tìm"),
    "compare_":  ("Đang so sánh", "Đã so sánh"),
    "read_":     ("Đang đọc", "Đã đọc"),
    "analyze_":  ("Đang phân tích", "Đã phân tích"),
    "generate_": ("Đang tạo", "Đã tạo"),
    "list_":     ("Đang liệt kê", "Đã liệt kê"),
}

# vài cụm hay gặp → từ tiếng Việt tự nhiên cho fallback object
_NOUN_MAP: dict[str, str] = {
    "financial statements": "báo cáo tài chính",
    "market price": "giá thị trường",
    "market overview": "tổng quan thị trường",
    "news": "tin tức",
    "events": "sự kiện",
    "sector": "ngành",
    "value chain": "chuỗi giá trị",
}


def _humanize(raw: str) -> str:
    s = raw.replace("_", " ").strip().lower()
    return _NOUN_MAP.get(s, s)


def translate_tool(call: dict) -> dict:
    """Dịch 1 tool call → {phase, gerund, past, obj_text}. Không bao giờ lộ tên hàm."""
    tool = (call or {}).get("tool", "")
    meta = TOOL_META.get(tool)
    if meta is None:                       # FALLBACK suy diễn theo tiền tố
        prefix = next((p for p in _VERB_MAP if tool.startswith(p)), None)
        g, p = _VERB_MAP.get(prefix, ("Đang xử lý", "Đã xử lý"))
        obj_noun = _humanize(tool[len(prefix):]) if prefix else _humanize(tool)
        return {"phase": "collect", "gerund": f"{g} {obj_noun}".strip(),
                "past": f"{p} {obj_noun}".strip(), "obj_text": ""}

    obj_text = ""
    if not meta.get("redact"):
        key = meta.get("obj")
        if key:
            val = call.get(key)
            if isinstance(val, (list, tuple)):
                obj_text = ", ".join(str(x) for x in val if x)
            elif val:
                obj_text = str(val)
            if obj_text in ("?", "None", "null"):
                obj_text = ""
    return {"phase": meta["phase"], "gerund": meta["gerund"],
            "past": meta["past"], "obj_text": obj_text}


def phase_of(call: dict) -> str:
    return translate_tool(call)["phase"]


def group_activities(tool_calls: list) -> list[dict]:
    """
    GOM N tool call → các activity theo phase (đã dịch).
    Trả list dict: {key, icon, label, detail, count}
      - label : nhãn phase thì quá khứ ("Thu thập dữ liệu")
      - detail: đối tượng gộp ("VCB, HPG") — đã loại trùng, giữ thứ tự
      - count : số tool call thuộc phase (metadata phụ)
    Luôn kèm 'understand' + 'plan' đầu và 'synthesize' cuối (synthetic) để
    tạo cảm giác một quy trình phân tích mạch lạc.
    """
    buckets: dict[str, dict] = {}
    for call in (tool_calls or []):
        t = translate_tool(call)
        ph = t["phase"]
        b = buckets.setdefault(ph, {"count": 0, "objs": []})
        b["count"] += 1
        for piece in (t["obj_text"].split(", ") if t["obj_text"] else []):
            if piece and piece not in b["objs"]:
                b["objs"].append(piece)

    activities: list[dict] = [
        _activity("understand", ""),
        _activity("plan", ""),
    ]
    real_phases = sorted(buckets.keys(), key=lambda k: _PHASE_ORDER.get(k, 99))
    for ph in real_phases:
        b = buckets[ph]
        detail = ", ".join(b["objs"][:6])
        if len(b["objs"]) > 6:
            detail += f" +{len(b['objs']) - 6}"
        activities.append(_activity(ph, detail, b["count"]))
    activities.append(_activity("synthesize", ""))
    return activities


def _activity(phase_key: str, detail: str, count: int = 0) -> dict:
    p = _PHASE_BY_KEY[phase_key]
    return {"key": phase_key, "icon": p["icon"], "label": p["past"],
            "detail": detail, "count": count}


def extract_sources(tool_calls: list, cap: int = 16, per_ticker: int = 6) -> list[dict]:
    """
    Trích NGUỒN THẬT (có thể trích dẫn) từ kết quả tool → list {title, link, date, source}.
    Dedupe theo link. **CÂN BẰNG theo mã**: gom nguồn theo TICKER của call rồi round-robin để
    MỖI mã (cả peer khi so sánh) đều có đại diện — tránh mã chính chiếm hết slot, đẩy peer khỏi list.
    Đây là 'tiền tệ niềm tin' cho sản phẩm tài chính (SourcesPanel — Layer 2).
    """
    buckets: dict[str, list] = {}
    order: list[str] = []
    seen: set[str] = set()

    def _add(tk, title, link, date, source):
        title = (title or "").strip()
        link = (link or "").strip()
        # CHỈ giữ NGUỒN WEB BẤM ĐƯỢC (panel = link click vào đọc được). Dữ liệu nội bộ không có
        # trang đọc (vnstock BCTC, KG…) → KHÔNG vào panel (user tự kiểm trên nền tảng dữ liệu).
        if not link.startswith("http"):
            return
        if link in seen:
            return
        seen.add(link)
        if tk not in buckets:
            buckets[tk] = []
            order.append(tk)
        buckets[tk].append({"title": title or link, "link": link,
                            "date": (date or "").strip(), "source": source})

    for call in (tool_calls or []):
        tool = (call or {}).get("tool", "")
        res = call.get("result") if isinstance(call.get("result"), dict) else {}
        if not isinstance(res, dict):
            continue
        # mã của call (news/BCTC gắn theo ticker; tickers[0] cho compare; "·" cho web/chung)
        tk = call.get("ticker") or (call.get("tickers") or [None])[0] or "·"
        tk = str(tk).upper()
        for n in (res.get("news") or []):
            _add(tk, n.get("tieu_de"), n.get("link"), n.get("ngay"), n.get("nguon") or "Tin tức")
        for e in (res.get("events") or []):
            _add(tk, e.get("tieu_de"), e.get("link") or e.get("source_url"),
                 e.get("ngay"), "Sự kiện")
        ab = res.get("answer_box") or {}
        if ab.get("answer") and ab.get("link"):
            _add(tk, ab.get("answer"), ab.get("link"), "", "Web")
        for w in (res.get("results") or []):
            _add(tk, w.get("title"), w.get("link"), w.get("date"), "Web")
        if tool == "read_article":
            _add(tk, res.get("tieu_de") or call.get("url"), call.get("url"), "", "Báo chí")
        # vnstock BCTC KHÔNG có trang đọc được → không đưa vào panel (user tự kiểm trên nền tảng dữ liệu).

    # Round-robin: lấy nguồn thứ i của TỪNG mã (≤ per_ticker/mã) → mọi mã đều xuất hiện sớm
    capped = {tk: lst[:per_ticker] for tk, lst in buckets.items()}
    out: list[dict] = []
    i = 0
    while len(out) < cap and any(i < len(capped[tk]) for tk in order):
        for tk in order:
            if i < len(capped[tk]):
                out.append(capped[tk][i])
                if len(out) >= cap:
                    break
        i += 1
    return out


def thinking_plan() -> list[dict]:
    """Kế hoạch tĩnh cho trạng thái 'đang nghiên cứu' (chưa stream realtime được).
    Trả 4 dòng: Hiểu ✓ · Lập kế hoạch ✓ · ⟳ Nghiên cứu & phân tích · Tổng hợp."""
    return [
        _activity("understand", ""),
        _activity("plan", ""),
        {"key": "research", "icon": "activity",
         "label": "Nghiên cứu dữ liệu & phân tích", "detail": "", "count": 0},
        _activity("synthesize", ""),
    ]


def streaming_state(calls: list) -> tuple[list, int]:
    """
    Cho LiveTimeline streaming realtime: từ các tool call ĐÃ THẤY tới hiện tại,
    dựng timeline + chỉ số dòng đang chạy (⟳). understand/plan ✓, các phase đã có
    call ✓ trừ phase mới nhất = đang chạy, synthesize ○ (chờ).
    """
    if not calls:
        return thinking_plan(), 2
    acts = group_activities(calls)          # [understand, plan, <real…>, synthesize]
    running_idx = len(acts) - 2             # phase thật cuối cùng = đang chạy
    return acts, max(running_idx, 2)


def run_summary(tool_calls: list) -> dict:
    """Tóm tắt 1 dòng cho Layer 1: số hoạt động, số bước, các nguồn đã dùng."""
    acts = [a for a in group_activities(tool_calls)
            if a["count"] > 0 or a["key"] in ("understand", "plan", "synthesize")]
    sources: list[str] = []
    for call in (tool_calls or []):
        meta = TOOL_META.get((call or {}).get("tool", ""))
        s = meta.get("source") if meta else None
        if s and s not in sources:
            sources.append(s)
    return {
        "activity_count": len([a for a in acts if a["count"] > 0]) or len(acts),
        "step_count": len(tool_calls or []),
        "sources": sources,
    }
