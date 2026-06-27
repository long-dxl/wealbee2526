"""search_tools.py — web_search (SerpAPI) + read_article (HTML/PDF) + nguồn primary.
Tách khỏi agent_config (tự chứa). agent_config RE-EXPORT để không vỡ import cũ."""
import re

# Nguồn primary + map chủ đề/vĩ mô giờ thuộc HỒ SƠ THỊ TRƯỜNG (markets/vn/config.py) để scale
# đa-thị-trường. Re-export tên cũ (_VN_PRIMARY_SOURCES…) → mọi import cũ vẫn chạy (facade).
from markets.vn.config import (
    PRIMARY_SOURCES as _VN_PRIMARY_SOURCES,
    INTL_SOURCES as _INTL_PRIMARY_SOURCES,
    SECTOR_SOURCE_HINT as _SECTOR_SOURCE_HINT,
    TOPIC_SOURCES as _TOPIC_SOURCES,
    MACRO_SOURCE_MAP as _MACRO_SOURCE_MAP,
)


def _topic_site_filter(ql: str) -> str:
    """Dựng `(site:a OR site:b …)` THEO CHỦ ĐỀ: CORE bao quát + báo MẠNH NHẤT cho chủ đề câu hỏi.
    → vừa precise (đúng báo điểm mạnh) vừa đủ rộng. Trần ~8 domain (Google site:OR vẫn ổn)."""
    core = ["vietstock.vn", "tinnhanhchungkhoan.vn", "cafef.vn"]   # luôn có: bao quát TTCK/tin nhanh
    extra = [dom for kws, dom in _TOPIC_SOURCES if any(k in ql for k in kws)]
    # nếu không match chủ đề nào → thêm 2 báo vĩ mô/đầu tư bao quát
    if not extra:
        extra = ["vneconomy.vn", "baodautu.vn"]
    sites = list(dict.fromkeys(core + extra))[:8]
    return " (" + " OR ".join(f"site:{d}" for d in sites) + ")"


def _result_year(r: dict, cur_year: int):
    """Đoán NĂM của 1 kết quả search → để lọc/đẩy theo độ tươi.
    Ưu tiên field `date`; nếu là mốc tương đối (ngày/giờ trước) → coi là NĂM NAY; nếu trống → quét
    năm trong link+title (bắt trang lưu trữ kiểu .../2011/... hay 'Báo cáo thường niên 2011'). None nếu không rõ."""
    import re as _re
    d = (r.get("date") or "").lower().strip()
    if d:
        m = _re.search(r"\b(19\d{2}|20\d{2})\b", d)
        if m:
            return int(m.group(1))
        if _re.search(r"(trước|ago|giờ|phút|ngày|hôm|tuần|tháng)", d):   # "2 ngày trước" → mới
            return cur_year
    # date trống → quét năm trong URL/tiêu đề (chỉ nhận năm hợp lý ≤ năm hiện tại)
    for txt in ((r.get("link") or ""), (r.get("title") or "")):
        for y in _re.findall(r"\b(19\d{2}|20\d{2})\b", txt):
            yi = int(y)
            if 1995 <= yi <= cur_year:
                return yi
    return None


def _clean_search_query(q: str) -> str:
    """
    Bỏ cụm NGÀY/THÁNG/NĂM cụ thể khỏi query (nhồi ngày làm Google match nhầm trang điểm tin).
    GIỮ "hôm nay/mới nhất" (từ khóa generic, giúp khớp tiêu đề bản tin giá hằng ngày).
    """
    import re
    q = re.sub(r"\bngày\s*\d{1,2}\s*[-–/]?\s*\d{0,2}", " ", q, flags=re.IGNORECASE)
    q = re.sub(r"\btháng\s*\d{1,2}(\s*[-–/]\s*\d{1,2})?", " ", q, flags=re.IGNORECASE)
    q = re.sub(r"\bnăm\s*20\d{2}", " ", q, flags=re.IGNORECASE)
    q = re.sub(r"\b\d{1,2}/\d{1,2}(/\d{2,4})?\b", " ", q)   # 12/6 hoặc 12/6/2026
    q = re.sub(r"\b20\d{2}\b", " ", q)                       # năm đứng lẻ
    q = re.sub(r"\s+", " ", q).strip()
    return q


