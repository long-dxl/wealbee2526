"""
Stockbiz Scraper
Crawl tin tức từ stockbiz.vn
Upsert vào bảng market_news trên Supabase.

URL article pattern: /tin-tuc/[slug]/[numeric-id]
Category URLs: /thi-truong, /doanh-nghiep, /tai-chinh, /kinh-te
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

LOOKBACK_DAYS = 1
WORKERS       = 4
CONTENT_DELAY = 0.3
SITE_URL      = "https://stockbiz.vn"

CATEGORIES = [
    "thi-truong",
    "doanh-nghiep",
    "tai-chinh",
    "kinh-te",
]

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Connection":      "keep-alive",
    "Referer":         SITE_URL + "/",
}

_lock = threading.Lock()
_done = 0

# Article URL: /tin-tuc/slug/39861224
_ART_RE = re.compile(r'stockbiz\.vn/tin-tuc/[a-z0-9][a-z0-9\-]+/\d{5,}$')


def parse_date(text: str) -> datetime | None:
    if not text:
        return None
    today = date.today()
    # ISO: 2026-05-08T17:02
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})', text)
    if m:
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                          int(m.group(4)), int(m.group(5)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    # "08/05/2026 17:02" or "08-05-2026 17:02"
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})[\s,\-]+(\d{1,2}):(\d{2})', text)
    if m:
        try:
            dt = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)),
                          int(m.group(4)), int(m.group(5)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    # "08/05/2026"
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', text)
    if m:
        try:
            dt = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            if dt.date() <= today:
                return dt
        except ValueError:
            pass
    return None


def _session() -> requests.Session:
    s = requests.Session()
    try:
        s.get(SITE_URL, headers=HEADERS, timeout=10)
    except Exception:
        pass
    return s


def scrape_category(session: requests.Session, slug: str, cutoff: date) -> list[dict]:
    articles = []
    seen_urls: set[str] = set()
    url = f"{SITE_URL}/{slug}"

    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"  [!] {slug}: HTTP {resp.status_code}")
            return articles
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        print(f"  [!] {slug} lỗi: {e}")
        return articles

    for a_tag in soup.find_all("a", href=True):
        href = a_tag.get("href", "")
        if not href.startswith("http"):
            href = SITE_URL + href
        if not _ART_RE.search(href):
            continue
        if href in seen_urls:
            continue

        title = (a_tag.get("title") or a_tag.get_text(strip=True)).strip()
        if not title or len(title) < 10:
            continue

        # Tìm ngày trong DOM gần thẻ a
        pub_dt = None
        parent = a_tag.parent
        for _ in range(3):
            if parent is None:
                break
            for el in parent.find_all(["time", "span", "div", "p"], limit=10):
                cls = " ".join(el.get("class", []))
                val = el.get("datetime") or el.get("content") or ""
                if val:
                    pub_dt = parse_date(val)
                    if pub_dt:
                        break
                if any(k in cls.lower() for k in ("date", "time", "pub", "post")):
                    pub_dt = parse_date(el.get_text(strip=True))
                    if pub_dt:
                        break
            if pub_dt:
                break
            parent = parent.parent

        if pub_dt and pub_dt.date() < cutoff:
            break

        seen_urls.add(href)
        articles.append({
            "title":        title,
            "content":      "",
            "source":       "stockbiz",
            "article_url":  href,
            "published_at": pub_dt,
        })

    print(f"    [{slug}]: {len(articles)} bài")
    return articles


def scrape_all(lookback_days: int = LOOKBACK_DAYS) -> list[dict]:
    cutoff  = date.today() - timedelta(days=lookback_days)
    session = _session()
    all_articles: list[dict] = []
    seen_urls: set[str] = set()

    print(f"  Stockbiz: lấy bài từ {cutoff.strftime('%d/%m/%Y')}")

    for slug in CATEGORIES:
        for a in scrape_category(session, slug, cutoff):
            url = a.get("article_url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_articles.append(a)

    print(f"  Tổng listing: {len(all_articles)} bài unique")
    return all_articles


def fetch_content(idx: int, article: dict, session: requests.Session) -> tuple[int, dict]:
    global _done
    url = article.get("article_url", "")
    if not url:
        return idx, article
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        # Date — stockbiz nhúng giờ đăng trong JSON: "date":"2026-07-02T09:49:00+07:00"
        # (meta tag / listing đều KHÔNG có → phải lấy từ đây). Giữ offset +07 → aware.
        pub_dt = None
        mjson = re.search(r'"date"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+\-]\d{2}:\d{2})"', resp.text)
        if mjson:
            try:
                pub_dt = datetime.fromisoformat(mjson.group(1))
            except ValueError:
                pub_dt = None
        if not pub_dt:
            for sel in ["meta[property='article:published_time']", "time[datetime]"]:
                tag = soup.select_one(sel)
                if tag:
                    val = tag.get("content") or tag.get("datetime") or ""
                    pub_dt = parse_date(val)
                    if pub_dt:
                        break
        if pub_dt:
            article["published_at"] = pub_dt
        elif not article.get("published_at"):
            article["published_at"] = datetime.now()

        # Content — Tailwind CSS class: post_content
        content_tag = (
            soup.select_one(".post_content")
            or soup.select_one(".detail-content")
            or soup.select_one(".article-content")
            or soup.select_one("article")
        )
        if content_tag:
            for junk in content_tag.select("script,style,.ads,[class*=ads],.relate,.tags,.social"):
                junk.decompose()
            paras = content_tag.select("p")
            article["content"] = "\n\n".join(p.get_text(strip=True) for p in paras if p.get_text(strip=True))

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
    session = _session()
    print(f"  Enrich {len(articles)} bài ({WORKERS} luồng)...")
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(fetch_content, i, a, session): i for i, a in enumerate(articles)}
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
            "source":       "stockbiz",
            "article_url":  a.get("article_url"),
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


def run(lookback_days: int = LOOKBACK_DAYS) -> int:
    articles = scrape_all(lookback_days)
    if not articles:
        return 0
    articles = enrich_content(articles)
    return upsert_to_supabase(articles)


if __name__ == "__main__":
    print(f"\nSTOCKBIZ — {datetime.now().strftime('%H:%M:%S')}\n")
    total = run()
    print(f"\nHOAN THANH — {total} bai da luu")
