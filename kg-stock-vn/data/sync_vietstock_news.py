"""
sync_vietstock_news.py
----------------------
Pipeline tích hợp tin tức THỰC từ Vietstock vào Supabase Temporal Knowledge Graph.
(Sprint 2 — trích xuất quan hệ có cấu trúc, lấy cảm hứng từ FinDKG)

Luồng:
  1. Gọi API Vietstock → lọc tin tức liên quan đến Top 10 cổ phiếu
  2. Gemini TRÍCH XUẤT CÓ CẤU TRÚC từng batch tiêu đề (ép JSON schema + enum):
     { sentiment, confidence[0..1], reason } → không free-text, giảm hallucination
  3. Upsert vào graph_nodes (NEWS) + graph_edges (NEWS → STOCK) với đầy đủ
     cột temporal: data_source='news', observed_at, source_url, evidence_quote, confidence

NGUYÊN TẮC CHỐNG HALLUCINATION:
  - Vietstock API chỉ trả TIÊU ĐỀ (không có thân bài). Vì vậy:
    + evidence_quote = chính tiêu đề THẬT (kiểm chứng được qua source_url)
    + 'reason' do Gemini sinh được lưu trong properties dưới nhãn 'ai_reason'
      (diễn giải AI, KHÔNG phải dữ kiện) — tách bạch rõ với bằng chứng gốc.
  - Mọi edge 'news' bắt buộc có source_url, nếu thiếu sẽ bị bỏ qua.

Chạy: python3 -m data.sync_vietstock_news [--days 3] [--min-confidence 0.0]
"""

import os
import re
import sys
import json
import time
import hashlib
import argparse
import requests
from datetime import datetime, date, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types

load_dotenv()

# ============================================================
# CẤU HÌNH
# ============================================================
SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Rổ ưu tiên fallback gom về hồ sơ thị trường (khi bảng watchlist trống). Watchlist động vẫn ưu tiên.
from markets.vn.config import TOP_10_TICKERS


# ─────────────────────────────────────────────────────────────────────
# WATCHLIST ĐỘNG — tập mã được crawl tin. Đọc từ bảng `watchlist` (active=true);
# fallback Top-10 nếu bảng chưa tạo/trống. Mở rộng phạm vi = INSERT, KHÔNG sửa code.
# ─────────────────────────────────────────────────────────────────────
_WATCHLIST_CACHE: set = set()


def get_watchlist(force_refresh: bool = False) -> set:
    """Trả tập mã cần crawl (UPPER). Cache trong tiến trình; fallback Top-10 khi lỗi/trống."""
    global _WATCHLIST_CACHE
    if _WATCHLIST_CACHE and not force_refresh:
        return _WATCHLIST_CACHE
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        r = sb.table("watchlist").select("ticker").eq("active", True).execute()
        tks = {row["ticker"].strip().upper() for row in (r.data or []) if row.get("ticker")}
        _WATCHLIST_CACHE = tks or set(TOP_10_TICKERS)
    except Exception:
        _WATCHLIST_CACHE = set(TOP_10_TICKERS)   # bảng chưa có → giữ Top-10
    return _WATCHLIST_CACHE


def normalize_title(title: str) -> str:
    """
    Chuẩn hoá tiêu đề để CHỐNG TRÙNG theo NỘI DUNG (không chỉ theo URL): bỏ tiền tố mã
    ('HPG:', 'VCB -'), hạ chữ thường, bỏ dấu câu, gộp khoảng trắng. Hai bài cùng sự kiện
    nhưng khác URL/cách giật tít sẽ ra cùng khoá → dedup được.
    """
    s = (title or "").strip()
    s = re.sub(r"^[A-Z]{2,4}\s*[:\-–]\s*", "", s)   # bỏ tiền tố mã đầu câu
    s = s.lower()
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)  # bỏ dấu câu, giữ chữ/số/khoảng trắng
    s = re.sub(r"\s+", " ", s).strip()
    return s


def title_hash(title: str) -> str:
    """MD5 của tiêu đề ĐÃ CHUẨN HOÁ — dùng làm khoá chống trùng theo nội dung."""
    return hashlib.md5(normalize_title(title).encode("utf-8")).hexdigest()

