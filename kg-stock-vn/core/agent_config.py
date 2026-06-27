"""
agent_config.py
---------------
Source of truth duy nhất cho cấu hình AI Agent:
  - Danh sách model + fallback
  - System instruction
  - Bộ tools (4 tools)

Facade trung tâm — import bởi app.py, analysis_orchestrator, evals, pages.
"""

import os
import re
import sys
import io
import contextlib
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

from core import analysis_knowledge   # KHO TRI THỨC PHÂN TÍCH (knowledge cards evergreen — dễ scale)

load_dotenv()

# VNSTOCK Community API key: nâng rate-limit 20→60 request/phút (giảm mạnh chờ rate-limit khi
# phân tích sâu/so sánh nhiều mã). Bridge .env → vnai (lưu ~/.vnstock/api_key.json). Idempotent,
# chặn banner stdout, lỗi KHÔNG làm vỡ import (vnai/key thiếu thì degrade về gói Khách 20/phút).
_VNSTOCK_KEY = os.getenv("VNSTOCK_API_KEY", "").strip()
if _VNSTOCK_KEY:
    try:
        import vnai
        with contextlib.redirect_stdout(io.StringIO()):
            vnai.setup_api_key(_VNSTOCK_KEY)
    except Exception:
        pass

# ============================================================
# MODEL CONFIG
# ============================================================
# Danh mục model cho người dùng tự chọn trên khung chat.
# Thứ tự = thứ tự hiển thị + thứ tự fallback khi model đang dùng hết hạn mức (quota).
GEMINI_MODEL_OPTIONS = [
    {"id": "gemini-3.5-flash",      "label": "Gemini 3.5 Flash",      "short": "3.5 Flash",
     "note": "Mạnh nhất · suy luận sâu"},
    {"id": "gemini-2.5-flash",      "label": "Gemini 2.5 Flash",      "short": "2.5 Flash",
     "note": "Cân bằng tốc độ & chất lượng"},
    {"id": "gemini-3.1-flash-lite", "label": "Gemini 3.1 Flash Lite", "short": "Flash Lite",
     "note": "Câu trả lời nhanh nhất · free 500 lượt/ngày"},
]
GEMINI_MODELS      = [o["id"] for o in GEMINI_MODEL_OPTIONS]
GEMINI_DEFAULT_IDX = 2  # Flash Lite — bền vững nhất cho free tier (mặc định)
GEMINI_DEFAULT     = GEMINI_MODELS[GEMINI_DEFAULT_IDX]

# Hằng số đặc-thị-trường (rổ theo dõi, taxonomy ngành/vĩ mô, tham số định giá) giờ thuộc HỒ SƠ
# THỊ TRƯỜNG (markets/vn/config.py) để scale đa-thị-trường. Re-export tên cũ (facade).
from markets.vn.config import (
    TOP_10_TICKERS,
    SECTOR_IDS, SECTOR_ALIASES as _SECTOR_ALIASES,
    MACRO_IDS, MACRO_ALIASES as _MACRO_ALIASES,
    VN_CONFIG as _MKT,
)


def _is_plausible_ticker(t: str) -> bool:
    """Mã CK Việt Nam hợp lệ về định dạng (HOSE/HNX: 3 ký tự chữ; cho phép 2-4)."""
    return t.isalpha() and 2 <= len(t) <= 4


# ── Bản đồ tên → entity_id cho NGÀNH và VĨ MÔ: SECTOR_IDS/_SECTOR_ALIASES/MACRO_IDS/_MACRO_ALIASES
#    nay ở markets/vn/config.py (re-export phía trên). ──


def _resolve(value: str, ids: set, aliases: dict) -> str | None:
    """Map chuỗi tự do (tên/keyword) hoặc entity_id → entity_id hợp lệ."""
    v = (value or "").strip()
    if v.upper() in ids:
        return v.upper()
    low = v.lower()
    if low in aliases:
        return aliases[low]
    for kw, eid in aliases.items():     # khớp một phần
        if kw in low:
            return eid
    return None

# ============================================================
# SYSTEM INSTRUCTION
# ============================================================
from core.prompts import (  # facade: prompts đã tách ra module riêng, re-export để không vỡ import cũ
    SYSTEM_INSTRUCTION, FINANCIAL_ANALYSIS_PLAYBOOK, get_system_instruction, get_lean_instruction,
)


# ============================================================
# GUARDRAIL: SANITIZE CITATION (chặn cứng trích dẫn không hợp lệ — xem mục 3A② prompt)
# ============================================================
# Bỏ các trích dẫn KHÔNG hợp lệ mà model lỡ in: (1) "[Knowledge Graph · …]"/tên node KG;
# (2) "(Trọng số 0.x)"; (3) "[get_market_overview/vnstock/query_* · ngày]" KHÔNG-link → "(cập nhật ngày)".
# KHÔNG đụng tới link web thật dạng [Nguồn · ngày](http…).
from core.sanitize import ensure_disclaimer, sanitize_citations  # facade (đã tách module sanitize)


# ============================================================
# LAZY SUPABASE CLIENT
# ============================================================
_supabase: Client | None = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_KEY"),
        )
    return _supabase


# ============================================================
# SUPPRESS VNSTOCK BANNER
# ============================================================
@contextlib.contextmanager
def _suppress_stdout():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        yield


def _is_rate_limit(e: BaseException) -> bool:
    m = str(e).lower()
    return any(k in m for k in ("rate limit", "exceeded", "20/20", "too many request", "429"))


def _vn_retry(fn, *args, _tries: int = 3, _wait: float = 4.0, **kwargs):
    """
    Gọi 1 hàm vnstock có khả năng dính RATE LIMIT (20 req/phút ở gói khách).
    vnstock có thể RAISE hoặc gọi sys.exit (SystemExit) khi quá hạn → bắt cả hai, retry backoff.
    Ném lại lỗi cuối nếu hết lượt thử để hàm gọi tự xử lý (trả error rõ ràng, KHÔNG bịa).
    """
    import time
    last = None
    for i in range(_tries):
        try:
            with _suppress_stdout():
                return fn(*args, **kwargs)
        except (Exception, SystemExit) as e:   # SystemExit: vnstock dùng khi rate-limit
            last = e
            if _is_rate_limit(e) and i < _tries - 1:
                time.sleep(_wait * (i + 1))     # 4s, 8s…
                continue
            raise
    if last:
        raise last


# ============================================================
# TOOL 1: query_graph_database
# ============================================================
def query_graph_database(ticker: str) -> dict:
    """
    Truy vấn Knowledge Graph trên Supabase để lấy toàn bộ mạng lưới
    quan hệ tài chính của một mã cổ phiếu trong vòng 2 bước nhảy (2-hop).
    Trả về nodes, edges, summary và các chỉ số cơ bản.

    Args:
        ticker: Mã cổ phiếu (HPG, VCB, FPT, VHM, VIC, TCB, BID, MSN, VNM, MWG).
    """
    t = ticker.strip().upper()
    # Cổng MỀM: mã có node trong KG (đã seed, không chỉ Top 10) → truy quan hệ 2-hop; mã ngoài KG →
    # KHÔNG chặn cứng mà trỏ sang query_stock_sector_context (KG cấp NGÀNH chạy cho MỌI mã).
    try:
        _in_kg = (get_supabase().table("graph_nodes").select("entity_id")
                  .eq("entity_id", t).eq("entity_type", "STOCK").limit(1).execute().data)
    except Exception:
        _in_kg = None
    if not _in_kg:
        return {
            "error": f"Mã '{t}' chưa có trong đồ thị quan hệ 2-hop. Dùng query_stock_sector_context "
                     f"(ngành + Beta + driver vĩ mô — chạy cho mọi mã) / get_financial_statements / "
                     f"web_search cho mã này.",
            "status": "NOT_IN_KG",
        }
    try:
        r = get_supabase().rpc("get_financial_network", {"ticker_input": t}).execute()
        return r.data or {"error": "Không có dữ liệu", "status": "EMPTY"}
    except Exception as e:
        return {"error": str(e), "status": "DB_ERROR"}


# ============================================================
# TOOL 5: get_stock_news_timeline
# ============================================================
def get_stock_news_timeline(ticker: str, days_back: int = 90) -> dict:
    """
    Lấy DÒNG THỜI GIAN sự kiện/tin tức gần đây của một cổ phiếu từ Temporal
    Knowledge Graph (các cạnh data_source='news'), sắp xếp mới → cũ.
    Mỗi sự kiện kèm observed_at, sentiment (relationship), confidence,
    source_url và evidence_quote (tiêu đề gốc) để Agent TRÍCH DẪN NGUỒN.

    Dùng khi người dùng hỏi về tin tức, sự kiện, diễn biến gần đây của 1 mã.

    Args:
        ticker:    Mã cổ phiếu (HPG, VCB, FPT ...).
        days_back: Số ngày nhìn lại (mặc định 90).
    """
    t = ticker.strip().upper()
    if not _is_plausible_ticker(t):
        return {"error": f"Mã '{t}' không hợp lệ.", "status": "INVALID"}
    try:
        r = get_supabase().rpc(
            "get_stock_timeline",
            {"ticker_input": t, "days_back": int(days_back)},
        ).execute()
        return r.data or {"error": "Không có dữ liệu", "status": "EMPTY"}
    except Exception as e:
        return {"error": str(e), "status": "DB_ERROR"}


def _read_news_table(ticker: str, days_back: int = 120, limit: int = 20) -> list:
    """Đọc tin từ bảng news_articles (1 query có index → NHANH). Trả [] nếu bảng chưa có/lỗi."""
    from datetime import timedelta
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
        r = (get_supabase().table("news_articles")
             .select("title,url,source,published_at,sentiment,confidence,ai_reason,tags")
             .eq("ticker", ticker.upper()).gte("published_at", cutoff)
             .order("published_at", desc=True).limit(limit).execute())
        return r.data or []
    except Exception:
        return []


def _save_news_to_table(collected: list, extractions: list) -> None:
    """Ghi tin vừa crawl vào bảng news_articles (MỌI mã, kể cả ngoài Top-10). Best-effort."""
    try:
        from data.sync_vietstock_news import upsert_news_to_table
        upsert_news_to_table(collected, extractions, verbose=False)
    except Exception:
        pass


# ============================================================
# TOOL 15: get_stock_news — TỔNG HỢP TIN 1 MÃ TỪ NHIỀU NGUỒN (tự leo thang)
# ============================================================
def get_stock_news(ticker: str, max_items: int = 8, recent_days: int = 0) -> dict:
    """
    Lấy TIN TỨC của MỘT cổ phiếu — tự động GOM TỪ NHIỀU NGUỒN cho tới khi ĐỦ, không bỏ sót:
      (1) Knowledge Graph (tin đã lưu, nhanh/free) →
      (2) nếu chưa đủ: crawl Vietstock trực tiếp →
      (3) nếu vẫn chưa đủ: Google News (web, per-ticker, mới nhất).
    Tự dừng khi đủ `max_items` (CIRCUIT BREAKER: tối đa 3 nguồn, không lặp vô hạn → tiết kiệm token).
    Dedup theo tiêu đề, trả tin kèm link + ngày + nguồn.

    LUÔN DÙNG tool này khi hỏi "tin tức về [1 mã]" — thay cho việc gọi rời từng nguồn.
    Khi user hỏi tin theo MỐC THỜI GIAN (hôm nay/tuần/tháng…) → TRUYỀN `recent_days` (1=hôm nay,
    7=tuần, 30=tháng): nếu Vietstock/KG KHÔNG có tin trong mốc, tool TỰ ĐỘNG tìm thêm trên web.

    Args:
        ticker:      Mã cổ phiếu (HPG, FPT...).
        max_items:   Số tin mong muốn (mặc định 8).
        recent_days: Cửa sổ ngày user quan tâm (0=không lọc). Nếu >0 và không có tin trong cửa sổ
                     → tự web_search bổ sung tin tươi.
    """
    t = ticker.strip().upper()
    if not _is_plausible_ticker(t):
        return {"error": f"Mã '{t}' không hợp lệ.", "status": "INVALID"}
    want = max(3, min(int(max_items), 20))
    items, seen, sources_used = [], set(), []

    def _in_window_count() -> int:
        """Đếm tin có NGÀY nằm trong recent_days (cửa sổ user hỏi)."""
        if recent_days <= 0:
            return len(items)
        from datetime import date, timedelta
        cutoff = (date.today() - timedelta(days=int(recent_days))).isoformat()
        return sum(1 for it in items if (it.get("ngay") or "")[:10] >= cutoff)

    def _add(title, ngay, nguon, link, extra=None):
        if not title:
            return
        if not (link and str(link).startswith("http")):
            return   # CHẶN tin không có link THẬT (seed://, URL giả) — mọi tin phải trích nguồn được
        # DEDUP theo NỘI DUNG (tiêu đề chuẩn hoá) → gom tin cùng sự kiện từ nhiều nguồn
        # (bảng/KG/Vietstock/web) thành 1, kể cả khác cách giật tít/tiền tố mã.
        try:
            from data.sync_vietstock_news import normalize_title as _nt
            k = _nt(title)[:80] or title.strip().lower()[:60]
        except Exception:
            k = title.strip().lower()[:60]
        if k in seen:
            return
        seen.add(k)
        items.append({"tieu_de": title, "ngay": ngay, "nguon": nguon, "link": link, **(extra or {})})

    # (0) Bảng news_articles — NHANH NHẤT (1 query có index), cập nhật hàng ngày qua scheduler
    try:
        rows = _read_news_table(t, 120, want + 2)
        for a in rows:
            _add(a.get("title"), (a.get("published_at") or "")[:10],
                 a.get("source") or "Vietstock", a.get("url"), {"tac_dong": a.get("sentiment")})
        sources_used.append(f"bảng:{len(rows)}")
    except Exception:
        pass

    # (1) KG — tin đã lưu (free, nhanh) — chỉ khi bảng CHƯA ĐỦ
    if len(items) < want:
        try:
            kg = get_stock_news_timeline(t, 120)
            for e in (kg.get("events") or []):
                _add(e.get("evidence_quote") or e.get("counterpart_name"), (e.get("observed_at") or "")[:10],
                     "Vietstock (KG)", e.get("source_url"), {"tac_dong": e.get("relationship")})
            sources_used.append(f"KG:{len(kg.get('events') or [])}")
        except Exception:
            pass

    # (2) Vietstock crawl TRỰC TIẾP — CHẬM (~12s) → CHỈ khi bảng+KG gần như RỖNG (<4 tin).
    if len(items) < 4:
        try:
            fr = fetch_fresh_news(t, 21)
            for e in (fr.get("events") or []):
                _add(e.get("title"), (e.get("observed_at") or "")[:10], "Vietstock",
                     e.get("source_url"), {"tac_dong": e.get("sentiment")})
            sources_used.append(f"Vietstock:{len(fr.get('events') or [])}")
        except Exception:
            pass

    # (3) Google News (web) — bổ sung tin TƯƠI khi: chưa đủ số · user hỏi theo MỐC mà cửa sổ trống ·
    #     HOẶC tin mới nhất đã CŨ >3 ngày (lưới an toàn freshness — KHÔNG phụ thuộc model truyền tham số).
    from datetime import date as _date, timedelta as _td
    _newest = max((it.get("ngay") or "")[:10] for it in items) if items else ""
    _stale = (not _newest) or (_newest < (_date.today() - _td(days=3)).isoformat())
    _need_recent = (recent_days > 0 and _in_window_count() < 2)
    if len(items) < want or _need_recent or _stale:
        try:
            ws = web_search(f"cổ phiếu {t} tin tức mới nhất", num_results=6, news=True, recent=True)
            for r in (ws.get("results") or []):
                _add(r.get("title"), r.get("date"), r.get("source"), r.get("link"))
            sources_used.append(f"web:{len(ws.get('results') or [])}")
        except Exception:
            pass

    return {
        "ticker": t, "count": len(items[:want]), "news": items[:want],
        "nguon": sources_used, "status": "OK" if items else "NO_NEWS",
    }


# ============================================================
# TOOL 16: query_news — TRA CỨU TIN theo BỘ LỌC (scope/ngành/sentiment/nhãn)
# ============================================================
def query_news(scope: str = None, sector: str = None, ticker: str = None,
               sentiment: str = None, tag: str = None, days: int = 30,
               limit: int = 15) -> dict:
    """
    Tra cứu TIN TỨC theo BỘ LỌC từ bảng news_articles (CHỈ chứa tin TÁC ĐỘNG thật +/-,
    đã bỏ tin trung lập/thủ tục). Dùng cho câu hỏi cấp CHỦ ĐỀ / NGÀNH / VĨ MÔ, vd:
      "tin vĩ mô tác động tiêu cực tuần này", "tin tích cực ngành thép tháng này",
      "tin nợ xấu ngành ngân hàng", "tin M&A gần đây".
    (Hỏi tin của 1 MÃ cụ thể → vẫn dùng get_stock_news.)

    Args:
        scope:     'macro' (vĩ mô) | 'sector' (ngành) | 'stock' (doanh nghiệp). Bỏ trống = tất cả.
        sector:    Tên ngành (Thép, Ngân hàng, Bất động sản, Dầu khí, Chứng khoán...).
        ticker:    Mã cổ phiếu (nếu muốn lọc theo 1 mã).
        sentiment: 'tích cực'/'positive' hoặc 'tiêu cực'/'negative'.
        tag:       Nhãn chủ đề: cổ tức, "kết quả kinh doanh", "nợ xấu/dự phòng", margin,
                   "nhân sự/lãnh đạo", "M&A/hợp tác", "hợp đồng/dự án", "khối ngoại"...
        days:      Số ngày nhìn lại (mặc định 30).
        limit:     Số tin tối đa (mặc định 15, tối đa 30).
    """
    from datetime import timedelta
    sb = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))).isoformat()
    _sent_map = {
        "positive": "AFFECTS_POSITIVE", "tích cực": "AFFECTS_POSITIVE", "tốt": "AFFECTS_POSITIVE",
        "negative": "AFFECTS_NEGATIVE", "tiêu cực": "AFFECTS_NEGATIVE", "xấu": "AFFECTS_NEGATIVE",
    }
    sent = _sent_map.get((sentiment or "").strip().lower()) if sentiment else None
    lim = min(max(int(limit), 1), 30)
    cols = "title,url,source,ticker,sector,scope,sentiment,confidence,ai_reason,tags,published_at"

    def _run(with_scope: bool):
        c = cols if with_scope else cols.replace(",scope", "")
        q = sb.table("news_articles").select(c)
        if ticker:           q = q.eq("ticker", ticker.strip().upper())
        if sector:           q = q.ilike("sector", f"%{sector.strip()}%")
        if with_scope and scope: q = q.eq("scope", scope.strip().lower())
        if sent:             q = q.eq("sentiment", sent)
        if tag:              q = q.contains("tags", [tag.strip()])
        return q.gte("published_at", cutoff).order("published_at", desc=True).limit(lim).execute()

    try:
        r = _run(True)
    except Exception:
        try:
            r = _run(False)   # cột scope chưa có (chưa chạy migration_news_scope.sql)
        except Exception as e:
            return {"error": str(e), "status": "DB_ERROR",
                    "luu_y": "Cần chạy migration_news_table.sql (+ migration_news_scope.sql) trên Supabase."}
    _vi = {"AFFECTS_POSITIVE": "tích cực", "AFFECTS_NEGATIVE": "tiêu cực"}
    news = [{
        "tieu_de": x.get("title"), "ngay": (x.get("published_at") or "")[:10],
        "nguon": x.get("source"), "link": x.get("url"),
        "ma": x.get("ticker"), "nganh": x.get("sector"), "pham_vi": x.get("scope"),
        "tac_dong": _vi.get(x.get("sentiment"), x.get("sentiment")),
    } for x in (r.data or []) if (x.get("url") or "").startswith("http")]   # CHẶN URL giả + bỏ field thừa
    return {"count": len(news), "news": news, "status": "OK" if news else "EMPTY"}


