"""
TinNhanhChungKhoan Scraper
Crawl tin tức từ tinnhanhchungkhoan.vn.
Upsert vào bảng market_news trên Supabase.

Chạy: python3 tinnhanh_scraper.py
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
MAX_PAGES     = 4
WORKERS       = 4
CONTENT_DELAY = 0.3

SITE_URL = "https://www.tinnhanhchungkhoan.vn"

CATEGORIES = [
    "chung-khoan",
    "tai-chinh",
    "ngan-hang",
    "doanh-nghiep",
]

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "vi-VN,vi;q=0.9",
    "Referer":         SITE_URL + "/",
}

_lock = threading.Lock()
_done = 0

_SYM_RE = re.compile(
    r'[\(\[]([A-Z]{2,5})[\)\]]'
    r'|\b(VNM|HPG|VIC|MSN|VHM|TCB|BID|CTG|VPB|MBB|ACB|STB|FPT|MWG|VRE|PLX|GAS|SAB|POW|HDB|EIB|SHB|LPB|OCB|TPB|SSI|VND|HCM|VCI|VIX|NVL|DGC|MWG|KBC|VCB|VCG)\b'
)


def extract_symbol(text: str) -> str | None:
    if not text:
        return None
    m = _SYM_RE.search(text)
    return m.group(1) or m.group(2) if m else None


def parse_date(text: str) -> datetime | None:
    if not text:
        return None
    # Format ISO: 2026-06-22T17:39:44+0700  (lấy giờ địa phương, bỏ tz)
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})', text)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                            int(m.group(4)), int(m.group(5)))
        except ValueError:
            pass
    # Format: DD/MM/YYYY HH:MM
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})', text)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)),
                            int(m.group(4)), int(m.group(5)))
        except ValueError:
            pass
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', text)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    return None


# ── Bước 1: Scrape danh sách bài ─────────────────────────────────────────────

def scrape_category(session: requests.Session, slug: str, cutoff: date) -> list[dict]:
    articles = []
    seen_urls: set[str] = set()

    for page in range(1, MAX_PAGES + 1):
        if page == 1:
            url = f"{SITE_URL}/{slug}/"
        else:
            url = f"{SITE_URL}/{slug}/trang-{page}/"

        try:
            resp = session.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 404:
                # Thử format khác
                url = f"{SITE_URL}/{slug}/?page={page}"
                resp = session.get(url, headers=HEADERS, timeout=15)
                if resp.status_code == 404:
                    break
            resp.raise_for_status()
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            print(f"  [!] {slug} p{page} lỗi: {e}")
            break

        found = 0
        stop  = False

        # Bài viết dùng pattern: ...post[ID].html
        for a_tag in soup.find_all("a", href=re.compile(r'post\d+\.html$')):
            href  = a_tag.get("href", "")
            if not href.startswith("http"):
                href = SITE_URL + href
            if href in seen_urls:
                continue

            title = (a_tag.get("title") or a_tag.get_text(strip=True)).strip()
            if not title or len(title) < 10:
                continue

            # Tìm ngày trong DOM gần thẻ a — chỉ leo tối đa 2 cấp,
            # chỉ đọc thẻ có class date/time/pub hoặc <time> để tránh
            # bắt ngày từ sidebar / related articles.
            pub_dt = None
            parent = a_tag.parent
            for _ in range(2):
                if parent is None:
                    break
                for candidate in parent.find_all(["time", "span", "p"], limit=8):
                    cls = " ".join(candidate.get("class", []))
                    dt_attr = candidate.get("datetime") or candidate.get("content")
                    if dt_attr:
                        pub_dt = parse_date(dt_attr)
                        if pub_dt:
                            break
                    if any(kw in cls.lower() for kw in ("date", "time", "pub")):
                        pub_dt = parse_date(candidate.get_text(strip=True))
                        if pub_dt:
                            break
                if pub_dt:
                    break
                parent = parent.parent

            if pub_dt and pub_dt.date() < cutoff:
                stop = True
                break

            seen_urls.add(href)
            articles.append({
                "title":        title,
                "content":      "",
                "source":       "tinnhanhchungkhoan",
                "article_url":  href,
                "published_at": pub_dt or datetime.now(),
                "symbol":       extract_symbol(title),
            })
            found += 1

        print(f"    [{slug}] trang {page}: +{found} bài (tổng: {len(articles)})")

        if stop or found == 0:
            break
        time.sleep(0.5)

    return articles


def scrape_all(lookback_days: int = LOOKBACK_DAYS) -> list[dict]:
    cutoff  = date.today() - timedelta(days=lookback_days)
    session = requests.Session()
    all_articles: list[dict] = []
    seen_urls: set[str] = set()

    print(f"  TinNhanh: lấy bài từ {cutoff.strftime('%d/%m/%Y')}")

    for slug in CATEGORIES:
        arts = scrape_category(session, slug, cutoff)
        for a in arts:
            url = a.get("article_url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_articles.append(a)

    print(f"  Tổng: {len(all_articles)} bài unique")
    return all_articles


# ── Bước 2: Enrich nội dung ───────────────────────────────────────────────────

def fetch_content(idx: int, article: dict) -> tuple[int, dict]:
    global _done
    url = article.get("article_url", "")
    if not url:
        return idx, article
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        content_tag = (
            soup.select_one(".article__body")
            or soup.select_one("[itemprop='articleBody']")
            or soup.select_one(".cms-body")
            or soup.select_one(".article-content")
            or soup.select_one(".content-detail")
            or soup.select_one("#content_detail")
            or soup.select_one("article")
        )
        if content_tag:
            for junk in content_tag.select("script, style, .ads, [class*=ads], .related, .social, h1, .author, .date"):
                junk.decompose()
            paras = content_tag.select("p")
            text = "\n\n".join(p.get_text(strip=True) for p in paras if len(p.get_text(strip=True)) > 30)
            if not text:
                text = content_tag.get_text(separator="\n", strip=True)
            article["content"] = text

        # Lấy ngày chính xác từ trang bài
        for sel in ["time[datetime]", "span.date", ".publish-date", "meta[property='article:published_time']"]:
            tag = soup.select_one(sel)
            if tag:
                dt_str = tag.get("datetime") or tag.get("content") or tag.get_text(strip=True)
                pub_dt = parse_date(dt_str)
                if pub_dt:
                    article["published_at"] = pub_dt
                    break

        time.sleep(CONTENT_DELAY)
    except Exception:
        pass

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

    print(f"  Enrich nội dung {len(articles)} bài ({WORKERS} luồng)...")
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(fetch_content, i, a): i for i, a in enumerate(articles)}
        for future in as_completed(futures):
            idx, enriched = future.result()
            articles[idx] = enriched

    return articles


# ── Bước 3: Upsert Supabase ───────────────────────────────────────────────────

def upsert_to_supabase(articles: list[dict]) -> int:
    if not articles:
        return 0
    records = []
    for a in articles:
        pub = a.get("published_at")
        records.append({
            "title":        a.get("title", ""),
            "content":      a.get("content") or None,
            "source":       "tinnhanhchungkhoan",
            "article_url":  a.get("article_url"),
            "symbol":       a.get("symbol") or None,
            "published_at": pub.isoformat() if isinstance(pub, datetime) else None,
        })
    try:
        sb = get_client()
        n = upsert_batch(sb, "market_news", records, "article_url")
        print(f"  Supabase: {n} rows upserted")
        return n
    except Exception as e:
        print(f"  Supabase lỗi: {e}")
        return 0


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    articles = scrape_all(lookback_days=1)
    articles = enrich_content(articles)
    upsert_to_supabase(articles)
