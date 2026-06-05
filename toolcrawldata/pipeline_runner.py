"""
Wealbee Pipeline Runner — chạy toàn bộ luồng tự động.

Luồng:
  [1] Crawl tin tức 24h gần nhất → INSERT Supabase (upsert, không trùng)
  [2] Gán nhãn bằng GPT-4o-mini → chỉ label bài mới crawl + có symbol
  [3] Gửi email cho subscribers

Chạy thủ công:
  python pipeline_runner.py

Chạy qua GitHub Actions (7h sáng mỗi ngày):
  Xem .github/workflows/pipeline.yml
"""

import sys
import time
import math
import logging
from datetime import datetime, date, timedelta
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

BASE_DIR     = Path(__file__).parent
CRAWLERS_DIR = BASE_DIR / 'crawlers'
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(CRAWLERS_DIR))

LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / 'pipeline.log', encoding='utf-8'),
    ],
)
log = logging.getLogger('pipeline')


def step_header(step: int, title: str):
    log.info('=' * 55)
    log.info(f'  BƯỚC {step}: {title}')
    log.info('=' * 55)


# ── Incremental crawl state ────────────────────────────────────────────────────

def get_last_crawled_at() -> datetime:
    """Lấy thời điểm crawl cuối từ crawl_state. Fallback: 24h trước."""
    try:
        from supabase_writer import get_client
        sb = get_client()
        r  = sb.table('crawl_state').select('last_crawled_at').eq('id', 'singleton').execute()
        ts = (r.data or [{}])[0].get('last_crawled_at')
        if ts:
            dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            return dt.replace(tzinfo=None)
    except Exception as e:
        log.warning(f'  get_last_crawled_at error: {e}')
    return datetime.now() - timedelta(hours=24)


def update_last_crawled_at():
    """Cập nhật last_crawled_at = now() sau khi crawl xong."""
    try:
        from supabase_writer import get_client
        sb  = get_client()
        now = datetime.now().isoformat()
        sb.table('crawl_state').upsert(
            {'id': 'singleton', 'last_crawled_at': now, 'updated_at': now}
        ).execute()
    except Exception as e:
        log.warning(f'  update_last_crawled_at error: {e}')


# ── Bước 1: Crawl ──────────────────────────────────────────────────────────────