# ============================================================
# TOOL 17: query_events — TRUY VẤN EVENT GRAPH (KG v2): sự kiện + tác động
# ============================================================
_DIRECTION_MAP = {"positive": "POSITIVE", "tích cực": "POSITIVE", "tốt": "POSITIVE",
                  "negative": "NEGATIVE", "tiêu cực": "NEGATIVE", "xấu": "NEGATIVE"}


def query_events(ticker: str = None, event_category: str = None, event_type: str = None,
                 direction: str = None, scope: str = None, min_materiality: float = 0.0,
                 days: int = 60, limit: int = 15) -> dict:
    """
    Truy vấn ĐỒ THỊ SỰ KIỆN (KG v2): các SỰ KIỆN đã được trích + dedupe, kèm TÁC ĐỘNG lên
    cổ phiếu (chiều +/-, độ mạnh, cơ chế) và thực thể tham gia. Khác get_stock_news (tin thô):
    đây là SỰ KIỆN có cấu trúc, gộp nhiều bài, xếp theo mức TRỌNG YẾU (materiality).

    Dùng khi hỏi: "sự kiện nào tác động tới [mã]?", "các sự kiện M&A/cổ tức gần đây",
    "rủi ro nào với ngành X", "sự kiện tích cực/tiêu cực tuần này".

    Args:
        ticker:          Lọc sự kiện CÓ TÁC ĐỘNG tới mã này (vd HPG).
        event_category:  Nhóm sự kiện: CORPORATE/EARNINGS/CAPITAL/GOVERNANCE/MA/REGULATORY/
                         MACRO/MARKET/SECTOR/RATING/RISK.
        event_type:      Mã loại sự kiện cụ thể (vd 'MA.PARTNERSHIP', 'CAPITAL.DIVIDEND').
        direction:       'tích cực'/'positive' hoặc 'tiêu cực'/'negative' (chiều tác động).
        scope:           'company'/'sector'/'macro'.
        min_materiality: Chỉ lấy sự kiện trọng yếu >= ngưỡng (0..1).
        days:            Số ngày nhìn lại (mặc định 60). limit: số sự kiện (mặc định 15).
    """
    from datetime import timedelta
    sb = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))).isoformat()
    lim = min(max(int(limit), 1), 30)
    dirn = _DIRECTION_MAP.get((direction or "").strip().lower()) if direction else None

    try:
        # (1) Nếu lọc theo mã → tìm event_id từ event_impacts (mã = CO_<ticker>)
        only_ids = None
        if ticker:
            eid = f"CO_{ticker.strip().upper()}"
            iq = sb.table("event_impacts").select("event_id,direction").eq("entity_id", eid)
            if dirn:
                iq = iq.eq("direction", dirn)
            rows = iq.execute().data
            only_ids = list({r["event_id"] for r in rows})
            if not only_ids:
                return {"count": 0, "events": [], "status": "EMPTY",
                        "ghi_chu": f"Chưa có sự kiện nào trong KG tác động tới {ticker} (thử get_stock_news)."}

        # (2) Lọc theo category → đổi sang danh sách event_type
        type_codes = None
        if event_category:
            tc = sb.table("event_taxonomy").select("code").eq("category", event_category.strip().upper())\
                   .not_.is_("parent_code", "null").execute().data
            type_codes = [r["code"] for r in tc]

        q = sb.table("events").select(
            "event_id,event_type,scope,title,summary,occurred_at,sentiment,materiality,primary_source_url,source_article_ids")
        if only_ids is not None:
            q = q.in_("event_id", only_ids)
        # direction KHÔNG kèm ticker → lọc theo SENTIMENT tổng của sự kiện (tích cực/tiêu cực)
        if dirn and not ticker:
            q = q.eq("sentiment", dirn)
        if event_type:
            q = q.eq("event_type", event_type.strip())
        elif type_codes:
            q = q.in_("event_type", type_codes)
        if scope:
            q = q.eq("scope", scope.strip().lower())
        if min_materiality:
            q = q.gte("materiality", float(min_materiality))
        evs = q.gte("occurred_at", cutoff).order("materiality", desc=True)\
               .order("occurred_at", desc=True).limit(lim).execute().data
        if not evs:
            return {"count": 0, "events": [], "status": "EMPTY",
                    "ghi_chu": "Không có sự kiện khớp bộ lọc trong KG."}

        ev_ids = [e["event_id"] for e in evs]
        # impacts + tên loại + tên thực thể (batch)
        impacts = sb.table("event_impacts").select("event_id,entity_id,direction,mechanism").in_("event_id", ev_ids).execute().data
        ent_ids = list({i["entity_id"] for i in impacts})
        ents = sb.table("entities").select("entity_id,canonical_name,ticker").in_("entity_id", ent_ids).execute().data if ent_ids else []
        ename = {e["entity_id"]: (e.get("ticker") or e.get("canonical_name")) for e in ents}
        tnames = {r["code"]: r["name_vi"] for r in sb.table("event_taxonomy").select("code,name_vi").execute().data}
        _vi = {"POSITIVE": "tích cực", "NEGATIVE": "tiêu cực", "NEUTRAL": "trung lập"}

        out = []
        for e in evs:
            eid = e["event_id"]
            out.append({
                "loai_su_kien": tnames.get(e["event_type"], e["event_type"]),
                "tieu_de": e["title"], "ngay": (e.get("occurred_at") or "")[:10],
                "tac_dong_tong": _vi.get(e.get("sentiment"), e.get("sentiment")),
                "trong_yeu": e.get("materiality"),
                "link": e["primary_source_url"] if str(e.get("primary_source_url") or "").startswith("http") else None,
                # tác động lượng hóa (giữ — đây là giá trị cốt lõi); cap 5 mã/sự kiện
                "tac_dong": [{"thuc_the": ename.get(i["entity_id"], i["entity_id"]),
                              "chieu": _vi.get(i["direction"], i["direction"]),
                              "co_che": i.get("mechanism")}
                             for i in impacts if i["event_id"] == eid][:5],
            })
        return {"count": len(out), "events": out, "status": "OK"}
    except Exception as e:
        return {"error": str(e), "status": "DB_ERROR",
                "luu_y": "Cần đã chạy migration_kg_v2.sql + seed_kg_v2.py + extract_events.py."}


# ============================================================
# TOOL 6: fetch_fresh_news — CRAWL TRỰC TIẾP Vietstock theo yêu cầu
# ============================================================
def fetch_fresh_news(ticker: str, days_back: int = 14) -> dict:
    """
    CRAWL TRỰC TIẾP tin tức mới nhất của một mã từ Vietstock (KHÔNG chỉ đọc cache
    trong Knowledge Graph), trích xuất có cấu trúc bằng AI, LƯU vào KG, rồi trả về
    danh sách sự kiện kèm nguồn (tiêu đề thật + link + ngày + sentiment + độ tin cậy).

    Dùng khi: người dùng hỏi tin tức/diễn biến gần đây và cần dữ liệu MỚI hoặc cửa sổ
    DÀI hơn (vd 1 tháng), HOẶC khi get_stock_news_timeline trả về quá ít/không có.

    Args:
        ticker:    Mã cổ phiếu (HPG, VCB, FPT ...).
        days_back: Số ngày nhìn lại (mặc định 14, tối đa 30 để giữ tốc độ phản hồi).
    """
    import time as _time
    import requests as _requests
    from datetime import date as _date, timedelta as _timedelta

    t = ticker.strip().upper()
    if not _is_plausible_ticker(t):
        return {"error": f"Mã '{t}' không hợp lệ.", "status": "INVALID"}

    try:
        from data.sync_vietstock_news import (
            VIETSTOCK_API, VIETSTOCK_SITE, API_HEADERS, ITEMS_PER_PAGE,
            parse_vietstock_time, extract_batch, upsert_news_to_graph,
        )
    except Exception as e:
        return {"error": f"Không nạp được pipeline tin tức: {e}", "status": "ERROR"}

    from concurrent.futures import ThreadPoolExecutor

    days        = max(1, min(int(days_back), 30))    # chặn trần 30 ngày
    PAGE_BUDGET = 16                                 # ngân sách trang nhỏ (phản hồi ~12-15s)
    cutoff      = _date.today() - _timedelta(days=days)

    def _fetch_page(page: int) -> list:
        try:
            resp = _requests.post(
                VIETSTOCK_API,
                json={"item": ITEMS_PER_PAGE, "martket": "1", "row": page},
                headers=API_HEADERS, timeout=20,
            )
            d = resp.json()
            return d.get("Data") or [] if d.get("Code") == 200 else []
        except Exception:
            return []

    # Tải song song PAGE_BUDGET trang (nhanh hơn nhiều so với tuần tự)
    all_articles: list = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for data in ex.map(_fetch_page, range(1, PAGE_BUDGET + 1)):
            all_articles.extend(data)

    collected: list[dict] = []
    oldest_reached = None
    for art in all_articles:
        pub = parse_vietstock_time(art.get("PublishTime", ""))
        if not pub:
            continue
        if oldest_reached is None or pub.date() < oldest_reached:
            oldest_reached = pub.date()
        if pub.date() < cutoff:
            continue
        if art.get("StockCode", "").strip().upper() != t:
            continue
        url = art.get("URL", "")
        if url and not url.startswith("http"):
            url = VIETSTOCK_SITE + url
        collected.append({
            "ticker": t, "title": art.get("Title", "").strip(),
            "published_at": pub.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "url": url, "source": "Vietstock",
            "close_price": art.get("ClosePrice"), "pct_change": art.get("PerChange"),
        })

    # Độ phủ thực tế: PAGE_BUDGET trang gần nhất chỉ lùi tới oldest_reached.
    covered_note = (f"Đã quét {PAGE_BUDGET} trang tin mới nhất toàn thị trường "
                    f"(lùi tới ~{oldest_reached}).") if oldest_reached else ""

    if not collected:
        return {
            "ticker": t, "days_back": days, "events": [], "status": "NO_NEWS",
            "note": f"Không thấy tin của {t} trong {PAGE_BUDGET} trang gần nhất. {covered_note} "
                    f"Để lấy lịch sử sâu hơn, hãy chạy đồng bộ tin (sync_vietstock_news.py).",
        }

    # Trích xuất có cấu trúc (theo lô 12) + lưu vào KG để lần sau đọc nhanh
    extractions: list[dict] = []
    for i in range(0, len(collected), 12):
        extractions.extend(extract_batch(collected[i:i + 12]))
    # Mirror tin → KG-event-graph cho MỌI mã CÓ NODE trong KG (không còn giới hạn Top 10 — đảm bảo
    # tính khách quan/đồng đều). Mã chưa có node → bỏ qua (tránh edge mồ côi); tin vẫn lưu news_articles.
    saved = False
    try:
        _has_node = (get_supabase().table("graph_nodes").select("entity_id")
                     .eq("entity_id", t).eq("entity_type", "STOCK").limit(1).execute().data)
    except Exception:
        _has_node = None
    if _has_node:
        try:
            upsert_news_to_graph(collected, extractions, min_confidence=0.0)
            saved = True
        except Exception:
            pass  # vẫn trả kết quả cho agent dù lưu KG lỗi
    # Lưu vào bảng news_articles cho MỌI mã (kể cả ngoài Top-10) → lần sau đọc nhanh, không crawl lại
    _save_news_to_table(collected, extractions)

    events = [
        {
            "observed_at":  a["published_at"][:10],
            "title":        a["title"],
            "sentiment":    e["sentiment"],
            "confidence":   e["confidence"],
            "source_url":   a["url"],
        }
        for a, e in zip(collected, extractions)
    ]
    events.sort(key=lambda x: x["observed_at"], reverse=True)
    return {
        "ticker": t, "days_back": days, "count": len(events),
        "pages_budget": PAGE_BUDGET, "oldest_reached": str(oldest_reached),
        "events": events, "status": "OK",
        "note": (f"Đã crawl trực tiếp Vietstock {len(events)} tin của {t}"
                 + (" & lưu vào KG. " if saved else " (mã ngoài Top 10 — không lưu KG). ")
                 + covered_note),
    }


def _fmt_macro_value(eid: str, props: dict) -> dict | None:
    """Trả {gia_tri_hien_tai, as_of} cho 1 MACRO node nếu có giá trị thực; None nếu trống."""
    v = props.get("value")
    if v in (None, "", "N/A"):
        v = props.get("sell")
    if v in (None, "", "N/A"):
        return None
    as_of = props.get("as_of", "") or ""
    pct_kw = ("LAI_SUAT", "CPI", "GDP", "TANG_TRUONG", "TIN_DUNG", "THUE")
    try:
        if eid == "TY_GIA_USD_VND":
            disp = f"{int(float(v)):,}".replace(",", ".") + " VND/USD"
        elif any(k in eid for k in pct_kw):
            disp = f"{v}%"
        else:
            disp = str(v)
    except (ValueError, TypeError):
        disp = str(v)
    return {"gia_tri_hien_tai": disp, "as_of": as_of}


def _enrich_macro_drivers(drivers: list) -> None:
    """Gắn GIÁ TRỊ THỰC hiện tại (+as_of) vào từng macro driver, đọc từ node MACRO.
    Sửa tại chỗ. Để agent nêu CON SỐ thật thay vì chỉ mô tả cơ chế (chống citation-theater)."""
    if not drivers:
        return
    ids = list({d.get("macro") for d in drivers if d.get("macro")})
    if not ids:
        return
    try:
        rows = get_supabase().table("graph_nodes").select("entity_id,properties")\
                 .eq("entity_type", "MACRO").in_("entity_id", ids).execute()
    except Exception:
        return
    vals = {}
    for r in (rows.data or []):
        fv = _fmt_macro_value(r["entity_id"], r.get("properties") or {})
        if fv:
            vals[r["entity_id"]] = fv
    for d in drivers:
        fv = vals.get(d.get("macro"))
        if fv:
            d["gia_tri_hien_tai"] = fv["gia_tri_hien_tai"]
            d["as_of"] = fv["as_of"]


def get_universe_tickers() -> list[str]:
    """UNIVERSE đầy đủ = mọi mã STOCK đã có trong KG (đã seed). Dùng cho batch sync tầng ĐẦY ĐỦ
    (khác `priority_tickers` chỉ là rổ ưu tiên sync thường xuyên). Mở rộng universe = chạy seed_universe."""
    try:
        rows = (get_supabase().table("graph_nodes").select("entity_id")
                .eq("entity_type", "STOCK").execute().data) or []
        return sorted(r["entity_id"] for r in rows)
    except Exception:
        return []


def _sector_stocks(sid: str) -> list:
    """TẦNG DỮ LIỆU: mã + Beta thuộc 1 ngành, lấy từ DB (graph_nodes STOCK). Shape khớp RPC cũ
    (beta là TEXT, sắp xếp beta_vnindex giảm dần). KG tri thức (markets/vn/knowledge) lo phần
    nhân-quả; hàm này chỉ lo dữ liệu khối lượng lớn (universe/Beta tính từ vnstock)."""
    try:
        rows = (get_supabase().table("graph_nodes").select("entity_id,name,properties")
                .eq("entity_type", "STOCK").execute().data) or []
    except Exception:
        return []
    out = []
    for r in rows:
        p = r.get("properties") or {}
        if p.get("sector") != sid:
            continue
        bv = p.get("beta_vnindex")
        out.append({"ticker": r["entity_id"], "name": r.get("name"),
                    "beta_vnindex": (str(bv) if bv is not None else None),
                    "beta_sector": (str(p["beta_sector"]) if p.get("beta_sector") is not None else None)})
    out.sort(key=lambda d: float(d["beta_vnindex"]) if d.get("beta_vnindex") else -1.0, reverse=True)
    return out


# ============================================================
# TOOL 8: query_sector_impact — Ngành ← các yếu tố vĩ mô + cổ phiếu (Beta)
# ============================================================
def query_sector_impact(sector: str) -> dict:
    """
    Lấy "bản đồ tác động" của MỘT NGÀNH: các yếu tố VĨ MÔ (trong nước + quốc tế) tác
    động đến ngành (kèm dấu +/-, trọng số, độ trễ, cơ chế) và DANH SÁCH CỔ PHIẾU thuộc
    ngành kèm hệ số BETA (mức nhạy so với VN-Index). Dùng để suy luận:
    cú sốc vĩ mô → ngành → cổ phiếu nào nhạy mạnh/yếu hơn (Beta cao = biến động mạnh hơn).

    Args:
        sector: Tên ngành tiếng Việt (vd "ngân hàng", "bất động sản", "thép", "chứng khoán")
                hoặc entity_id (vd "SECTOR_BANKING").
    """
    sid = _resolve(sector, SECTOR_IDS, _SECTOR_ALIASES)
    if not sid:
        return {"error": f"Không nhận diện được ngành '{sector}'. Ngành hợp lệ: "
                         f"ngân hàng, bất động sản, chứng khoán, thép, tiêu dùng, công nghệ, "
                         f"dầu khí, điện, KCN, thủy sản, xây dựng, hàng không, bảo hiểm.",
                "status": "UNKNOWN_SECTOR"}
    try:
        # TẦNG TRI THỨC: bản đồ nhân-quả vĩ mô×ngành từ KG IN-MEMORY (markets/vn/knowledge.py),
        # KHÔNG còn RPC Supabase. TẦNG DỮ LIỆU: mã + Beta vẫn lấy từ DB (_sector_stocks).
        from markets.vn.knowledge import VN_GRAPH
        data = VN_GRAPH.get_sector_network(sid, stocks=_sector_stocks(sid))
        if isinstance(data, dict) and data.get("macro_drivers"):
            _enrich_macro_drivers(data["macro_drivers"])
        return data
    except Exception as e:
        return {"error": str(e), "status": "GRAPH_ERROR"}


