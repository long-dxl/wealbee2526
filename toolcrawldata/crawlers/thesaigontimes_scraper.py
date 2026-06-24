"""
Kinh tế Sài Gòn (The Saigon Times) Scraper
Crawl tin tức từ thesaigontimes.vn — kinh tế, tài chính - ngân hàng, doanh nghiệp, địa ốc.
Upsert vào bảng market_news trên Supabase.

Lưu ý kỹ thuật:
  - Site chạy WordPress (tagDiv "Newspaper" theme). Bài viết có URL phẳng dạng
    https://thesaigontimes.vn/<slug>/ — slug dài, một segment, kết thúc bằng "/".
  - Trang chuyên mục KHÔNG phân trang qua URL (/page/N/ và ?page=N đều trả về
    đúng nội dung trang 1). Theme dùng AJAX load-more → chỉ lấy được ~30 bài mới
    nhất mỗi chuyên mục từ HTML tĩnh. Với crawl 24h incremental, lượng này là đủ.
  - Ngày đăng KHÔNG có ổn định ở listing → lấy từ trang bài
    (meta[itemprop=datePublished] / time[datetime] / og article:published_time).
  - Các slug "chung-khoan", "kinh-te-vi-mo", "doanh-nghiep" ở root là soft-404
    (trả về cùng một tập bài generic) → KHÔNG dùng. Chỉ dùng chuyên mục thật.

Chạy: python thesaigontimes_scraper.py
"""

import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import re
import time
import threading
from datetime import datetime, date, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent.parent))
from supabase_writer import get_client, upsert_batch

# ── Cấu hình ──────────────────────────────────────────────────────────────────
LOOKBACK_DAYS = 1
WORKERS       = 4
CONTENT_DELAY = 0.3
SOURCE        = "thesaigontimes"
SITE_URL      = "https://thesaigontimes.vn"

# Chuyên mục thật, đã verify trả về tập bài phân biệt (mỗi trang ~30 bài mới nhất)
CATEGORIES = [
    "tai-chinh-ngan-hang",
    "kinh-doanh",
    "dia-oc",
]

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Referer":         SITE_URL + "/",
}

_lock = threading.Lock()
_done = 0

_SYM_RE = re.compile(
    r'[\(\[]([A-Z]{3})[\)\]]'
    r'|\b(VNM|HPG|VIC|MSN|VHM|TCB|BID|CTG|VPB|MBB|ACB|STB|FPT|MWG|VRE|PLX|GAS|SAB|'
    r'POW|HDB|EIB|SHB|LPB|OCB|TPB|SSI|VND|HCM|VCI|VIX|NVL|DGC|KBC|VCB|VCG|VJC|GVR|'
    r'BCM|BVH|PNJ|REE|DXG|PDR|KDH|DIG|HSG|NKG|PVD|PVS|PVT|BSR|DCM|DPM|VHC|ANV)\b'
)

# Slug chuyên mục / trang hệ thống — KHÔNG phải bài viết
_NON_ARTICLE = {
    "kinh-doanh", "tai-chinh-ngan-hang", "dia-oc", "the-gioi", "kinh-te-vi-mo",
    "chung-khoan", "doanh-nghiep", "thi-truong", "kinh-te", "tac-gia", "chuyen-de",
    "video", "magazine", "e-paper", "lien-he", "gioi-thieu",
}


def extract_symbol(text: str) -> str | None:
    if not text:
        return None
    m = _SYM_RE.search(text)
    return (m.group(1) or m.group(2)) if m else None


