"""
sync_vietstock_reports.py — Kéo báo cáo phân tích DOANH NGHIỆP từ Vietstock
(https://finance.vietstock.vn/bao-cao-phan-tich, reportTypeID=58) → trích PDF text
(fitz/PyMuPDF) → upsert Supabase bảng `analyst_reports` (lưu TEXT nhẹ, đầy đủ; PDF gốc
giữ qua link `pdf_url`, không lưu binary).

Chạy:
  python sync_vietstock_reports.py --dry --pages 1     # in ra, không ghi DB
  python sync_vietstock_reports.py --pages 3           # crawl 3 trang + upsert

Nguồn: list AJAX POST /View/ChannelEDocumentPage {reportTypeID, page, pageSize, token}
       → trang chi tiết /bao-cao-phan-tich/{id}/{slug}.htm → link PDF static1.vietstock.vn/edocs/{id}/...
"""

import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import re
import time
import argparse
from datetime import datetime
from pathlib import Path

import requests
import fitz  # PyMuPDF
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client, upsert_batch

BASE = "https://finance.vietstock.vn"
CATEGORY_URL = f"{BASE}/bao-cao-phan-tich/phan-tich-doanh-nghiep"
AJAX_URL = f"{BASE}/View/ChannelEDocumentPage"
REPORT_TYPE_ID = 58  # Phân tích Doanh nghiệp

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "vi-VN,vi;q=0.9",
    "Referer": CATEGORY_URL,
}

# CTCK phát hành thường gặp (nhận diện từ text PDF)
KNOWN_FIRMS = [
    ("SSI", "SSI"), ("VNDIRECT", "VNDirect"), ("VND", "VNDirect"), ("HSC", "HSC"),
    ("VCSC", "VCSC"), ("VIETCAP", "Vietcap"), ("BSC", "BSC"), ("MBS", "MBS"),
    ("MAS", "Mirae Asset"), ("MIRAE", "Mirae Asset"), ("KBSV", "KBSV"), ("KB SECURITIES", "KBSV"),
    ("ACBS", "ACBS"), ("FPTS", "FPTS"), ("PHS", "PHS"), ("PHU HUNG", "PHS"),
    ("AGRISECO", "Agriseco"), ("BVSC", "BVSC"), ("TPS", "TPS"), ("CSI", "CSI"),
    ("DSC", "DSC"), ("VDSC", "Rồng Việt"), ("RONG VIET", "Rồng Việt"), ("YUANTA", "Yuanta"),
]

# Khuyến nghị: token trong slug (đã bỏ dấu, nối '-') → nhãn hiển thị
RECO_SLUG = [
    ("kem-kha-quan", "Kém khả quan"), ("kha-quan", "Khả quan"), ("tich-luy", "Tích lũy"),
    ("trung-lap", "Trung lập"), ("nam-giu", "Nắm giữ"), ("theo-doi", "Theo dõi"),
    ("mua", "MUA"), ("ban", "BÁN"),
]