# ============================================================
# TOOL 9: query_macro_propagation — Cú sốc vĩ mô lan truyền tới đâu
# ============================================================
def query_macro_propagation(macro: str) -> dict:
    """
    Mô phỏng MỘT CÚ SỐC VĨ MÔ lan truyền: các yếu tố vĩ mô HẠ NGUỒN (chuỗi TRANSMITS_TO,
    vd Fed → DXY → tỷ giá → khẩu vị rủi ro) và các NGÀNH chịu tác động trực tiếp
    (kèm dấu/trọng số/cơ chế). Dùng khi câu hỏi bắt đầu từ một biến vĩ mô.

    Args:
        macro: Tên yếu tố vĩ mô (vd "Fed", "lãi suất", "tỷ giá", "giá dầu", "thuế Mỹ",
               "đầu tư công", "FTSE") hoặc entity_id (vd "LAI_SUAT_FED").
    """
    mid = _resolve(macro, MACRO_IDS, _MACRO_ALIASES)
    if not mid:
        return {"error": f"Không nhận diện được yếu tố vĩ mô '{macro}'.",
                "status": "UNKNOWN_MACRO"}
    try:
        # Lan truyền vĩ mô từ KG IN-MEMORY (tri thức chuyên gia, markets/vn/knowledge.py).
        from markets.vn.knowledge import VN_GRAPH
        data = VN_GRAPH.get_macro_propagation(mid)
        if isinstance(data, dict):
            for _k in ("macro_drivers", "affected_sectors", "transmits_to"):
                if isinstance(data.get(_k), list):
                    _enrich_macro_drivers(data[_k])
        return data
    except Exception as e:
        return {"error": str(e), "status": "GRAPH_ERROR"}


_TICKER_SECTOR_CACHE: dict = {}

def _resolve_sector_for_ticker(t: str) -> dict | None:
    """Suy ra NGÀNH (+tên, vốn hóa, Beta mặc định) cho MÃ BẤT KỲ ngoài KG — qua vnstock company ICB.
    Cho phép mở CẢ THỊ TRƯỜNG: KG cấp NGÀNH nên chỉ cần biết ngành là suy luận vĩ mô→ngành→mã được.
    Read THUẦN (không ghi DB), cache trong phiên. None nếu không xác định được."""
    t = t.upper()
    if t in _TICKER_SECTOR_CACHE:
        return _TICKER_SECTOR_CACHE[t]
    res = None
    try:
        import contextlib, io
        from vnstock.api.company import Company
        with contextlib.redirect_stdout(io.StringIO()):
            ov = Company(symbol=t, source="VCI").overview()
        row = ov.iloc[0] if (ov is not None and not ov.empty) else None
        if row is not None:
            icb = str(row.get("sector") or "").strip()
            name = str(row.get("short_name") or row.get("organ_name") or t)[:120]
            mct = None
            try:
                mc = row.get("market_cap")
                mct = round(float(mc) / 1e12, 2) if mc else None
            except Exception:
                pass
            res = {"sector": _MKT.icb_sector_map.get(icb), "name": name, "icb": icb,
                   "beta_vnindex": 1.0, "beta_source": "default", "market_cap_trillion": mct}
    except (Exception, SystemExit):   # vnai có thể sys.exit khi rate-limit → nuốt, degrade
        res = None
    _TICKER_SECTOR_CACHE[t] = res
    return res


# ============================================================
# TOOL 10: query_stock_sector_context — Cổ phiếu → ngành + Beta + driver vĩ mô
# ============================================================
def query_stock_sector_context(ticker: str) -> dict:
    """
    Cho MỘT CỔ PHIẾU: trả về ngành của nó, hệ số BETA, và bản đồ vĩ mô tác động đến ngành
    đó. Dùng để suy luận tác động vĩ mô lên cổ phiếu cụ thể: tác_động(cổ phiếu) ≈
    tín_hiệu(ngành) × Beta. Beta>1 → nhạy hơn ngành/thị trường; Beta<1 → phòng thủ hơn.

    Args:
        ticker: Mã cổ phiếu (vd HPG, VHM, SSI, VPB...).
    """
    t = ticker.strip().upper()
    if not _is_plausible_ticker(t):
        return {"error": f"Mã '{t}' không hợp lệ.", "status": "INVALID"}
    try:
        node = get_supabase().table("graph_nodes").select("entity_id,name,properties")\
                 .eq("entity_id", t).eq("entity_type", "STOCK").execute()
        beta_note = None
        if node.data:                       # FAST PATH: mã đã trong KG (ngành/Beta đã tính)
            props = node.data[0].get("properties") or {}
            name = node.data[0]["name"]
        else:                               # MỌI MÃ ngoài KG: suy ngành on-demand (mở cả thị trường)
            r = _resolve_sector_for_ticker(t)
            if not r or not r.get("sector"):
                # không map được ngành → degrade graceful (vẫn báo OK cấp tối thiểu để dùng web_search),
                # KHÔNG chặn cứng như trước. macro context bỏ trống.
                return {"ticker": t, "name": (r or {}).get("name") or t,
                        "sector": None, "beta_vnindex": None, "beta_source": None,
                        "status": "NO_SECTOR",
                        "luu_y": "Chưa map được NGÀNH cho mã này → dùng get_financial_statements + "
                                 "web_search('ngành của <mã>') để xác định ngành & bối cảnh vĩ mô."}
            props = {"sector": r["sector"], "beta_vnindex": r["beta_vnindex"],
                     "beta_source": r["beta_source"]}
            name = r["name"]
            beta_note = ("Beta = MẶC ĐỊNH 1.0 (mã chưa tính Beta thật) → tác động(mã) ≈ tín hiệu ngành "
                         "×1.0; coi như nhạy ngang trung bình ngành, KHÔNG nhấn mạnh Beta cao/thấp.")
        sector = props.get("sector")
        ctx = {
            "ticker": t, "name": name, "sector": sector,
            "beta_vnindex": props.get("beta_vnindex"),
            "beta_source": props.get("beta_source"),
            "status": "OK",
        }
        if sector:
            # Bản đồ vĩ mô của ngành từ KG IN-MEMORY (tri thức); Beta/sector của mã từ DB hoặc on-demand.
            from markets.vn.knowledge import VN_GRAPH
            sn = VN_GRAPH.get_sector_network(sector)
            if sn and not sn.get("error"):
                ctx["sector_name"] = (sn.get("sector") or {}).get("name")
                ctx["macro_drivers"] = sn.get("macro_drivers", [])
                _enrich_macro_drivers(ctx["macro_drivers"])
                ctx["luu_y"] = ("Mỗi macro driver có 'gia_tri_hien_tai' = GIÁ TRỊ THỰC hiện tại "
                                "(+as_of). BẮT BUỘC nêu con số này khi phân tích yếu tố đó, kèm ngày, "
                                "KHÔNG chỉ mô tả cơ chế. Driver thiếu giá trị → gọi get_market_overview/"
                                "get_commodity_prices/web_search để lấy số."
                                + (" " + beta_note if beta_note else ""))
        return ctx
    except Exception as e:
        return {"error": str(e), "status": "DB_ERROR"}


# ============================================================
# TOOL 7: web_search — TÌM KIẾM GOOGLE qua SerpAPI
# ============================================================
# NGUỒN PRIMARY báo tài chính VN uy tín — web_search ưu tiên (re-rank) các domain này.
from core.search_tools import (  # facade: web_search/read_article/nguồn đã tách module riêng
    _VN_PRIMARY_SOURCES, _INTL_PRIMARY_SOURCES, _SECTOR_SOURCE_HINT, _MACRO_SOURCE_MAP,
    _result_year, _clean_search_query, web_search, read_article,
)


# ============================================================
# TOOL 11: get_financial_statements — BÁO CÁO TÀI CHÍNH THẬT (vnstock)
# ============================================================
_BUSINESS_FRAMEWORK = {
    "ngan_hang": {
        "ten": "Ngân hàng",
        "chi_so_chinh": "NIM, CASA, tăng trưởng tín dụng, CIR, NPL (nợ xấu), bao phủ nợ xấu (LLR), CAR, LDR, ROE/ROA",
        "web_search_them": "NIM, CASA, tỷ lệ nợ xấu NPL, bao phủ nợ xấu, CAR, tăng trưởng tín dụng (báo cáo phân tích/BCTC thuyết minh)",
        "luu_y": "KHÔNG dùng 'biên LN gộp'/'tồn kho'. 'Doanh thu' = Tổng thu nhập hoạt động (TOI).",
    },
    "chung_khoan": {
        "ten": "Công ty chứng khoán",
        "chi_so_chinh": "Dư nợ margin & margin/VCSH, thị phần môi giới, cơ cấu thu nhập (môi giới/margin/tự doanh), đòn bẩy, ROE",
        "web_search_them": "dư nợ cho vay margin, thị phần môi giới HOSE, cơ cấu tự doanh FVTPL (báo cáo ngành chứng khoán)",
        "luu_y": "Mô hình thu nhập: môi giới + lãi margin + tự doanh + IB. LN theo CHU KỲ thị trường.",
    },
    "bao_hiem": {
        "ten": "Công ty bảo hiểm",
        "chi_so_chinh": "Combined ratio (loss + expense ratio), tăng trưởng phí, hiệu suất đầu tư, dự phòng nghiệp vụ",
        "web_search_them": "combined ratio, loss ratio, doanh thu phí bảo hiểm, lợi nhuận đầu tư (báo cáo phân tích bảo hiểm)",
        "luu_y": "TÁCH lãi NGHIỆP VỤ bảo hiểm vs lãi ĐẦU TƯ — ở VN phần lớn LN từ đầu tư.",
    },
    "san_xuat_thuong_mai_dich_vu": {
        "ten": "Sản xuất / Thương mại / Dịch vụ",
        "chi_so_chinh": "Tăng trưởng DT&LNST, biên LN gộp/LNST, ROE/ROA/ROIC, vòng quay tồn kho & phải thu, chu kỳ tiền mặt, nợ vay ròng/EBITDA, CFO vs LNST",
        "web_search_them": "(thường BCTC đã đủ; web_search bối cảnh ngành/giá đầu vào nếu cần)",
        "luu_y": "Chú ý CHẤT LƯỢNG LỢI NHUẬN: CFO so với LNST, vốn lưu động.",
    },
}


def _classify_business(inc_df) -> str:
    """Nhận diện LOẠI HÌNH DN từ các dòng trên báo cáo KQKD (để áp đúng khung phân tích)."""
    try:
        items = " ".join(inc_df["item_en"].astype(str).str.lower().tolist())
    except Exception:
        return "san_xuat_thuong_mai_dich_vu"
    if any(k in items for k in ("net interest income", "interest and similar income",
                                 "provision for credit losses")):
        return "ngan_hang"
    if any(k in items for k in ("brokerage", "margin lending", "proprietary",
                                 "securities services", "underwriting service")):
        return "chung_khoan"
    if any(k in items for k in ("insurance premium", "net premium", "gross written premium",
                                 "reinsurance", "insurance claim", "claims and")):
        return "bao_hiem"
    return "san_xuat_thuong_mai_dich_vu"


_FIN_CACHE: dict = {}   # cache TTL get_financial_statements: {(ticker,period,target): (ts, result)}