# API Vietstock (từ SOP)
VIETSTOCK_API = "https://vietstock.vn/_Partials/GetStockNewsByMarketPaging"
VIETSTOCK_SITE = "https://vietstock.vn"
API_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept":          "application/json, text/javascript, */*; q=0.01",
    "Content-Type":    "application/json; charset=UTF-8",
    "X-Requested-With":"XMLHttpRequest",
    "Referer":         "https://vietstock.vn/chu-de/1-8/tat-ca.htm",
    "Origin":          "https://vietstock.vn",
}

ITEMS_PER_PAGE = 15   # Mặc định của Vietstock API
MAX_PAGES      = 100  # Giới hạn an toàn
PAGE_DELAY     = 0.6  # Giây chờ giữa mỗi trang (tránh bị block)
GEMINI_BATCH   = 12   # Số tiêu đề gửi Gemini mỗi lần (tiết kiệm quota)
GEMINI_MODEL   = "gemini-3.1-flash-lite"  # Model nhẹ nhất cho classify

# ============================================================
# LAZY SINGLETON CLIENTS
# Khởi tạo khi cần, không chạy khi import
# ============================================================
_supabase: Client | None = None
_gemini_client = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


# ============================================================
# BƯỚC 1: THU THẬP TIN TỨC TỪ VIETSTOCK API
# ============================================================

def parse_vietstock_time(ts_str: str) -> datetime | None:
    """Parse format /Date(1234567890000)/ của Vietstock."""
    try:
        ms = int(ts_str.replace("/Date(", "").replace(")/", ""))
        return datetime.utcfromtimestamp(ms / 1000)
    except Exception:
        return None


def fetch_relevant_news(days_back: int = 3) -> dict:
    """
    Gọi Vietstock API MỘT LẦN, lấy CẢ: (a) tin của Top 10 cổ phiếu, (b) tin VĨ MÔ/NGÀNH
    (lãi suất, tỷ giá, giá thép/dầu, ngành ngân hàng/BĐS…) tác động tới cổ phiếu.
    Trả {"stock": [...], "macro_sector": [...]}.
    """
    cutoff = date.today() - timedelta(days=days_back)
    session = requests.Session()
    stock_articles, macro_articles, other_stock_articles = [], [], []
    total_pages_checked = 0

    print(f"\n{'='*55}")
    print(f"  BƯỚC 1: Tải tin Vietstock (từ {cutoff.strftime('%d/%m/%Y')}) — Top 10 + vĩ mô/ngành")
    print(f"{'='*55}")

    for page in range(1, MAX_PAGES + 1):
        total_pages_checked += 1
        try:
            resp = session.post(
                VIETSTOCK_API,
                json={"item": ITEMS_PER_PAGE, "martket": "1", "row": page},
                headers=API_HEADERS, timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  ❌ Lỗi trang {page}: {e}")
            break

        if data.get("Code") != 200 or not data.get("Data"):
            print(f"  -> Hết dữ liệu ở trang {page}.")
            break

        stop_pagination = False
        for art in data["Data"]:
            pub_time = parse_vietstock_time(art.get("PublishTime", ""))
            if not pub_time:
                continue
            if pub_time.date() < cutoff:
                stop_pagination = True
                break

            title = art.get("Title", "").strip()
            url = art.get("URL", "")
            if url and not url.startswith("http"):
                url = VIETSTOCK_SITE + url
            base = {
                "title":        title,
                "published_at": pub_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "pub_date":     pub_time.date(),
                "url":          url,
                "close_price":  art.get("ClosePrice"),
                "pct_change":   art.get("PerChange"),
                "source":       "Vietstock",
            }
            ticker = art.get("StockCode", "").strip().upper()
            if ticker in get_watchlist():          # WATCHLIST động (mở rộng = thêm DB, không sửa code)
                stock_articles.append({**base, "ticker": ticker})
            elif ticker.isalpha() and 2 <= len(ticker) <= 5:
                # Tin mã NGOÀI watchlist (vd peer HSG/NKG) → LƯU RAW (không LLM) để query ĐỌC DB
                # nhanh thay vì crawl live; nhãn tác động gắn LAZY khi phân tích (xem get_stock_news).
                other_stock_articles.append({**base, "ticker": ticker})
            else:
                # Tin KHÔNG gắn mã → xét xem có phải tin VĨ MÔ/NGÀNH không
                scope, sector = detect_macro_sector(title)
                if scope:
                    macro_articles.append({**base, "ticker": None, "scope": scope, "sector": sector})

        if page % 10 == 0:
            print(f"  Đã kiểm tra {page} trang — {len(stock_articles)} tin DN, {len(macro_articles)} tin vĩ mô/ngành")
        if stop_pagination:
            print(f"  -> Gặp bài ngày {pub_time.date()}, dừng phân trang.")
            break
        time.sleep(PAGE_DELAY)

    print(f"\n  ✅ {len(stock_articles)} tin watchlist + {len(other_stock_articles)} tin mã khác (raw) "
          f"+ {len(macro_articles)} tin vĩ mô/ngành (kiểm tra {total_pages_checked} trang)")
    return {"stock": stock_articles, "other_stock": other_stock_articles,
            "macro_sector": macro_articles}


def fetch_top10_news(days_back: int = 3) -> list:
    """(Tương thích ngược) Chỉ trả danh sách tin Top-10."""
    return fetch_relevant_news(days_back).get("stock", [])


# ============================================================
# BƯỚC 2: TRÍCH XUẤT CÓ CẤU TRÚC BẰNG GEMINI
# (ép JSON schema + enum → không free-text, giảm hallucination)
# ============================================================

VALID_SENTIMENTS = {"AFFECTS_POSITIVE", "AFFECTS_NEGATIVE", "MENTIONS"}

# Schema cứng buộc Gemini trả đúng cấu trúc, sentiment chỉ trong enum hợp lệ.
EXTRACTION_SCHEMA = types.Schema(
    type=types.Type.ARRAY,
    items=types.Schema(
        type=types.Type.OBJECT,
        required=["sentiment", "confidence", "reason"],
        properties={
            "sentiment": types.Schema(
                type=types.Type.STRING,
                enum=["AFFECTS_POSITIVE", "AFFECTS_NEGATIVE", "MENTIONS"],
            ),
            "confidence": types.Schema(
                type=types.Type.NUMBER,
                description="Độ tin cậy nhận định trong khoảng 0.0 đến 1.0",
            ),
            "reason": types.Schema(
                type=types.Type.STRING,
                description="Một câu ngắn giải thích, CHỈ dựa trên thông tin có trong tiêu đề",
            ),
        },
    ),
)

EXTRACT_PROMPT_TEMPLATE = """Bạn là chuyên gia phân tích chứng khoán Việt Nam.
Với MỖI tiêu đề tin tức dưới đây, hãy trích xuất tác động tới cổ phiếu được gắn thẻ [TICKER].

Quy tắc sentiment:
- AFFECTS_POSITIVE : Tin tốt (lợi nhuận tăng, hợp đồng mới, tăng trưởng, cổ tức, vượt kế hoạch...)
- AFFECTS_NEGATIVE : Tin xấu (lỗ, vi phạm, nợ xấu, điều tra, giảm lợi nhuận, bị bán phá giá...)
- MENTIONS         : Trung lập / chỉ đề cập (thông báo thường, họp ĐHCĐ, kết quả hỗn hợp...)

QUY TẮC QUAN TRỌNG:
- confidence: 0.8-1.0 nếu tiêu đề nêu rõ ràng tác động; 0.5-0.7 nếu hàm ý; <0.5 nếu mơ hồ.
- reason: CHỈ dựa vào thông tin CÓ trong tiêu đề. TUYỆT ĐỐI KHÔNG bịa số liệu, sự kiện
  hay chi tiết không xuất hiện trong tiêu đề. Nếu tiêu đề không đủ rõ → MENTIONS, confidence thấp.

Tiêu đề (mỗi dòng = 1 bài, format: "N. [TICKER] tiêu đề"):
{items}

Trả về JSON array đúng thứ tự, mỗi phần tử ứng với 1 tiêu đề."""


def _clamp01(x) -> float:
    """Ép confidence về [0,1]; trả 0.5 nếu không hợp lệ."""
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return 0.5


def extract_batch(batch: list[dict]) -> list[dict]:
    """
    Trích xuất có cấu trúc cho một batch tiêu đề qua Gemini.
    Trả về list dict {sentiment, confidence, reason} cùng độ dài với batch.
    """
    items_text = "\n".join(
        f"{i+1}. [{art['ticker']}] {art['title']}"
        for i, art in enumerate(batch)
    )
    prompt = EXTRACT_PROMPT_TEMPLATE.format(items=items_text)
    fallback = [{"sentiment": "MENTIONS", "confidence": 0.4, "reason": ""} for _ in batch]

    for attempt in range(3):  # Tối đa 3 lần thử
        try:
            resp = get_gemini_client().models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.05,  # Rất thấp để kết quả nhất quán
                    response_mime_type="application/json",
                    response_schema=EXTRACTION_SCHEMA,
                    max_output_tokens=2048,
                ),
            )
            results = json.loads(resp.text)

            # Chuẩn hóa từng phần tử + bảo toàn độ dài bằng batch
            normalized = []
            for i in range(len(batch)):
                r = results[i] if i < len(results) and isinstance(results[i], dict) else {}
                sent = r.get("sentiment")
                normalized.append({
                    "sentiment":  sent if sent in VALID_SENTIMENTS else "MENTIONS",
                    "confidence": _clamp01(r.get("confidence", 0.5)),
                    "reason":     (r.get("reason") or "").strip()[:300],
                })
            return normalized

        except Exception as e:
            if attempt < 2:
                wait = 2 ** attempt
                print(f"  ⚠️ Gemini batch error (thử {attempt+1}/3): {e} — chờ {wait}s")
                time.sleep(wait)
            else:
                print(f"  ❌ Gemini batch thất bại sau 3 lần: {e}")
                return fallback

    return fallback


def extract_all(articles: list[dict]) -> list[dict]:
    """Trích xuất có cấu trúc toàn bộ danh sách bài, gửi theo batch."""
    all_results: list[dict] = []
    total_batches = (len(articles) + GEMINI_BATCH - 1) // GEMINI_BATCH

    print(f"\n{'='*55}")
    print(f"  BƯỚC 2: Trích xuất có cấu trúc qua Gemini")
    print(f"  {len(articles)} bài → {total_batches} batch × {GEMINI_BATCH} tiêu đề/batch")
    print(f"{'='*55}")

    for i in range(0, len(articles), GEMINI_BATCH):
        batch = articles[i:i + GEMINI_BATCH]
        batch_num = i // GEMINI_BATCH + 1
        results = extract_batch(batch)
        all_results.extend(results)

        sents = [r["sentiment"] for r in results]
        pos = sents.count("AFFECTS_POSITIVE")
        neg = sents.count("AFFECTS_NEGATIVE")
        neu = sents.count("MENTIONS")
        avg_conf = sum(r["confidence"] for r in results) / max(len(results), 1)
        print(f"  Batch {batch_num}/{total_batches}: +{pos} -{neg} ~{neu} | conf TB {avg_conf:.2f}")

        # Nghỉ giữa các batch để tránh rate limit (15 req/phút free tier)
        if i + GEMINI_BATCH < len(articles):
            time.sleep(4)

    sents = [r["sentiment"] for r in all_results]
    print(f"\n  Tổng kết: ✅ {sents.count('AFFECTS_POSITIVE')} tích cực  "
          f"❌ {sents.count('AFFECTS_NEGATIVE')} tiêu cực  "
          f"⚪ {sents.count('MENTIONS')} trung lập")
    return all_results


# ============================================================
# BƯỚC 3: UPSERT VÀO KNOWLEDGE GRAPH
# ============================================================

def make_news_entity_id(ticker: str, url: str, published_at: str) -> str:
    """
    Tạo entity_id duy nhất cho mỗi bài tin.
    Format: NEWS_{TICKER}_{YYYYMMDD}_{URL_HASH_8}
    URL hash đảm bảo không trùng nếu cùng ngày cùng mã có nhiều bài.
    """
    date_str  = published_at[:10].replace("-", "")
    url_hash  = hashlib.md5(url.encode()).hexdigest()[:8].upper()
    return f"NEWS_{ticker}_{date_str}_{url_hash}"


def get_node_uuid(entity_id: str) -> str | None:
    """Tra cứu UUID của node theo entity_id."""
    try:
        r = (
            get_supabase().table("graph_nodes")
            .select("id")
            .eq("entity_id", entity_id)
            .single()
            .execute()
        )
        return r.data["id"] if r.data else None
    except Exception:
        return None


def upsert_news_to_graph(
    articles: list[dict],
    extractions: list[dict],
    min_confidence: float = 0.0,
) -> dict:
    """
    Upsert tất cả bài tin vào Temporal Knowledge Graph.
    - graph_nodes: Mỗi bài = 1 NEWS node
    - graph_edges: NEWS → STOCK với đầy đủ cột temporal:
        relationship_type = sentiment
        data_source       = 'news'
        observed_at       = ngày đăng bài (neo thời gian cho Feature 2)
        source_url        = link bài gốc (kiểm chứng được)
        evidence_quote    = tiêu đề THẬT (bằng chứng)
        confidence        = độ tin cậy do Gemini gán

    Args:
        min_confidence: bỏ qua edge có confidence < ngưỡng (lọc nhiễu).

    Trả về dict thống kê.
    """
    print(f"\n{'='*55}")
    print(f"  BƯỚC 3: Upsert vào Temporal Knowledge Graph")
    print(f"  (bỏ qua edge có confidence < {min_confidence})")
    print(f"{'='*55}")

    stats = {"nodes_ok": 0, "nodes_err": 0, "edges_ok": 0,
             "edges_err": 0, "skipped": 0, "low_conf": 0}

    for art, ext in zip(articles, extractions):
        ticker    = art["ticker"]
        sentiment = ext["sentiment"]
        confidence = ext["confidence"]
        ai_reason  = ext.get("reason", "")
        news_id   = make_news_entity_id(ticker, art["url"], art["published_at"])

        # ── Chống hallucination: edge tin tức bắt buộc có URL nguồn ──
        if not art.get("url"):
            print(f"  ⚠️ Bỏ qua (thiếu source_url): {news_id}")
            stats["skipped"] += 1
            continue

        # ── Upsert NEWS node ──────────────────────────────────────
        node_props = {
            "title":         art["title"],
            "url":           art["url"],
            "source":        art["source"],
            "published_at":  art["published_at"],
            "ticker":        ticker,
            "sentiment":     sentiment,
            "confidence":    confidence,
            "ai_reason":     ai_reason,          # diễn giải AI (KHÔNG phải dữ kiện)
            "close_price":   art.get("close_price"),
            "pct_change":    art.get("pct_change"),
            "synced_at":     datetime.utcnow().isoformat() + "Z",
        }
        try:
            r = (
                get_supabase().table("graph_nodes")
                .upsert(
                    {
                        "entity_id":   news_id,
                        "entity_type": "NEWS",
                        "name":        art["title"][:100],
                        "properties":  node_props,
                    },
                    on_conflict="entity_id",
                )
                .execute()
            )
            if r.data:
                stats["nodes_ok"] += 1
            else:
                stats["nodes_err"] += 1
                continue
        except Exception as e:
            print(f"  ❌ Node {news_id}: {e}")
            stats["nodes_err"] += 1
            continue

        # ── Lọc theo độ tin cậy (vẫn lưu node để tra cứu, chỉ bỏ edge) ──
        if confidence < min_confidence:
            stats["low_conf"] += 1
            continue

        # ── Lấy UUIDs của news node và ticker node ────────────────
        news_uuid   = get_node_uuid(news_id)
        ticker_uuid = get_node_uuid(ticker)

        if not news_uuid or not ticker_uuid:
            print(f"  ⚠️ Không tìm thấy UUID cho {news_id} hoặc {ticker}")
            stats["skipped"] += 1
            continue

        # ── Upsert EDGE: NEWS → STOCK (đầy đủ cột temporal) ───────
        edge_props = {
            "sentiment":   sentiment,
            "source":      "Vietstock",
            "ai_reason":   ai_reason,
            "close_price": art.get("close_price"),
            "pct_change":  art.get("pct_change"),
        }
        edge_columns = {
            "relationship_type": sentiment,
            "properties":        edge_props,
            "data_source":       "news",
            "observed_at":       art["published_at"],
            "confidence":        confidence,
            "source_url":        art["url"],
            "evidence_quote":    art["title"],     # bằng chứng = tiêu đề thật
        }
        try:
            existing = (
                get_supabase().table("graph_edges")
                .select("id")
                .eq("source_id", news_uuid)
                .eq("target_id", ticker_uuid)
                .execute()
            )
            if existing.data:
                # Cập nhật edge đã có
                get_supabase().table("graph_edges").update(
                    edge_columns
                ).eq("id", existing.data[0]["id"]).execute()
            else:
                # Tạo edge mới
                get_supabase().table("graph_edges").insert({
                    "source_id": news_uuid,
                    "target_id": ticker_uuid,
                    **edge_columns,
                }).execute()
            stats["edges_ok"] += 1

        except Exception as e:
            print(f"  ❌ Edge {news_id}→{ticker}: {e}")
            stats["edges_err"] += 1

    return stats


# ============================================================
# BƯỚC 3b: UPSERT VÀO BẢNG news_articles (đường ĐỌC NHANH cho Agent)
# Tách khỏi KG: lưu MỌI mã + gán NHÃN chủ đề + index theo mã/ngày.
# ============================================================

# Map mã → ngành (nhãn). Bổ sung dần khi mở rộng phạm vi crawl.
TICKER_SECTOR = {
    "HPG": "Thép", "VHM": "Bất động sản", "VIC": "Bất động sản", "VCB": "Ngân hàng",
    "TCB": "Ngân hàng", "BID": "Ngân hàng", "MSN": "Tiêu dùng", "VNM": "Tiêu dùng",
    "MWG": "Bán lẻ", "FPT": "Công nghệ",
}

# Quy tắc gán NHÃN chủ đề từ tiêu đề (keyword → tag). Tiếng Việt thường, không dấu phân biệt.
_TAG_RULES = {
    "cổ tức":            ["cổ tức", "chia cổ tức", "trả cổ tức", "tạm ứng cổ tức"],
    "phát hành":         ["phát hành", "esop", "chào bán", "tăng vốn", "quyền mua"],
    "kết quả kinh doanh":["lợi nhuận", "lnst", "doanh thu", "kqkd", "báo cáo kết quả", "lãi", "lỗ"],
    "nợ xấu/dự phòng":   ["nợ xấu", "trích lập", "dự phòng"],
    "margin":            ["margin", "ký quỹ", "cho vay"],
    "nhân sự/lãnh đạo":  ["hđqt", "tổng giám đốc", "bổ nhiệm", "từ nhiệm", "miễn nhiệm", "nhân sự", "chủ tịch"],
    "giao dịch nội bộ":  ["nội bộ", "đăng ký mua", "đăng ký bán", "cổ đông lớn", "thoái vốn"],
    "M&A/hợp tác":       ["sáp nhập", "mua lại", "thâu tóm", "m&a", "hợp tác", "liên doanh", "đối tác"],
    "hợp đồng/dự án":    ["hợp đồng", "ký kết", "trúng thầu", "dự án", "khởi công", "đầu tư"],
    "khối ngoại":        ["khối ngoại", "nước ngoài", "quỹ ngoại", "bán ròng", "mua ròng", "room"],
    "đại hội cổ đông":   ["đhcđ", "đại hội", "họp cổ đông", "nghị quyết"],
    "niêm yết/giao dịch":["niêm yết", "giao dịch", "thị giá", "cổ phiếu quỹ"],
}


def derive_tags(title: str) -> list:
    """Gán nhãn chủ đề cho 1 tiêu đề (giúp Agent lọc tin theo chủ đề)."""
    low = (title or "").lower()
    tags = [tag for tag, kws in _TAG_RULES.items() if any(k in low for k in kws)]
    return tags


# Tin THỦ TỤC / công bố thông tin (CBTT) — chỉ là filing kèm link PDF, KHÔNG có nội dung phân
# tích, người dùng coi là "rác" → loại bỏ. Nhận diện qua mẫu tiêu đề "MÃ: <động từ thủ tục>".
_PROCEDURAL_RE = re.compile(
    r"^[A-ZĐ0-9]{2,5}\s*:\s*(thông\s*báo|công\s*bố|báo\s*cáo|quyết\s*định|nghị\s*quyết|"
    r"giải\s*trình|tài\s*liệu|cbtt|ngày\s*đăng\s*ký|đính\s*chính|nhắc\s*nhở|"
    r"thay\s*đổi\s*giấy|điều\s*lệ|biên\s*bản|kết\s*quả\s*giao\s*dịch|"
    r"thông\s*báo\s*giao\s*dịch)",
    re.IGNORECASE,
)
_PROCEDURAL_KEYWORDS = ("công bố thông tin", "tài liệu đính kèm", "giải trình biến động")


def is_procedural_filing(title: str) -> bool:
    """True nếu tiêu đề là tin THỦ TỤC/CBTT (filing kèm link, không có phân tích)."""
    t = (title or "").strip()
    if _PROCEDURAL_RE.match(t):
        return True
    low = t.lower()
    return any(k in low for k in _PROCEDURAL_KEYWORDS)


def is_impactful(sentiment: str, title: str) -> bool:
    """
    Tin ĐÁNG LƯU = có tác động THẬT: sentiment +/- (KHÔNG trung lập MENTIONS)
    VÀ không phải tin thủ tục/CBTT chỉ-kèm-link.
    """
    if sentiment not in ("AFFECTS_POSITIVE", "AFFECTS_NEGATIVE"):
        return False
    if is_procedural_filing(title):
        return False
    return True


# ── TIN VĨ MÔ & NGÀNH (không gắn 1 DN cụ thể nhưng tác động cổ phiếu) ──────────
# (keywords, scope, sector). Khớp đầu tiên thắng.
_MACRO_SECTOR_RULES = [
    (["lãi suất", "nhnn", "ngân hàng nhà nước", " fed", "tỷ giá", "usd/vnd", "lạm phát",
      "cpi", "gdp", "tăng trưởng kinh tế", "room tín dụng", "chính sách tiền tệ",
      "trái phiếu chính phủ", "nâng hạng", "ftse", "msci", "thuế quan", "áp thuế"], "macro", None),
    (["giá thép", "quặng sắt", "thép hrc", "thép xây dựng", "thép trung quốc", "ngành thép"], "sector", "Thép"),
    (["ngành ngân hàng", "nợ xấu toàn ngành", "cổ phiếu ngân hàng", "tín dụng toàn"], "sector", "Ngân hàng"),
    (["bất động sản", "luật đất đai", "thị trường bđs", "tháo gỡ pháp lý", "ngành bđs"], "sector", "Bất động sản"),
    (["giá dầu", "dầu brent", "opec", "ngành dầu khí"], "sector", "Dầu khí"),
    (["dư nợ margin", "thị phần môi giới", "ngành chứng khoán", "cổ phiếu chứng khoán"], "sector", "Chứng khoán"),
    (["xuất khẩu", "đơn hàng dệt may", "thủy sản xuất khẩu"], "macro", None),
]


def detect_macro_sector(title: str):
    """Trả (scope, sector) nếu tiêu đề là tin VĨ MÔ/NGÀNH; (None, None) nếu không."""
    low = " " + (title or "").lower()
    for kws, scope, sector in _MACRO_SECTOR_RULES:
        if any(k in low for k in kws):
            return scope, sector
    return None, None


EXTRACT_MACRO_PROMPT = """Bạn là chuyên gia phân tích vĩ mô & ngành chứng khoán Việt Nam.
Với MỖI tiêu đề tin VĨ MÔ hoặc NGÀNH dưới đây, đánh giá TÁC ĐỘNG tới CỔ PHIẾU thuộc phạm vi [...]:
- AFFECTS_POSITIVE: hỗ trợ/thuận lợi (lãi suất giảm, nới tín dụng, nâng hạng, gỡ pháp lý, giá đầu ra tăng...)
- AFFECTS_NEGATIVE: bất lợi (lãi suất tăng mạnh, siết tín dụng, áp thuế, giá đầu vào tăng, rủi ro hệ thống...)
- MENTIONS: trung lập / không rõ tác động.

QUY TẮC: confidence 0.8-1.0 nếu rõ; 0.5-0.7 nếu hàm ý; <0.5 nếu mơ hồ. reason CHỈ dựa vào tiêu đề,
TUYỆT ĐỐI KHÔNG bịa số liệu/sự kiện. Không rõ tác động → MENTIONS.

Tiêu đề (mỗi dòng "N. [PHẠM VI] tiêu đề"):
{items}

Trả JSON array đúng thứ tự, mỗi phần tử ứng 1 tiêu đề."""


def extract_macro_batch(batch: list) -> list:
    """Phân loại tác động cho tin vĩ mô/ngành (không gắn 1 mã). Trả [{sentiment,confidence,reason}]."""
    items_text = "\n".join(
        f"{i+1}. [{(a.get('sector') or a.get('scope') or 'VĨ MÔ')}] {a['title']}"
        for i, a in enumerate(batch)
    )
    prompt = EXTRACT_MACRO_PROMPT.format(items=items_text)
    fallback = [{"sentiment": "MENTIONS", "confidence": 0.4, "reason": ""} for _ in batch]
    for attempt in range(3):
        try:
            resp = get_gemini_client().models.generate_content(
                model=GEMINI_MODEL, contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.05, response_mime_type="application/json",
                    response_schema=EXTRACTION_SCHEMA, max_output_tokens=2048,
                ),
            )
            results = json.loads(resp.text)
            out = []
            for i in range(len(batch)):
                r = results[i] if i < len(results) and isinstance(results[i], dict) else {}
                sent = r.get("sentiment")
                out.append({
                    "sentiment":  sent if sent in VALID_SENTIMENTS else "MENTIONS",
                    "confidence": _clamp01(r.get("confidence", 0.5)),
                    "reason":     (r.get("reason") or "").strip()[:300],
                })
            return out
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                print(f"  ❌ Gemini macro batch lỗi: {e}")
                return fallback
    return fallback


def upsert_news_to_table(articles: list, extractions: list, verbose: bool = True,
                         scope: str = "stock", impact_only: bool = True) -> dict:
    """
    Ghi tin vào bảng news_articles (upsert theo url). Lưu MỌI mã + nhãn + sentiment.
    CHỈ lưu tin CÓ TÁC ĐỘNG THẬT (impact_only=True): bỏ tin trung lập (MENTIONS) và tin
    thủ tục/CBTT chỉ-kèm-link. An toàn nếu bảng chưa tạo.
    """
    sb = get_supabase()
    rows = []
    seen_urls = set()                       # DEDUP theo url ngay trong batch
    seen_titles = set()                     # DEDUP theo NỘI DUNG (tiêu đề chuẩn hoá) trong batch
    skipped = dup_content = 0

    # CHỐNG TRÙNG CROSS-RUN: nạp content_hash của tin GẦN ĐÂY trong DB → bỏ bài cùng nội dung
    # dù khác URL/nguồn (cùng sự kiện được đăng lại). Best-effort, không làm hỏng pipeline nếu lỗi.
    existing_hashes: set = set()
    try:
        from datetime import datetime, timezone, timedelta
        _cut = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        _ex = (sb.table("news_articles").select("content_hash")
               .gte("published_at", _cut).limit(2000).execute())
        existing_hashes = {r["content_hash"] for r in (_ex.data or []) if r.get("content_hash")}
    except Exception:
        pass

    for a, e in zip(articles, extractions):
        url = a.get("url")
        title = a.get("title")
        if not url or url in seen_urls:     # Postgres upsert không cho update 1 row 2 lần/statement
            continue
        if impact_only and not is_impactful(e.get("sentiment"), title):
            skipped += 1
            continue                        # bỏ tin trung lập / thủ tục
        chash = title_hash(title)           # khoá theo NỘI DUNG (tiêu đề chuẩn hoá)
        if chash in seen_titles or chash in existing_hashes:
            dup_content += 1
            continue                        # cùng sự kiện, khác URL → bỏ trùng
        seen_urls.add(url)
        seen_titles.add(chash)
        tk = (a.get("ticker") or "").upper() or None
        rows.append({
            "url":          url,
            "title":        title,
            "source":       a.get("source", "Vietstock"),
            "ticker":       tk,
            "sector":       a.get("sector") or TICKER_SECTOR.get(tk),
            "scope":        scope,
            "published_at": a.get("published_at"),
            "sentiment":    e.get("sentiment"),
            "confidence":   _clamp01(e.get("confidence")),
            "ai_reason":    e.get("reason"),
            "tags":         derive_tags(title),
            "close_price":  a.get("close_price"),
            "pct_change":   a.get("pct_change"),
            "content_hash": title_hash(title),     # theo NỘI DUNG (chuẩn hoá) → chống trùng cross-URL
        })
    if verbose and skipped:
        print(f"  → Bỏ qua {skipped} tin trung lập/thủ tục (không tác động)")
    if verbose and dup_content:
        print(f"  → Bỏ qua {dup_content} tin TRÙNG NỘI DUNG (cùng sự kiện, khác URL/nguồn)")
    if not rows:
        return {"ok": 0, "err": 0, "skipped": skipped}
    ok = err = 0
    # Upsert theo lô để tránh payload lớn
    for i in range(0, len(rows), 100):
        batch = rows[i:i + 100]
        try:
            sb.table("news_articles").upsert(batch, on_conflict="url").execute()
            ok += len(batch)
        except Exception as ex:
            msg = str(ex).lower()
            # DEGRADE an toàn: nếu cột 'scope' chưa tồn tại (chưa chạy migration_news_scope.sql)
            # → bỏ field scope rồi thử lại, không làm hỏng pipeline.
            if "scope" in msg and ("column" in msg or "schema cache" in msg):
                try:
                    stripped = [{k: v for k, v in r.items() if k != "scope"} for r in batch]
                    sb.table("news_articles").upsert(stripped, on_conflict="url").execute()
                    ok += len(batch)
                    continue
                except Exception:
                    pass
            err += len(batch)
            if verbose:
                print(f"  ⚠️  Upsert news_articles lỗi (lô {i//100}): {str(ex)[:120]}")
    if verbose:
        print(f"  → news_articles: {ok} bản ghi (lỗi {err})")
    return {"ok": ok, "err": err, "skipped": skipped}


# ============================================================
# PIPELINE CHÍNH
# ============================================================

def run_pipeline(days_back: int = 3, dry_run: bool = False, min_confidence: float = 0.0):
    """
    Chạy toàn bộ pipeline đồng bộ tin tức Vietstock → Temporal Knowledge Graph.

    Args:
        days_back:      Lấy tin tức từ bao nhiêu ngày trước (mặc định 3)
        dry_run:        Nếu True, chỉ fetch + trích xuất, không upsert vào DB
        min_confidence: Bỏ qua edge có confidence < ngưỡng (lọc nhiễu)
    """
    start_time = datetime.utcnow()

    print("\n" + "🚀 " * 18)
    print("  PIPELINE: VIETSTOCK NEWS → TEMPORAL KNOWLEDGE GRAPH")
    print(f"  Thời gian: {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  Phạm vi:   {days_back} ngày gần nhất | min_confidence={min_confidence}")
    print("🚀 " * 18)

    # ── Bước 1: Thu thập tin tức (Top-10 + vĩ mô/ngành) ───────
    fetched = fetch_relevant_news(days_back=days_back)
    articles = fetched["stock"]
    macro_articles = fetched["macro_sector"]

    if not articles and not macro_articles:
        print("\n⚠️  Không tìm thấy bài viết nào liên quan trong khoảng thời gian này.")
        return

    # ── Bước 2: Trích xuất có cấu trúc ────────────────────────
    extractions = extract_all(articles) if articles else []

    # ── Bước 2b: Phân loại + lưu tin VĨ MÔ/NGÀNH (chỉ tin tác động +/-) ──
    if macro_articles:
        print(f"\n  Phân loại {len(macro_articles)} tin vĩ mô/ngành...")
        macro_ext = []
        for i in range(0, len(macro_articles), GEMINI_BATCH):
            macro_ext.extend(extract_macro_batch(macro_articles[i:i + GEMINI_BATCH]))
            if i + GEMINI_BATCH < len(macro_articles):
                time.sleep(4)
        if not dry_run:
            for i, a in enumerate(macro_articles):
                a["__scope"] = a.get("scope", "macro")
            # Lưu theo scope (sector vs macro) — upsert_news_to_table tự bỏ tin trung lập
            for sc in ("macro", "sector"):
                grp_a = [a for a in macro_articles if a.get("scope") == sc]
                grp_e = [macro_ext[macro_articles.index(a)] for a in grp_a]
                if grp_a:
                    try:
                        upsert_news_to_table(grp_a, grp_e, scope=sc)
                    except Exception as ex:
                        print(f"  ⚠️  Bỏ qua tin {sc}: {str(ex)[:100]}")

    # Preview 10 bài mẫu
    print("\n  Ví dụ 10 bài đầu tiên:")
    for art, ext in list(zip(articles, extractions))[:10]:
        icon = {"AFFECTS_POSITIVE": "✅", "AFFECTS_NEGATIVE": "❌", "MENTIONS": "⚪"}.get(ext["sentiment"], "?")
        print(f"  {icon} [{art['ticker']}] (conf {ext['confidence']:.2f}) {art['title'][:55]}...")

    if dry_run:
        print("\n⚠️  DRY RUN — không upsert vào database.")
        return

    # ── Bước 3: Upsert vào Temporal Knowledge Graph ───────────
    stats = upsert_news_to_graph(articles, extractions, min_confidence=min_confidence)

    # ── Bước 3b: Upsert vào bảng news_articles (đường đọc nhanh cho Agent) ──
    try:
        upsert_news_to_table(articles, extractions)
    except Exception as e:
        print(f"  ⚠️  Bỏ qua news_articles (bảng chưa tạo?): {str(e)[:120]}")

    # ── Bước 3c: Lưu RAW tin mã NGOÀI watchlist (KHÔNG LLM) → query đọc DB, khỏi crawl live ──
    # Phủ long-tail (peer khi so sánh). Nhãn tác động gắn LAZY lúc phân tích. impact_only=False
    # để giữ mọi tin (chưa có sentiment để lọc); dedup nội dung vẫn áp dụng.
    other_stock = fetched.get("other_stock", [])
    if other_stock:
        raw_ext = [{"sentiment": None, "confidence": 0.0, "reason": None} for _ in other_stock]
        try:
            res = upsert_news_to_table(other_stock, raw_ext, impact_only=False)
            print(f"  ✅ Lưu RAW {res.get('ok', 0)} tin mã ngoài watchlist (nhãn lazy)")
        except Exception as e:
            print(f"  ⚠️  Bỏ qua tin raw ngoài watchlist: {str(e)[:120]}")

    # ── Kết quả ───────────────────────────────────────────────
    elapsed = (datetime.utcnow() - start_time).total_seconds()

    print(f"\n{'='*55}")
    print(f"  ✅ HOÀN THÀNH — {elapsed:.1f}s")
    print(f"  Nodes upserted    : {stats['nodes_ok']}  (lỗi: {stats['nodes_err']})")
    print(f"  Edges upserted    : {stats['edges_ok']}  (lỗi: {stats['edges_err']})")
    print(f"  Bỏ qua conf thấp  : {stats['low_conf']}")
    print(f"  Bỏ qua khác       : {stats['skipped']}")
    print(f"{'='*55}")

    # ── Bước 4: Trích SỰ KIỆN (KG v2) cho các bài MỚI (event_id null) ──
    if not dry_run:
        try:
            from data import extract_events
            print("\n  ▶ Trích sự kiện (KG v2) cho tin mới...")
            extract_events.process()      # chỉ xử lý bài chưa có event_id
        except Exception as e:
            print(f"  ⚠️  Bỏ qua trích sự kiện: {str(e)[:120]}")

    # ── Bước 5: RADAR vĩ mô QUỐC TẾ (giá dầu/Fed/địa chính trị/thương mại) ──
    if not dry_run:
        try:
            from data import macro_radar
            print("\n  ▶ Radar tin vĩ mô quốc tế...")
            macro_radar.run()
        except Exception as e:
            print(f"  ⚠️  Bỏ qua macro radar: {str(e)[:120]}")

    # ── Bước 6: REFRESH tỷ giá USD/VND + lãi suất (HÀNG NGÀY — tỷ giá biến động nhanh) ──
    if not dry_run:
        try:
            from data.sync_fundamentals import sync_macro_data
            print("\n  ▶ Cập nhật tỷ giá/lãi suất (Vietcombank)...")
            sync_macro_data()
        except Exception as e:
            print(f"  ⚠️  Bỏ qua cập nhật tỷ giá: {str(e)[:120]}")

    # ── Bước 7: HỌC LIÊN TỤC (P2) — chấm nhận định đủ horizon → rút bài học (best-effort) ──
    if not dry_run:
        try:
            from core import agent_learning
            print("\n  ▶ Chấm kết quả nhận định & rút bài học...")
            r = agent_learning.score_pending_outcomes()
            print(f"     Đã chấm {r.get('scored',0)} (đúng {r.get('correct',0)}) · {r.get('lessons',0)} bài học mới")
        except Exception as e:
            print(f"  ⚠️  Bỏ qua chấm kết quả: {str(e)[:120]}")

    # ── Bước 8: SELF-EVAL (P3) — chấm chất lượng câu trả lời + đề xuất cải tiến DRAFT (human-gated) ──
    if not dry_run:
        try:
            from core import agent_learning
            print("\n  ▶ Tự đánh giá chất lượng & đề xuất cải tiến...")
            e1 = agent_learning.evaluate_pending_runs()
            e2 = agent_learning.propose_improvements()
            e3 = agent_learning.propose_tool_policy()   # P4: chính sách tool
            print(f"     Eval {e1.get('evaluated',0)} câu (TB {e1.get('avg_overall')}) · "
                  f"{e2.get('proposals',0)+e3.get('proposals',0)} đề xuất DRAFT")
        except Exception as e:
            print(f"  ⚠️  Bỏ qua self-eval: {str(e)[:120]}")

    # Kiểm tra tổng counts trong DB
    try:
        n = get_supabase().table("graph_nodes").select("id", count="exact").execute()
        e = get_supabase().table("graph_edges").select("id", count="exact").execute()
        print(f"\n  📊 Tổng DB hiện tại: {n.count} nodes / {e.count} edges")
    except Exception:
        pass

    print("\n💡 Test Agent với tin tức mới:")
    print("   streamlit run app.py")
    print("   streamlit run app.py")


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Đồng bộ tin tức Vietstock vào Knowledge Graph"
    )
    parser.add_argument(
        "--days", type=int, default=3,
        help="Số ngày gần nhất cần lấy tin (mặc định: 3)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Chỉ fetch + trích xuất, không ghi vào database"
    )
    parser.add_argument(
        "--min-confidence", type=float, default=0.0,
        help="Bỏ qua edge có confidence < ngưỡng (mặc định: 0.0 = giữ tất cả)"
    )
    args = parser.parse_args()

    run_pipeline(days_back=args.days, dry_run=args.dry_run, min_confidence=args.min_confidence)