def _strip_accents_lower(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def get_token(session: requests.Session) -> tuple[str, int]:
    r = session.get(CATEGORY_URL, headers=HEADERS, timeout=20)
    r.encoding = "utf-8"
    soup = BeautifulSoup(r.text, "html.parser")
    tok = soup.select_one("input[name=__RequestVerificationToken]")
    vc = soup.select_one("#view-content")
    rptid = int(vc.get("rptid")) if (vc and vc.get("rptid")) else REPORT_TYPE_ID
    return (tok.get("value") if tok else ""), rptid


def fetch_list_page(session: requests.Session, token: str, rptid: int, page: int) -> list[dict]:
    """1 trang list → [{eid, slug, title, detail_url}]."""
    data = {"page": page, "pageSize": 9, "reportTypeID": rptid,
            "__RequestVerificationToken": token}
    r = session.post(AJAX_URL, headers={**HEADERS, "X-Requested-With": "XMLHttpRequest"},
                     data=data, timeout=20)
    r.encoding = "utf-8"
    soup = BeautifulSoup(r.text, "html.parser")
    out, seen = [], set()
    for a in soup.select('a[href*="/bao-cao-phan-tich/"]'):
        href = a.get("href", "")
        m = re.search(r"/bao-cao-phan-tich/(\d+)/([a-z0-9-]+)\.htm", href)
        if not m or m.group(1) in seen:
            continue
        seen.add(m.group(1))
        title = a.get("title") or a.get_text(strip=True)
        out.append({"eid": m.group(1), "slug": m.group(2),
                    "title": title.strip(),
                    "detail_url": BASE + href if href.startswith("/") else href})
    return out


def parse_detail(session: requests.Session, item: dict) -> dict | None:
    """Trang chi tiết → pdf_url + ngày + tiêu đề đầy đủ."""
    r = session.get(item["detail_url"], headers=HEADERS, timeout=20)
    r.encoding = "utf-8"
    html = r.text
    soup = BeautifulSoup(html, "html.parser")

    # PDF gốc: static1.vietstock.vn/edocs/{eid}/...
    pdf = None
    for m in re.findall(r'(https?://static\d?\.vietstock\.vn/edocs/\d+/[^"\'> ]+\.pdf)', html):
        if f"/edocs/{item['eid']}/" in m:
            pdf = m.replace("http://", "https://")
            break
    if not pdf:
        return None

    # Tiêu đề đầy đủ từ og:title (sạch nhất)
    og = soup.select_one('meta[property="og:title"]')
    title = (og.get("content").strip() if (og and og.get("content")) else item["title"]) or item["title"]

    return {**item, "pdf_url": pdf, "title": title}


def extract_pdf_text(session: requests.Session, pdf_url: str) -> str:
    """PDF → text cho ActionHub. Ưu tiên pymupdf4llm (markdown sạch, bảng đúng cột/hàng
    — kiểu NotebookLM, FREE local, không tốn token LLM). Fallback fitz get_text nếu lỗi."""
    r = session.get(pdf_url, headers=HEADERS, timeout=40)
    if r.status_code != 200 or not r.content:
        return ""
    # 1) pymupdf4llm → markdown có cấu trúc bảng
    try:
        import pymupdf4llm
        doc = fitz.open(stream=r.content, filetype="pdf")
        md = pymupdf4llm.to_markdown(doc, show_progress=False).strip()
        if md:
            return md
    except Exception as e:
        print(f"    [!] pymupdf4llm lỗi → fallback get_text: {str(e)[:80]}")
    # 2) Fallback: text thô
    try:
        doc = fitz.open(stream=r.content, filetype="pdf")
        return "\n".join(p.get_text() for p in doc).strip()
    except Exception as e:
        print(f"    [!] PDF lỗi {pdf_url[:60]}: {e}")
        return ""


def extract_metadata(item: dict, text: str) -> dict:
    slug = item["slug"]                      # vd: bmp-khuyen-nghi-kha-quan-voi-gia-muc-tieu-168500-dong
    title = item["title"]                    # og:title: "BMP: Khuyến nghị KHẢ QUAN với giá mục tiêu 168,500 đồng/cổ phiếu"

    # ── Ticker: segment đầu slug (2-5 ký tự) → uppercase; fallback filename / og:title ──
    ticker = None
    ms = re.match(r"^([a-z0-9]{2,5})-", slug)
    if ms:
        ticker = ms.group(1).upper()
    if not ticker:
        mf = re.search(r"/edocs/\d+/([A-Z]{2,4})[_\-]", item["pdf_url"])
        ticker = mf.group(1) if mf else None
    if not ticker:
        mt = re.match(r"\s*([A-Z]{2,4})\b", title)
        ticker = mt.group(1) if mt else None

    # ── Khuyến nghị: từ slug (giữa 'khuyen-nghi-' và '-voi-gia') ──
    reco = None
    mr = re.search(r"khuyen-nghi-(.+?)-(?:voi-gia|gia-muc|$)", slug)
    reco_tok = mr.group(1) if mr else slug
    for key, label in RECO_SLUG:
        if key in reco_tok:
            reco = label
            break

    # ── Giá mục tiêu: từ slug 'muc-tieu-{số}' ; fallback og:title ──
    target = None
    mp = re.search(r"muc-tieu-(\d{3,})", slug)
    if mp:
        target = int(mp.group(1))
    else:
        mt2 = re.search(r"m[uụ]c ti[êe]u[^0-9]{0,12}([\d\.,]{4,})", _strip_accents_lower(title))
        if mt2:
            try:
                target = int(re.sub(r"[.,]", "", mt2.group(1)))
            except ValueError:
                pass

    # ── CTCK phát hành: nhận diện trong 800 ký tự đầu PDF ──
    firm = None
    head = _strip_accents_lower(text[:800])
    for key, label in KNOWN_FIRMS:
        if _strip_accents_lower(key) in head:
            firm = label
            break

    # ── Ngày báo cáo: tìm trong 1500 ký tự đầu PDF (DD/MM/YYYY) ──
    report_date = None
    md = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", text[:1500])
    if md:
        try:
            report_date = datetime(int(md.group(3)), int(md.group(2)), int(md.group(1))).strftime("%Y-%m-%d")
        except ValueError:
            pass

    return {"ticker": ticker, "recommendation": reco, "target_price": target,
            "source_firm": firm, "report_date": report_date}


def crawl(pages: int, dry: bool):
    session = requests.Session()
    token, rptid = get_token(session)
    print(f"reportTypeID={rptid}, token={'OK' if token else 'THIẾU'}")

    records = []
    for page in range(1, pages + 1):
        items = fetch_list_page(session, token, rptid, page)
        print(f"\n── Trang {page}: {len(items)} báo cáo ──")
        for it in items:
            det = parse_detail(session, it)
            if not det:
                print(f"  [skip] {it['eid']} (không có PDF)")
                continue
            text = extract_pdf_text(session, det["pdf_url"])
            if len(text) < 300:
                print(f"  [skip] {det['eid']} (text quá ngắn {len(text)} — có thể scan)")
                continue
            meta = extract_metadata(det, text)
            rec = {
                "id": det["eid"],
                "ticker": meta["ticker"],
                "title": det["title"][:300],
                "source_firm": meta["source_firm"],
                "recommendation": meta["recommendation"],
                "target_price": meta["target_price"],
                "report_date": meta["report_date"],
                "pdf_url": det["pdf_url"],
                "full_text": text,
            }
            records.append(rec)
            print(f"  OK {rec['id']} | {rec['ticker']} | {meta['source_firm']} | "
                  f"{meta['recommendation']} | TP={meta['target_price']} | {len(text)} ký tự | {meta['report_date']}")
            time.sleep(0.4)
        time.sleep(0.6)

    print(f"\nTổng: {len(records)} báo cáo")
    if dry:
        print("[DRY] không ghi DB.")
        if records:
            print("\n--- MẪU full_text[0:400] ---")
            print(records[0]["full_text"][:400])
        return
    n = upsert_batch(get_client(), "analyst_reports", records, "id")
    print(f"✅ analyst_reports: {n} rows upserted")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    crawl(args.pages, args.dry)