def get_financial_statements(ticker: str, period: str = "quarter",
                             target_period: str = None) -> dict:
    """
    Lấy BÁO CÁO TÀI CHÍNH THẬT của một cổ phiếu từ vnstock, phủ TỚI 3 NĂM GẦN NHẤT (mặc định
    12 quý hoặc 4 năm): doanh thu, biên LN GỘP/EBIT/LNST (3 tầng), LNST + cổ đông mẹ, tài sản,
    vốn CSH, ROE/ROA từng năm + CAGR/PEG. Với DN SẢN XUẤT/DV còn có SNAPSHOT kỳ mới nhất: thanh
    khoản (current/quick ratio, vốn lưu động), nợ vay ròng (net cash/net debt), dòng tiền (CFO/LNST,
    CAPEX, FCF, biên FCF, cổ tức, mua lại CP) + định giá P/E·PEG·P/B·P/S·EV/EBITDA. Đơn vị: tỷ VND.
    → Đủ số để phân tích CHUYÊN SÂU 1 lần gọi (rule 7c), KHÔNG cần web_search số tài chính cơ bản.

    LUÔN DÙNG tool này khi hỏi số liệu/báo cáo tài chính, doanh thu, lợi nhuận, biên, tài sản…
    của một mã — KỂ CẢ một KỲ QUÁ KHỨ cụ thể trong 3 năm (truyền target_period). KHÔNG dùng
    web_search cho số liệu tài chính (web hay cũ). KHÔNG tự bịa/ước lượng — chỉ trả số có thật.

    Args:
        ticker:        Mã cổ phiếu (vd HAH, HPG, FPT...).
        period:        "quarter" (mặc định, theo quý) hoặc "year" (theo năm).
        target_period: (tùy chọn) một kỳ cụ thể muốn lấy trong 3 năm gần nhất, vd "2024-Q2"
                       (quý) hoặc "2023" (năm). Nếu kỳ này không có sẽ báo rõ, KHÔNG bịa.
    """
    import re, time as _t
    t = ticker.strip().upper()
    if not _is_plausible_ticker(t):
        return {"error": f"Mã '{t}' không hợp lệ.", "status": "INVALID"}
    period = "year" if str(period).lower().startswith("y") else "quarter"
    n_cover = 12 if period == "quarter" else 4   # ~3 năm

    # CACHE TTL: BCTC không đổi trong ngày → cache 15 phút giúp câu SO SÁNH/HỎI NỐI TIẾP không
    # phải fetch lại 7 call vnstock/mã (tránh chạm rate-limit 20/phút giữa chừng phân tích sâu).
    _ck = (t, period, (target_period or "").strip().upper())
    _hit = _FIN_CACHE.get(_ck)
    if _hit and (_t.time() - _hit[0]) < 900:
        return _hit[1]

    shares = None
    market_cap_ty = None
    price = None
    try:
        with _suppress_stdout():
            from vnstock.api.financial import Finance
            from vnstock.api.company import Company
            f = Finance(symbol=t, source="VCI")
        # VỐN HÓA/SỐ CP lấy TRƯỚC (định giá P/E·P/B·P/S là chỉ số quan trọng nhất) — đảm bảo
        # lấy được kể cả khi các call BCTC phía sau bị rate-limit throttle.
        try:
            ov = _vn_retry(Company(symbol=t, source="VCI").overview)
            if ov is not None and not ov.empty:
                row = ov.iloc[0]
                shares = float(row.get("issue_share")) if row.get("issue_share") else None
                mc = row.get("market_cap")
                market_cap_ty = round(float(mc) / 1e9, 1) if mc else None
                if shares and mc:
                    price = round(float(mc) / shares, 0)
        except (Exception, SystemExit):
            pass
        # retry khi rate-limit (20 req/phút gói khách) thay vì fail/bịa
        inc = _vn_retry(f.income_statement, period=period, lang="vi")
        bs  = _vn_retry(f.balance_sheet,  period=period, lang="vi")
        try:
            cf = _vn_retry(f.cash_flow, period=period, lang="vi")   # lưu chuyển tiền tệ → CFO
        except Exception:
            cf = None
        # QUÝ gần nhất (vnstock có ~4 quý = đúng cửa sổ TTM) → tính chỉ số TTM THẬT + kết quả
        # quý mới nhất (số CẬP NHẬT nhất, khớp với các nền tảng dữ liệu). Best-effort: nếu lỗi/
        # rate-limit thì degrade về tính theo năm, KHÔNG làm hỏng cả phân tích.
        if period == "quarter":
            incQ, bsQ, cfQ = inc, bs, cf
        else:
            try:
                incQ = _vn_retry(f.income_statement, period="quarter", lang="vi")
                bsQ  = _vn_retry(f.balance_sheet,  period="quarter", lang="vi")
            except (Exception, SystemExit):
                incQ = bsQ = None
            try:
                cfQ = _vn_retry(f.cash_flow, period="quarter", lang="vi")
            except (Exception, SystemExit):
                cfQ = None
    except (Exception, SystemExit) as e:
        msg = str(e)
        if _is_rate_limit(e):
            return {"error": "vnstock đang bị giới hạn tốc độ (rate limit 20 req/phút gói khách). "
                             "Thử lại sau ~30s hoặc dùng API key cộng đồng miễn phí (60 req/phút) "
                             "tại https://vnstocks.com/login.", "status": "RATE_LIMIT", "ticker": t}
        return {"error": msg, "status": "VNSTOCK_ERROR"}

    pat = re.compile(r"^\d{4}(-Q\d)?$")

    def data_cols(df):
        cols = [c for c in df.columns if isinstance(c, str) and pat.match(c)]
        return sorted(cols, reverse=True)   # mới nhất trước

    def row_val(df, col, keys):
        if df is None or col not in df.columns:
            return None
        m = df["item_en"].astype(str).str.lower()
        for k in keys:
            mask = m.str.contains(k, regex=False, na=False)
            if mask.any():
                v = df.loc[mask, col].values[0]
                try:
                    v = float(v)
                    return v if v == v else None   # loại NaN
                except (TypeError, ValueError):
                    return None
        return None

    BN = 1e9
    all_periods = data_cols(inc)                 # toàn bộ kỳ vnstock có
    inc_cols = all_periods[:n_cover]             # phủ ~3 năm
    # Nếu hỏi 1 kỳ quá khứ cụ thể, đảm bảo nó nằm trong tập trả về (nếu có thật)
    tp_norm = (target_period or "").strip().upper().replace(" ", "")
    target_status = None
    if tp_norm:
        if tp_norm in all_periods:
            if tp_norm not in inc_cols:
                inc_cols = inc_cols + [tp_norm]
            target_status = "FOUND"
        else:
            target_status = "NOT_AVAILABLE"
    by_period = []
    for c in inc_cols:
        # Doanh thu: DN thường = "net sales"; NGÂN HÀNG = thu nhập lãi thuần / tổng thu nhập HĐ
        rev = row_val(inc, c, ["net sales"])
        is_bank = False
        if rev is None:
            rev = row_val(inc, c, ["total operating income", "net interest income",
                                   "interest and similar income"])
            is_bank = rev is not None
        gp  = row_val(inc, c, ["gross profit"])
        op  = row_val(inc, c, ["operating profit/(loss)"])   # LN thuần HĐKD → biên EBIT
        npt = row_val(inc, c, ["net profit/(loss) after tax", "profit after tax", "net profit after tax"])
        # LN thuộc cổ đông CÔNG TY MẸ — dùng cho EPS/P/E (chuẩn), KHÔNG dùng tổng LNST
        par = row_val(inc, c, ["attributable to parent"])
        ta  = row_val(bs,  c, ["total assets"])
        eq  = row_val(bs,  c, ["owner's equity", "owners equity", "total equity"])
        cfo = row_val(cf, c, ["net cash inflows/(outflows) from operating",
                              "net cash flow from operating", "from operating activities"]) if cf is not None else None
        debt = (ta - eq) if (ta is not None and eq is not None) else None   # nợ phải trả
        prof = par if par is not None else npt   # LN cổ đông mẹ (ưu tiên) cho ROE/ROA
        rec = {
            "period":              c,
            "doanh_thu_thuan_ty":  round(rev / BN, 1) if rev else None,
            "loi_nhuan_gop_ty":    round(gp / BN, 1) if gp else None,
            "lnst_ty":             round(npt / BN, 1) if npt else None,
            "lnst_cd_me_ty":       round(par / BN, 1) if par else None,
            "bien_gop_pct":        round(gp / rev * 100, 1) if (gp and rev) else None,   # biên LN gộp
            "bien_ebit_pct":       round(op / rev * 100, 1) if (op and rev) else None,   # biên LN thuần HĐKD
            "bien_lnst_pct":       round(npt / rev * 100, 1) if (npt and rev) else None,
            "tong_tai_san_ty":     round(ta / BN, 1) if ta else None,
            "von_chu_so_huu_ty":   round(eq / BN, 1) if eq else None,
            "no_phai_tra_ty":      round(debt / BN, 1) if debt is not None else None,
            "no_tren_vcsh":        round(debt / eq, 2) if (debt is not None and eq) else None,
            "luu_chuyen_tien_hdkd_ty": round(cfo / BN, 1) if cfo is not None else None,  # CFO
            # ROE/ROA TÍNH ĐƯỢC theo TỪNG NĂM (đừng để N/A) — dùng LN/VCSH, LN/tài sản của chính kỳ đó
            "roe_pct":             round(prof / eq * 100, 1) if (prof and eq) else None,
            "roa_pct":             round(prof / ta * 100, 1) if (prof and ta) else None,
        }
        if is_bank:
            rec["ghi_chu_doanh_thu"] = "doanh thu = Tổng thu nhập hoạt động/TN lãi thuần (ngân hàng)"
        by_period.append(rec)

    # ── Chỉ số HEADLINE = TTM THẬT (4 quý gần nhất) + KẾT QUẢ QUÝ MỚI NHẤT ──────
    # Định giá/biên/ROE PHẢI phản ánh 12 THÁNG GẦN NHẤT (khớp các nền tảng dữ liệu như
    # Simplize/TCBS), KHÔNG dùng riêng năm dương lịch gần nhất — sẽ LỖI THỜI khi đã có quý
    # mới (vd HPG: P/E theo FY2025 = 13,3 nhưng theo TTM thật chỉ ~9,7). Ưu tiên dữ liệu QUÝ;
    # thiếu quý (rate-limit) → degrade về năm gần nhất. EPS/P/E dùng LN CỔ ĐÔNG MẸ + CP thật.
    loai = _classify_business(inc)   # phân loại SỚM để gate snapshot theo loại hình
    ratios = {}
    qcols = data_cols(incQ) if incQ is not None else []
    use_q = len(qcols) >= 4                          # đủ 4 quý mới tính TTM thật
    if use_q:
        s_inc, s_bs, s_cf, s_cols, bs_col = incQ, bsQ, cfQ, qcols[:4], qcols[0]
        ttm_label = f"TTM 4 quý ({qcols[3]} → {qcols[0]})"
    else:
        s_inc, s_bs, s_cf, s_cols = inc, bs, cf, inc_cols[:4]
        bs_col = inc_cols[0] if inc_cols else None
        ttm_label = (inc_cols[0] + " (năm — chưa có dữ liệu quý)") if inc_cols else None

    def _flow(df, keys):
        """Dòng FLOW: TTM = tổng 4 quý; nếu nguồn là NĂM thì lấy năm gần nhất."""
        if df is None or not s_cols:
            return None
        if not use_q:
            return row_val(df, s_cols[0], keys)             # năm gần nhất
        vals = [row_val(df, c, keys) for c in s_cols]
        vals = [v for v in vals if v is not None]
        return sum(vals) if len(vals) >= len(s_cols) else None

    def _stock(df, keys):
        """Dòng STOCK (BS): lấy kỳ MỚI NHẤT (quý mới nhất, hoặc năm gần nhất nếu fallback)."""
        return row_val(df, bs_col, keys) if (df is not None and bs_col) else None

    if by_period:
        ratios["ky_chi_so"] = ttm_label   # nhãn cửa sổ tính chỉ số (để agent ghi rõ "TTM tới Qx/yyyy")

        # Nguồn TTM (thô, VND) + tồn kho kỳ mới nhất
        rev_r = (_flow(s_inc, ["net sales"]) or
                 _flow(s_inc, ["total operating income", "net interest income", "interest and similar income"]))
        gp_r  = _flow(s_inc, ["gross profit"])
        op_r  = _flow(s_inc, ["operating profit/(loss)"])
        npt_r = _flow(s_inc, ["net profit/(loss) after tax", "profit after tax", "net profit after tax"])
        par_r = _flow(s_inc, ["attributable to parent"])
        cfo_r = _flow(s_cf, ["net cash inflows/(outflows) from operating", "from operating activities"])
        eq_r  = _stock(s_bs, ["owner's equity", "owners equity", "total equity"])
        ta_r  = _stock(s_bs, ["total assets"])

        rev_ttm = round(rev_r / BN, 1) if rev_r else None     # tỷ VND
        par_ttm = round(par_r / BN, 1) if par_r else None
        npt_ttm = round(npt_r / BN, 1) if npt_r else None
        eq_l    = round(eq_r / BN, 1) if eq_r else None
        ta_l    = round(ta_r / BN, 1) if ta_r else None

        if rev_ttm is not None: ratios["doanh_thu_ttm_ty"] = rev_ttm
        if par_ttm is not None: ratios["lnst_cd_me_ttm_ty"] = par_ttm
        if npt_ttm is not None: ratios["lnst_ttm_ty"] = npt_ttm
        # BIÊN TTM (số CẬP NHẬT — khớp nền tảng dữ liệu)
        if gp_r and rev_r:  ratios["bien_gop_ttm_pct"]  = round(gp_r / rev_r * 100, 1)
        if op_r and rev_r:  ratios["bien_ebit_ttm_pct"] = round(op_r / rev_r * 100, 1)
        if npt_r and rev_r: ratios["bien_lnst_ttm_pct"] = round(npt_r / rev_r * 100, 1)
        ratios["bien_lnst_moi_nhat_pct"] = ratios.get("bien_lnst_ttm_pct") or by_period[0].get("bien_lnst_pct")
        # ROE/ROA TTM = LN cổ đông mẹ TTM / VCSH (hoặc tài sản) kỳ MỚI NHẤT
        if par_r and eq_r: ratios["roe_ttm_pct"] = round(par_r / eq_r * 100, 1)
        if par_r and ta_r: ratios["roa_ttm_pct"] = round(par_r / ta_r * 100, 1)

        # CHẤT LƯỢNG LỢI NHUẬN: CFO TTM / LNST TTM (>=1 tốt; <0.7 kéo dài = cờ đỏ)
        if cfo_r is not None:
            ratios["cfo_ttm_ty"] = round(cfo_r / BN, 1)
            if npt_r and npt_r > 0:
                cq = round(cfo_r / npt_r, 2)
                ratios["cfo_tren_lnst"] = cq
                ratios["chat_luong_ln"] = ("tốt (tiền thật ≥ lãi)" if cq >= 1
                                           else "khá" if cq >= 0.7 else "thấp — cờ đỏ (lãi không ra tiền)")

        # ĐỊNH GIÁ THẬT (vốn hóa hiện tại / TTM)
        if shares:        ratios["so_co_phieu_luu_hanh"] = int(shares)
        if market_cap_ty: ratios["von_hoa_ty"] = market_cap_ty
        if price:         ratios["gia_uoc_tinh_vnd"] = int(price)
        if par_r and shares:
            eps = par_r / shares
            ratios["eps_ttm_vnd"] = round(eps, 0)
            if price and not market_cap_ty:
                ratios["pe"] = round(price / eps, 2)
        if market_cap_ty and par_ttm: ratios["pe"] = round(market_cap_ty / par_ttm, 2)
        if market_cap_ty and eq_l:    ratios["pb"] = round(market_cap_ty / eq_l, 2)
        if market_cap_ty and rev_ttm: ratios["ps"] = round(market_cap_ty / rev_ttm, 2)
        if eq_l and ta_l:
            # SỐ CUỐI KỲ (point-in-time quý gần nhất) cho cột BS — để bảng cân đối ĐỦ & nhất quán
            # (trước đây chỉ có no_phai_tra → tài sản/VCSH bị "(chưa có số)"). BS là STOCK, KHÔNG phải TTM.
            ratios["tong_tai_san_cuoi_ky_ty"]   = ta_l
            ratios["von_chu_so_huu_cuoi_ky_ty"] = eq_l
            ratios["no_phai_tra_ty"] = round(ta_l - eq_l, 1)
            ratios["no_tren_vcsh"]   = round((ta_l - eq_l) / eq_l, 2)

        # KẾT QUẢ QUÝ MỚI NHẤT (số CẬP NHẬT nhất) + QoQ so với quý liền trước
        if use_q and qcols:
            qc = qcols[0]
            q_rev = (row_val(incQ, qc, ["net sales"]) or
                     row_val(incQ, qc, ["total operating income", "net interest income"]))
            q_npt = row_val(incQ, qc, ["net profit/(loss) after tax", "profit after tax"])
            q_par = row_val(incQ, qc, ["attributable to parent"])
            q_gp  = row_val(incQ, qc, ["gross profit"])
            lq = {"ky": qc,
                  "doanh_thu_ty":  round(q_rev / BN, 1) if q_rev else None,
                  "lnst_ty":       round(q_npt / BN, 1) if q_npt else None,
                  "lnst_cd_me_ty": round(q_par / BN, 1) if q_par else None,
                  "bien_gop_pct":  round(q_gp / q_rev * 100, 1) if (q_gp and q_rev) else None,
                  "bien_lnst_pct": round(q_npt / q_rev * 100, 1) if (q_npt and q_rev) else None}
            cur = q_par if q_par is not None else q_npt
            if len(qcols) >= 2:
                p_rev = (row_val(incQ, qcols[1], ["net sales"]) or
                         row_val(incQ, qcols[1], ["total operating income", "net interest income"]))
                p_par = (row_val(incQ, qcols[1], ["attributable to parent"]) or
                         row_val(incQ, qcols[1], ["net profit/(loss) after tax"]))
                if q_rev and p_rev: lq["doanh_thu_qoq_pct"] = round((q_rev / p_rev - 1) * 100, 1)
                if cur and p_par:   lq["lnst_qoq_pct"]      = round((cur / p_par - 1) * 100, 1)
            # YoY = SO VỚI CÙNG KỲ năm trước (quý cách 4 quý) → mặc định nên dùng (so QoQ ít ý nghĩa với DN mùa vụ)
            if len(qcols) >= 5:
                y_rev = (row_val(incQ, qcols[4], ["net sales"]) or
                         row_val(incQ, qcols[4], ["total operating income", "net interest income"]))
                y_gp  = row_val(incQ, qcols[4], ["gross profit"])
                y_par = (row_val(incQ, qcols[4], ["attributable to parent"]) or
                         row_val(incQ, qcols[4], ["net profit/(loss) after tax"]))
                lq["ky_cung_ky"] = qcols[4]
                if q_rev and y_rev: lq["doanh_thu_yoy_pct"] = round((q_rev / y_rev - 1) * 100, 1)
                if cur and y_par:   lq["lnst_yoy_pct"]      = round((cur / y_par - 1) * 100, 1)
                if (q_gp and q_rev) and (y_gp and y_rev):    # đổi biên gộp YoY (điểm %) → giải thích biên
                    lq["bien_gop_thay_doi_diem_pct"] = round((q_gp / q_rev - y_gp / y_rev) * 100, 1)
            ratios["quy_moi_nhat"] = lq

        # ── TĂNG TRƯỞNG NHIỀU NĂM (CAGR/YoY) + PEG — từ trend NĂM (by_period) ──
        def _series(field):
            vals = [(p["period"], p.get(field)) for p in by_period if p.get(field)]
            return list(reversed(vals))   # cũ → mới
        def _cagr(field):
            s = _series(field)
            if len(s) >= 2 and s[0][1] and s[0][1] > 0 and s[-1][1] > 0:
                yrs = len(s) - 1
                return round(((s[-1][1] / s[0][1]) ** (1 / yrs) - 1) * 100, 1)
            return None
        def _yoy(field):
            s = _series(field)
            if len(s) >= 2 and s[-2][1]:
                return round((s[-1][1] / s[-2][1] - 1) * 100, 1)
            return None
        rev_cagr = _cagr("doanh_thu_thuan_ty"); lnst_cagr = _cagr("lnst_cd_me_ty") or _cagr("lnst_ty")
        lnst_yoy = _yoy("lnst_cd_me_ty") or _yoy("lnst_ty")
        if rev_cagr is not None:  ratios["doanh_thu_cagr_pct"] = rev_cagr
        if lnst_cagr is not None: ratios["lnst_cagr_pct"] = lnst_cagr
        if lnst_yoy is not None:  ratios["lnst_yoy_pct"] = lnst_yoy
        # PEG = P/E ÷ tốc độ tăng LNST (ưu tiên CAGR; <1 = rẻ so tăng trưởng)
        _g = lnst_cagr if (lnst_cagr and lnst_cagr > 0) else (lnst_yoy if (lnst_yoy and lnst_yoy > 0) else None)
        if ratios.get("pe") and _g:
            # GUARD: PEG chỉ đáng tin khi tăng trưởng trong VÙNG HỢP LÝ. Tăng đột biến (nền thấp) → PEG bé
            # giả tạo, gắn nhãn "rẻ" gây HIỂU NHẦM; tăng trưởng quá nhỏ → PEG phồng. Nêu rõ thay vì phán xét sai.
            ratios["peg"] = round(ratios["pe"] / _g, 2)
            if _g > 50:
                ratios["peg_danh_gia"] = f"PEG kém tin cậy (LN tăng đột biến {_g}%/nền thấp — đừng coi là 'rẻ')"
            elif _g < 3:
                ratios["peg_danh_gia"] = f"PEG kém tin cậy (tăng trưởng quá thấp {_g}% → PEG phồng)"
            else:
                ratios["peg_danh_gia"] = "rẻ so tăng trưởng" if ratios["peg"] < 1 else ("hợp lý" if ratios["peg"] < 1.5 else "đắt")

        # ── DATA-DERIVED: VỊ THẾ chỉ số hiện tại so với LỊCH SỬ CHÍNH DN (KHÔNG hardcode ngưỡng) ──
        # Triết lý "đâu đúng đâu sai": thay vì so với 1 con số chuyên gia CỐ ĐỊNH (dễ stale/sai bối cảnh),
        # so giá trị mới nhất với PHÂN PHỐI NHIỀU NĂM của CHÍNH DN (đã có trong by_period) → tự cập nhật
        # theo dữ liệu, không cần call thêm. Bổ trợ PEG (cũng data-derived). Dải P/E tuyệt đối chỉ là BỐI CẢNH.
        def _position(field):
            s = [v for _, v in _series(field) if v is not None]
            if len(s) < 3:
                return None
            cur, lo, hi = s[-1], min(s), max(s)
            avg = round(sum(s) / len(s), 1)
            if hi == lo:
                band = "ổn định"
            else:
                p = (cur - lo) / (hi - lo)
                band = "vùng CAO" if p >= 0.66 else "vùng THẤP" if p <= 0.33 else "vùng giữa"
            return {"hien_tai": cur, "tb_lich_su": avg, "min": lo, "max": hi,
                    "vi_the": f"{band} so với {len(s)} năm của chính DN"}
        _vt = {}
        for _f, _lb in [("roe_pct", "ROE"), ("bien_gop_pct", "Biên gộp"),
                        ("bien_lnst_pct", "Biên LNST"), ("bien_ebit_pct", "Biên EBIT")]:
            _p = _position(_f)
            if _p:
                _vt[_lb] = _p
        if _vt:
            ratios["vi_the_vs_lich_su"] = _vt

        # ── CONFLICT DETECTOR (P3): dải P/E tuyệt đối (chuyên gia, time-bound) vs PEG (data-derived) ──
        # Mâu thuẫn = tín hiệu đáng chú ý → ƯU TIÊN PEG (dữ liệu). Dev luôn thấy ở ratios; prompt chỉ nêu
        # cho NĐT khi đổi kết luận (materiality cao — 2 case dưới đều material vì đảo verdict rẻ↔đắt).
        _band = ratios.get("pe_vung_thi_truong") or ""
        _pegd = ratios.get("peg_danh_gia") or ""
        if "đắt" in _band and "rẻ" in _pegd:
            ratios["mau_thuan_dinh_gia"] = ("P/E tuyệt đối thuộc vùng ĐẮT nhưng PEG<1 (tăng trưởng nhanh bù) "
                                            "→ ưu tiên PEG: định giá HỢP LÝ so tăng trưởng, không kết luận 'đắt' suông.")
        elif "rẻ" in _band and _pegd == "đắt":
            ratios["mau_thuan_dinh_gia"] = ("P/E tuyệt đối thuộc vùng RẺ nhưng PEG cao (tăng trưởng yếu) "
                                            "→ cảnh giác BẪY GIÁ TRỊ: rẻ vì triển vọng kém, không kết luận 'rẻ' suông.")

        # ── ĐỊNH GIÁ NỘI TẠI BẢO THỦ → VÙNG THAM KHẢO (KHÔNG phải khuyến nghị/giá mục tiêu) ──
        # Dùng phương pháp ỔN ĐỊNH (tránh Gordon (ROE−g)/(COE−g) nổ tung khi g→COE): EPV (earnings power,
        # GIẢ ĐỊNH KHÔNG tăng trưởng = EPS/COE) + Graham (√(22.5·EPS·BVPS)). COE = Rf + Beta×ERP.
        # Framing: giá > vùng = thị trường TRẢ THÊM cho TĂNG TRƯỞNG (cross-check PEG); giá < vùng = rẻ kể cả
        # khi KHÔNG tăng trưởng. Tránh "false precision" — chỉ là neo bảo thủ.
        _eps = ratios.get("eps_ttm_vnd")
        _shares = ratios.get("so_co_phieu_luu_hanh")
        if _eps and _eps > 0 and _shares and eq_r:
            _bvps = eq_r / _shares
            _beta = 1.0
            try:
                _bn = (get_supabase().table("graph_nodes").select("properties")
                       .eq("entity_id", t).eq("entity_type", "STOCK").execute().data)
                if _bn:
                    _beta = float((_bn[0].get("properties") or {}).get("beta_vnindex") or 1.0)
            except Exception:
                pass
            _beta_adj = round(_MKT.blume_slope * _beta + _MKT.blume_intercept, 2)  # Blume: β 1 năm raw nhiễu → hồi quy về 1 (chuẩn CFA)
            _coe = _MKT.risk_free_rate + _beta_adj * _MKT.equity_risk_premium      # Rf (TPCP) + β_adj×ERP — tham số theo thị trường
            # EPS CHUẨN HÓA mid-cycle (tinh hơn): BIÊN LNST TRUNG VỊ nhiều năm × DT TTM ÷ CP → giữ QUY MÔ
            # hiện tại nhưng ở biên CHUẨN HÓA (tốt hơn TB LNST thô bỏ qua tăng trưởng quy mô). Dùng khi DN
            # chu kỳ: CV LNST>0.30 HOẶC EPS_TTM>1.4× chuẩn hóa (đỉnh ở TTM/quý).
            import statistics as _stt
            _ls = [v for _, v in _series("lnst_cd_me_ty") if v] or [v for _, v in _series("lnst_ty") if v]
            _mgs = [p.get("bien_lnst_pct") for p in by_period if p.get("bien_lnst_pct")]
            _eps_use, _normalized = _eps, False
            if len(_ls) >= 3 and _stt.mean(_ls) > 0:
                _cv = _stt.pstdev(_ls) / _stt.mean(_ls)
                if len(_mgs) >= 3 and rev_r:          # biên-trung-vị × DT TTM (mid-cycle theo biên)
                    _eps_norm = round(_stt.median(_mgs) / 100 * rev_r / _shares)
                else:
                    _eps_norm = round(_stt.mean(_ls) * BN / _shares)
                ratios["eps_chuan_hoa_vnd"] = _eps_norm
                if _eps_norm > 0 and (_cv > 0.30 or _eps > 1.4 * _eps_norm):
                    _eps_use, _normalized = _eps_norm, True
            methods, vals = {}, []
            # EPV + ĐỘ NHẠY COE ±1pp (CFA: định giá rất nhạy COE → thể hiện DẢI thay vì 1 điểm)
            _epv = _eps_use / _coe
            _epv_lo = _eps_use / (_coe + 0.01)
            _epv_hi = _eps_use / max(_coe - 0.01, 0.05)
            methods["epv_khong_tang_truong"] = round(_epv)
            methods["epv_nhay_COE_±1pp"] = [round(_epv_lo), round(_epv_hi)]
            vals += [_epv_lo, _epv_hi]
            if _bvps > 0:
                _gr = (_MKT.graham_const * _eps_use * _bvps) ** 0.5  # Graham (bảo thủ)
                methods["graham"] = round(_gr); vals.append(_gr)
            lo, hi = round(min(vals)), round(max(vals))
            cur = price or ratios.get("gia_uoc_tinh_vnd")
            pos = None
            if cur:
                pos = ("dưới vùng — rẻ kể cả khi KHÔNG tăng trưởng" if cur < lo * 0.95 else
                       "trên vùng — phần vượt = kỳ vọng TĂNG TRƯỞNG (đối chiếu PEG)" if cur > hi * 1.05 else
                       "quanh vùng bảo thủ")
            ratios["dinh_gia_noi_tai"] = {
                "vung_bao_thu_vnd": [lo, hi], "gia_hien_tai_vnd": int(cur) if cur else None,
                "vi_tri": pos, "phuong_phap": methods,
                "co_so_eps": ("EPS chuẩn hóa mid-cycle (DN chu kỳ)" if _normalized else "EPS TTM"),
                "gia_dinh": {"COE_pct": round(_coe * 100, 1), "beta_raw": round(_beta, 2),
                             "beta_dieu_chinh": _beta_adj},
                "luu_y": ("Vùng BẢO THỦ giả định KHÔNG/ÍT tăng trưởng (EPV+Graham) — KHÔNG phải khuyến nghị/giá "
                          "mục tiêu. DN tăng trưởng cao XỨNG ĐÁNG cao hơn vùng (xem PEG)."
                          + (" Đã dùng EPS CHUẨN HÓA (trung bình nhiều năm) vì LNST biến động mạnh (chu kỳ) — "
                             "tránh định giá trên đỉnh lợi nhuận." if _normalized else "")),
            }

        # ── DẢI ĐỊNH GIÁ LỊCH SỬ CHÍNH MÃ (P/E & P/B vs chính nó nhiều năm) ───────────
        # "P/E hiện 12 vs trung vị 5 năm của NÓ là 18 → rẻ TƯƠNG ĐỐI so chính nó" (tốt hơn so VN-Index).
        # 1 call giá lịch sử (cache 15' theo cả result). EPS/BVPS lịch sử ≈ LNST/VCSH năm ÷ số CP HIỆN TẠI
        # (xấp xỉ — nếu phát hành thêm thì P/E lịch sử hơi cao; đủ làm THAM CHIẾU xu hướng).
        if _shares and ratios.get("pe"):
            try:
                from vnstock.api.quote import Quote
                yrs = [p["period"] for p in by_period if p["period"].isdigit()]
                if len(yrs) >= 3:
                    with _suppress_stdout():
                        _ph = _vn_retry(Quote(symbol=t, source="VCI").history,
                                        start=f"{min(yrs)}-01-01",
                                        end=datetime.now().strftime("%Y-%m-%d"), interval="1D")
                    if _ph is not None and not _ph.empty:
                        _ph["_y"] = _ph["time"].astype(str).str[:4]
                        yclose = {y: float(g.iloc[-1]["close"]) for y, g in _ph.groupby("_y")}
                        # đơn vị close vnstock (nghìn đồng) vs giá đầy đủ → quy về cùng: dùng tỷ số nên KHÔNG cần khớp đơn vị
                        pe_hist, pb_hist = [], []
                        for p in by_period:
                            y = p["period"]
                            c = yclose.get(y)
                            if not c:
                                continue
                            c = c * 1000 if c < 1000 else c   # close vnstock = nghìn đồng → quy full VND
                            epsy = (p.get("lnst_cd_me_ty") or p.get("lnst_ty"))
                            eqy = p.get("von_chu_so_huu_ty")
                            if epsy and epsy > 0:
                                pe_hist.append(c / (epsy * BN / _shares))
                            if eqy and eqy > 0:
                                pb_hist.append(c / (eqy * BN / _shares))
                        import statistics as _st2
                        def _band(cur, hist):
                            hist = [x for x in hist if 0 < x < 100]   # lọc nhiễu
                            if not cur or len(hist) < 3:
                                return None
                            lo, md, hi = round(min(hist), 1), round(_st2.median(hist), 1), round(max(hist), 1)
                            vt = ("THẤP hơn lịch sử (rẻ tương đối)" if cur < md * 0.9 else
                                  "CAO hơn lịch sử (đắt tương đối)" if cur > md * 1.1 else "quanh trung vị lịch sử")
                            return {"hien_tai": round(cur, 1), "min": lo, "trung_vi": md, "max": hi, "vi_the": vt}
                        dv = {}
                        _peb = _band(ratios.get("pe"), pe_hist)
                        _pbb = _band(ratios.get("pb"), pb_hist)
                        if _peb:
                            dv["pe"] = _peb
                        if _pbb:
                            dv["pb"] = _pbb
                        if dv:
                            ratios["dinh_gia_vs_lich_su"] = dv
            except Exception:
                pass

        # ── SNAPSHOT BẢNG CÂN ĐỐI + DÒNG TIỀN + ĐỊNH GIÁ MỞ RỘNG (kỳ MỚI NHẤT) ──
        # CHỈ cho DN SẢN XUẤT/TM/DV — ngân hàng/CK/bảo hiểm KHÔNG có tài sản ngắn hạn/tồn kho/
        # CAPEX/FCF theo nghĩa thông thường (OCF gồm dòng tiền gửi/cho vay → SAI) → dùng khung riêng.
        if loai == "san_xuat_thuong_mai_dich_vu" and bs_col:
            ca  = _stock(s_bs, ["current assets"])          # khớp dòng tổng "CURRENT ASSETS"
            cl  = _stock(s_bs, ["current liabilities"])
            inv = _stock(s_bs, ["inventories, net"])
            csh = _stock(s_bs, ["cash and cash equivalents"])
            sti = _stock(s_bs, ["short-term investments"])
            stb = _stock(s_bs, ["short-term borrowings"])
            ltb = _stock(s_bs, ["long-term borrowings"])

            if ca and cl:
                ratios["he_so_thanh_toan_hien_hanh"] = round(ca / cl, 2)
                ratios["von_luu_dong_ty"] = round((ca - cl) / BN, 1)
                if inv is not None:
                    ratios["he_so_thanh_toan_nhanh"] = round((ca - inv) / cl, 2)

            cash_pos = None
            if csh is not None or sti is not None:
                cash_pos = (csh or 0) + (sti or 0)
                ratios["tien_va_dau_tu_ngan_han_ty"] = round(cash_pos / BN, 1)
            total_debt = None
            if stb is not None or ltb is not None:
                total_debt = (stb or 0) + (ltb or 0)
                ratios["tong_no_vay_ty"] = round(total_debt / BN, 1)
            if total_debt is not None and cash_pos is not None:
                nd = total_debt - cash_pos
                ratios["no_vay_rong_ty"] = round(nd / BN, 1)          # nợ vay ròng (ÂM = net cash)
                ratios["tien_mat_rong_ty"] = round(-nd / BN, 1)       # tiền mặt ròng (DƯƠNG = net cash) — dùng số NÀY khi nói "tiền mặt ròng"
                # Nhãn kèm ĐỘ LỚN ĐÚNG DẤU để model không lẫn: net cash hiển thị số DƯƠNG, nợ ròng số dương.
                if nd < 0:
                    ratios["trang_thai_tien_mat"] = f"tiền mặt ròng (net cash) +{abs(nd)/BN:.1f} tỷ"
                else:
                    ratios["trang_thai_tien_mat"] = f"có nợ vay ròng {nd/BN:.1f} tỷ"
                if eq_l:
                    ratios["no_vay_rong_tren_vcsh"] = round(nd / BN / eq_l, 2)

            # Dòng tiền TTM: CAPEX, FCF, phân phối cổ đông
            capex = _flow(s_cf, ["purchases of fixed assets"])
            da    = _flow(s_cf, ["depreciation and amortization"])
            divp  = _flow(s_cf, ["dividends paid"])
            buyb  = _flow(s_cf, ["payments for share returns and repurchases"])
            if capex is not None:
                capex_abs = abs(capex)
                ratios["dau_tu_capex_ty"] = round(capex_abs / BN, 1)
                if cfo_r:
                    fcf = cfo_r - capex_abs
                    ratios["dong_tien_tu_do_fcf_ty"] = round(fcf / BN, 1)
                    if rev_r:
                        ratios["bien_fcf_pct"] = round(fcf / rev_r * 100, 1)
                    if cfo_r > 0:
                        ratios["capex_tren_ocf_pct"] = round(capex_abs / cfo_r * 100, 1)
            if divp is not None and abs(divp) > 0:
                ratios["co_tuc_tien_mat_ty"] = round(abs(divp) / BN, 1)
                if market_cap_ty:
                    ratios["tuc_suat_co_tuc_pct"] = round(abs(divp) / BN / market_cap_ty * 100, 2)
            if buyb is not None and abs(buyb) > 0:
                ratios["mua_lai_co_phieu_ty"] = round(abs(buyb) / BN, 1)

            # EV/EBITDA (EBITDA TTM = LN HĐKD TTM + khấu hao TTM)
            if op_r is not None and da is not None:
                ebitda = op_r + da
                ratios["ebitda_ttm_ty"] = round(ebitda / BN, 1)
                if market_cap_ty and total_debt is not None and cash_pos is not None and ebitda > 0:
                    ev = market_cap_ty + (total_debt - cash_pos) / BN
                    ratios["ev_tren_ebitda"] = round(ev / (ebitda / BN), 2)

            # ── BATCH CHẨN ĐOÁN (analyst): DuPont · trả lãi · nợ ròng/EBITDA · ROIC · CCC ──
            # Nâng từ "mô tả" → "VÌ SAO": tất cả từ IS/BS/CF đã fetch (KHÔNG call thêm). Chỉ DN sản xuất/TM/DV.
            diag = {}
            if rev_r and npt_r and ta_r and eq_r:            # DuPont: ROE = biên × vòng quay × đòn bẩy
                nm, at, lev = npt_r / rev_r, rev_r / ta_r, ta_r / eq_r
                diag["dupont"] = {"bien_lnst_pct": round(nm * 100, 1), "vong_quay_tai_san": round(at, 2),
                                  "don_bay_tai_san": round(lev, 2), "roe_suy_ra_pct": round(nm * at * lev * 100, 1)}
            int_exp = _flow(s_inc, ["interest expenses", "interest expense"])
            if op_r is not None and int_exp:                # trả lãi = EBIT/lãi vay (>4 an toàn, <2 rủi ro)
                diag["kha_nang_tra_lai_vay"] = round(op_r / abs(int_exp), 1)
            if ratios.get("no_vay_rong_ty") is not None and (ratios.get("ebitda_ttm_ty") or 0) > 0:
                _nde = round(ratios["no_vay_rong_ty"] / ratios["ebitda_ttm_ty"], 2)
                diag["no_rong_tren_ebitda"] = _nde
                if _nde < 0:   # nợ ròng âm = NET CASH → tỷ số âm KHÔNG phải "đòn bẩy", nêu rõ kẻo hiểu nhầm
                    diag["no_rong_tren_ebitda_ghi_chu"] = "Âm = tiền mặt ròng (net cash), KHÔNG có đòn bẩy nợ ròng"
            if op_r is not None and total_debt is not None and cash_pos is not None and eq_r:  # ROIC = NOPAT/vốn đầu tư
                _inv_cap = total_debt + eq_r - cash_pos
                if _inv_cap > 0:
                    diag["roic_pct"] = round(op_r * 0.8 / _inv_cap * 100, 1)
            _cogs = (rev_r - gp_r) if (rev_r and gp_r) else None    # CCC = DIO + DSO − DPO (vốn lưu động)
            _recv = _stock(s_bs, ["accounts receivable", "trade accounts receivable"])
            _pay = _stock(s_bs, ["accounts payable", "trade accounts payable", "payable to suppliers"])
            if _cogs and _cogs > 0 and inv is not None and _recv is not None and _pay is not None and rev_r:
                _dio, _dso, _dpo = inv / _cogs * 365, _recv / rev_r * 365, _pay / _cogs * 365
                _ccc = round(_dio + _dso - _dpo)
                # GUARD: CCC > ~2 năm → KHÔNG phải chu kỳ vốn lưu động bình thường (BĐS/hạ tầng: "tồn kho" =
                # dự án dở dang nhiều năm → DIO phồng vô nghĩa). KHÔNG in con số gây hiểu nhầm; thay bằng ghi chú.
                if _ccc > 730 or _dio > 730:
                    diag["chu_ky_tien_mat_ghi_chu"] = (
                        f"Không áp dụng — tồn kho dạng dự án dài hạn (DIO ~{round(_dio)} ngày), CCC bị méo, "
                        f"BỎ QUA khi so sánh chu kỳ vận hành (đặc thù BĐS/hạ tầng).")
                else:
                    diag["chu_ky_tien_mat_ngay"] = _ccc
                    diag["dio_dso_dpo_ngay"] = [round(_dio), round(_dso), round(_dpo)]
            if diag:
                ratios["chan_doan"] = diag

        # ── CHẤT LƯỢNG LỢI NHUẬN NÂNG CAO: ACCRUALS + RED-FLAG BẢNG CÂN ĐỐI ────────
        # Doctrine (FAnalysis "Behind the Numbers"/"BCTC như Buffett"): Dồn tích = LNST − Dòng tiền.
        # Dồn tích DƯƠNG LỚN → lãi không ra tiền → chất lượng LN thấp. Soi các khoản trên BCĐ tăng
        # nhanh hơn doanh thu (ghi lãi/doanh thu nhưng tiền CHƯA về): phải thu, phải thu khác/bên liên
        # quan, trả trước người bán, XDCB dở dang, chi phí trả trước dài hạn; NGÂN HÀNG: lãi/phí dự thu.
        # Accruals CHỈ có ý nghĩa với SẢN XUẤT/TM/DV — ngân hàng/CK/BH có CFO bị chi phối bởi dòng
        # tiền gửi/cho vay/giao dịch ký quỹ (vd VCB CFO−LNST tới −128.851 tỷ = vô nghĩa) → BỎ.
        if loai == "san_xuat_thuong_mai_dich_vu" and npt_r is not None and cfo_r is not None:
            accr = npt_r - cfo_r
            ratios["accruals_ttm_ty"] = round(accr / BN, 1)
            if npt_r and abs(npt_r) > 0:
                ratios["accruals_tren_lnst"] = round(accr / abs(npt_r), 2)

        # so sánh khoản mục kỳ MỚI NHẤT vs kỳ NĂM TRƯỚC (YoY) trên cùng nguồn inc/bs
        cur_col = inc_cols[0] if inc_cols else None
        prev_col = None
        if cur_col:
            if period == "quarter" and len(inc_cols) >= 5:
                prev_col = inc_cols[4]            # cùng quý năm trước (YoY)
            elif len(inc_cols) >= 2:
                prev_col = inc_cols[1]

        def _growth(df, keys):
            """(% tăng YoY, giá trị kỳ mới [tỷ]) của 1 khoản mục giữa prev_col→cur_col; None nếu thiếu."""
            if not (cur_col and prev_col):
                return None, None
            cv = row_val(df, cur_col, keys)
            pv = row_val(df, prev_col, keys)
            if cv is None:
                return None, None
            cur_ty = round(cv / BN, 1)
            if pv and pv > 0:
                return round((cv / pv - 1) * 100, 1), cur_ty
            return None, cur_ty

        # benchmark: tăng trưởng DOANH THU cùng kỳ (so cờ "tăng nhanh hơn doanh thu")
        if loai == "san_xuat_thuong_mai_dich_vu":
            rev_g, _ = _growth(inc, ["net sales"])
        else:
            rev_g, _ = _growth(inc, ["total operating income", "net interest income",
                                     "interest and similar income"])

        # khoản mục cần soi theo loại hình (mỗi mục thử NHIỀU candidate substring — phòng thủ,
        # không match thì bỏ qua). mode "rev" = so với tăng trưởng doanh thu; "abs" = tăng đột biến.
        if loai == "san_xuat_thuong_mai_dich_vu":
            _watch = [
                ("Phải thu khách hàng", ["accounts receivable", "trade receivable", "account receivables"], "rev"),
                ("Phải thu nội bộ / bên liên quan", ["intercompany receivables", "related part"], "rev"),
                ("Phải thu khác", ["other receivables", "other receivable"], "rev"),
                ("Trả trước cho người bán", ["prepayments to suppliers", "advances to suppliers", "prepayment to suppliers"], "rev"),
                ("Xây dựng cơ bản dở dang", ["construction in progress"], "abs"),
                ("Chi phí trả trước dài hạn", ["long-term prepaid", "prepaid expense"], "abs"),
                ("Hàng tồn kho", ["inventories, net"], "rev"),
            ]
        else:  # ngân hàng / chứng khoán / bảo hiểm
            _watch = [
                ("Lãi & phí dự thu (phải thu)", ["accrued interest and fee", "interest and fee receivable",
                                                 "interest receivable", "accrued interest"], "rev"),
                ("Phải thu khác", ["other receivable"], "rev"),
            ]
        _flags = []
        for ten, keys, mode in _watch:
            g, cur_ty = _growth(bs, keys)
            if g is None or cur_ty is None or cur_ty <= 0:
                continue
            trig, ly_do = False, ""
            if mode == "rev":
                if rev_g is not None and g - rev_g >= 15 and g >= 20:
                    trig = True; ly_do = f"+{g}% YoY trong khi doanh thu {('+' if rev_g >= 0 else '')}{rev_g}%"
                elif rev_g is not None and rev_g < 0 and g >= 15:
                    trig = True; ly_do = f"+{g}% YoY trong khi doanh thu giảm ({rev_g}%)"
            else:  # abs
                if g >= 50:
                    trig = True; ly_do = f"+{g}% YoY (tăng đột biến)"
            if trig:
                _flags.append({"khoan_muc": ten, "gia_tri_ky_moi_ty": cur_ty,
                               "tang_truong_yoy_pct": g, "ghi_chu": ly_do})
        if _flags:
            ratios["co_dau_hieu_dong_tich"] = _flags

        # tổng hợp ĐÁNH GIÁ chất lượng LN (CFO/LNST + dồn tích chỉ cho sản xuất; cờ BCĐ cho mọi loại)
        _ql = []
        if loai == "san_xuat_thuong_mai_dich_vu":
            _cq = ratios.get("cfo_tren_lnst")
            if _cq is not None:
                _ql.append("CFO/LNST " + ("≥1 (tốt)" if _cq >= 1 else "≥0,7 (khá)" if _cq >= 0.7 else "<0,7 (yếu)"))
            if ratios.get("accruals_tren_lnst") is not None and ratios["accruals_tren_lnst"] > 0.3:
                _ql.append("dồn tích/LNST cao")
        if _flags:
            _ql.append(f"{len(_flags)} khoản tăng nhanh hơn doanh thu (soi dồn tích)")
        if _ql:
            ratios["danh_gia_chat_luong_ln"] = "; ".join(_ql)

        # ── VÙNG ĐỊNH GIÁ P/E so với lịch sử VN-Index (≤12 rẻ / 12–16,5 trung tính / ≥16,5 đắt) ──
        # BỐI CẢNH thị trường; với từng mã ưu tiên PEG (đã điều chỉnh tăng trưởng) + so peer.
        _pe = ratios.get("pe")
        if _pe and _pe > 0:
            ratios["pe_vung_thi_truong"] = ("rẻ (≤12)" if _pe <= 12 else
                                            "trung tính (12–16,5)" if _pe < 16.5 else "đắt (≥16,5)")

    # ── CHỈ SỐ CHUYÊN NGÀNH TÍNH TỪ BCTC (deterministic — bank/CK/BH) ────────────────
    # Tính TRỰC TIẾP từ dòng BCTC chi tiết vnstock (đáng tin hơn web_search). NPL/CASA/CAR (cần thuyết
    # minh) + thị phần → vẫn web_search. Dùng năm gần nhất; tài sản BS lấy TRUNG BÌNH 2 năm cho NIM.
    if loai in ("ngan_hang", "chung_khoan", "bao_hiem") and inc_cols:
        _c0 = inc_cols[0]
        _c1 = inc_cols[1] if len(inc_cols) > 1 else None

        def _ii(keys):
            return row_val(inc, _c0, keys)

        def _bb(keys):
            return row_val(bs, _c0, keys)

        def _bavg(keys):
            a = row_val(bs, _c0, keys)
            b = row_val(bs, _c1, keys) if _c1 else None
            return (a + b) / 2 if (a is not None and b is not None) else a

        sn = {}
        if loai == "ngan_hang":
            _nii = _ii(["net interest income"]); _toi = _ii(["total operating income"])
            _opex = _ii(["general and admin"]); _fee = _ii(["net fee and commission income"])
            _loans = _bb(["loans and advances to customers, net", "loans and advances to customers"])
            _dep = _bb(["deposits from customers"])
            _ea = sum(x for x in [
                _bavg(["loans and advances to customers, net", "loans and advances to customers"]),
                _bavg(["placements with and loans to other credit institutions"]),
                _bavg(["trading securities, net"]), _bavg(["investment securities"])] if x)
            _prov = _bb(["provision for losses on loans and advances"])
            if _nii and _ea: sn["NIM_pct"] = round(_nii / _ea * 100, 2)
            if _opex and _toi: sn["CIR_pct"] = round(abs(_opex) / _toi * 100, 1)
            # cho vay/tiền gửi KH (THÔ) — KHÁC LDR quy định (mẫu số gồm nguồn vốn khác + 20% tiền gửi KBNN
            # theo TT08) → số này CAO hơn LDR quy định; KHÔNG so trực tiếp với trần 85%.
            if _loans and _dep: sn["cho_vay_tren_tien_gui_KH_pct"] = round(_loans / _dep * 100, 1)
            if _fee and _toi: sn["thu_ngoai_lai_tren_TOI_pct"] = round(_fee / _toi * 100, 1)
            if _prov and _loans: sn["bao_phu_du_phong_tren_du_no_pct"] = round(abs(_prov) / _loans * 100, 2)
            sn["luu_y"] = ("NIM/CIR ước tính từ BCTC (đã đối chiếu khớp số công bố VCB: CIR 34.8%, NIM ~2.7%). "
                           "'cho_vay/tien_gui_KH' là LDR THÔ, CAO hơn LDR QUY ĐỊNH (gồm nguồn vốn khác) — đừng so trần 85%. "
                           "NPL/CASA/CAR cần thuyết minh → web_search.")
        elif loai == "chung_khoan":
            def _exact_bs(name):   # khớp CHÍNH XÁC tên dòng (tránh dòng "...(Before 2016)" = 0)
                m = bs[bs["item_en"].astype(str).str.strip().str.lower() == name]
                if m.empty or _c0 not in m.columns:
                    return None
                try:
                    v = float(m[_c0].values[0]); return v if v == v else None
                except (TypeError, ValueError):
                    return None
            _mg = _exact_bs("loans")   # dư nợ margin = dòng "Loans" hiện hành
            _eq = _bb(["owner's equity", "owners equity", "total equity"])
            _brk = _ii(["revenue in brokerage"]); _mgi = _ii(["income from loans and receivables"])
            # tự doanh RÒNG = lãi FVTPL − lỗ FVTPL (CFA: tự doanh phải NET vì mua/bán 2 chiều)
            _fvg = _ii(["income from financial assets recognized through profit/loss"])
            _fvl = _ii(["loss from financial assets recognized through profit/loss"])
            _fv = (_fvg - (_fvl or 0)) if _fvg else None
            if _mg: sn["du_no_margin_ty"] = round(_mg / BN, 0)
            if _mg and _eq: sn["margin_tren_vcsh"] = round(_mg / _eq, 2)
            _tot = sum(x for x in [_brk, _mgi, _fv] if x and x > 0)
            if _tot:   # tỷ trọng TRONG 3 mảng cốt lõi (KHÔNG phải % tổng doanh thu — CK còn HTM/AFS/phái sinh)
                if _brk: sn["mix3mang_moi_gioi_pct"] = round(_brk / _tot * 100)
                if _mgi: sn["mix3mang_margin_pct"] = round(_mgi / _tot * 100)
                if _fv and _fv > 0: sn["mix3mang_tu_doanh_rong_pct"] = round(_fv / _tot * 100)
            sn["luu_y"] = ("Dư nợ margin + margin/VCSH (trần ≤2×) tính từ BCTC. mix3mang_* = tỷ trọng TRONG 3 mảng "
                           "cốt lõi (môi giới/margin/tự doanh RÒNG), KHÔNG phải % tổng doanh thu (CK còn HTM/AFS/"
                           "phái sinh). Thị phần môi giới → web_search.")
        elif loai == "bao_hiem":
            _np = _ii(["net revenue of insurance premium", "net sales from insurance business"])
            _cl = _ii(["total insurance claim settlement expenses"])
            _iox = _ii(["general and administrative expenses of insurance operation"])
            _gr = _ii(["gross written premium"])
            if _cl and _np: sn["loss_ratio_pct"] = round(abs(_cl) / _np * 100, 1)
            if _cl and _iox and _np: sn["combined_ratio_pct"] = round((abs(_cl) + abs(_iox)) / _np * 100, 1)
            if _np and _gr: sn["ty_le_giu_lai_pct"] = round(_np / abs(_gr) * 100, 1)
            sn["luu_y"] = "Combined/loss ratio tính từ BCTC (xấp xỉ); tách lãi nghiệp vụ vs đầu tư."
        if len([k for k in sn if k != "luu_y"]) >= 1:
            ratios["chi_so_chuyen_nganh_tinh"] = sn

    # ── SANITY-CHECK DỮ LIỆU (data integrity — nguồn đơn vnstock VCI) ─────────────────
    # Cờ giá trị BẤT THƯỜNG (có thể lỗi nguồn) → agent thận trọng + đề nghị kiểm chứng nguồn 2.
    _warn = []
    if ratios.get("roe_ttm_pct") is not None and not (-60 <= ratios["roe_ttm_pct"] <= 60):
        _warn.append(f"ROE TTM {ratios['roe_ttm_pct']}% bất thường")
    if ratios.get("bien_gop_ttm_pct") is not None and not (-20 <= ratios["bien_gop_ttm_pct"] <= 100):
        _warn.append(f"biên gộp {ratios['bien_gop_ttm_pct']}% bất thường")
    if ratios.get("bien_lnst_ttm_pct") is not None and not (-50 <= ratios["bien_lnst_ttm_pct"] <= 80):
        _warn.append(f"biên LNST {ratios['bien_lnst_ttm_pct']}% bất thường")
    if ratios.get("pe") is not None and (ratios["pe"] < 0 or ratios["pe"] > 200):
        _warn.append(f"P/E {ratios['pe']} bất thường")
    if ratios.get("pb") is not None and (ratios["pb"] < 0 or ratios["pb"] > 30):
        _warn.append(f"P/B {ratios['pb']} bất thường")
    if ratios.get("no_tren_vcsh") is not None and ratios["no_tren_vcsh"] > 12:
        _warn.append(f"Nợ/VCSH {ratios['no_tren_vcsh']} rất cao (kiểm tra)")
    if _warn:
        ratios["canh_bao_du_lieu"] = _warn

    fw   = _BUSINESS_FRAMEWORK[loai]
    _tri_thuc = analysis_knowledge.card_for_loai_hinh(loai)   # card chuyên sâu (nếu có) cho loại hình
    out = {
        "ticker": t, "period_type": period,
        "loai_hinh": loai, "loai_hinh_ten": fw["ten"],
        "khung_phan_tich": {
            "chi_so_can_xem": fw["chi_so_chinh"],
            "can_web_search_them": fw["web_search_them"],
            "luu_y": fw["luu_y"],
            **({"tri_thuc_nang_cao": _tri_thuc} if _tri_thuc else {}),
            "huong_dan": "Áp ĐÚNG khung loại hình này (xem PLAYBOOK). Chỉ số chuyên ngành không có trong "
                         "BCTC cơ bản → web_search GỘP nhiều chỉ số trong 1 query (vd 'VCB NIM CASA nợ xấu "
                         "CAR báo cáo phân tích'), TỐI ĐA 2-3 lượt, KHÔNG tách từng chỉ số/từng năm, KHÔNG "
                         "lặp; sau đó DỪNG và trả lời với số đã có (thiếu thì ghi 'chưa có số cập nhật').",
        },
        "latest_period": inc_cols[0] if inc_cols else None,        # kỳ NĂM gần nhất (cho bảng trend)
        "ky_cap_nhat_nhat": (ratios.get("quy_moi_nhat") or {}).get("ky"),  # QUÝ mới nhất (số cập nhật nhất)
        "periods_available": all_periods[:max(n_cover, 12)],   # các kỳ có thật (tới ~3 năm)
        "by_period": by_period, "ratios": ratios,
        "note": "PHÂN TÍCH CHUYÊN SÂU theo PLAYBOOK rule 7c. (1) by_period = TREND NHIỀU NĂM (biên 3 tầng "
                "bien_gop_pct→bien_ebit_pct→bien_lnst_pct + roe_pct/roa_pct TỪNG NĂM, ĐỪNG để 'N/A') — cho cái nhìn "
                "bao quát. (2) ratios = CHỈ SỐ HEADLINE tính theo TTM 4 QUÝ GẦN NHẤT (xem ratios.ky_chi_so) → biên_*_ttm_pct, "
                "roe_ttm_pct, pe, pb, ps, ev_tren_ebitda, peg là số CẬP NHẬT (khớp nền tảng dữ liệu), KHÔNG phải năm cũ — "
                "dùng các số TTM này cho phần định giá/hiệu quả hiện tại. (3) ratios.quy_moi_nhat = KẾT QUẢ QUÝ MỚI NHẤT "
                "(doanh thu/LNST/biên + QoQ) → NÊU RÕ 'Quý gần nhất (Qx/yyyy): …' để thông tin mới nhất. PHẢI GIẢI THÍCH "
                "lý do thay đổi (biên/FCF/QoQ…), không chỉ liệt kê. Snapshot thanh khoản/FCF/ps/ev CHỈ có ở DN sản xuất/DV "
                "(ngân hàng/CK/bảo hiểm dùng khung loại hình + P/B). P/E·P/B·P/S·EV/EBITDA là chỉ số HIỆN TẠI → 1 cột, "
                "KHÔNG kẻ cột cho từng năm cũ rồi điền N/A.",
        "unit": "tỷ VND (trừ EPS=VND/cp, % và lần)", "source": "vnstock (VCI)", "status": "OK",
    }
    if target_period:
        out["target_period"] = tp_norm
        out["target_period_status"] = target_status
        if target_status == "FOUND":
            out["target_period_data"] = next((p for p in by_period if p["period"] == tp_norm), None)
        elif target_status == "NOT_AVAILABLE":
            alt = ""
            if period == "quarter":
                alt = (" vnstock chỉ cung cấp ~4 QUÝ gần nhất. Muốn dữ liệu xa hơn trong 3 năm: "
                       "gọi lại với period='year' (có ~4 NĂM: 2022–2025), HOẶC web_search báo cáo "
                       "tài chính/BCTC năm của công ty. KHÔNG được điền số ước đoán cho quý này.")
            out["luu_y_target"] = (f"Kỳ '{tp_norm}' KHÔNG có trong dữ liệu vnstock hiện có "
                                   f"(các kỳ có: {', '.join(all_periods[:12])}).{alt}")
    # Cảnh báo độ phủ quý mỏng để agent biết dùng năm cho lịch sử 3 năm
    if period == "quarter" and len(all_periods) <= 4:
        out["luu_y_lich_su"] = ("vnstock chỉ có ~4 quý gần nhất. Nếu cần SO SÁNH/LỊCH SỬ tới 3 năm, "
                                "ưu tiên period='year' (4 năm) hoặc web_search BCTC năm — chớ bịa quý cũ.")
    _FIN_CACHE[_ck] = (_t.time(), out)   # lưu cache (chỉ kết quả OK mới tới đây)
    return out