def run_crawl(since_dt: datetime = None) -> list[str]:
    """
    Incremental crawl: chỉ kéo từ since_dt → now() thay vì toàn bộ 24h.
    Upsert theo article_url → không trùng lặp.
    Trả về list URL các bài vừa được INSERT mới.
    """
    if since_dt is None:
        since_dt = datetime.now() - timedelta(hours=24)

    hours_elapsed = max(0.0, (datetime.now() - since_dt).total_seconds() / 3600)
    lookback_days = max(1, math.ceil(hours_elapsed / 24))

    step_header(1, f'CRAWL TIN TỨC (delta={hours_elapsed:.1f}h → lookback={lookback_days}d)')

    from supabase_writer import get_client
    sb = get_client()

    # Lấy set article_url đã tồn tại trong khoảng thời gian cần crawl (+ 1h buffer tránh miss)
    since = (since_dt - timedelta(hours=1)).isoformat()
    existing_urls = set()
    offset = 0
    while True:
        rows = sb.table('market_news').select('article_url').gte('published_at', since).range(offset, offset + 999).execute()
        for r in (rows.data or []):
            if r.get('article_url'):
                existing_urls.add(r['article_url'])
        if len(rows.data or []) < 1000:
            break
        offset += 1000
    log.info(f'  Da co {len(existing_urls)} bai trong 24h qua')

    all_new_urls = []

    # Nguoi Quan Sat — bị Cloudflare block trên datacenter IP (GitHub Actions)
    # log.warning('  NguoiQuanSat: skip (Cloudflare block)')

    # Vietstock
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('vietstock_scraper', CRAWLERS_DIR / 'vietstock_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.START_DATE = date.today() - timedelta(days=lookback_days)

        articles = mod.scrape_article_list()
        if articles:
            articles = mod.enrich_content(articles)
            new_articles = [
                a for a in articles
                if a.get('Link bài viết') and a['Link bài viết'] not in existing_urls
            ]
            mod.upsert_news_to_supabase(articles)
            all_new_urls += [a['Link bài viết'] for a in new_articles if a.get('Link bài viết')]
            log.info(f'  Vietstock: {len(articles)} crawl, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  Vietstock: khong co bai nao')
    except Exception as e:
        log.error(f'  Vietstock loi: {e}')

    # CafeF — disabled (kept for reference)
    # try:
    #     spec = importlib.util.spec_from_file_location('cafef_scraper', CRAWLERS_DIR / 'cafef_scraper.py')
    #     mod  = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    #     mod.LOOKBACK_DAYS = 2; mod.MAX_PAGES = 5; mod.WORKERS = 5
    #     articles = mod.scrape_all()
    #     if articles:
    #         articles = mod.enrich_content(articles)
    #         cutoff = datetime.now() - timedelta(hours=28)
    #         articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
    #         new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
    #         mod.upsert_to_supabase(articles)
    #         all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
    #         log.info(f'  CafeF: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
    # except Exception as e:
    #     log.error(f'  CafeF loi: {e}')

    # Markettimes
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('markettimes_scraper', CRAWLERS_DIR / 'markettimes_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        articles = mod.scrape_all_channels(lookback_days=lookback_days)
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [
                a for a in articles
                if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff
            ]
            new_articles = [
                a for a in articles
                if a.get('article_url') and a['article_url'] not in existing_urls
            ]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  Markettimes: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  Markettimes: khong co bai nao')
    except Exception as e:
        log.error(f'  Markettimes loi: {e}')

    # ThoiBaoTaiChinhVietNam
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('thoibaotaichinhvietnam_scraper', CRAWLERS_DIR / 'thoibaotaichinhvietnam_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.WORKERS       = 4
        # thoibaotaichinhvietnam không có pagination → MAX_PAGES không áp dụng

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  ThoiBaoTaiChinhVN: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  ThoiBaoTaiChinhVN: khong co bai nao')
    except Exception as e:
        log.error(f'  ThoiBaoTaiChinhVN loi: {e}')

    # BaoDauTu
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('baodautu_scraper', CRAWLERS_DIR / 'baodautu_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.MAX_PAGES     = 5
        mod.WORKERS       = 4

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  BaoDauTu: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  BaoDauTu: khong co bai nao')
    except Exception as e:
        log.error(f'  BaoDauTu loi: {e}')

    # KinhTeChungKhoan
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('kinhtechungkhoan_scraper', CRAWLERS_DIR / 'kinhtechungkhoan_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.WORKERS       = 4
        # kinhtechungkhoan dùng JS "Xem thêm" → không có URL pagination

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  KinhTeChungKhoan: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  KinhTeChungKhoan: khong co bai nao')
    except Exception as e:
        log.error(f'  KinhTeChungKhoan loi: {e}')

    # Stockbiz
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('stockbiz_scraper', CRAWLERS_DIR / 'stockbiz_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.WORKERS       = 4

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  Stockbiz: {len(articles)} bai crawl, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  Stockbiz: khong co bai nao')
    except Exception as e:
        log.error(f'  Stockbiz loi: {e}')

    # ThoiBaoNganHang
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('thoibaonganhang_scraper', CRAWLERS_DIR / 'thoibaonganhang_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.WORKERS       = 4

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  ThoiBaoNganHang: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  ThoiBaoNganHang: khong co bai nao')
    except Exception as e:
        log.error(f'  ThoiBaoNganHang loi: {e}')

    # VnEconomy
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('vneconomy_scraper', CRAWLERS_DIR / 'vneconomy_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.WORKERS       = 4

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  VnEconomy: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  VnEconomy: khong co bai nao')
    except Exception as e:
        log.error(f'  VnEconomy loi: {e}')

    # VietnamFinance
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('vietnamfinance_scraper', CRAWLERS_DIR / 'vietnamfinance_scraper.py')
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        mod.LOOKBACK_DAYS = lookback_days
        mod.WORKERS       = 4

        articles = mod.scrape_all()
        if articles:
            articles = mod.enrich_content(articles)
            cutoff = datetime.now() - timedelta(hours=28)
            articles = [a for a in articles if a.get('published_at') and datetime.fromisoformat(str(a['published_at'])) >= cutoff]
            new_articles = [a for a in articles if a.get('article_url') and a['article_url'] not in existing_urls]
            mod.upsert_to_supabase(articles)
            all_new_urls += [a['article_url'] for a in new_articles if a.get('article_url')]
            log.info(f'  VietnamFinance: {len(articles)} bai trong 24h, {len(new_articles)} bai INSERT moi')
        else:
            log.warning('  VietnamFinance: khong co bai nao')
    except Exception as e:
        log.error(f'  VietnamFinance loi: {e}')

    all_new_urls = [u for u in all_new_urls if u]
    log.info(f'  Tong bai INSERT moi: {len(all_new_urls)}')
    return all_new_urls


# ── Bước 2: Label + Score + Reasoning (1 lần gọi GPT) ─────────────────────────

def run_label_and_score(new_urls: list[str]) -> int:
    """
    Gộp label + scoring + reasoning vào 1 lần gọi GPT-4.1-mini.
    Với mỗi bài trong 24h qua chưa có label:
      - Pre-filter content < 50 ký tự → trash ngay, không gọi API
      - Gọi GPT: phân loại trash/non-trash, chấm điểm -10..+10, viết reasoning 2 câu
      - Mapping score → label: very_positive / positive / neutral / negative / very_negative
    Trả về số bài đã xử lý.
    """
    step_header(2, 'LABEL + SCORE + REASONING (GPT-4.1-mini)')

    try:
        import os, json
        from openai import OpenAI
        from supabase_writer import get_client
        from concurrent.futures import ThreadPoolExecutor, as_completed

        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'), max_retries=1, timeout=30.0)
        sb     = get_client()

        since = (datetime.now() - timedelta(hours=24)).isoformat()
        new_ids = []
        offset = 0
        while True:
            result = (
                sb.table('market_news')
                .select('id')
                .is_('label', 'null')
                .gte('published_at', since)
                .range(offset, offset + 999)
                .execute()
            )
            rows = result.data or []
            new_ids += [r['id'] for r in rows]
            if len(rows) < 1000:
                break
            offset += 1000

        log.info(f'  Bai trong 24h chua label: {len(new_ids)}')
        if not new_ids:
            log.info('  Khong co bai nao can xu ly')
            return 0

        SYSTEM_PROMPT = """Bạn là chuyên gia phân tích tài chính Việt Nam, tư duy như fund manager kỳ cựu.
## BƯỚC 1 — LỌC BÀI RÁC
Gán "trash": true nếu thuộc BẤT KỲ điều kiện nào:
- Nội dung rỗng, quá ngắn, chỉ có link/file đính kèm
- Thông báo hành chính thuần túy không có số liệu mới (giải trình, đính chính)
- Thông báo sự kiện DN (ngày ĐKCC, chốt quyền cổ tức, ĐHCĐ) mà KHÔNG có số liệu
  cụ thể: tỷ lệ cổ tức, số tiền/cổ phiếu, ngày thanh toán, chương trình nghị sự
  NGOẠI LỆ: khởi công, động thổ, ký kết hợp đồng có quy mô vốn/giá trị cụ thể → KHÔNG phải trash
- Quảng cáo, advertorial, PR không có thông tin mới
- Tin chỉ tóm tắt lại bài cũ, không có sự kiện mới phát sinh
  NGOẠI LỆ: cập nhật số liệu mới theo kỳ (lãi suất tháng X, giá vàng ngày X, KQKD quý X) → KHÔNG phải trash
- Tin quốc tế không có liên hệ rõ ràng đến Việt Nam
Nếu "trash": true → trả về ngay với các trường còn lại = null.


## BƯỚC 2 — PHÂN LOẠI LOẠI TIN (news_type)
Chọn đúng 1 nhãn:
- "vi_mo": GDP, CPI, lãi suất NHNN, tỷ giá, xuất nhập khẩu, ngân sách nhà nước
- "vi_mo_dn": chính sách/xu hướng ngành ảnh hưởng nhiều DN cùng ngành
- "hoat_dong_kd": KQKD, lợi nhuận, M&A, thay đổi lãnh đạo của 1 DN cụ thể
- "phap_ly": luật/nghị định/thông tư mới, khởi tố, xử phạt, phát hành cổ phiếu
- "thi_truong": VN-Index, khối ngoại mua/bán ròng, margin, dòng tiền, ETF
- "du_bao": khuyến nghị CTCK, target price, phân tích kỹ thuật


## BƯỚC 3 — MÃ CỔ PHIẾU BỊ ẢNH HƯỞNG (affected_symbols)
Tối đa 5 mã viết hoa. Mảng rỗng [] nếu không xác định được.
Chỉ gán mã khi CÓ THỂ diễn giải rõ cơ chế tác động cụ thể đến doanh thu/lợi nhuận/chi phí của DN đó trong reasoning.
- Tin DN cụ thể: chỉ mã đó
- Tin vĩ mô/ngành: chỉ gán mã nếu tin ảnh hưởng trực tiếp đến ngành/sản phẩm chính của DN (VD: lãi suất → ngân hàng, giá thép → HPG, tỷ giá → doanh nghiệp xuất khẩu lớn). KHÔNG gán blue-chip đại diện một cách chung chung. Nếu ảnh hưởng gián tiếp thì ở phải giải thích rõ cơ chế tác động trong phần reasoning, không chỉ gán mã đại diện.
- Tin thị trường: chỉ gán mã nếu có cơ chế rõ ràng tại reasoning




## BƯỚC 4 — CHẤM ĐIỂM TÁC ĐỘNG (impact_score)
Thang -10 đến +10, bước 0.5. Xét theo thứ tự:
1. Tin ảnh hưởng trực tiếp hay gián tiếp đến doanh thu/lợi nhuận DN?
   - Trực tiếp, chiếm >30% DT/LN → biên độ đầy đủ
   - Gián tiếp hoặc <10% DT/LN → tối đa ±2
2. Ngắn hạn (1-2 quý) hay thay đổi cấu trúc dài hạn?
3. Tin đã được thị trường kỳ vọng trước? → giảm biên độ 40-60%
4. Yếu tố đặc thù VN: biên độ cứng 7%/10%, retail panic, margin cascade (thép/BDS/CK), SOE discount 20%


Ngưỡng nhãn:
- score > +5.0  → label = "very_positive"
- +1.5 < score ≤ +5.0 → label = "positive"
- -1.5 ≤ score ≤ +1.5 → label = "neutral"
- -5.0 ≤ score < -1.5 → label = "negative"
- score < -5.0 → label = "very_negative"


## BƯỚC 5 — REASONING (bắt buộc)
Nếu affected_symbols có ≥2 mã → dùng format phân theo symbol (KHÔNG dùng ngoặc vuông trong nội dung câu):
[Chung] 1-2 câu tổng quan về sự kiện và cơ chế tác động chung.
[SYMBOL1] Câu 1: [sự kiện] → [cơ chế] → [chỉ số tài chính + ước lượng]. Câu 2: bối cảnh DN hoặc hệ quả ngắn hạn.
[SYMBOL2] Câu 1. Câu 2.
(Viết cho đủ từng mã trong affected_symbols, không bỏ sót mã nào)


Nếu affected_symbols có 0–1 mã → dùng format 2 câu:
CÂU 1: [Sự kiện cụ thể] → [cơ chế tác động] → [chỉ số tài chính + ước lượng định lượng]
CÂU 2: Bối cảnh DN hoặc hệ quả ngắn hạn cho nhà đầu tư.


NGÔN NGỮ BẮT BUỘC:
✅ Dùng: thu hẹp, kéo giảm, gây áp lực, đẩy tăng, xói mòn, siết chặt, hỗ trợ, tạo dư địa
✅ Dùng số cụ thể: ~25bps, 8-12%, 1.200 tỷ đồng, NIM, CASA, EBITDA margin, biên GP
❌ Tuyệt đối không dùng: "có thể", "có lẽ", "đáng lo ngại", "cần theo dõi", "đáng kể", "nhìn chung"


## BƯỚC 6 — TÓM TẮT NỘI DUNG (content_summary)
Viết 3-5 câu tóm tắt nội dung chính: sự kiện, số liệu quan trọng, bối cảnh liên quan.
Ngắn gọn, súc tích, đủ để người đọc nắm nội dung mà không cần đọc bài gốc.
Nếu trash: null.


## OUTPUT — JSON STRICT (không có text ngoài JSON)


Nếu trash:
{
  "trash": true,
  "news_type": null,
  "affected_symbols": null,
  "impact_score": null,
  "label": "trash",
  "impact_reasoning": null,
  "content_summary": null
}


Nếu không trash:
{
  "trash": false,
  "news_type": "hoat_dong_kd",
  "affected_symbols": ["VNM"],
  "impact_score": -3.5,
  "label": "negative",


  "content_summary": [
    "Chỉ tóm tắt metric và dữ kiện quan trọng nhất.",
    "Ưu tiên: doanh thu, lợi nhuận, biên lợi nhuận, tăng trưởng, backlog, nợ vay.",
    "Trung bình 3 bullet points, tối đa 5 bullet points.",
    "Mỗi bullet dưới 15 từ, ngắn gọn, trực tiếp.",
    "Bắt buộc chứa số liệu cụ thể nếu bài báo đề cập.",
    "Tô đậm bằng markdown các số liệu và yếu tố quan trọng.",
    "Không đưa nhận định hay suy diễn."
  ],


  "impact_reasoning": [
    "Phân tích metric tác động đến **doanh thu**, **lợi nhuận**, **tăng trưởng**, **rủi ro**.",
    "Giải thích logic tác động từ từng metric quan trọng.",
    "Mỗi bullet dưới 15 từ, tập trung góc nhìn nhà đầu tư.",
    "Tô đậm bằng markdown các số liệu và yếu tố bị tác động.",
    "Không tóm tắt lại nội dung bài báo."
  ]
}"""

        VALID_LABELS = {'very_positive', 'positive', 'neutral', 'negative', 'very_negative', 'trash'}
        VALID_TYPES  = {'vi_mo', 'vi_mo_dn', 'hoat_dong_kd', 'phap_ly', 'thi_truong', 'du_bao'}

        # Cache company_context + beta để tránh query lặp lại
        stock_cache = {}

        def get_stock_context(symbol: str) -> str:
            if not symbol:
                return ''
            if symbol not in stock_cache:
                r = sb.table('stocks').select('company_context,beta').eq('symbol', symbol).limit(1).execute()
                if r.data:
                    row  = r.data[0]
                    ctx  = (row.get('company_context') or '')[:800]
                    beta = row.get('beta')
                    stock_cache[symbol] = f"{ctx}\nBeta so VN-Index: {beta}".strip() if beta else ctx
                else:
                    stock_cache[symbol] = ''
            return stock_cache[symbol]

        def score_to_label(score: float) -> str:
            if score > 5.0:
                return 'very_positive'
            elif score > 1.5:
                return 'positive'
            elif score >= -1.5:
                return 'neutral'
            elif score >= -5.0:
                return 'negative'
            else:
                return 'very_negative'

        def process_one(article):
            content = (article.get('content') or '').strip()

            # Pre-filter: content < 150 ký tự → trash ngay, không gọi API
            # Bắt cả 2 loại: bài PDF thuần (0 ký tự) và bài chỉ có đoạn mở đầu
            # không có số liệu (thông báo ĐKCC, chốt quyền cổ tức, v.v.)
            if len(content) < 150:
                return article['id'], {
                    'label': 'trash', 'news_type': None,
                    'affected_symbols': None, 'impact_score': None,
                    'impact_reasoning': None, 'content_summary': None,
                }

            symbol      = article.get('symbol') or ''
            affected_db = article.get('affected_symbols') or []
            main_symbol = symbol or (affected_db[0] if affected_db else '')
            stock_ctx   = get_stock_context(main_symbol)

            user_text = f"Tiêu đề: {article.get('title', '')}\nNội dung: {content[:1500]}"
            if main_symbol:
                user_text += f"\nMã CK chính: {main_symbol}"
            if stock_ctx:
                user_text += f"\nThông tin doanh nghiệp:\n{stock_ctx}"

            try:
                resp = client.chat.completions.create(
                    model='gpt-4.1-mini',
                    messages=[
                        {'role': 'system', 'content': SYSTEM_PROMPT},
                        {'role': 'user',   'content': user_text},
                    ],
                    max_tokens=600,
                    temperature=0,
                    response_format={'type': 'json_object'},
                )
                data = json.loads(resp.choices[0].message.content.strip())

                if data.get('trash'):
                    return article['id'], {
                        'label': 'trash', 'news_type': None,
                        'affected_symbols': None, 'impact_score': None,
                        'impact_reasoning': None, 'content_summary': None,
                    }

                score    = data.get('impact_score')
                label    = score_to_label(float(score)) if isinstance(score, (int, float)) else data.get('label', 'neutral')
                ntype    = data.get('news_type', 'thi_truong')
                affected = data.get('affected_symbols') or []
                _r = data.get('impact_reasoning') or ''
                reasoning = '\n'.join(str(s).strip() for s in _r if s) if isinstance(_r, list) else str(_r).strip()
                _s = data.get('content_summary') or ''
                summary   = '\n'.join(str(s).strip() for s in _s if s) if isinstance(_s, list) else str(_s).strip()

                if label not in VALID_LABELS:
                    label = 'neutral'
                if ntype not in VALID_TYPES:
                    ntype = 'thi_truong'
                if not isinstance(affected, list):
                    affected = []
                affected = [s for s in affected if isinstance(s, str) and len(s) <= 10][:5]

                return article['id'], {
                    'label':            label,
                    'news_type':        ntype,
                    'affected_symbols': affected,
                    'impact_score':     float(score) if isinstance(score, (int, float)) else None,
                    'impact_reasoning': reasoning or None,
                    'content_summary':  summary or None,
                }

            except Exception as e:
                err = str(e)
                if '429' in err or 'rate_limit' in err:
                    import time as _time
                    log.warning(f'  Rate limit, cho 60s roi retry...')
                    _time.sleep(60)
                    try:
                        resp = client.chat.completions.create(
                            model='gpt-4.1-mini',
                            messages=[
                                {'role': 'system', 'content': SYSTEM_PROMPT},
                                {'role': 'user',   'content': user_text},
                            ],
                            max_tokens=600,
                            temperature=0,
                            response_format={'type': 'json_object'},
                        )
                        data = json.loads(resp.choices[0].message.content.strip())
                        if data.get('trash'):
                            return article['id'], {
                                'label': 'trash', 'news_type': None,
                                'affected_symbols': None, 'impact_score': None,
                                'impact_reasoning': None, 'content_summary': None,
                            }
                        score     = data.get('impact_score')
                        label     = score_to_label(float(score)) if isinstance(score, (int, float)) else data.get('label', 'neutral')
                        ntype     = data.get('news_type', 'thi_truong')
                        affected  = data.get('affected_symbols') or []
                        reasoning = (data.get('impact_reasoning') or '').strip()
                        summary   = (data.get('content_summary') or '').strip()
                        if label not in VALID_LABELS:
                            label = 'neutral'
                        if ntype not in VALID_TYPES:
                            ntype = 'thi_truong'
                        if not isinstance(affected, list):
                            affected = []
                        affected = [s for s in affected if isinstance(s, str) and len(s) <= 10][:5]
                        return article['id'], {
                            'label': label, 'news_type': ntype,
                            'affected_symbols': affected,
                            'impact_score': float(score) if isinstance(score, (int, float)) else None,
                            'impact_reasoning': reasoning or None,
                            'content_summary':  summary or None,
                        }
                    except Exception as e2:
                        log.warning(f'  Retry that bai sau rate limit {article["id"][:8]}: {e2}')
                elif any(x in err.lower() for x in ['disconnected', 'connecterror', 'remoteprotocol', 'timeout', 'connection']):
                    import time as _time
                    log.warning(f'  Connection error, cho 3s roi retry: {article["id"][:8]}')
                    _time.sleep(3)
                    try:
                        resp = client.chat.completions.create(
                            model='gpt-4.1-mini',
                            messages=[
                                {'role': 'system', 'content': SYSTEM_PROMPT},
                                {'role': 'user',   'content': user_text},
                            ],
                            max_tokens=600,
                            temperature=0,
                            response_format={'type': 'json_object'},
                        )
                        data = json.loads(resp.choices[0].message.content.strip())
                        if data.get('trash'):
                            return article['id'], {
                                'label': 'trash', 'news_type': None,
                                'affected_symbols': None, 'impact_score': None,
                                'impact_reasoning': None, 'content_summary': None,
                            }
                        score     = data.get('impact_score')
                        label     = score_to_label(float(score)) if isinstance(score, (int, float)) else data.get('label', 'neutral')
                        ntype     = data.get('news_type', 'thi_truong')
                        affected  = data.get('affected_symbols') or []
                        reasoning = (data.get('impact_reasoning') or '').strip()
                        summary   = (data.get('content_summary') or '').strip()
                        if label not in VALID_LABELS:
                            label = 'neutral'
                        if ntype not in VALID_TYPES:
                            ntype = 'thi_truong'
                        if not isinstance(affected, list):
                            affected = []
                        affected = [s for s in affected if isinstance(s, str) and len(s) <= 10][:5]
                        return article['id'], {
                            'label': label, 'news_type': ntype,
                            'affected_symbols': affected,
                            'impact_score': float(score) if isinstance(score, (int, float)) else None,
                            'impact_reasoning': reasoning or None,
                            'content_summary':  summary or None,
                        }
                    except Exception as e2:
                        log.warning(f'  Retry that bai sau connection error {article["id"][:8]}: {e2}')
                log.warning(f'  API loi {article["id"][:8]}: {e}')
                return article['id'], {
                    'label': 'neutral', 'news_type': 'thi_truong',
                    'affected_symbols': [], 'impact_score': None,
                    'impact_reasoning': None, 'content_summary': None,
                }

        total = 0
        batch_size = 50

        for i in range(0, len(new_ids), batch_size):
            chunk_ids = new_ids[i:i + batch_size]
            result = (
                sb.table('market_news')
                .select('id,title,content,symbol,affected_symbols')
                .in_('id', chunk_ids)
                .execute()
            )
            articles = result.data or []
            if not articles:
                continue

            # Dedup theo tiêu đề: chỉ gọi GPT cho 1 bài mỗi nhóm trùng tiêu đề
            from collections import defaultdict
            title_groups = defaultdict(list)
            for a in articles:
                key = (a.get('title') or '').strip().lower()
                title_groups[key].append(a)

            primaries    = []
            secondary_map = {}  # primary_id -> [secondary_ids]
            for key, group in title_groups.items():
                if len(group) == 1:
                    primaries.append(group[0])
                else:
                    primary = max(group, key=lambda x: len(x.get('content') or ''))
                    primaries.append(primary)
                    secondary_map[primary['id']] = [a['id'] for a in group if a['id'] != primary['id']]
                    log.info(f'  Dedup: {len(group)} bai trung tieu de → xu ly {primary["id"][:8]}')

            log.info(f'  Dang xu ly {len(primaries)}/{len(articles)} bai (sau dedup)...')
            with ThreadPoolExecutor(max_workers=3) as executor:
                futures = {executor.submit(process_one, a): a for a in primaries}
                for future in as_completed(futures):
                    try:
                        rec_id, fields = future.result()
                    except Exception as fe:
                        log.warning(f'  Future loi: {fe}')
                        continue

                    update_payload = {
                        **fields,
                        'labeled_at':       datetime.now().isoformat(),
                        'labeled_by':       'gpt-4.1-mini',
                        'impact_scored_at': datetime.now().isoformat() if fields.get('impact_score') is not None else None,
                    }

                    ids_to_update = [rec_id] + secondary_map.get(rec_id, [])
                    for uid in ids_to_update:
                        for attempt in range(3):
                            try:
                                sb.table('market_news').update(update_payload).eq('id', uid).execute()
                                break
                            except Exception as ue:
                                if attempt < 2:
                                    import time as _t; _t.sleep(2 ** attempt)
                                else:
                                    log.warning(f'  Supabase update that bai {uid[:8]}: {ue}')

                    n_copies = len(secondary_map.get(rec_id, []))
                    suffix = f' + copy sang {n_copies} ban trung' if n_copies else ''
                    log.info(f'  ✓ {rec_id[:8]}... → {fields["label"]} (score={fields.get("impact_score")}){suffix}')
                    total += len(ids_to_update)

        log.info(f'  Da xu ly: {total} bai')
        return total

    except Exception as e:
        log.error(f'  Label+score loi: {e}')
        return total


# ── Bước 3: Email ──────────────────────────────────────────────────────────────

def run_email(test_email: str = None, manual_email: str = None):
    """Gửi email. manual_email: chỉ gửi cho 1 người khi chạy thủ công."""
    step_header(3, 'GỬI EMAIL THÔNG BÁO')
    try:
        from email_notifier import run
        run(test_email=test_email, manual_email=manual_email)
    except Exception as e:
        log.error(f'  Email lỗi: {e}')


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Wealbee Pipeline Runner')
    parser.add_argument('--test-email',    metavar='EMAIL', help='Test: gửi email cho địa chỉ này')
    parser.add_argument('--manual-email',  metavar='EMAIL', help='Chạy thủ công: chỉ gửi cho user này')
    args = parser.parse_args()

    start = time.time()

    log.info('=' * 55)
    log.info(f'  WEALBEE PIPELINE — {datetime.now().strftime("%d/%m/%Y %H:%M:%S")}')
    if args.manual_email:
        log.info(f'  CHẾ ĐỘ THỦ CÔNG → gửi cho: {args.manual_email}')
    log.info('=' * 55)

    since_dt = get_last_crawled_at()
    log.info(f'  Last crawled: {since_dt.strftime("%d/%m/%Y %H:%M:%S")}')

    new_urls = run_crawl(since_dt)
    update_last_crawled_at()
    time.sleep(2)

    n_labeled = run_label_and_score(new_urls)
    time.sleep(2)

    run_email(
        test_email=args.test_email,
        manual_email=args.manual_email,
    )

    elapsed = time.time() - start
    log.info('=' * 55)
    log.info(f'  HOAN THANH — {elapsed:.0f}s')
    log.info(f'  Crawl moi: {len(new_urls)} bai | Label+Score: {n_labeled} bai')
    log.info('=' * 55)


if __name__ == '__main__':
    main()
