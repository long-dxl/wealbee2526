"""core/wealbee_retriever.py — TOOL: lấy dữ liệu từ Supabase WEALBEE làm context.

Mục tiêu: đọc prompt người dùng → hiểu cần dữ liệu gì (mã nào, loại data, khung thời gian)
→ sinh truy vấn chính xác tới Supabase Wealbee (đã có sẵn data) → trả về bundle gọn để
orchestrator nhồi vào vòng tổng hợp Gemini.

Tách biệt với Supabase GỐC của kg-stock-vn: dùng biến môi trường riêng
  WEALBEE_SUPABASE_URL, WEALBEE_SUPABASE_KEY (service role).

Bảng Wealbee dùng:
  - prices_daily      (symbol, date, open, high, low, close, volume)
  - market_indices    (index_code, date, open, high, low, close, change_pt, change_pct)
  - market_news       (title, content_summary, label, impact_score, affected_symbols,
                       published_at, source, article_url)  -- đã gán nhãn
  - financials_annual (symbol, year, revenue, net_profit, eps, pe_ratio, pb_ratio, roe, roa, debt_to_equity)
  - stocks            (symbol, name, company_context, beta, sector_name)
  - company_subsidiaries (parent_symbol, company_name, ticker, ownership_pct, relation_type)
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from supabase import create_client, Client

# ── Kết nối Supabase Wealbee (lazy, tách env riêng) ──────────────────────────

@lru_cache(maxsize=1)
def _wb() -> Client | None:
    url = os.environ.get("WEALBEE_SUPABASE_URL", "").strip()
    key = os.environ.get("WEALBEE_SUPABASE_KEY", "").strip()
    if not url or not key:
        return None
    return create_client(url, key)


# ── Hiểu yêu cầu (intent) — rule-based, nhanh & tất định ─────────────────────

_TICKER_RE = re.compile(r"\b([A-Z]{3})\b")
_INDEX_WORDS = ("vn-index", "vnindex", "vn index", "hnx", "chỉ số", "thị trường chung")
_NEWS_WORDS = ("tin", "tin tức", "news", "thông tin", "sự kiện", "công bố")
_PRICE_WORDS = ("giá", "price", "tăng", "giảm", "cp", "phiên", "khối lượng")
_FIN_WORDS = ("tài chính", "bctc", "doanh thu", "lợi nhuận", "eps", "p/e", "pe", "roe",
              "định giá", "kết quả kinh doanh", "báo cáo", "financ")
_SUB_WORDS = ("công ty con", "công ty liên kết", "subsidiar", "sở hữu", "thành viên")
_INSIDER_WORDS = ("insider", "nội bộ", "giao dịch nội bộ", "lãnh đạo", "cổ đông lớn",
                  "ban lãnh đạo", "người liên quan", "mua bán nội bộ")


_DEFAULTS = {"news_hours": 72, "news_limit": 5, "price_days": 10, "fin_years": 4}


def _parse_intent_rules(query: str, max_tickers: int = 5) -> dict:
    """Fallback tất định: regex mã + keyword (dùng khi không có/không gọi được LLM)."""
    q = (query or "")
    ql = q.lower()
    stop = {"VND", "USD", "GDP", "CPI", "FED", "ETF", "IPO", "ROE", "ROA", "EPS", "NIM"}
    tickers = [t for t in dict.fromkeys(_TICKER_RE.findall(q)) if t not in stop][:max_tickers]

    want_index = any(w in ql for w in _INDEX_WORDS)
    want_news = any(w in ql for w in _NEWS_WORDS)
    want_fin = any(w in ql for w in _FIN_WORDS)
    want_sub = any(w in ql for w in _SUB_WORDS)
    want_price = any(w in ql for w in _PRICE_WORDS)
    want_insider = any(w in ql for w in _INSIDER_WORDS)
    if tickers and not (want_price or want_news or want_fin or want_sub or want_insider):
        want_price = want_news = want_fin = True

    hours = 24 if ("hôm nay" in ql or "mới nhất" in ql) else 168 if "tuần" in ql else 720 if "tháng" in ql else _DEFAULTS["news_hours"]
    return {
        "tickers": tickers,
        "want_price": want_price or bool(tickers),
        "want_news": want_news,
        "want_financials": want_fin,
        "want_index": want_index or not tickers,
        "want_subsidiaries": want_sub,
        "want_insider": want_insider,
        "news_hours": hours, "news_limit": _DEFAULTS["news_limit"],
        "price_days": _DEFAULTS["price_days"], "fin_years": _DEFAULTS["fin_years"],
        "_engine": "rules",
    }


_INTENT_SYS = (
    "Bạn là bộ định tuyến truy vấn cho hệ phân tích chứng khoán Việt Nam. Đọc câu hỏi, xuất JSON "
    "MÔ TẢ DỮ LIỆU CẦN LẤY từ DB nội bộ. CHỈ trả JSON, không text thừa.\n"
    "Schema: {\"tickers\": [mã 3 chữ in hoa], \"want_price\": bool, \"want_news\": bool, "
    "\"want_financials\": bool, \"want_index\": bool (VN-Index/HNX/thị trường chung), "
    "\"want_subsidiaries\": bool (công ty con/liên kết), \"news_hours\": int (hôm nay=24, tuần=168, "
    "tháng=720, mặc định=72), \"news_limit\": int 3-10, \"price_days\": int (mặc định 10; so sánh dài "
    "hạn 60-120), \"fin_years\": int 2-5}.\n"
    "Quy tắc: có mã mà không nói rõ loại → bật price+news+financials. So sánh nhiều mã → đủ mã + tăng "
    "price_days. Vĩ mô/ngành chung không mã → want_index=true, tickers=[]."
)


@lru_cache(maxsize=1)
def _gemini():
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        return None
    try:
        from google import genai
        return genai.Client(api_key=key)
    except Exception:
        return None


def _parse_intent_llm(query: str) -> dict | None:
    cli = _gemini()
    if cli is None:
        return None
    import json as _json
    for model in ("gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"):
        try:
            r = cli.models.generate_content(
                model=model,
                contents=f"{_INTENT_SYS}\n\nCÂU HỎI: {query}",
                config={"temperature": 0, "max_output_tokens": 400,
                        "response_mime_type": "application/json"},
            )
            data = _json.loads((r.text or "").strip())
            if not isinstance(data, dict):
                continue
            tickers = [str(t).upper().strip() for t in (data.get("tickers") or []) if str(t).strip()][:6]
            return {
                "tickers": tickers,
                "want_price": bool(data.get("want_price", bool(tickers))),
                "want_news": bool(data.get("want_news", False)),
                "want_financials": bool(data.get("want_financials", False)),
                "want_index": bool(data.get("want_index", not tickers)),
                "want_subsidiaries": bool(data.get("want_subsidiaries", False)),
                "news_hours": int(data.get("news_hours") or _DEFAULTS["news_hours"]),
                "news_limit": max(3, min(10, int(data.get("news_limit") or _DEFAULTS["news_limit"]))),
                "price_days": max(5, min(180, int(data.get("price_days") or _DEFAULTS["price_days"]))),
                "fin_years": max(2, min(5, int(data.get("fin_years") or _DEFAULTS["fin_years"]))),
                "_engine": f"llm:{model}",
            }
        except Exception:
            continue
    return None


def parse_intent(query: str, use_llm: bool = True) -> dict:
    """LLM hiểu intent (chính xác cho câu phức tạp) → fallback rule-based nếu lỗi/không có key."""
    if use_llm:
        out = _parse_intent_llm(query)
        if out is not None:
            return out
    return _parse_intent_rules(query)


# ── Query từng loại dữ liệu ──────────────────────────────────────────────────

def _latest_prices(sb: Client, sym: str, days: int = 10) -> list[dict]:
    r = (sb.table("prices_daily")
         .select("date,open,high,low,close,volume")
         .eq("symbol", sym).order("date", desc=True).limit(days).execute())
    return list(reversed(r.data or []))


def _indices(sb: Client) -> list[dict]:
    out = []
    for code in ("VNINDEX", "HNX"):
        r = (sb.table("market_indices")
             .select("date,close,change_pt,change_pct")
             .eq("index_code", code).order("date", desc=True).limit(1).execute())
        if r.data:
            out.append({"index_code": code, **r.data[0]})
    return out


def _news(sb: Client, sym: str | None, hours: int = 72, limit: int = 5) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    q = (sb.table("market_news")
         .select("title,content_summary,label,impact_score,affected_symbols,published_at,source,article_url")
         .not_.is_("label", "null").neq("label", "trash").gte("published_at", since))
    if sym:
        q = q.contains("affected_symbols", [sym])
    r = q.order("impact_score", desc=True).limit(limit).execute()
    return r.data or []


def _financials(sb: Client, sym: str, years: int = 4) -> list[dict]:
    r = (sb.table("financials_annual")
         .select("year,revenue,net_profit,eps,pe_ratio,pb_ratio,roe,roa,debt_to_equity")
         .eq("symbol", sym).order("year", desc=True).limit(years).execute())
    return r.data or []


def _company(sb: Client, sym: str) -> dict | None:
    r = (sb.table("stocks").select("symbol,name,company_context,beta,sector_name")
         .eq("symbol", sym).limit(1).execute())
    return r.data[0] if r.data else None


def _subsidiaries(sb: Client, sym: str, limit: int = 30) -> list[dict]:
    r = (sb.table("company_subsidiaries")
         .select("company_name,ticker,charter_capital,ownership_pct,relation_type")
         .eq("parent_symbol", sym).order("ownership_pct", desc=True).limit(limit).execute())
    return r.data or []


def _insider(sb: Client, sym: str, limit: int = 12) -> list[dict]:
    r = (sb.table("insider_transactions")
         .select("trade_date,insider_name,position,trade_type,volume,price,total_value")
         .eq("symbol", sym).order("trade_date", desc=True).limit(limit).execute())
    return r.data or []


# ══════════════════════════════════════════════════════════════════════════════
# QUERY-PLAN ENGINE — LLM biết SCHEMA → sinh kế hoạch query có cấu trúc, chạy trong
# WHITELIST (chặn bảng/cột/toán tử lạ, clamp limit, resolve token thời gian).
# ══════════════════════════════════════════════════════════════════════════════

# Whitelist: bảng → {cols cho phép select, filter: {cột: {toán tử}}, order: {cột}, max_limit}
SCHEMA: dict = {
    "prices_daily": {
        "cols": ["symbol", "date", "open", "high", "low", "close", "volume"],
        "filter": {"symbol": {"eq", "in"}, "date": {"gte", "lte", "eq", "gt", "lt"}},
        "order": {"date"}, "max_limit": 200,
    },
    "market_indices": {
        "cols": ["index_code", "date", "open", "high", "low", "close", "change_pt", "change_pct"],
        "filter": {"index_code": {"eq", "in"}, "date": {"gte", "lte", "eq"}},
        "order": {"date"}, "max_limit": 200,
    },
    "market_news": {
        "cols": ["title", "content_summary", "label", "impact_score", "news_type",
                 "affected_symbols", "published_at", "source", "article_url"],
        "filter": {"affected_symbols": {"contains"}, "published_at": {"gte", "lte"},
                   "label": {"eq", "neq", "in"}, "news_type": {"eq", "in"},
                   "source": {"eq", "in"}, "impact_score": {"gte", "lte"}},
        "order": {"published_at", "impact_score"}, "max_limit": 20,
    },
    "financials_annual": {
        "cols": ["symbol", "year", "revenue", "net_profit", "eps", "pe_ratio",
                 "pb_ratio", "roe", "roa", "debt_to_equity"],
        "filter": {"symbol": {"eq", "in"}, "year": {"gte", "lte", "eq"}},
        "order": {"year"}, "max_limit": 12,
    },
    "stocks": {
        "cols": ["symbol", "name", "company_context", "beta", "sector_name", "exchange"],
        "filter": {"symbol": {"eq", "in"}, "sector_name": {"eq", "ilike"}},
        "order": set(), "max_limit": 10,
    },
    "company_subsidiaries": {
        "cols": ["parent_symbol", "company_name", "ticker", "charter_capital",
                 "ownership_pct", "relation_type"],
        "filter": {"parent_symbol": {"eq", "in"}, "relation_type": {"eq"},
                   "ownership_pct": {"gte", "lte"}},
        "order": {"ownership_pct", "charter_capital"}, "max_limit": 50,
    },
    "analyst_reports": {  # báo cáo phân tích CTCK (Vietstock) — full_text trích từ PDF
        "cols": ["ticker", "title", "source_firm", "recommendation", "target_price",
                 "report_date", "full_text"],
        "filter": {"ticker": {"eq", "in"}, "recommendation": {"eq"},
                   "source_firm": {"eq"}, "report_date": {"gte", "lte"}},
        "order": {"report_date"}, "max_limit": 3,
    },
}

_MAX_QUERIES = 8  # trần số query mỗi request (chống lạm dụng)


def _schema_for_prompt() -> str:
    lines = []
    for t, m in SCHEMA.items():
        filt = ", ".join(f"{c}({'/'.join(sorted(ops))})" for c, ops in m["filter"].items())
        lines.append(f"- {t}: cột=[{', '.join(m['cols'])}] | filter được=[{filt}] | "
                     f"order=[{', '.join(sorted(m['order'])) or '—'}] | max_limit={m['max_limit']}")
    return "\n".join(lines)


def _resolve_value(v):
    """Resolve token thời gian: NOW, NOW-72h, NOW-180d → ISO. Giá trị khác giữ nguyên."""
    if isinstance(v, str):
        m = re.fullmatch(r"\s*NOW(?:-(\d+)([hd]))?\s*", v)
        if m:
            if not m.group(1):
                return datetime.now(timezone.utc).isoformat()
            n = int(m.group(1))
            delta = timedelta(hours=n) if m.group(2) == "h" else timedelta(days=n)
            return (datetime.now(timezone.utc) - delta).isoformat()
    return v


def _apply_filter(q, col: str, op: str, val):
    val = _resolve_value(val)
    if op == "eq":       return q.eq(col, val)
    if op == "neq":      return q.neq(col, val)
    if op == "gte":      return q.gte(col, val)
    if op == "lte":      return q.lte(col, val)
    if op == "gt":       return q.gt(col, val)
    if op == "lt":       return q.lt(col, val)
    if op == "in":       return q.in_(col, val if isinstance(val, list) else [val])
    if op == "contains": return q.contains(col, val if isinstance(val, list) else [val])
    if op == "ilike":    return q.ilike(col, f"%{val}%")
    return q


def execute_plan(sb: Client, plan: list) -> list[dict]:
    """Chạy plan trong WHITELIST. Trả [{label, table, rows|error}]. Bỏ qua gì không hợp lệ."""
    results = []
    for spec in (plan or [])[:_MAX_QUERIES]:
        if not isinstance(spec, dict):
            continue
        table = spec.get("table")
        meta = SCHEMA.get(table)
        if not meta:
            results.append({"label": spec.get("label", str(table)), "table": table,
                            "error": "bảng không nằm trong whitelist"})
            continue
        cols = [c for c in (spec.get("select") or meta["cols"]) if c in meta["cols"]] or meta["cols"]

        # Guardrail tin: ép đủ cột trích dẫn (LLM hay bỏ sót article_url) + chỉ tin đã gán nhãn, bỏ trash
        if table == "market_news":
            for must in ("title", "article_url", "source", "published_at", "label", "impact_score", "content_summary"):
                if must not in cols:
                    cols.append(must)

        q = sb.table(table).select(",".join(cols))
        if table == "market_news":
            q = q.not_.is_("label", "null").neq("label", "trash")

        for f in (spec.get("filters") or []):
            if not isinstance(f, (list, tuple)) or len(f) < 2:
                continue
            col, op = f[0], f[1]
            val = f[2] if len(f) > 2 else None
            if col in meta["filter"] and op in meta["filter"][col]:
                try:
                    q = _apply_filter(q, col, op, val)
                except Exception:
                    pass  # filter lỗi → bỏ qua, không phá query

        order = spec.get("order")
        if isinstance(order, dict) and order.get("col") in meta["order"]:
            q = q.order(order["col"], desc=str(order.get("dir", "desc")).lower() != "asc")

        try:
            limit = min(int(spec.get("limit") or 10), meta["max_limit"])
        except Exception:
            limit = 10
        q = q.limit(max(1, limit))

        try:
            results.append({"label": spec.get("label", table), "table": table,
                            "rows": q.execute().data or []})
        except Exception as e:
            results.append({"label": spec.get("label", table), "table": table,
                            "error": str(e)[:140]})
    return results


_PLAN_SYS = (
    "Bạn là bộ LẬP KẾ HOẠCH TRUY VẤN cho hệ phân tích chứng khoán VN. Cho câu hỏi + SCHEMA DB bên dưới, "
    "hãy xuất JSON kế hoạch lấy ĐÚNG dữ liệu cần thiết. CHỈ trả JSON, không text thừa.\n\n"
    "SCHEMA (chỉ được dùng bảng/cột/toán tử/order liệt kê ở đây — ngoài danh sách sẽ bị bỏ):\n{schema}\n\n"
    "ĐỊNH DẠNG: {{\"queries\": [ {{\"label\": str, \"table\": str, \"select\": [cột], "
    "\"filters\": [[cột, op, giá_trị]], \"order\": {{\"col\": str, \"dir\": \"asc|desc\"}}, \"limit\": int}} ]}}\n\n"
    "QUY TẮC:\n"
    "- Giá trị thời gian dùng token: NOW, NOW-24h, NOW-72h, NOW-180d (hệ thống tự đổi ra ngày). "
    "Hôm nay là {today} (giờ VN).\n"
    "- affected_symbols là MẢNG → lọc theo mã dùng: [\"affected_symbols\", \"contains\", [\"VCB\"]].\n"
    "- Tin tức (market_news): luôn order theo impact_score desc, limit 5-10; hệ thống tự lọc bỏ tin rác.\n"
    "- Giá (prices_daily): order date desc; phân tích/so-sánh dài hạn tăng limit (60-120 phiên).\n"
    "- BCTC (financials_annual): order year desc, limit theo số năm cần.\n"
    "- Mỗi mã trong câu hỏi → tạo query riêng cho mỗi loại dữ liệu cần (giá/tin/BCTC/hồ sơ).\n"
    "- Hỏi vĩ mô/ngành chung (không mã) → lấy market_indices (VNINDEX, HNX) + tin thị trường liên quan.\n"
    "- KHÔNG tạo query thừa. Tối đa 8 query."
)


def plan_queries(query: str) -> list | None:
    """LLM sinh kế hoạch query (schema-aware). None nếu không có key/lỗi."""
    cli = _gemini()
    if cli is None:
        return None
    import json as _json
    today = datetime.now(timezone(timedelta(hours=7))).strftime("%d/%m/%Y")
    sys_prompt = _PLAN_SYS.format(schema=_schema_for_prompt(), today=today)
    for model in ("gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"):
        try:
            r = cli.models.generate_content(
                model=model,
                contents=f"{sys_prompt}\n\nCÂU HỎI: {query}",
                config={"temperature": 0, "max_output_tokens": 900,
                        "response_mime_type": "application/json"},
            )
            data = _json.loads((r.text or "").strip())
            qs = data.get("queries") if isinstance(data, dict) else data
            if isinstance(qs, list) and qs:
                return qs
        except Exception:
            continue
    return None


# ── Điểm vào chính ───────────────────────────────────────────────────────────

def retrieve(query: str, use_plan: bool = False, symbols: list | None = None) -> dict:
    """DETERMINISTIC-FIRST: mặc định dùng intent RULE-BASED + bundle cố định → cùng câu hỏi
    luôn lấy CÙNG bộ dữ liệu (nhất quán giữa các lần chạy). Đặt use_plan=True để bật lại
    query-plan LLM (linh hoạt hơn nhưng KHÔNG tất định — chỉ dùng khi thật cần).

    symbols: nếu truyền (vd mã người dùng CHỌN ở agent), CHỈ lấy data các mã này —
    KHÔNG quét mã 3 ký tự trong prompt (tránh bắt nhầm mã trong câu ví dụ)."""
    sb = _wb()
    if sb is None:
        return {"available": False, "error": "Chưa cấu hình WEALBEE_SUPABASE_URL/KEY"}
    if use_plan and not symbols:
        plan = plan_queries(query)
        if plan:
            results = execute_plan(sb, plan)
            if any(r.get("rows") for r in results):
                return {"available": True, "mode": "plan", "plan": plan, "queries": results}
    return _retrieve_fixed(query, symbols=symbols)


def _retrieve_fixed(query: str, symbols: list | None = None) -> dict:
    """Bundle cố định theo intent RULE-BASED (tất định) — đường lấy data mặc định."""
    sb = _wb()
    intent = parse_intent(query, use_llm=False)
    # Mã CHỌN (nếu có) là nguồn DUY NHẤT — ghi đè mã regex quét từ prompt
    if symbols:
        intent["tickers"] = [s.upper() for s in symbols if s]
    if sb is None:
        return {"available": False, "intent": intent,
                "error": "Chưa cấu hình WEALBEE_SUPABASE_URL/KEY"}

    out: dict = {"available": True, "intent": intent, "indices": [], "stocks": {}}

    if intent["want_index"]:
        try:
            out["indices"] = _indices(sb)
        except Exception as e:
            out.setdefault("errors", []).append(f"indices: {e}")

    nh = intent.get("news_hours", _DEFAULTS["news_hours"])
    nl = intent.get("news_limit", _DEFAULTS["news_limit"])
    pd = intent.get("price_days", _DEFAULTS["price_days"])
    fy = intent.get("fin_years", _DEFAULTS["fin_years"])

    for sym in intent["tickers"]:
        rec: dict = {}
        try:
            if intent["want_price"]:
                rec["prices"] = _latest_prices(sb, sym, days=pd)
            if intent["want_news"]:
                rec["news"] = _news(sb, sym, hours=nh, limit=nl)
            if intent["want_financials"]:
                rec["financials"] = _financials(sb, sym, years=fy)
            if intent["want_subsidiaries"]:
                rec["subsidiaries"] = _subsidiaries(sb, sym)
            if intent.get("want_insider"):
                rec["insider"] = _insider(sb, sym)
            comp = _company(sb, sym)
            if comp:
                rec["company"] = comp
        except Exception as e:
            rec["error"] = str(e)
        out["stocks"][sym] = rec

    # Tin thị trường chung nếu hỏi tin mà không gắn mã
    if intent["want_news"] and not intent["tickers"]:
        try:
            out["market_news"] = _news(sb, None, hours=nh, limit=max(8, nl))
        except Exception as e:
            out.setdefault("errors", []).append(f"market_news: {e}")

    return out


def _fmt_val(k: str, v) -> str:
    if v is None:
        return "—"
    if k == "company_context":
        return str(v)[:600]
    if k == "full_text":
        return str(v)[:2500]
    if k == "content_summary":
        if isinstance(v, list):
            return " | ".join(str(x) for x in v[:3])
        return str(v)[:200]
    if isinstance(v, (list, dict)):
        return str(v)[:120]
    return str(v)


def _render_plan(bundle: dict) -> str:
    """Render kết quả query-plan (mode='plan') thành text gọn cho synthesis."""
    L: list[str] = ["## DỮ LIỆU WEALBEE (Supabase nội bộ — truy vấn theo yêu cầu)"]
    for res in bundle.get("queries", []):
        label = res.get("label") or res.get("table")
        if res.get("error"):
            L.append(f"\n### {label}\n- (lỗi: {res['error']})")
            continue
        rows = res.get("rows") or []
        if not rows:
            continue
        L.append(f"\n### {label}")
        for row in rows[:15]:
            parts = [f"{k}={_fmt_val(k, row[k])}" for k in row if k not in ("id", "created_at")]
            L.append("- " + " · ".join(parts))
    return "\n".join(L) if len(L) > 1 else ""


def to_context_with_refs(bundle: dict) -> tuple[str, list]:
    """Như to_context_block nhưng gắn [ref:N] cho tin/báo cáo (có URL) + trả refs=[{index,label,url}].
    Dữ liệu nội bộ không URL (giá/BCTC/chỉ số) KHÔNG gắn ref — sẽ được trích nguồn dạng text cụ thể."""
    refs: list = []
    seen: dict = {}
    seen_titles: set = set()

    def _norm(t: str) -> str:
        # chuẩn hóa tiêu đề để khử trùng tin đăng lại nhiều nguồn
        return re.sub(r"[^a-z0-9àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ ]", "",
                      (t or "").lower()).strip()[:80]

    def addref(label: str, url: str | None) -> str:
        if not url:
            return ""
        if url in seen:
            return f" [ref:{seen[url]}]"
        n = len(refs) + 1
        seen[url] = n
        refs.append({"index": n, "label": (label or "Nguồn")[:40], "url": url})
        return f" [ref:{n}]"

    if not bundle.get("available"):
        return "", refs

    # ── Fallback mode (bundle theo intent cố định) — VẪN gắn [ref:N] cho tin ──
    if bundle.get("mode") != "plan":
        L = ["## DỮ LIỆU WEALBEE (Supabase nội bộ)"]
        for idx in bundle.get("indices", []):
            pct = idx.get("change_pct")
            L.append(f"- {idx['index_code']}: {idx.get('close')} "
                     f"({'+' if (pct or 0) >= 0 else ''}{pct}%) · phiên {idx.get('date')} [Wealbee · market_indices]")
        for sym, rec in bundle.get("stocks", {}).items():
            L.append(f"\n### {sym}")
            comp = rec.get("company")
            if comp:
                L.append(f"- {comp.get('name')} · ngành {comp.get('sector_name')} · Beta {comp.get('beta')}")
                ctx = (comp.get("company_context") or "")[:600]
                if ctx:
                    L.append(f"- Hồ sơ: {ctx}")
            prices = rec.get("prices") or []
            if prices:
                last = prices[-1]
                L.append(f"- Giá mới nhất: {last.get('close')} · phiên {last.get('date')} · KL {last.get('volume')} "
                         f"[Wealbee · prices_daily · {last.get('date')}]")
            for f in (rec.get("financials") or [])[:3]:
                L.append(f"- BCTC {f.get('year')}: DT {f.get('revenue')}, LNST {f.get('net_profit')}, "
                         f"EPS {f.get('eps')}, P/E {f.get('pe_ratio')}, ROE {f.get('roe')} [Wealbee · financials_annual {f.get('year')}]")
            for n in (rec.get("news") or []):
                t = _norm(n.get("title"))
                if t and t in seen_titles:
                    continue
                seen_titles.add(t)
                cs = n.get("content_summary")
                cs = (cs[0] if isinstance(cs, list) and cs else (cs if isinstance(cs, str) else ""))
                ref = addref(n.get("source") or "Tin", n.get("article_url"))
                L.append(f"- {n.get('title')} (impact {n.get('impact_score')}, {str(n.get('published_at'))[:10]})"
                         f"{ref} — {cs[:120]}")
            for s in (rec.get("subsidiaries") or [])[:10]:
                L.append(f"- Cty con: {s.get('company_name')} ({s.get('ticker') or '—'}) "
                         f"sở hữu {s.get('ownership_pct')}% [{s.get('relation_type')}]")
            for it in (rec.get("insider") or [])[:12]:
                vol = it.get("volume") or 0
                L.append(f"- GD nội bộ {it.get('trade_date')}: {it.get('insider_name')} "
                         f"({it.get('position') or '—'}) {it.get('trade_type')} {vol:,} cp"
                         + (f", giá {it.get('price')}" if it.get("price") else "")
                         + " [Wealbee · insider_transactions]")
        for n in bundle.get("market_news", []):
            ref = addref(n.get("source") or "Tin", n.get("article_url"))
            L.append(f"- {n.get('title')}{ref}")
        return ("\n".join(L) if len(L) > 1 else ""), refs

    L = ["## DỮ LIỆU WEALBEE (Supabase nội bộ — truy vấn theo yêu cầu)"]
    for res in bundle.get("queries", []):
        label = res.get("label") or res.get("table")
        tbl = res.get("table")
        if res.get("error"):
            L.append(f"\n### {label}\n- (lỗi: {res['error']})")
            continue
        rows = res.get("rows") or []
        if not rows:
            continue
        L.append(f"\n### {label}")
        for row in rows[:15]:
            ref = ""
            if tbl == "market_news":
                t = _norm(row.get("title"))
                if t and t in seen_titles:
                    continue
                seen_titles.add(t)
                ref = addref(row.get("source") or "Tin", row.get("article_url"))
            elif tbl == "analyst_reports":
                ref = addref(row.get("source_firm") or "Báo cáo", row.get("pdf_url"))
            parts = [f"{k}={_fmt_val(k, row[k])}" for k in row
                     if k not in ("id", "created_at", "article_url", "pdf_url")]
            L.append("- " + " · ".join(parts) + ref)
    return ("\n".join(L) if len(L) > 1 else ""), refs


def to_context_block(bundle: dict) -> str:
    """Định dạng bundle thành text gọn để nhồi vào prompt tổng hợp."""
    if not bundle.get("available"):
        return ""
    if bundle.get("mode") == "plan":
        return _render_plan(bundle)
    L: list[str] = ["## DỮ LIỆU WEALBEE (Supabase nội bộ)"]

    for idx in bundle.get("indices", []):
        pct = idx.get("change_pct")
        L.append(f"- {idx['index_code']}: {idx.get('close')} "
                 f"({'+' if (pct or 0) >= 0 else ''}{pct}%) · phiên {idx.get('date')}")

    for sym, rec in bundle.get("stocks", {}).items():
        L.append(f"\n### {sym}")
        comp = rec.get("company")
        if comp:
            L.append(f"- {comp.get('name')} · ngành {comp.get('sector_name')} · Beta {comp.get('beta')}")
            ctx = (comp.get("company_context") or "")[:600]
            if ctx:
                L.append(f"- Hồ sơ: {ctx}")
        prices = rec.get("prices") or []
        if prices:
            last = prices[-1]
            L.append(f"- Giá mới nhất: {last.get('close')} · phiên {last.get('date')} · KL {last.get('volume')}")
        for f in (rec.get("financials") or [])[:3]:
            L.append(f"- BCTC {f.get('year')}: DT {f.get('revenue')}, LNST {f.get('net_profit')}, "
                     f"EPS {f.get('eps')}, P/E {f.get('pe_ratio')}, ROE {f.get('roe')}")
        for n in (rec.get("news") or []):
            cs = n.get("content_summary")
            cs = (cs[0] if isinstance(cs, list) and cs else (cs if isinstance(cs, str) else ""))
            L.append(f"- Tin [{n.get('label')}/{n.get('impact_score')}] {n.get('title')} "
                     f"({n.get('source')}, {str(n.get('published_at'))[:10]}) {cs[:100]}")
        for s in (rec.get("subsidiaries") or [])[:10]:
            L.append(f"- Cty con: {s.get('company_name')} ({s.get('ticker') or '—'}) "
                     f"sở hữu {s.get('ownership_pct')}% [{s.get('relation_type')}]")
        for it in (rec.get("insider") or [])[:12]:
            vol = it.get("volume") or 0
            L.append(f"- GD nội bộ {it.get('trade_date')}: {it.get('insider_name')} "
                     f"({it.get('position') or '—'}) {it.get('trade_type')} {vol:,} cp")

    for n in bundle.get("market_news", []):
        L.append(f"- Tin TT [{n.get('label')}] {n.get('title')} ({n.get('source')})")

    return "\n".join(L)


if __name__ == "__main__":
    import sys, json
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    q = " ".join(sys.argv[1:]) or "Phân tích VCB"
    b = retrieve(q)
    print(json.dumps(b.get("intent"), ensure_ascii=False))
    print("---")
    print(to_context_block(b)[:2000])