# ============================================================
# TOOL 14: get_sector_value_chain — CHUỖI GIÁ TRỊ ngành (input/output + nguồn giá đúng)
# ============================================================
def get_sector_value_chain(sector: str) -> dict:
    """
    Trả về CHUỖI GIÁ TRỊ của một ngành: NGUYÊN LIỆU ĐẦU VÀO + SẢN PHẨM ĐẦU RA, kèm CHỈ DẪN
    lấy giá ĐÚNG NGUỒN cho từng mục:
      - INPUT (nguyên liệu) → get_commodity_prices (benchmark quốc tế).
      - OUTPUT (sản phẩm bán) → get_vn_domestic_price (GIÁ NỘI ĐỊA VN) nếu có; kèm tham chiếu quốc tế.
    Dùng TRƯỚC khi phân tích biên lợi nhuận một ngành/doanh nghiệp sản xuất VN.

    Args:
        sector: tên ngành tiếng Việt (vd "thép", "chăn nuôi", "phân bón") hoặc entity_id.
    """
    sid = _resolve(sector, SECTOR_IDS, _SECTOR_ALIASES)
    if not sid:
        return {"error": f"Không nhận diện ngành '{sector}'.", "status": "UNKNOWN_SECTOR"}
    try:
        sb = get_supabase()
        snode = sb.table("graph_nodes").select("id,name").eq("entity_id", sid)\
                  .eq("entity_type", "SECTOR").single().execute()
        sector_uuid = snode.data["id"]
        edges = sb.table("graph_edges").select("source_id,relationship_type,properties")\
                  .eq("target_id", sector_uuid).execute().data
        src_ids = list({e["source_id"] for e in edges})
        nmap = {}
        if src_ids:
            for n in sb.table("graph_nodes").select("id,name,properties").in_("id", src_ids).execute().data:
                nmap[n["id"]] = n

        inputs, outputs = [], []
        for e in edges:
            n = nmap.get(e["source_id"])
            if not n:
                continue
            p = n.get("properties") or {}
            if p.get("scope") != "commodity":
                continue
            base = {"ten": n["name"], "commodity_key": p.get("commodity_key"),
                    "market": p.get("market"), "primary_source": p.get("primary_source")}
            if e["relationship_type"] == "IS_INPUT_COST_OF":
                # INPUT là hàng NỘI ĐỊA (thép xây dựng, xi măng…) → lấy giá VN, KHÔNG dùng benchmark quốc tế.
                if p.get("vn_key") and (p.get("market") == "vietnam"):
                    base["vn_key"] = p["vn_key"]
                    base["lay_gia_bang"] = (f"get_vn_domestic_price('{p['vn_key']}') = GIÁ NỘI ĐỊA VN "
                                            f"(chi phí đầu vào thực tế của DN Việt Nam)")
                else:
                    base["lay_gia_bang"] = f"get_commodity_prices('{p.get('commodity_key')}') (benchmark quốc tế)"
                inputs.append(base)
            elif e["relationship_type"] == "AFFECTS_POSITIVE":
                if p.get("vn_key"):
                    base["vn_key"] = p["vn_key"]
                    base["lay_gia_bang"] = (f"get_vn_domestic_price('{p['vn_key']}') = GIÁ NỘI ĐỊA VN (chính); "
                                            f"+ get_commodity_prices('{p.get('commodity_key')}') = tham chiếu quốc tế")
                else:
                    base["lay_gia_bang"] = f"get_commodity_prices('{p.get('commodity_key')}')"
                outputs.append(base)

        return {
            "sector": snode.data["name"], "inputs": inputs, "outputs": outputs,
            "huong_dan": ("Lấy giá INPUT (quốc tế) + OUTPUT (NỘI ĐỊA VN nếu có vn_key) rồi suy luận "
                          "BIÊN LỢI NHUẬN: input tăng→biên giảm, output tăng→biên tăng. Với DN Việt Nam, "
                          "GIÁ BÁN dùng số NỘI ĐỊA VN, KHÔNG dùng giá sàn quốc tế."),
            "status": "OK",
        }
    except Exception as e:
        return {"error": str(e), "status": "DB_ERROR"}