def web_search(query: str, num_results: int = 5, recent: bool = False,
               news: bool = False, intl: bool = False, prefer_sources: bool = False) -> dict:
    """
    TÌM KIẾM GOOGLE (qua SerpAPI) để lấy thông tin web CẬP NHẬT mà Knowledge Graph và
    vnstock CHƯA có. Trả về kết quả kèm LINK NGUỒN để TRÍCH DẪN. Ngữ cảnh VN (tiếng Việt).

    QUAN TRỌNG về QUERY: chỉ đặt TỪ KHÓA CỐT LÕI (tên công ty/chủ đề). TUYỆT ĐỐI KHÔNG nhồi
    ngày/tháng/"hôm nay"/"mới nhất" vào query — Google sẽ match nhầm các trang điểm-tin-theo-ngày.
    Muốn tin mới → đặt recent=True; muốn TIN TỨC báo chí → đặt news=True.

    Args:
        query:       TỪ KHÓA cốt lõi (vd "FPT cổ phiếu", "ngành thép Việt Nam"). KHÔNG kèm ngày.
        num_results: Số kết quả (mặc định 5, tối đa 10).
        recent:      True để ưu tiên tin gần đây (1 tháng).
        news:        True để tìm trên GOOGLE NEWS (tin tức báo chí, có ngày, đúng chủ đề hơn).
        intl:        True để tìm NGUỒN QUỐC TẾ (tiếng Anh, google.com) — dùng cho giá hàng hóa
                     thế giới, dữ liệu vĩ mô toàn cầu (Trading Economics, Investing, Reuters…).
        prefer_sources: True để ÉP kết quả về các BÁO TÀI CHÍNH VN UY TÍN (site: filter) — DÙNG cho
                     BÁO CÁO PHÂN TÍCH NGÀNH / định giá / vĩ mô (Google News hay trả bài lạc đề; ép
                     site: cho ra báo cáo đúng trọng tâm từ Vietstock/TinnhanhCK/CafeF/Báo Đầu tư…).
    """
    import os
    import requests

    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        return {
            "error": "Chưa cấu hình SERPAPI_API_KEY trong file .env. "
                     "Lấy key tại https://serpapi.com/ rồi thêm vào .env.",
            "status": "NO_API_KEY",
        }

    clean_q = _clean_search_query(query) or query
    _ql = (query or "").lower()
    # TỰ BẬT recent cho truy vấn cần ĐỘ TƯƠI (báo cáo/giá mục tiêu/khuyến nghị/dự phóng) → tránh ra bài cũ 2024-25
    if not recent and any(k in _ql for k in
                          ("giá mục tiêu", "báo cáo phân tích", "khuyến nghị", "dự phóng", "mục tiêu",
                           "mới nhất", "cập nhật", "định giá",
                           # OUTLOOK/tương lai → ép tươi để tránh bài cũ 2021-2024
                           "tiềm năng", "triển vọng", "tương lai", "sắp tới", "kế hoạch", "mở rộng",
                           "dự án mới", "động lực tăng trưởng", "sắp triển khai")):
        recent = True
    # TỰ BẬT prefer_sources cho truy vấn BÁO CÁO/NGÀNH/VĨ MÔ (kết quả Google News thường lạc đề) → ép site:
    if not prefer_sources and not intl and any(k in _ql for k in
                          ("báo cáo phân tích", "báo cáo ngành", "triển vọng ngành", "phân tích ngành",
                           "định giá", "luận điểm đầu tư", "đầu tư công")):
        prefer_sources = True
    # prefer_sources: ép site: THEO CHỦ ĐỀ (core bao quát + báo MẠNH NHẤT cho chủ đề) → precise hơn filter cố định.
    if prefer_sources and not intl and "site:" not in _ql:
        clean_q = clean_q + _topic_site_filter(_ql)
        news = False   # site: filter cho kết quả tốt nhất ở chế độ web (organic), không phải Google News
    n = max(1, min(int(num_results), 10))
    if intl:
        params = {"engine": "google", "q": clean_q, "api_key": api_key,
                  "num": n, "hl": "en", "gl": "us", "google_domain": "google.com"}
    else:
        params = {"engine": "google", "q": clean_q, "api_key": api_key,
                  "num": n, "hl": "vi", "gl": "vn", "google_domain": "google.com.vn"}
    if news:
        params["tbm"] = "nws"          # Google News: tin báo chí, đúng chủ đề, có ngày
        # SẮP XẾP THEO NGÀY MỚI NHẤT (sbd:1) + giới hạn thời gian → tránh trả bài cũ (2025)
        params["tbs"] = "qdr:w,sbd:1" if recent else "qdr:m,sbd:1"
    elif recent:
        params["tbs"] = "qdr:m"        # ưu tiên 1 tháng gần nhất (chế độ web thường)
    try:
        data = requests.get("https://serpapi.com/search.json", params=params, timeout=20).json()
        # Lọc thời gian quá chặt → rỗng: NỚI dần NHƯNG giữ SÀN ~1 năm (qdr:y) để KHÔNG lọt bài cũ 2011/2022.
        if data.get("error") and params.get("tbs"):
            params["tbs"] = "sbd:1" if news else "qdr:y"
            data = requests.get("https://serpapi.com/search.json", params=params, timeout=20).json()
            if data.get("error") and params.get("tbs"):
                params.pop("tbs", None)
                data = requests.get("https://serpapi.com/search.json", params=params, timeout=20).json()
    except Exception as e:
        return {"error": str(e), "status": "SEARCH_ERROR"}

    if data.get("error"):
        return {"error": data["error"], "status": "SERPAPI_ERROR"}

    results = []
    if news:
        for r in (data.get("news_results") or [])[:n]:
            src = r.get("source")
            src = src.get("name") if isinstance(src, dict) else src
            results.append({"title": r.get("title"), "link": r.get("link"),
                            "snippet": r.get("snippet"), "date": r.get("date"), "source": src})
    else:
        for r in (data.get("organic_results") or [])[:n]:
            results.append({"title": r.get("title"), "link": r.get("link"),
                            "snippet": r.get("snippet"), "date": r.get("date"), "source": r.get("source")})

    # LỌC theo ĐỘ TƯƠI khi recent=True: bỏ bài CŨ (lọt qua do fallback) + đẩy bài MỚI lên.
    # Năm lấy từ field date; nếu trống → quét năm trong link/title (bắt trang lưu trữ kiểu .../2011/...).
    if recent and not intl:
        import datetime as _dt
        cur_year = _dt.date.today().year
        for r in results:
            r["_year"] = _result_year(r, cur_year)
        # Bỏ bài có năm XÁC ĐỊNH & cũ hơn năm ngoái (giữ năm nay + năm trước). KHÔNG bỏ bài không rõ năm.
        fresh = [r for r in results if r.get("_year") is None or r["_year"] >= cur_year - 1]
        if fresh:                       # chỉ lọc nếu vẫn còn kết quả (tránh trả rỗng)
            results = fresh

    # ƯU TIÊN NGUỒN PRIMARY + ĐỘ TƯƠI: primary lên đầu, trong mỗi nhóm bài MỚI trước (bài không rõ năm xuống cuối).
    # intl=True → dùng tập nguồn QUỐC TẾ (Investing/TradingView/CNBC/TradingEconomics/Fed…); còn lại dùng nguồn VN.
    _srcs = _INTL_PRIMARY_SOURCES if intl else _VN_PRIMARY_SOURCES
    for r in results:
        r["nguon_uy_tin"] = any(d in (r.get("link") or "") for d in _srcs)
    results.sort(key=lambda r: (0 if r.get("nguon_uy_tin") else 1, -(r.get("_year") or 0)))
    for r in results:
        r.pop("_year", None)            # dọn field nội bộ trước khi trả về

    out = {"query": clean_q, "mode": "news" if news else "web",
           "count": len(results), "results": results, "status": "OK"}

    # Answer box (nếu Google có trả lời nhanh) — kèm nguồn
    ab = data.get("answer_box")
    if ab:
        out["answer_box"] = {
            "answer": ab.get("answer") or ab.get("snippet"),
            "title":  ab.get("title"),
            "link":   ab.get("link"),
        }
    return out