def parse_date(text: str) -> datetime | None:
    """Hỗ trợ ISO (2026-06-18T19:30:33+07:00) và DD/MM/YYYY [HH:MM]."""
    if not text:
        return None
    today = date.today()
    # ISO 8601
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})', text)
    if m:
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                          int(m.group(4)), int(m.group(5)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    # DD/MM/YYYY HH:MM  hoặc  HH:MM DD/MM/YYYY
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})', text)
    if m:
        try:
            dt = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)),
                          int(m.group(4)), int(m.group(5)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    m = re.search(r'(\d{1,2}):(\d{2})\s+(\d{1,2})/(\d{1,2})/(\d{4})', text)
    if m:
        try:
            dt = datetime(int(m.group(5)), int(m.group(4)), int(m.group(3)),
                          int(m.group(1)), int(m.group(2)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', text)
    if m:
        try:
            dt = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    return None


def _is_article_url(href: str) -> bool:
    """Bài viết = URL một segment, slug dài (>=4 dấu '-'), không phải chuyên mục."""
    if not href:
        return False
    if "thesaigontimes.vn" not in href and not href.startswith("/"):
        return False
    path = re.sub(r'^https?://[^/]+', '', href).strip("/")
    if not path or "/" in path:          # nhiều segment → chuyên mục con
        return False
    if path in _NON_ARTICLE:
        return False
    return path.count("-") >= 4 and len(path) >= 20


def scrape_category(session: requests.Session, slug: str) -> list[dict]:
    url = f"{SITE_URL}/{slug}/"
    try:
        resp = session.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        print(f"  [!] {slug} lỗi listing: {e}")
        return []

    articles: list[dict] = []
    seen: set[str] = set()
    # Ưu tiên link tiêu đề trong module; fallback toàn bộ link bài hợp lệ
    anchors = soup.select(".td-module-container h3 a, .td_module_wrap h3 a, .entry-title a")
    if not anchors:
        anchors = soup.find_all("a", href=True)

    for a in anchors:
        href = a.get("href", "")
        if href.startswith("/"):
            href = SITE_URL + href
        if not _is_article_url(href) or href in seen:
            continue
        title = (a.get("title") or a.get_text(strip=True)).strip()
        if not title or len(title) < 15:
            continue
        seen.add(href)
        articles.append({
            "title":        title,
            "content":      "",
            "source":       SOURCE,
            "article_url":  href,
            "published_at": None,
            "symbol":       extract_symbol(title),
        })

    print(f"    [{slug}] {len(articles)} bài")
    return articles


def scrape_all(lookback_days: int = LOOKBACK_DAYS) -> list[dict]:
    session = requests.Session()
    all_articles: list[dict] = []
    seen_urls: set[str] = set()

    print(f"  TheSaigonTimes: lấy listing (lookback {lookback_days}d)")
    for slug in CATEGORIES:
        for a in scrape_category(session, slug):
            url = a["article_url"]
            if url not in seen_urls:
                seen_urls.add(url)
                all_articles.append(a)
        time.sleep(0.4)

    print(f"  Tổng listing: {len(all_articles)} bài unique")
    return all_articles


def fetch_content(idx: int, article: dict) -> tuple[int, dict]:
    global _done
    url = article.get("article_url", "")
    if not url:
        return idx, article

    for attempt in range(2):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "html.parser")

            # Ngày đăng — ưu tiên giờ địa phương +07
            pub_dt = None
            for sel in ['meta[itemprop="datePublished"]', 'time[datetime]',
                        'meta[property="article:published_time"]']:
                tag = soup.select_one(sel)
                if tag:
                    pub_dt = parse_date(tag.get("content") or tag.get("datetime") or "")
                    if pub_dt:
                        break
            if not pub_dt:
                for el in soup.select(".td-module-date, .entry-date, .tdb-post-meta time"):
                    pub_dt = parse_date(el.get("datetime", "") or el.get_text(strip=True))
                    if pub_dt:
                        break
            if pub_dt:
                article["published_at"] = pub_dt

            # Nội dung
            content_tag = (
                soup.select_one(".td-post-content")
                or soup.select_one("[class*=tdb_single_content]")
                or soup.select_one("article")
            )
            if content_tag:
                for junk in content_tag.select(
                    "script,style,.ads,[class*=ads],.td-a-rec,.tdc-row,"
                    ".relate,.tags,.social,figure,.wp-caption-text"
                ):
                    junk.decompose()
                paras = content_tag.select("p")
                article["content"] = "\n\n".join(
                    p.get_text(strip=True) for p in paras if p.get_text(strip=True)
                )

            # Bổ sung symbol từ nội dung nếu tiêu đề chưa có
            if not article.get("symbol"):
                article["symbol"] = extract_symbol(article.get("content", "")[:500])

            break  # thành công
        except Exception:
            if attempt == 0:
                time.sleep(1.5)
            continue

    time.sleep(CONTENT_DELAY)
    with _lock:
        _done += 1
        if _done <= 3 or _done % 50 == 0:
            print(f"  [{_done}] {url[:70]}")
    return idx, article


def enrich_content(articles: list[dict]) -> list[dict]:
    global _done
    _done = 0
    if not articles:
        return articles
    print(f"  Enrich {len(articles)} bài ({WORKERS} luồng)...")
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(fetch_content, i, a): i for i, a in enumerate(articles)}
        for f in as_completed(futures):
            idx, enriched = f.result()
            articles[idx] = enriched
    return articles


def upsert_to_supabase(articles: list[dict]) -> int:
    if not articles:
        return 0
    records = []
    for a in articles:
        pub = a.get("published_at")
        records.append({
            "title":        a.get("title", ""),
            "content":      a.get("content") or None,
            "source":       SOURCE,
            "article_url":  a.get("article_url"),
            "published_at": pub.isoformat() if isinstance(pub, datetime) else None,
            "symbol":       a.get("symbol"),
        })
    try:
        sb = get_client()
        n = upsert_batch(sb, "market_news", records, "article_url")
        print(f"  Supabase: {n} rows upserted")
        return n
    except Exception as e:
        print(f"  Supabase lỗi: {e}")
        return 0


def run(lookback_days: int = LOOKBACK_DAYS) -> int:
    cutoff   = date.today() - timedelta(days=lookback_days)
    articles = scrape_all(lookback_days)
    if not articles:
        return 0
    articles = enrich_content(articles)
    before = len(articles)
    articles = [
        a for a in articles
        if isinstance(a.get("published_at"), datetime)
        and a["published_at"].date() >= cutoff
    ]
    dropped = before - len(articles)
    if dropped:
        print(f"  Loại {dropped} bài (không có ngày hoặc quá cũ)")
    return upsert_to_supabase(articles)


if __name__ == "__main__":
    print(f"\nTHESAIGONTIMES — {datetime.now().strftime('%H:%M:%S')}\n")
    total = run()
    print(f"\nHOAN THANH — {total} bai da luu")