# ============================================================
# TOOL 13: get_vn_domestic_price — GIÁ NỘI ĐỊA VIỆT NAM THẬT (nguồn chuyên ngành VN)
# ============================================================
# keyword -> (nhãn, truy vấn tiếng Việt nhắm nguồn chuyên ngành, đơn vị kỳ vọng)
_VN_DOMESTIC_MAP = {
    "thép xây dựng": ("Thép xây dựng VN (HPG…)", "giá thép xây dựng hôm nay đồng/kg", "đồng/kg"),
    "thép":          ("Thép xây dựng VN (HPG…)", "giá thép xây dựng hôm nay đồng/kg", "đồng/kg"),
    "heo hơi":       ("Heo hơi VN (3 miền)", "giá heo hơi hôm nay ba miền đồng/kg", "đồng/kg"),
    "heo":           ("Heo hơi VN (3 miền)", "giá heo hơi hôm nay ba miền đồng/kg", "đồng/kg"),
    "lợn":           ("Heo hơi VN (3 miền)", "giá lợn hơi hôm nay ba miền đồng/kg", "đồng/kg"),
    "cá tra":        ("Cá tra VN (VASEP)", "giá cá tra nguyên liệu hôm nay đồng/kg", "đồng/kg"),
    "tôm":           ("Tôm VN (VASEP)", "giá tôm nguyên liệu hôm nay đồng/kg", "đồng/kg"),
    "đường":         ("Đường nội địa VN", "giá đường trong nước hôm nay đồng/kg", "đồng/kg"),
    "urea":          ("Phân urea VN (Phú Mỹ/Cà Mau)", "giá phân urea Phú Mỹ Cà Mau hôm nay đồng/kg", "đồng/kg"),
    "phân bón":      ("Phân urea VN (Phú Mỹ/Cà Mau)", "giá phân urea Phú Mỹ hôm nay đồng/kg", "đồng/kg"),
    "đạm":           ("Phân urea VN", "giá phân đạm urea hôm nay đồng/kg", "đồng/kg"),
    "xi măng":       ("Xi măng VN", "giá xi măng hôm nay đồng/bao", "đồng/bao"),
    "cao su":        ("Cao su nội địa VN", "giá mủ cao su trong nước hôm nay đồng/kg", "đồng/kg"),
    "gạo":           ("Gạo xuất khẩu VN", "giá gạo xuất khẩu Việt Nam hôm nay USD/tấn", "USD/tấn"),
    "cà phê":        ("Cà phê nội địa VN", "giá cà phê trong nước hôm nay đồng/kg Tây Nguyên", "đồng/kg"),
    "điện":          ("Giá điện EVN", "giá bán lẻ điện EVN mới nhất đồng/kWh", "đồng/kWh"),
}