# ============================================================
# TOOL: read_article — ĐỌC THÂN BÀI THẬT, TRÍCH CÂU CHỨA SỐ LIỆU
# ============================================================
# Câu có "đơn vị tài chính" gắn số → ưu tiên cao (đây là số liệu cốt lõi)
_RE_NUM_UNIT = re.compile(
    r"\d[\d.,]*\s*(?:%|‰|tỷ|nghìn\s*tỷ|triệu|nghìn|đồng|vnđ|vnd|usd|đô|điểm|"
    r"cổ\s*phiếu|cp|tấn|thùng|barrel|kwh|mw|ha|km|m2|lần|point|bps|pip)",
    re.IGNORECASE,
)
_RE_PERCENT  = re.compile(r"\d[\d.,]*\s*%")
# Số nhóm hàng nghìn kiểu VN (1.234 / 26.103 / 1.234,5) — thường là giá/giá trị
_RE_BIGNUM   = re.compile(r"\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b")
_RE_ANYNUM   = re.compile(r"\d")


def read_article(url: str, focus: str = "") -> dict:
    """
    ĐỌC NỘI DUNG THẬT của một bài báo/URL rồi TRÍCH các CÂU CHỨA SỐ LIỆU
    (%, tỷ đồng, giá, tỷ giá, khối lượng, doanh thu, xếp hạng, ngày…) để trả lời câu hỏi
    KÈM CON SỐ thay vì nói chung chung.

    Dùng khi: web_search / get_stock_news / query_news trả về TIÊU ĐỀ + snippet NHƯNG
    snippet CHƯA đủ con số cần thiết → MỞ 1 (hoặc vài) bài QUAN TRỌNG NHẤT để moi số thật.
    Sau khi đọc, hãy trả lời bằng CHÍNH các con số trong `so_lieu` + trích link nguồn.

    Args:
        url:   Link http(s) THẬT của bài (lấy từ kết quả web_search/get_stock_news/query_news).
        focus: (tùy chọn) cụm từ cần lấy số cho nó (vd "khối ngoại bán ròng", "doanh thu",
               "tỷ giá JPY") → các câu chứa cụm này được ưu tiên đưa lên đầu.
    """
    import requests as _requests
    from bs4 import BeautifulSoup as _BS

    u = (url or "").strip()
    if not u.startswith("http"):
        return {"error": "URL phải là link http(s) thật.", "status": "INVALID_URL"}

    headers = {
        "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/124.0 Safari/537.36"),
        "Accept-Language": "vi,en;q=0.8",
    }
    try:
        resp = _requests.get(u, headers=headers, timeout=15)
        resp.raise_for_status()
        _ctype = (resp.headers.get("Content-Type") or "").lower()
        _is_pdf = ("pdf" in _ctype) or u.lower().endswith(".pdf") or resp.content[:5] == b"%PDF-"
        if not _is_pdf:
            if not resp.encoding or resp.encoding.lower() == "iso-8859-1":
                resp.encoding = resp.apparent_encoding
            html = resp.text
    except Exception as e:
        return {"link": u, "status": "FETCH_FAIL",
                "note": f"Không mở được bài ({e}). Dùng snippet từ web_search và "
                        f"ghi '(nguồn chưa nêu con số cụ thể)' nếu thiếu số."}

    # ── PDF (báo cáo phân tích CTCK thường là PDF) → trích TEXT THẬT bằng PyMuPDF (else pdfplumber) ──
    if _is_pdf:
        raw, tieu_de = "", ""
        try:
            import fitz  # PyMuPDF
            with fitz.open(stream=resp.content, filetype="pdf") as _doc:
                tieu_de = (_doc.metadata or {}).get("title") or ""
                raw = "\n".join(_doc[i].get_text("text") for i in range(min(len(_doc), 30)))  # ≤30 trang
        except Exception:
            try:
                import pdfplumber, io as _io
                with pdfplumber.open(_io.BytesIO(resp.content)) as _pdf:
                    raw = "\n".join((p.extract_text() or "") for p in _pdf.pages[:30])
            except Exception as _e:
                return {"link": u, "status": "PDF_UNREADABLE",
                        "note": f"Là PDF nhưng không trích được text ({_e}). KHÔNG bịa nội dung — "
                                f"ghi '(báo cáo PDF chưa đọc được nội dung)'."}
        if len((raw or "").strip()) < 80:    # PDF scan ảnh / rỗng → KHÔNG có text để trích
            return {"link": u, "tieu_de": tieu_de, "status": "PDF_NO_TEXT",
                    "note": "PDF không có lớp text (có thể bản scan) → KHÔNG đọc được nội dung; "
                            "khi trả lời ghi '(báo cáo PDF chưa đọc được nội dung)', TUYỆT ĐỐI KHÔNG bịa."}
        if not tieu_de:
            tieu_de = (u.rsplit("/", 1)[-1] or "Báo cáo PDF")[:80]
    else:
        try:
            soup = _BS(html, "lxml")
        except Exception:
            soup = _BS(html, "html.parser")

        # Tiêu đề: og:title → <title> → <h1>
        tieu_de = ""
        og = soup.find("meta", attrs={"property": "og:title"})
        if og and og.get("content"):
            tieu_de = og["content"].strip()
        if not tieu_de and soup.title and soup.title.string:
            tieu_de = soup.title.string.strip()
        if not tieu_de:
            h1 = soup.find("h1")
            tieu_de = h1.get_text(" ", strip=True) if h1 else ""

        # Bỏ phần không phải nội dung
        for tag in soup(["script", "style", "noscript", "nav", "header", "footer",
                         "aside", "form", "figure", "figcaption", "iframe", "button"]):
            tag.decompose()

        # Lấy text: ưu tiên <article>, else gom <p>/<li>/<td>
        container = soup.find("article") or soup.find("main") or soup.body or soup
        blocks = container.find_all(["p", "li", "td", "h2", "h3"]) if container else []
        raw = " \n ".join(b.get_text(" ", strip=True) for b in blocks)
        if len(raw) < 200:                       # fallback: site lạ → lấy toàn bộ text
            raw = (container or soup).get_text(" ", strip=True)

    # Tách câu (giữ nguyên số kiểu 1.234 vì chỉ cắt sau dấu kết thúc + khoảng trắng)
    import re as _re
    parts = _re.split(r"(?<=[.!?…])\s+|\n+", raw)
    seen, sentences = set(), []
    for s in parts:
        s = " ".join(s.split())
        if 8 <= len(s) <= 320 and s not in seen:
            seen.add(s)
            sentences.append(s)

    foc = (focus or "").strip().lower()

    # từ khóa ĐỊNH TÍNH của BÁO CÁO (luận điểm/rủi ro/khuyến nghị…) → giữ câu KHÔNG-số nhưng quan trọng
    # (read_article vốn chỉ giữ câu CÓ SỐ → bỏ sót rủi ro/luận điểm định tính; bổ sung để trả lời sâu được).
    _foc_words = [w for w in foc.split() if len(w) > 3]
    def _score(s: str) -> int:
        sl = s.lower()
        sc = 0
        if _RE_PERCENT.search(s):  sc += 5
        if _RE_NUM_UNIT.search(s): sc += 4
        if _RE_BIGNUM.search(s):   sc += 3
        if any(k in sl for k in ("luận điểm", "rủi ro", "khuyến nghị", "giá mục tiêu", "động lực",
                                 "dự phóng", "định giá", "kỳ vọng", "thách thức", "tiềm năng",
                                 "catalyst", "khả quan", "triển vọng")):
            sc += 4                              # câu định tính trọng yếu (kể cả không số)
        if _foc_words and any(w in sl for w in _foc_words):
            sc += 6                              # khớp TỪ trong focus (trước: khớp cả chuỗi → gần như vô dụng)
        return sc

    scored = [(s, _score(s)) for s in sentences]
    so_lieu = [s for s, sc in scored if sc > 0]
    # sắp theo điểm (focus + định tính + nhiều loại số lên đầu), giữ thứ tự gốc khi bằng điểm
    so_lieu.sort(key=lambda s: -_score(s))
    so_lieu = so_lieu[:18]

    tom_tat = [s for s in sentences if _RE_ANYNUM.search(s) or len(s) > 40][:2]

    if not so_lieu:
        return {"link": u, "tieu_de": tieu_de, "status": "NO_NUMBERS",
                "tom_tat": tom_tat[:2],
                "note": "Bài KHÔNG chứa con số định lượng rõ ràng → khi trả lời ghi "
                        "'(nguồn chưa nêu con số cụ thể)', KHÔNG tự suy ra số."}

    return {
        "link": u,
        "tieu_de": tieu_de,
        "so_lieu": so_lieu,           # các CÂU CHỨA SỐ — trích nguyên văn con số vào câu trả lời
        "tom_tat": tom_tat,
        "status": "OK",
        "note": "Trả lời bằng CHÍNH con số trong 'so_lieu' + trích link. KHÔNG paraphrase định tính.",
    }
