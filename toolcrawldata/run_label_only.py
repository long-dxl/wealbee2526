"""
Chỉ label+score những bài đã crawl nhưng chưa được label.
Chạy local: python run_label_only.py

Workflow re-label toàn bộ:
  1. Chạy SQL: UPDATE market_news SET label=NULL, ... WHERE published_at >= NOW() - INTERVAL '24 hours';
  2. Chạy file này.
"""

import sys, os, json, time, logging
from datetime import datetime, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger('label_only')

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client
from openai import OpenAI

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'), max_retries=1, timeout=30.0)
sb     = get_client()

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
Viết 3-5 bullet points tóm tắt nội dung chính: sự kiện, số liệu quan trọng, bối cảnh liên quan.
Ưu tiên: doanh thu, lợi nhuận, biên lợi nhuận, tăng trưởng YoY/QoQ, backlog, sản lượng, thị phần, nợ vay, dòng tiền, CAPEX, đơn hàng, guidance.
Mỗi bullet ngắn gọn, chứa số liệu cụ thể nếu có. Không viết nhận định hay suy diễn.
Nếu trash: null.


## OUTPUT — JSON STRICT (không có text ngoài JSON)

Nếu trash:
{"trash":true,"news_type":null,"affected_symbols":null,"impact_score":null,"label":"trash","impact_reasoning":null,"content_summary":null}

Nếu không trash (content_summary và impact_reasoning là JSON array of strings):
{"trash":false,"news_type":"hoat_dong_kd","affected_symbols":["VNM"],"impact_score":-3.5,"label":"negative","content_summary":["Bullet 1 với số liệu cụ thể.","Bullet 2.","Bullet 3."],"impact_reasoning":["Câu phân tích tác động 1.","Câu phân tích tác động 2."]}"""

VALID_LABELS = {'very_positive', 'positive', 'neutral', 'negative', 'very_negative', 'trash'}
VALID_TYPES  = {'vi_mo', 'vi_mo_dn', 'hoat_dong_kd', 'phap_ly', 'thi_truong', 'du_bao'}

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
    if score > 5.0:    return 'very_positive'
    elif score > 1.5:  return 'positive'
    elif score >= -1.5: return 'neutral'
    elif score >= -5.0: return 'negative'
    else:              return 'very_negative'

def _parse_response(data: dict, article_id: str) -> dict:
    if data.get('trash'):
        return {
            'label': 'trash', 'news_type': None,
            'affected_symbols': None, 'impact_score': None,
            'impact_reasoning': None, 'content_summary': None,
        }
    score     = data.get('impact_score')
    label     = score_to_label(float(score)) if isinstance(score, (int, float)) else data.get('label', 'neutral')
    ntype     = data.get('news_type', 'thi_truong')
    affected  = data.get('affected_symbols') or []
    _r = data.get('impact_reasoning') or ''
    reasoning = '\n'.join(str(s).strip() for s in _r if s) if isinstance(_r, list) else str(_r).strip()
    _s = data.get('content_summary') or ''
    summary   = '\n'.join(str(s).strip() for s in _s if s) if isinstance(_s, list) else str(_s).strip()

    if label not in VALID_LABELS: label = 'neutral'
    if ntype not in VALID_TYPES:  ntype = 'thi_truong'
    if not isinstance(affected, list): affected = []
    affected = [s for s in affected if isinstance(s, str) and len(s) <= 10][:5]

    return {
        'label': label, 'news_type': ntype,
        'affected_symbols': affected,
        'impact_score': float(score) if isinstance(score, (int, float)) else None,
        'impact_reasoning': reasoning or None,
        'content_summary':  summary or None,
    }

def process_one(article):
    content = (article.get('content') or '').strip()
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

    for attempt in range(3):
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
            return article['id'], _parse_response(data, article['id'])

        except Exception as e:
            err = str(e)
            if '429' in err or 'rate_limit' in err:
                log.warning(f'  Rate limit, cho 60s... (attempt {attempt+1}/3)')
                time.sleep(60)
            elif any(x in err.lower() for x in ['disconnected', 'connecterror', 'remoteprotocol', 'timeout', 'connection']):
                log.warning(f'  Connection error, cho 3s... (attempt {attempt+1}/3)')
                time.sleep(3)
            else:
                log.warning(f'  API loi {article["id"][:8]}: {e}')
                break

    return article['id'], {
        'label': 'neutral', 'news_type': 'thi_truong',
        'affected_symbols': [], 'impact_score': None,
        'impact_reasoning': None, 'content_summary': None,
    }


def main():
    since = (datetime.now() - timedelta(hours=24)).isoformat()

    ids = []
    offset = 0
    while True:
        rows = (
            sb.table('market_news')
            .select('id')
            .gte('published_at', since)
            .gte('created_at', since)
            .range(offset, offset + 999)
            .execute()
        ).data or []
        ids += [r['id'] for r in rows]
        if len(rows) < 1000:
            break
        offset += 1000

    log.info(f'Bai trong 24h (published_at & created_at >= now-24h): {len(ids)}')
    if not ids:
        log.info('Khong co bai nao can xu ly.')
        return

    total      = 0
    batch_size = 50

    for i in range(0, len(ids), batch_size):
        chunk = ids[i:i + batch_size]
        articles = (
            sb.table('market_news')
            .select('id,title,content,symbol,affected_symbols')
            .in_('id', chunk)
            .execute()
        ).data or []

        if not articles:
            continue

        # Dedup theo tiêu đề: chỉ gọi GPT cho 1 bài mỗi nhóm trùng tiêu đề
        title_groups = defaultdict(list)
        for a in articles:
            key = (a.get('title') or '').strip().lower()
            title_groups[key].append(a)

        primaries    = []
        secondary_map = {}
        for key, group in title_groups.items():
            if len(group) == 1:
                primaries.append(group[0])
            else:
                primary = max(group, key=lambda x: len(x.get('content') or ''))
                primaries.append(primary)
                secondary_map[primary['id']] = [a['id'] for a in group if a['id'] != primary['id']]
                log.info(f'  Dedup: {len(group)} bai trung tieu de → xu ly {primary["id"][:8]}')

        log.info(f'  Batch {i//batch_size + 1}: xu ly {len(primaries)}/{len(articles)} bai (sau dedup)...')
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
                                time.sleep(2 ** attempt)
                            else:
                                log.warning(f'  Supabase update that bai {uid[:8]}: {ue}')

                n_copies = len(secondary_map.get(rec_id, []))
                suffix = f' + copy sang {n_copies} ban trung' if n_copies else ''
                log.info(f'  ✓ {rec_id[:8]}... → {fields["label"]} (score={fields.get("impact_score")}){suffix}')
                total += len(ids_to_update)

    log.info(f'XONG: da label {total} bai.')


if __name__ == '__main__':
    main()