def get_vn_domestic_price(items: str = "") -> dict:
    """
    Lấy GIÁ NỘI ĐỊA VIỆT NAM THẬT từ nguồn chuyên ngành VN (KHÔNG phải benchmark quốc tế):
    thép xây dựng (SteelOnline/VSA), heo hơi 3 miền, cá tra/tôm (VASEP), đường, phân urea
    (Phú Mỹ/Cà Mau), xi măng, cao su, gạo, cà phê nội địa, giá điện EVN...

    QUAN TRỌNG: Dùng tool NÀY cho GIÁ ĐẦU RA/sản phẩm của DOANH NGHIỆP VIỆT NAM. Giá nội địa
    VN khác hẳn giá sàn quốc tế (vd thép xây dựng VN ~14.000đ/kg ≠ thép HRC CME của Mỹ;
    heo hơi VN ~65.000đ/kg ≠ lean hogs CME). KHÔNG áp giá quốc tế làm giá VN.

    Args:
        items: tên mặt hàng cách nhau dấu phẩy (vd "thép xây dựng, heo hơi, cá tra").
    """
    import re as _re
    req = [c.strip().lower() for c in (items or "").split(",") if c.strip()]
    if not req:
        return {"error": "Cần nêu mặt hàng (vd 'thép xây dựng, heo hơi').", "status": "EMPTY"}

    chosen, seen = [], set()
    for r in req:
        for kw, info in _VN_DOMESTIC_MAP.items():
            if kw in r or r in kw:
                if info[0] not in seen:
                    seen.add(info[0]); chosen.append(info)
                break

    from datetime import datetime as _dt, timezone as _tz, timedelta as _td, date as _date
    _today = _dt.now(_tz(_td(hours=7))).date()

    def _days_ago(d):
        """Ước lượng số NGÀY trước từ chuỗi date đa định dạng (càng nhỏ càng mới)."""
        d = (d or "").lower().strip()
        if not d: return 500
        if any(k in d for k in ["giờ trước", "phút trước", "hôm nay"]): return 0
        m = _re.search(r"(\d+)\s*ngày trước", d)
        if m: return int(m.group(1))
        m = _re.search(r"(\d+)\s*tuần trước", d)
        if m: return int(m.group(1)) * 7
        m = _re.search(r"(\d+)\s*tháng trước", d)
        if m: return int(m.group(1)) * 30
        m = _re.search(r"(\d{1,2})\s*thg\s*(\d{1,2}),?\s*(\d{4})", d)  # "3 thg 3, 2026"
        if not m:
            m = _re.search(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?", d)    # "12/6/2026"
            if m:
                dd, mm, yy = int(m.group(1)), int(m.group(2)), int(m.group(3) or _today.year)
            else:
                return 500
        else:
            dd, mm, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yy < 100: yy += 2000
        try:
            return abs((_today - _date(yy, mm, dd)).days)
        except Exception:
            return 500

    def _fresh_rank(it):
        return _days_ago(it.get("date"))

    def _parse_one(it):
        text = f"{it.get('title','')} {it.get('snippet','')}"
        for m in _re.finditer(r"([\d][\d.,]{2,}(?:\s*[-–]\s*[\d][\d.,]{2,})?)\s*(đồng|vnđ|vnd|usd)\s*/?\s*(kg|tấn|con|bao|kwh)", text, _re.I):
            # Bỏ qua nếu là MỨC TĂNG/GIẢM (vd "tăng 500 đồng/kg"), không phải giá
            before = text[max(0, m.start()-14):m.start()].lower()
            if any(k in before for k in ["tăng", "giảm", "thêm", "bớt", "+", "-", "lên", "xuống"]):
                continue
            dm = _re.search(r"(\d{1,2}/\d{1,2}(?:/\d{2,4})?)", text)
            return {"gia": m.group(1).strip(), "don_vi": f"{m.group(2)}/{m.group(3)}".lower(),
                    "ngay_trong_bai": dm.group(1) if dm else it.get("date"),
                    "nguon": it.get("source"), "link": it.get("link"),
                    "trich": (it.get("snippet") or "")[:180]}
        return None

    def _parse_vnd(items_):
        # Ưu tiên bài TƯƠI NHẤT (theo số ngày trước) CÓ chứa giá
        ordered = sorted(items_, key=_fresh_rank)
        for it in ordered:
            p = _parse_one(it)
            if p:
                p["so_ngay_truoc"] = _days_ago(it.get("date"))
                p["luu_y_tuoi"] = ("Số liệu MỚI" if p["so_ngay_truoc"] <= 3
                                   else f"Bài cách ~{p['so_ngay_truoc']} ngày — nên lưu ý độ trễ")
                return p
        if ordered:
            it = ordered[0]
            return {"gia": None, "don_vi": None, "ngay_trong_bai": it.get("date"),
                    "nguon": it.get("source"), "link": it.get("link"),
                    "so_ngay_truoc": _days_ago(it.get("date")),
                    "trich": (it.get("snippet") or it.get("title") or "")[:180]}
        return None

    results = []
    for label, vn_q, unit in chosen:
        try:
            res = (web_search(vn_q, num_results=8, news=True) or {}).get("results") or []
            parsed = _parse_vnd(res)
            if parsed:
                parsed["ve"] = label; parsed["don_vi_ky_vong"] = unit
                results.append(parsed)
        except Exception:
            pass

    return {"results": results, "count": len(results),
            "source": "Nguồn chuyên ngành Việt Nam (SteelOnline/VSA/VASEP/báo chuyên ngành)",
            "ghi_chu": "GIÁ NỘI ĐỊA VN THỰC TẾ (không phải benchmark quốc tế). Nếu 'gia'=null, đọc 'trich' "
                       "để lấy con số. Trích link + ngày khi trả lời.",
            "status": "OK"}


# ============================================================
# TOOL 12: get_commodity_prices — GIÁ HÀNG HÓA THẬT TỪ SÀN (Yahoo Finance)
# ============================================================
_COMMODITY_MAP = {
    # keyword (lowercase) -> (yahoo_symbol, tên VN, đơn vị, sàn)
    "thép hrc":   ("HRC=F", "Thép cuộn cán nóng (HRC)", "USD/tấn ngắn", "CME"),
    "hrc":        ("HRC=F", "Thép cuộn cán nóng (HRC)", "USD/tấn ngắn", "CME"),
    "thép":       ("HRC=F", "Thép cuộn cán nóng (HRC)", "USD/tấn ngắn", "CME"),
    "dầu brent":  ("BZ=F", "Dầu Brent", "USD/thùng", "ICE"),
    "brent":      ("BZ=F", "Dầu Brent", "USD/thùng", "ICE"),
    "dầu thô":    ("BZ=F", "Dầu Brent", "USD/thùng", "ICE"),
    "dầu":        ("BZ=F", "Dầu Brent", "USD/thùng", "ICE"),
    "dầu wti":    ("CL=F", "Dầu thô WTI", "USD/thùng", "NYMEX"),
    "wti":        ("CL=F", "Dầu thô WTI", "USD/thùng", "NYMEX"),
    "vàng":       ("GC=F", "Vàng", "USD/oz", "COMEX"),
    "bạc":        ("SI=F", "Bạc", "USD/oz", "COMEX"),
    "bạch kim":   ("PL=F", "Bạch kim", "USD/oz", "NYMEX"),
    "đồng":       ("HG=F", "Đồng", "USD/lb", "COMEX"),
    "nhôm":       ("ALI=F", "Nhôm", "USD/tấn", "LME"),
    "khí":        ("NG=F", "Khí tự nhiên", "USD/MMBtu", "NYMEX"),
    "gas":        ("NG=F", "Khí tự nhiên", "USD/MMBtu", "NYMEX"),
    "xăng":       ("RB=F", "Xăng RBOB", "USD/gallon", "NYMEX"),
    "diesel":     ("HO=F", "Dầu diesel / nhiên liệu bay", "USD/gallon", "NYMEX"),
    "nhiên liệu bay": ("HO=F", "Nhiên liệu bay (proxy)", "USD/gallon", "NYMEX"),
    "jet":        ("HO=F", "Nhiên liệu bay (proxy)", "USD/gallon", "NYMEX"),
    # Nông sản — đầu vào/đầu ra ngành tiêu dùng, chăn nuôi, thủy sản, dệt may
    "đường":      ("SB=F", "Đường thô", "US cent/lb", "ICE"),
    "cà phê":     ("KC=F", "Cà phê Arabica", "US cent/lb", "ICE"),
    "bông":       ("CT=F", "Bông", "US cent/lb", "ICE"),
    "ngô":        ("ZC=F", "Ngô", "US cent/giạ", "CBOT"),
    "bắp":        ("ZC=F", "Ngô", "US cent/giạ", "CBOT"),
    "đậu tương":  ("ZS=F", "Đậu tương", "US cent/giạ", "CBOT"),
    "khô đậu":    ("ZM=F", "Khô đậu tương (TĂCN)", "USD/tấn ngắn", "CBOT"),
    "thức ăn chăn nuôi": ("ZM=F", "Khô đậu tương (TĂCN)", "USD/tấn ngắn", "CBOT"),
    "lúa mì":     ("ZW=F", "Lúa mì", "US cent/giạ", "CBOT"),
    "heo hơi":    ("HE=F", "Heo hơi (lean hogs)", "US cent/lb", "CME"),
    "heo":        ("HE=F", "Heo hơi (lean hogs)", "US cent/lb", "CME"),
    "lợn":        ("HE=F", "Heo hơi (lean hogs)", "US cent/lb", "CME"),
}
# Hàng hóa CHƯA có sàn miễn phí → leo thang nguồn QUỐC TẾ (Trading Economics/Investing).
# keyword -> (nhãn VN, truy vấn tiếng Anh, truy vấn tin VN)
_COMMODITY_NO_FEED = {
    "quặng sắt":  ("Quặng sắt 62% Fe CFR China", "iron ore 62% fe price", "giá quặng sắt hôm nay"),
    "iron ore":   ("Quặng sắt 62% Fe CFR China", "iron ore 62% fe price", "giá quặng sắt hôm nay"),
    "than cốc":   ("Than luyện cốc FOB Australia", "coking coal price australia", "giá than cốc luyện kim hôm nay"),
    "than":       ("Than luyện cốc FOB Australia", "coking coal price australia", "giá than cốc hôm nay"),
    "coking coal":("Than luyện cốc FOB Australia", "coking coal price australia", "giá than cốc luyện kim hôm nay"),
    "urea":       ("Urea (phân đạm)", "urea fertilizer price", "giá phân urea hôm nay"),
    "phân bón":   ("Urea (phân đạm)", "urea fertilizer price", "giá phân bón urea hôm nay"),
    "đạm":        ("Urea (phân đạm)", "urea fertilizer price", "giá phân urea hôm nay"),
    "cao su":     ("Cao su tự nhiên (SICOM/TOCOM)", "rubber price per kg", "giá cao su hôm nay"),
    "sữa bột":    ("Sữa bột nguyên kem (WMP)", "whole milk powder price per tonne", "giá sữa bột nguyên liệu"),
    "sữa":        ("Sữa bột nguyên kem (WMP)", "whole milk powder price per tonne", "giá sữa bột nguyên liệu"),
    "cước vận tải": ("Cước vận tải biển (container)", "Drewry world container index freight rate", "giá cước vận tải biển hôm nay"),
    "cước biển":  ("Cước vận tải biển (container)", "Drewry world container index freight rate", "giá cước vận tải biển hôm nay"),
    "freight":    ("Cước vận tải biển (container)", "Drewry world container index freight rate", "giá cước vận tải biển hôm nay"),
}


def get_commodity_prices(commodities: str = "") -> dict:
    """
    Lấy GIÁ HÀNG HÓA THẬT, MỚI NHẤT TỪ SÀN GIAO DỊCH (Yahoo Finance, giá đóng cửa gần nhất
    + % thay đổi + ngày). Dùng cho câu hỏi về giá nguyên liệu/hàng hóa: thép HRC, dầu Brent/WTI,
    vàng, đồng, nhôm, khí gas. ĐÂY LÀ GIÁ SÀN GỐC, không phải tin báo.

    LƯU Ý: Quặng sắt 62% Fe CFR và than luyện cốc FOB là CHỈ SỐ ĐỊNH GIÁ (Platts/SGX) trả phí,
    KHÔNG có sàn miễn phí — tool trả ghi chú để bạn dùng web_search nguồn chuyên ngành.

    Args:
        commodities: chuỗi tên hàng hóa cách nhau dấu phẩy (vd "thép hrc, dầu brent, đồng").
                     Để trống → trả rổ mặc định (thép HRC, Brent, WTI, vàng, đồng).
    """
    import contextlib, io
    from datetime import datetime as _dt

    req = [c.strip().lower() for c in (commodities or "").split(",") if c.strip()]
    no_feed_hits = []
    chosen = []  # (symbol, name, unit, exchange)
    if not req:
        for kw in ["thép hrc", "dầu brent", "dầu wti", "vàng", "đồng"]:
            chosen.append(_COMMODITY_MAP[kw])
    else:
        seen = set()
        for r in req:
            hit = None
            for kw, info in _COMMODITY_MAP.items():
                if kw in r or r in kw:
                    hit = info; break
            if hit and hit[0] not in seen:
                seen.add(hit[0]); chosen.append(hit)
            elif not hit:
                for kw, tup in _COMMODITY_NO_FEED.items():
                    if kw in r:
                        if tup not in no_feed_hits:
                            no_feed_hits.append(tup)   # (label, en_q, vn_q)
                        break

    @contextlib.contextmanager
    def _quiet():
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            yield

    results = []
    try:
        with _quiet():
            import yfinance as yf
        for sym, name, unit, exch in chosen:
            try:
                with _quiet():
                    h = yf.Ticker(sym).history(period="7d")
                if h is None or h.empty:
                    continue
                last = float(h["Close"].iloc[-1])
                prev = float(h["Close"].iloc[-2]) if len(h) >= 2 else last
                date = str(h.index[-1].date())
                results.append({
                    "ten": name, "symbol": sym, "gia": round(last, 2), "don_vi": unit,
                    "thay_doi_pct": round((last - prev) / prev * 100, 2) if prev else None,
                    "ngay": date, "san": exch,
                    "link": f"https://finance.yahoo.com/quote/{sym}",   # nguồn click được
                })
            except Exception:
                continue
    except Exception as e:
        return {"error": f"Không nạp được yfinance: {e}", "status": "ERROR"}

    out = {"results": results, "count": len(results),
           "source": "Yahoo Finance (giá đóng cửa sàn)", "status": "OK"}
    if no_feed_hits:
        import re as _re

        def _parse_benchmark(items):
            """Trích số benchmark từ snippet quốc tế — ĐA ĐƠN VỊ (USD/T, USD/kg, cents/kg,
            USD/FEU, index points). Nếu không trích được số sạch → vẫn trả snippet gốc."""
            num = (r"([\d]{1,6}(?:[.,]\d+)?)")
            patterns = [
                num + r"\s*USD\s*/?\s*(?:metric\s*)?(tonne|ton|MT|kg|FEU|TEU)\b",
                r"USD\s*" + num + r"\s*(?:per|/)\s*(?:metric\s*)?(tonne|ton|kg|container|FEU)",
                num + r"\s*(?:USD?\s*)?(cents?)\s*/?\s*(lb|kg)",
                num + r"\s*(points?)\b",
            ]
            for it in items:
                text = f"{it.get('title','')} {it.get('snippet','')}"
                for pat in patterns:
                    m = _re.search(pat, text, _re.I)
                    if m:
                        unit = " ".join(g for g in m.groups()[1:] if g) or "USD/tấn"
                        dm = _re.search(r"([A-Z][a-z]+ \d{1,2},? \d{4})", text)
                        return {"gia": m.group(1), "don_vi": unit.lower(),
                                "ngay": dm.group(1) if dm else it.get("date"),
                                "nguon": it.get("source"), "link": it.get("link"),
                                "trich": (it.get("snippet") or "")[:170]}
            # Không trích được số → trả snippet đầu tiên để Agent tự đọc
            if items:
                it = items[0]
                return {"gia": None, "don_vi": None, "ngay": it.get("date"),
                        "nguon": it.get("source"), "link": it.get("link"),
                        "trich": (it.get("snippet") or it.get("title") or "")[:170]}
            return None

        # ESCALATION: ưu tiên NGUỒN QUỐC TẾ (Trading Economics/Investing) lấy SỐ benchmark thật,
        # kèm tin chuyên ngành VN cho bối cảnh. Deterministic, không phụ thuộc model lặp.
        out["khong_co_san"] = [t[0] for t in no_feed_hits]
        benchmarks, vn_news = [], []
        for label, en_q, vn_q in no_feed_hits:
            try:
                bm = _parse_benchmark((web_search(en_q, num_results=4, intl=True) or {}).get("results") or [])
                if bm:
                    bm["ve"] = label; benchmarks.append(bm)
            except Exception:
                pass
            try:
                for it in ((web_search(vn_q, num_results=3, news=True) or {}).get("results") or [])[:2]:
                    vn_news.append({"ve": label, "tieu_de": it.get("title"), "ngay": it.get("date"),
                                    "nguon": it.get("source"), "link": it.get("link")})
            except Exception:
                pass

        out["benchmark_quoc_te"] = benchmarks      # số + đơn vị + ngày + link (TE/Investing/Drewry…)
        out["tham_chieu_bao_vn"] = vn_news         # bối cảnh trong nước
        out["ghi_chu"] = ("Các mục này là chỉ số định giá/benchmark quốc tế (Platts/SGX/Drewry, trả phí). "
                          "Đã LEO THANG sang nguồn QUỐC TẾ ('benchmark_quoc_te': số + đơn vị + ngày + link từ "
                          "Trading Economics/Investing/Drewry) + tin VN ('tham_chieu_bao_vn'). Khi trả lời: "
                          "nêu SỐ + ĐƠN VỊ kèm nguồn+ngày; nếu 'gia'=null thì đọc 'trich' để lấy con số.")
    return out


# ============================================================
# TOOL 2: get_market_price
# ============================================================
def get_market_price(ticker: str) -> dict:
    """
    Lấy giá thị trường real-time, khối lượng giao dịch, và biến động giá
    30 ngày gần nhất của một cổ phiếu từ vnstock (nguồn VCI).

    Args:
        ticker: Mã cổ phiếu (HPG, VCB, FPT ...).
    """
    t = ticker.strip().upper()
    if not _is_plausible_ticker(t):
        return {"error": f"Mã '{t}' không hợp lệ.", "status": "INVALID"}

    try:
        with _suppress_stdout():
            from vnstock.api.quote import Quote
            from vnstock.api.company import Company

        # Giá 30 ngày
        end_date   = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=30)
        q = Quote(symbol=t, source="VCI")
        with _suppress_stdout():
            df = q.history(
                start=start_date.isoformat(),
                end=end_date.isoformat(),
                interval="1D",
            )

        if df is None or df.empty:
            return {"error": f"Không có dữ liệu giá cho {t}", "status": "NO_DATA"}

        latest = df.iloc[-1]
        prev   = df.iloc[-2] if len(df) >= 2 else latest

        # vnstock trả về giá đơn vị nghìn VND (vd: 23.2 = 23,200 VND)
        PRICE_UNIT = 1000
        close_now  = float(latest["close"]) * PRICE_UNIT
        close_prev = float(prev["close"])   * PRICE_UNIT
        change_pct = round((close_now - close_prev) / close_prev * 100, 2)

        # 30-day stats (nhân PRICE_UNIT)
        high_30  = int(df["high"].max() * PRICE_UNIT)
        low_30   = int(df["low"].min()  * PRICE_UNIT)
        avg_vol  = int(df["volume"].mean())

        # Lấy thêm từ overview nếu có
        company_data = {}
        try:
            c = Company(symbol=t, source="VCI")
            with _suppress_stdout():
                ov = c.overview()
            if ov is not None and not ov.empty:
                row = ov.iloc[0]
                h52 = int(row.get("highest_price1_year", 0))
                company_data = {
                    "market_cap_trillion": round(float(row.get("market_cap", 0)) / 1e12, 1),
                    "price_52w_high":      h52,
                    "price_52w_low":       int(row.get("lowest_price1_year", 0)),
                    "analyst_rating":      str(row.get("rating", "")),
                    "target_price":        int(row.get("target_price", 0)) if row.get("target_price") else None,
                    "foreigner_pct":       round(float(row.get("foreigner_percentage", 0)) * 100, 1),
                }
                # Metric ĐỘ LỚN: % so với đỉnh 52T (âm = đang dưới đỉnh) + upside tới giá mục tiêu.
                # h52/target_price từ overview đã là VND đầy đủ (KHÁC close phải ×1000).
                if h52:
                    company_data["pct_vs_dinh_52w"] = round((close_now - h52) / h52 * 100, 1)
                tp = company_data.get("target_price")
                if tp:
                    company_data["upside_target_pct"] = round((tp - close_now) / close_now * 100, 1)
        except Exception:
            pass

        return {
            "ticker":           t,
            "price":            int(close_now),
            "price_change_pct": change_pct,
            "price_change_vnd": int(close_now - close_prev),
            "volume_today":     int(latest["volume"]),
            "open_today":       int(float(latest["open"])  * PRICE_UNIT),
            "high_today":       int(float(latest["high"])  * PRICE_UNIT),
            "low_today":        int(float(latest["low"])   * PRICE_UNIT),
            "high_30d":         high_30,
            "low_30d":          low_30,
            "avg_volume_30d":   avg_vol,
            "as_of":            str(latest["time"]),
            "price_history_30d": [
                {"date": str(r["time"]), "close": int(float(r["close"]) * PRICE_UNIT), "volume": int(r["volume"])}
                for _, r in df.tail(10).iterrows()  # 10 ngày cuối cho Agent đọc
            ],
            **company_data,
            "status": "OK",
        }

    except Exception as e:
        return {"error": str(e), "status": "VNSTOCK_ERROR"}


# ============================================================
# TOOL 3: compare_stocks
# ============================================================
def compare_stocks(tickers: list[str]) -> dict:
    """
    So sánh đồng thời nhiều cổ phiếu: giá, P/E, doanh thu Q, lợi nhuận Q,
    rating analyst, target price. Hữu ích khi cần so sánh nhóm ngân hàng
    (VCB/TCB/BID) hoặc BĐS (VHM/VIC).

    Args:
        tickers: Danh sách mã cổ phiếu cần so sánh (tối đa 5).
                 Ví dụ: ["VCB", "TCB", "BID"]
    """
    if isinstance(tickers, str):
        tickers = [t.strip() for t in tickers.split(",")]
    tickers = [t.strip().upper() for t in tickers[:5]]
    invalid = [t for t in tickers if not _is_plausible_ticker(t)]
    if invalid:
        return {"error": f"Mã không hợp lệ: {invalid}", "status": "INVALID"}

    def _sf(v, mult=1.0):
        """safe float: None/NaN/chuỗi rác → None (tránh 1 field None làm hỏng CẢ mã)."""
        try:
            if v is None:
                return None
            f = float(v)
            return f * mult if f == f else None   # f==f loại NaN
        except (ValueError, TypeError):
            return None

    try:
        with _suppress_stdout():
            from vnstock.api.company import Company
            from vnstock.api.financial import Finance

        results = []
        for t in tickers:
            row = {"ticker": t, "status": "OK"}
            got = False     # đã lấy được ÍT NHẤT 1 chỉ số thật chưa
            mc  = None

            # ── Overview (None-safe TỪNG field) ───────────────────────────
            try:
                c = Company(symbol=t, source="VCI")
                with _suppress_stdout():
                    ov = c.overview()
                if ov is not None and not ov.empty:
                    r = ov.iloc[0]
                    mc  = _sf(r.get("market_cap"))
                    iss = _sf(r.get("issue_share"))
                    cur = _sf(r.get("current_price"))
                    tp  = _sf(r.get("target_price"))
                    up  = _sf(r.get("upside_to_target_percent"))
                    fp  = _sf(r.get("foreigner_percentage"))
                    h52 = _sf(r.get("highest_price1_year"))
                    l52 = _sf(r.get("lowest_price1_year"))
                    if cur:           row["current_price"] = int(cur); got = True
                    if mc is not None: row["market_cap_trillion"] = round(mc / 1e12, 1); got = True
                    if mc and iss:    row["price"] = int(mc / iss)
                    if r.get("rating"): row["analyst_rating"] = str(r.get("rating"))
                    if tp:            row["target_price"] = int(tp)
                    if up is not None: row["upside_pct"] = round(up * 100, 1)
                    if fp is not None: row["foreigner_pct"] = round(fp * 100, 1)
                    if h52:           row["price_52w_high"] = int(h52)
                    if l52:           row["price_52w_low"] = int(l52)
            except Exception as e:
                row["overview_err"] = str(e)[:120]

            # ── Financial (try riêng — không để hỏng overview) ────────────
            try:
                f = Finance(symbol=t, source="VCI")
                with _suppress_stdout():
                    income = f.income_statement(period="quarter", lang="vi")
                data_cols = [col for col in income.columns if col not in ("item", "item_en", "item_id")]
                if data_cols:
                    latest_q = data_cols[0]
                    row["latest_quarter"] = latest_q

                    def _get(en):
                        mask = income["item_en"] == en
                        if mask.any():
                            return _sf(income.loc[mask, latest_q].values[0], 1 / 1e9)
                        return None

                    net_profit = _get("Net profit/(loss) after tax")
                    rev        = _get("Net sales") or _get("Net interest income")
                    if rev is not None:        row["revenue_q_bn"] = round(rev, 1); got = True
                    if net_profit is not None: row["net_profit_q_bn"] = round(net_profit, 1); got = True
                    if mc and net_profit and net_profit > 0:
                        row["pe_ttm"] = round(mc / (4 * net_profit * 1e9), 2)
            except Exception as e:
                row["fin_err"] = str(e)[:120]

            # ── LEO THANG: thiếu giá/vốn hóa → lấy từ get_market_price ────
            if not row.get("market_cap_trillion") or not (row.get("current_price") or row.get("price")):
                try:
                    mp = get_market_price(t)
                    if mp.get("status") == "OK":
                        if mp.get("price"):
                            row.setdefault("current_price", mp["price"])
                            row.setdefault("price", mp["price"])
                        if mp.get("market_cap_trillion"):
                            row["market_cap_trillion"] = mp["market_cap_trillion"]
                        row["price_source"] = "get_market_price"
                        got = True
                except Exception:
                    pass

            if not got:
                row["status"] = "NO_DATA"
                row["luu_y"] = ("Chưa lấy được số liệu từ vnstock cho mã này. ĐỪNG bịa — hãy thử "
                                "get_financial_statements / web_search; nếu vẫn không có thì ghi rõ "
                                "'chưa lấy được dữ liệu', KHÔNG điền số ước đoán.")
            results.append(row)

        n_ok = sum(1 for r in results if r.get("status") == "OK")
        return {
            "comparison": results,
            "tickers":    tickers,
            "count":      len(results),
            "ok_count":   n_ok,
            "as_of":      datetime.now(timezone.utc).isoformat(),
            "ghi_chu":    ("Chỉ trình bày số có THẬT trong kết quả này. Mã nào status=NO_DATA hoặc "
                           "thiếu field → KHÔNG được bịa số; báo 'chưa lấy được' hoặc lấy từ tool khác. "
                           "Số trong bảng trả lời PHẢI khớp dữ liệu tool, không tự chế."),
            "status":     "OK",
        }

    except Exception as e:
        return {"error": str(e), "status": "ERROR"}


# ============================================================
# TOOL 4: get_market_overview
# ============================================================
def get_market_overview() -> dict:
    """
    Lấy tổng quan thị trường chứng khoán Việt Nam:
    - Tỷ giá USD/VND thực từ Vietcombank
    - Lãi suất NHNN và Fed hiện tại
    - Bảng giá + trạng thái của cả 10 cổ phiếu Top 10
    - Phân loại tăng/giảm hôm nay
    """
    import requests
    import xml.etree.ElementTree as ET

    result: dict = {
        "as_of":    datetime.now(timezone.utc).isoformat(),
        "status":   "OK",
    }

    # ── Vĩ mô từ Supabase KG (đã được sync bởi sync_fundamentals.py) ──
    try:
        rows = get_supabase().table("graph_nodes").select(
            "entity_id,properties"
        ).eq("entity_type", "MACRO").in_(
            "entity_id", ["TY_GIA_USD_VND", "LAI_SUAT_VN", "LAI_SUAT_FED"]
        ).execute()

        macro = {}
        for r in (rows.data or []):
            macro[r["entity_id"]] = r["properties"]

        usd_vnd = macro.get("TY_GIA_USD_VND", {})
        sbv     = macro.get("LAI_SUAT_VN", {})
        fed     = macro.get("LAI_SUAT_FED", {})

        result["macro"] = {
            "usd_vnd":           usd_vnd.get("value", "N/A"),
            "usd_vnd_sell":      usd_vnd.get("sell", "N/A"),
            "usd_vnd_as_of":     usd_vnd.get("as_of", ""),
            "sbv_base_rate_pct": sbv.get("base_rate_pct", "N/A"),
            "sbv_refi_rate_pct": sbv.get("refi_rate_pct", "N/A"),
            "fed_rate_pct":      fed.get("value", "N/A"),
        }
    except Exception as e:
        result["macro"] = {"error": str(e)}

    # ── Giá Top 10 từ Supabase KG (properties đã sync) ──────────────
    try:
        rows = get_supabase().table("graph_nodes").select(
            "entity_id,name,properties"
        ).eq("entity_type", "STOCK").execute()

        stocks = []
        for r in (rows.data or []):
            p = r.get("properties") or {}
            stocks.append({
                "ticker":              r["entity_id"],
                "name":                r["name"],
                "price":               p.get("price"),
                "market_cap_trillion": p.get("market_cap_trillion"),
                "pe_ttm":              p.get("pe_ttm"),
                "analyst_rating":      p.get("analyst_rating"),
                "target_price":        p.get("target_price"),
                "upside_pct":          p.get("upside_pct"),
                "revenue_q_bn":        p.get("revenue_q_bn"),
                "net_profit_q_bn":     p.get("net_profit_q_bn"),
                "latest_quarter":      p.get("latest_quarter"),
                "price_52w_high":      p.get("price_52w_high"),
                "price_52w_low":       p.get("price_52w_low"),
                "synced_at":           p.get("synced_at", ""),
            })

        stocks.sort(key=lambda x: x.get("market_cap_trillion") or 0, reverse=True)
        result["top10_stocks"] = stocks
        result["total_stocks"] = len(stocks)

    except Exception as e:
        result["top10_stocks"] = []
        result["stock_error"] = str(e)

    return result
