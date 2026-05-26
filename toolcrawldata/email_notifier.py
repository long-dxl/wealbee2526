"""
Email Notifier — Query subscribers + tin tức mới label xong → gửi email.

Chạy:
  python email_notifier.py           <- gửi email cho tất cả subscribers
  python email_notifier.py --test EMAIL  <- gửi test 1 người
"""

import sys
import os
import logging
import argparse
from datetime import datetime, date, timedelta
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client

import resend

RESEND_API_KEY = os.getenv('RESEND_API_KEY')
EMAIL_FROM     = os.getenv('EMAIL_FROM', 'Wealbee <no-reply@wealbee.app>')

LOG_DIR = Path(__file__).parent / 'logs'
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / 'email_notifier.log', encoding='utf-8'),
    ],
)
log = logging.getLogger('email_notifier')

# ── Màu sắc theo label ────────────────────────────────────────────────────────
LABEL_VI = {
    'very_positive': 'RẤT TÍCH CỰC',
    'positive':      'TÍCH CỰC',
    'negative':      'TIÊU CỰC',
    'very_negative': 'RẤT TIÊU CỰC',
}
LABEL_COLOR = {
    'very_positive': '#1B5E20',
    'positive':      '#2E7D32',
    'negative':      '#D4183D',
    'very_negative': '#7B0D1E',
}
LABEL_BG = {
    'very_positive': '#C8E6C9',
    'positive':      '#E8F5E9',
    'negative':      '#FDE8EC',
    'very_negative': '#F8D7DA',
}
LABEL_BORDER = {
    'very_positive': '#1B5E20',
    'positive':      '#2E7D32',
    'negative':      '#D4183D',
    'very_negative': '#7B0D1E',
}

# Nhãn được gửi email (neutral và trash bị loại)
EMAIL_LABELS = ('very_positive', 'positive', 'negative', 'very_negative')

# ── Tag loại tin ──────────────────────────────────────────────────────────────
NEWS_TYPE_VI = {
    'vi_mo':        'Vĩ mô',
    'vi_mo_dn':     'Vĩ mô ngành',
    'hoat_dong_kd': 'Hoạt động KD',
    'phap_ly':      'Pháp lý',
    'thi_truong':   'Thị trường',
    'du_bao':       'Dự báo',
}


def fetch_subscribers(sb) -> list[dict]:
    result = sb.table('subscribers').select('email,holdings').execute()
    return result.data or []


def fetch_news_for_symbol(sb, symbol: str, since_published: str, since_labeled: str) -> list[dict]:
    seen_ids = set()
    results = []

    # 1. Bài có symbol khớp trực tiếp
    r1 = (
        sb.table('market_news')
        .select('id,title,content,content_summary,article_url,label,source,published_at,news_type,affected_symbols,impact_reasoning,impact_score')
        .eq('symbol', symbol)
        .in_('label', list(EMAIL_LABELS))
        .gte('published_at', since_published)
        .gte('labeled_at', since_labeled)
        .order('published_at', desc=True)
        .limit(20)
        .execute()
    )
    for row in (r1.data or []):
        seen_ids.add(row['id'])
        results.append(row)

    # 2. Bài LLM gán symbol vào affected_symbols (bài không có symbol trực tiếp)
    if len(results) < 20:
        r2 = (
            sb.table('market_news')
            .select('id,title,content,content_summary,article_url,label,source,published_at,news_type,affected_symbols,impact_reasoning,impact_score')
            .contains('affected_symbols', [symbol])
            .in_('label', list(EMAIL_LABELS))
            .gte('published_at', since_published)
            .gte('labeled_at', since_labeled)
            .order('published_at', desc=True)
            .limit(20)
            .execute()
        )
        for row in (r2.data or []):
            if row['id'] not in seen_ids:
                seen_ids.add(row['id'])
                results.append(row)

    # Sort theo |impact_score| giảm dần → bài ảnh hưởng mạnh nhất lên đầu
    results.sort(key=lambda x: abs(x.get('impact_score') or 0), reverse=True)

    # Dedup theo tiêu đề: giữ bài score cao nhất, gắn nguồn còn lại vào _alt_sources
    seen_titles = {}
    deduped = []
    for row in results:
        key = (row.get('title') or '').strip().lower()
        if key in seen_titles:
            seen_titles[key].setdefault('_alt_sources', []).append({
                'source': row.get('source', ''),
                'url':    row.get('article_url', '#'),
            })
        else:
            seen_titles[key] = row
            deduped.append(row)

    return deduped[:3]


import re as _re


def _md_bold(text: str) -> str:
    """Convert **text** markdown bold → <strong> HTML."""
    return _re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)


def _render_bullets(text: str, color: str = '#374151', font_size: str = '12px') -> str:
    """Render newline-separated bullet text as <ul><li> list with markdown bold support."""
    lines = [l.strip() for l in (text or '').split('\n') if l.strip()]
    if not lines:
        return ''
    items = ''.join(
        f'<li style="margin-bottom:5px;color:{color};font-size:{font_size};line-height:1.6;">{_md_bold(l)}</li>'
        for l in lines
    )
    return f'<ul style="margin:0 0 8px 0;padding-left:16px;">{items}</ul>'


def _extract_reasoning_for_symbol(reasoning: str, symbol: str) -> str:
    """Với bài 1 symbol: extract [Chung] + [SYMBOL] nếu dùng format mới, fallback nguyên văn."""
    if not reasoning or not _re.search(r'\[[A-Z]{1,10}\]', reasoning):
        return reasoning
    parts = _re.split(r'\[([^\]]+)\]', reasoning)
    result = []
    for i in range(1, len(parts), 2):
        tag  = parts[i].strip()
        text = parts[i + 1].strip() if i + 1 < len(parts) else ''
        if text and (tag == 'Chung' or tag == symbol):
            result.append(text)
    return ' '.join(result) if result else reasoning


def _reasoning_html_multi(reasoning: str, user_symbols: set) -> str:
    """Render per-symbol reasoning HTML cho multi-symbol card."""
    if not reasoning:
        return ''
    if not _re.search(r'\[[A-Z]{1,10}\]', reasoning):
        return _render_bullets(reasoning, color='#4A5568', font_size='12px') or f'<p style="margin:0;color:#4A5568;font-size:12px;line-height:1.6;">{_md_bold(reasoning)}</p>'
    parts = _re.split(r'\[([^\]]+)\]', reasoning)
    html  = []
    for i in range(1, len(parts), 2):
        tag  = parts[i].strip()
        text = parts[i + 1].strip() if i + 1 < len(parts) else ''
        if not text:
            continue
        if tag == 'Chung':
            html.append(f'<p style="margin:0 0 8px;color:#4A5568;font-size:12px;line-height:1.6;">{_md_bold(text)}</p>')
        elif tag in user_symbols:
            html.append(
                f'<p style="margin:0 0 6px;color:#4A5568;font-size:12px;line-height:1.6;">'
                f'<span style="color:#0849AC;font-weight:700;font-style:italic;">[{tag}]</span> {_md_bold(text)}</p>'
            )
        else:
            html.append(
                f'<p style="margin:0 0 6px;color:#9CA3AF;font-size:12px;line-height:1.6;">'
                f'<span style="font-weight:600;">[{tag}]</span> {_md_bold(text)}</p>'
            )
    return ''.join(html)


def _affected_chips_html(affected_symbols: list, user_symbols: set) -> str:
    """Render chip mã cổ phiếu: user's symbols nổi bật xanh+đậm+nghiêng, còn lại xám."""
    chips = []
    for sym in (affected_symbols or []):
        if sym in user_symbols:
            chips.append(
                f'<span style="display:inline-block;background:#ECF2FF;color:#0849AC;'
                f'font-size:11px;font-weight:700;font-style:italic;'
                f'padding:3px 10px;border-radius:20px;margin:2px 3px 2px 0;">{sym}</span>'
            )
        else:
            chips.append(
                f'<span style="display:inline-block;background:#F3F4F6;color:#9CA3AF;'
                f'font-size:11px;font-weight:600;'
                f'padding:3px 10px;border-radius:20px;margin:2px 3px 2px 0;">{sym}</span>'
            )
    return ''.join(chips)


def _utm_url(url: str, campaign: str = 'daily', content: str = '') -> str:
    """Thêm UTM params vào link để PostHog track click từ email."""
    import urllib.parse
    params = {'utm_source': 'email', 'utm_medium': 'digest', 'utm_campaign': campaign}
    if content:
        params['utm_content'] = content
    sep = '&' if '?' in url else '?'
    return url + sep + urllib.parse.urlencode(params)


def _news_item_html(news: dict, symbol: str = '') -> str:
    import urllib.parse
    label     = news.get('label', 'positive')
    color     = LABEL_COLOR.get(label, '#2E7D32')
    bg        = LABEL_BG.get(label, '#E8F5E9')
    border    = LABEL_BORDER.get(label, '#2E7D32')
    badge     = LABEL_VI.get(label, label.upper())
    ntype     = news.get('news_type') or ''
    type_tag  = NEWS_TYPE_VI.get(ntype, '')
    title     = news.get('title', '')
    url       = _utm_url(news.get('article_url', '#'), content=f"article_{symbol.lower()}")
    source    = news.get('source', '')
    summary     = (news.get('content_summary') or '').strip()
    if not summary:
        _raw = (news.get('content') or '').strip()
        summary = (_raw[:200] + '...') if _raw else ''
    reasoning   = _extract_reasoning_for_symbol((news.get('impact_reasoning') or '').strip(), symbol)
    alt_sources = news.get('_alt_sources') or []

    type_html = (
        f'<td style="padding-left:6px;">'
        f'<span style="background:#F0F0F8;color:#5A5A7A;font-size:10px;font-weight:600;'
        f'padding:3px 8px;border-radius:20px;">{type_tag}</span></td>'
        if type_tag else ''
    )

    # Source label: "CafeF · Markettimes" nếu có bài trùng
    if alt_sources:
        all_source_names = ' · '.join(filter(None, [source] + [s['source'] for s in alt_sources]))
    else:
        all_source_names = source

    # "Đọc bài báo gốc" links — mỗi nguồn 1 link riêng
    if alt_sources:
        link_parts = [f'<a href="{url}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">{source or "Nguồn 1"}</a>']
        for s in alt_sources:
            link_parts.append(f'<a href="{s["url"]}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">{s["source"] or "Nguồn khác"}</a>')
        read_html = f'<p style="margin:0 0 12px;">' + ' &nbsp;·&nbsp; '.join(link_parts) + '</p>'
    else:
        read_html = f'<p style="margin:0 0 12px;"><a href="{url}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">Đọc bài báo gốc</a></p>'

    deep_prompt = (
        f"Tóm tắt bài báo: {url}\n"
        f"Phân tích tác động của tin này lên cổ phiếu {symbol}.\n"
        f"Bạn hãy research các thông tin cần thiết liên quan để tự cung cấp đủ context nhằm phân tích tin tức và cho tôi biết:\n"
        f"- Tin ảnh hưởng trực tiếp hay gián tiếp?\n"
        f"- Mức độ tác động (mạnh / vừa / yếu)\n"
        f"- Ngắn hạn vs dài hạn\n"
        f"- Thị trường đã phản ánh chưa?\n"
        f"- Kết luận: bullish hay bearish (kèm reasoning)"
    )
    chatgpt_url = f"https://chatgpt.com/?q={urllib.parse.quote(deep_prompt)}"
    chatgpt_btn = f"""
                        <div style="margin-top:10px;">
                          <a href="{chatgpt_url}" style="display:inline-flex;align-items:center;gap:6px;background:#0849AC;color:#ffffff;font-size:11px;font-weight:600;padding:7px 14px;border-radius:20px;text-decoration:none;">
                            Research sâu hơn →
                          </a>
                        </div>"""

    summary_html  = _render_bullets(summary, color='#374151', font_size='13px') if summary else ''
    reasoning_html = _render_bullets(reasoning, color='#4A5568', font_size='12px') if reasoning else ''

    # Phần AI Reasoning (nếu có) hoặc placeholder — layout column
    if reasoning_html:
        bottom_block = f"""
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ECF2FF;border-radius:8px;">
                    <tr>
                      <td style="padding:12px 14px;">
                        <p style="margin:0 0 5px;color:#0849AC;font-size:11px;font-weight:700;letter-spacing:0.5px;">AI REASONING</p>
                        {reasoning_html}
                        {chatgpt_btn}
                      </td>
                    </tr>
                  </table>"""
    else:
        bottom_block = f"""
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FB;border-radius:8px;border:1px solid #ECECF0;">
                    <tr>
                      <td style="padding:12px 14px;">
                        <p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;font-style:italic;">Chưa có AI reasoning cho bài này.</p>
                        {chatgpt_btn}
                      </td>
                    </tr>
                  </table>"""

    return f"""
        <tr>
          <td class="pw" style="background:#ffffff;padding:8px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="card" style="background:#F8F9FB;border-radius:10px;border-left:4px solid {border};padding:16px;">
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                    <tr>
                      <td style="background:{bg};color:{color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">{badge}</td>
                      {type_html}
                      <td style="padding-left:10px;color:#717182;font-size:11px;">{all_source_names}</td>
                    </tr>
                  </table>
                  <a href="{url}" style="color:#030213;font-size:14px;font-weight:600;text-decoration:none;line-height:1.5;display:block;margin-bottom:8px;">{title}</a>
                  {summary_html if summary_html else f'<p style="margin:0 0 6px;color:#717182;font-size:13px;line-height:1.55;">{summary}</p>' if summary else ''}
                  {read_html}
                  {bottom_block}
                </td>
              </tr>
            </table>
          </td>
        </tr>"""


def _multi_news_item_html(news: dict, user_symbols: set) -> str:
    """Card cho bài ảnh hưởng ≥2 cổ phiếu user đang giữ."""
    import urllib.parse
    label     = news.get('label', 'positive')
    color     = LABEL_COLOR.get(label, '#2E7D32')
    bg        = LABEL_BG.get(label, '#E8F5E9')
    border    = LABEL_BORDER.get(label, '#2E7D32')
    badge     = LABEL_VI.get(label, label.upper())
    ntype     = news.get('news_type') or ''
    type_tag  = NEWS_TYPE_VI.get(ntype, '')
    title     = news.get('title', '')
    url       = _utm_url(news.get('article_url', '#'), content='article_multi')
    source    = news.get('source', '')
    affected  = news.get('affected_symbols') or []
    summary   = (news.get('content_summary') or '').strip()
    if not summary:
        _raw = (news.get('content') or '').strip()
        summary = (_raw[:200] + '...') if _raw else ''
    reasoning_raw = (news.get('impact_reasoning') or '').strip()
    alt_sources   = news.get('_alt_sources') or []

    type_html = (
        f'<td style="padding-left:6px;">'
        f'<span style="background:#F0F0F8;color:#5A5A7A;font-size:10px;font-weight:600;'
        f'padding:3px 8px;border-radius:20px;">{type_tag}</span></td>'
        if type_tag else ''
    )

    if alt_sources:
        all_source_names = ' · '.join(filter(None, [source] + [s['source'] for s in alt_sources]))
    else:
        all_source_names = source

    if alt_sources:
        link_parts = [f'<a href="{url}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">{source or "Nguồn 1"}</a>']
        for s in alt_sources:
            link_parts.append(f'<a href="{s["url"]}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">{s["source"] or "Nguồn khác"}</a>')
        read_html = '<p style="margin:0 0 12px;">' + ' &nbsp;·&nbsp; '.join(link_parts) + '</p>'
    else:
        read_html = f'<p style="margin:0 0 12px;"><a href="{url}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">Đọc bài báo gốc →</a></p>'

    chips_html     = _affected_chips_html(affected, user_symbols)
    reasoning_html = _reasoning_html_multi(reasoning_raw, user_symbols)
    summary_html   = _render_bullets(summary, color='#374151', font_size='13px') if summary else ''

    user_syms_affected = ', '.join(s for s in affected if s in user_symbols)
    deep_prompt = (
        f"Tóm tắt bài báo: {url}\n"
        f"Phân tích tác động của tin này lên các cổ phiếu {user_syms_affected}.\n"
        f"Bạn hãy research các thông tin cần thiết liên quan để tự cung cấp đủ context nhằm phân tích tin tức và cho tôi biết:\n"
        f"- Tin ảnh hưởng trực tiếp hay gián tiếp?\n"
        f"- Mức độ tác động (mạnh / vừa / yếu)\n"
        f"- Ngắn hạn vs dài hạn\n"
        f"- Thị trường đã phản ánh chưa?\n"
        f"- Kết luận: bullish hay bearish (kèm reasoning)"
    )
    chatgpt_url = f"https://chatgpt.com/?q={urllib.parse.quote(deep_prompt)}"
    chatgpt_btn = f"""
                        <div style="margin-top:10px;">
                          <a href="{chatgpt_url}" style="display:inline-flex;align-items:center;gap:6px;background:#0849AC;color:#ffffff;font-size:11px;font-weight:600;padding:7px 14px;border-radius:20px;text-decoration:none;">
                            Research sâu hơn →
                          </a>
                        </div>"""

    if reasoning_html:
        bottom_block = f"""
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ECF2FF;border-radius:8px;">
                    <tr>
                      <td style="padding:12px 14px;">
                        <p style="margin:0 0 8px;color:#0849AC;font-size:11px;font-weight:700;letter-spacing:0.5px;">AI REASONING</p>
                        {reasoning_html}
                        {chatgpt_btn}
                      </td>
                    </tr>
                  </table>"""
    else:
        bottom_block = f"""
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FB;border-radius:8px;border:1px solid #ECECF0;">
                    <tr>
                      <td style="padding:12px 14px;">
                        <p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;font-style:italic;">Chưa có AI reasoning cho bài này.</p>
                        {chatgpt_btn}
                      </td>
                    </tr>
                  </table>"""

    return f"""
        <tr>
          <td class="pw" style="background:#ffffff;padding:8px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="card" style="background:#F8F9FB;border-radius:10px;border-left:4px solid {border};padding:16px;">
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                    <tr>
                      <td style="background:{bg};color:{color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">{badge}</td>
                      {type_html}
                      <td style="padding-left:10px;color:#717182;font-size:11px;">{all_source_names}</td>
                    </tr>
                  </table>
                  <a href="{url}" style="color:#030213;font-size:14px;font-weight:600;text-decoration:none;line-height:1.5;display:block;margin-bottom:8px;">{title}</a>
                  <div style="margin-bottom:8px;">{chips_html}</div>
                  {summary_html if summary_html else f'<p style="margin:0 0 6px;color:#717182;font-size:13px;line-height:1.55;">{summary}</p>' if summary else ''}
                  {read_html}
                  {bottom_block}
                </td>
              </tr>
            </table>
          </td>
        </tr>"""


def build_email_html(email: str, holdings: list[dict], news_by_symbol: dict) -> str:
    from zoneinfo import ZoneInfo
    vn_now     = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh'))
    today_str  = vn_now.strftime('%d/%m/%Y')
    now_str    = vn_now.strftime('%H:%M')
    weekday_vi = ['Thu Hai','Thu Ba','Thu Tu','Thu Nam','Thu Sau','Thu Bay','Chu Nhat']
    weekday    = weekday_vi[vn_now.weekday()]

    weekday_full = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']
    weekday_display = weekday_full[vn_now.weekday()]

    hour = vn_now.hour
    if 5 <= hour < 11:
        buoi = 'buổi sáng'
    elif 11 <= hour < 13:
        buoi = 'buổi trưa'
    elif 13 <= hour < 18:
        buoi = 'buổi chiều'
    else:
        buoi = 'buổi tối'
    buoi_cap = buoi.capitalize()

    # Phân loại cổ phiếu có / không có tin
    symbols_with_news    = [h.get('symbol') for h in holdings if h.get('symbol') and news_by_symbol.get(h.get('symbol'))]
    symbols_without_news = [h.get('symbol') for h in holdings if h.get('symbol') and not news_by_symbol.get(h.get('symbol'))]

    # Block tổng quan danh mục
    with_news_html = ''
    if symbols_with_news:
        chips = ''.join(
            f'<span style="display:inline-block;background:#E8F5E9;color:#2E7D32;font-size:11px;font-weight:700;'
            f'padding:3px 10px;border-radius:20px;margin:2px 3px 2px 0;">{s}</span>'
            for s in symbols_with_news
        )
        with_news_html = f"""
              <tr>
                <td style="padding-bottom:10px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:top;padding-top:4px;padding-right:8px;">
                        <span style="display:inline-block;width:8px;height:8px;background:#2E7D32;border-radius:50%;"></span>
                      </td>
                      <td>
                        <span style="color:#717182;font-size:12px;font-weight:600;">Có tin tức ảnh hưởng:&nbsp;</span>
                        {chips}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>"""

    without_news_html = ''
    if symbols_without_news:
        chips = ''.join(
            f'<span style="display:inline-block;background:#F3F4F6;color:#9CA3AF;font-size:11px;font-weight:700;'
            f'padding:3px 10px;border-radius:20px;margin:2px 3px 2px 0;">{s}</span>'
            for s in symbols_without_news
        )
        without_news_html = f"""
              <tr>
                <td>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:top;padding-top:4px;padding-right:8px;">
                        <span style="display:inline-block;width:8px;height:8px;background:#D1D5DB;border-radius:50%;"></span>
                      </td>
                      <td>
                        <span style="color:#717182;font-size:12px;font-weight:600;">Không có tin tức:&nbsp;</span>
                        {chips}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>"""

    portfolio_summary_block = f"""
        <tr>
          <td class="pw" style="background:#ffffff;padding:16px 32px 4px;">
            <p style="margin:0 0 12px;color:#030213;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Danh mục hôm nay</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              {with_news_html}
              {without_news_html}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pw" style="background:#ffffff;padding:0 32px 16px;">
            <div style="border-top:1px solid #ECECF0;"></div>
          </td>
        </tr>"""

    # ── Phát hiện bài ảnh hưởng ≥2 cổ phiếu user đang giữ ──────────────────────
    user_symbols_set = {h.get('symbol') for h in holdings if h.get('symbol')}
    article_to_user_syms: dict = {}
    article_by_id: dict        = {}
    for _sym in user_symbols_set:
        for _n in news_by_symbol.get(_sym, []):
            _aid = _n['id']
            article_by_id[_aid] = _n
            article_to_user_syms.setdefault(_aid, set()).add(_sym)

    multi_ids = {aid for aid, syms in article_to_user_syms.items() if len(syms) >= 2}
    multi_articles = sorted(
        [article_by_id[aid] for aid in multi_ids],
        key=lambda x: abs(x.get('impact_score') or 0),
        reverse=True,
    )

    # ── Section "Tin ảnh hưởng nhiều cổ phiếu" ──────────────────────────────────
    multi_block = ''
    if multi_articles:
        multi_rows = ''.join(_multi_news_item_html(n, user_symbols_set) for n in multi_articles)
        multi_block = f"""
        <tr>
          <td class="pw" style="background:#ffffff;padding:20px 32px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#030213;font-size:18px;font-weight:700;">Tin ảnh hưởng nhiều cổ phiếu</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        {multi_rows}
        <tr>
          <td class="pw" style="background:#ffffff;padding:0 32px 16px;">
            <div style="border-top:1px solid #ECECF0;"></div>
          </td>
        </tr>"""

    # ── Per-symbol sections (loại bỏ bài đã hiển thị trong multi_block) ─────────
    per_symbol_blocks = ''
    for holding in holdings:
        symbol    = holding.get('symbol', '')
        quantity  = holding.get('quantity', 0)
        news_list = [n for n in news_by_symbol.get(symbol, []) if n['id'] not in multi_ids]
        if not news_list:
            continue
        news_rows = ''.join(_news_item_html(n, symbol) for n in news_list)
        per_symbol_blocks += f"""
        <tr>
          <td class="pw" style="background:#ffffff;padding:20px 32px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#030213;font-size:18px;font-weight:700;">{symbol}</span>
                  <span style="color:#717182;font-size:14px;margin-left:8px;">{quantity:,} cổ phiếu</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        {news_rows}
        <tr>
          <td class="pw" style="background:#ffffff;padding:0 32px 16px;">
            <div style="border-top:1px solid #ECECF0;"></div>
          </td>
        </tr>"""

    holding_blocks = multi_block + per_symbol_blocks

    # Nếu không có tin nào → block thông báo
    if not holding_blocks:
        symbol_list = ' · '.join(f'<strong>{s}</strong>' for s in symbols_without_news) if symbols_without_news else 'các cổ phiếu trong danh mục'
        holding_blocks = f"""
        <tr>
          <td class="pw" style="background:#ffffff;padding:8px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#F8F9FB;border-radius:10px;border-left:4px solid #E5E7EB;padding:20px 18px;">
                  <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">Không có tin tức nổi bật hôm nay</p>
                  <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.7;">
                    Trong 24 giờ qua, chưa ghi nhận tin tức nào ảnh hưởng đáng kể đến {symbol_list} trong danh mục của bạn.
                    Chúng tôi sẽ thông báo ngay khi có thông tin mới.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Wealbee - Bản tin {buoi}</title>
  <style>
    @media only screen and (max-width:600px){{
      .pw  {{ padding-left:10px!important; padding-right:10px!important; }}
      .card{{ padding:10px!important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:32px 0;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:#0849AC;border-radius:12px 12px 0 0;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:10px;">
                        <img src="https://fkwsvyzguehtsjpwmttb.supabase.co/storage/v1/object/public/assets/logo-white.svg"
                             width="44" height="44" alt="Wealbee" style="display:block;"/>
                      </td>
                      <td style="vertical-align:middle;">
                        <span style="color:#ffffff;font-size:21px;font-weight:600;letter-spacing:-0.3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Wealbee</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="color:rgba(255,255,255,0.7);font-size:13px;">{weekday_display}, {today_str}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- HERO BAND -->
        <tr>
          <td style="background:#ECF2FF;padding:14px 32px;">
            <p style="margin:0;color:#0849AC;font-size:15px;font-weight:600;">
              Bản tin {buoi} &nbsp;·&nbsp; {now_str}
            </p>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td class="pw" style="background:#ffffff;padding:24px 32px 12px;">
            <p style="margin:0;color:#030213;font-size:15px;line-height:1.6;">
              Dưới đây là những tin tức quan trọng ảnh hưởng đến danh mục của bạn hôm nay.
            </p>
          </td>
        </tr>
        <tr>
          <td class="pw" style="background:#ffffff;padding:0 32px;">
            <div style="border-top:1px solid #ECECF0;"></div>
          </td>
        </tr>

        {portfolio_summary_block}

        {holding_blocks}

        <!-- FOOTER -->
        <tr>
          <td style="background:#0849AC;border-radius:0 0 12px 12px;padding:28px 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Brand -->
              <tr>
                <td align="center" style="padding-bottom:16px;">
                  <p style="margin:0 0 3px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.3px;">Wealbee</p>
                  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:11px;">Bản tin tự động · Không trả lời email này</p>
                </td>
              </tr>

              <!-- Social icons -->
              <tr>
                <td align="center" style="padding-bottom:16px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <!-- Trang chủ -->
                      <td style="padding:0 6px;">
                        <a href="{_utm_url('https://wealbee.com', content='footer_home')}" title="Trang chủ"
                           style="display:inline-block;width:36px;height:36px;background:rgba(255,255,255,0.15);border-radius:50%;text-align:center;line-height:36px;text-decoration:none;font-size:16px;">
                          🌐
                        </a>
                      </td>
                      <!-- Facebook -->
                      <td style="padding:0 6px;">
                        <a href="https://www.facebook.com/people/Wealbee/61578427622563/" title="Facebook"
                           style="display:inline-block;width:36px;height:36px;background:rgba(255,255,255,0.15);border-radius:50%;text-align:center;line-height:34px;text-decoration:none;color:#ffffff;font-size:18px;font-weight:900;font-family:Georgia,serif;">
                          f
                        </a>
                      </td>
                      <!-- TikTok -->
                      <td style="padding:0 6px;">
                        <a href="https://www.tiktok.com/@wealbee?is_from_webapp=1&amp;sender_device=pc" title="TikTok"
                           style="display:inline-block;width:36px;height:36px;background:rgba(255,255,255,0.15);border-radius:50%;text-align:center;line-height:36px;text-decoration:none;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:-0.3px;">
                          TikTok
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="padding:0 0 14px;">
                  <div style="border-top:1px solid rgba(255,255,255,0.15);"></div>
                </td>
              </tr>

              <!-- Unsubscribe -->
              <tr>
                <td align="center">
                  <a href="https://wealbee.com/unsubscribe?email={email}"
                     style="color:rgba(255,255,255,0.45);font-size:11px;text-decoration:none;">
                    Huỷ đăng ký
                  </a>
                </td>
              </tr>

            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def send_email(to: str, subject: str, html: str) -> bool:
    resend.api_key = RESEND_API_KEY
    try:
        result = resend.Emails.send({'from': EMAIL_FROM, 'to': [to], 'subject': subject, 'html': html})
        log.info(f'  Gui -> {to} | id={result.get("id","?")}')
        return True
    except Exception as e:
        log.error(f'  Loi gui {to}: {e}')
        return False


def run(test_email=None):
    if not RESEND_API_KEY:
        log.error('Thieu RESEND_API_KEY trong .env')
        return

    sb    = get_client()
    since_published = (datetime.now() - timedelta(hours=28)).isoformat()
    since_labeled   = (datetime.now() - timedelta(hours=24)).isoformat()

    log.info('[1] Load subscribers...')
    subscribers = fetch_subscribers(sb)
    if test_email:
        allowed = {test_email} if isinstance(test_email, str) else set(test_email)
        subscribers = [s for s in subscribers if s['email'] in allowed]
    log.info(f'  -> {len(subscribers):,} subscribers')

    all_symbols = set()
    for sub in subscribers:
        for h in (sub.get('holdings') or []):
            if h.get('symbol'):
                all_symbols.add(h['symbol'])

    log.info(f'[2] Fetch tin tuc cho {len(all_symbols)} symbols...')
    news_by_symbol = {}
    for symbol in all_symbols:
        news_by_symbol[symbol] = fetch_news_for_symbol(sb, symbol, since_published, since_labeled)
        count = len(news_by_symbol[symbol])
        if count:
            log.info(f'  {symbol}: {count} bai')

    log.info('[3] Gui email...')
    ok = fail = skip = 0
    from zoneinfo import ZoneInfo
    vn_now    = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh'))
    today_str = vn_now.strftime('%d/%m/%Y')
    _hour = vn_now.hour
    if 5 <= _hour < 11:
        _buoi = 'Buổi Sáng'
    elif 11 <= _hour < 13:
        _buoi = 'Buổi Trưa'
    elif 13 <= _hour < 18:
        _buoi = 'Buổi Chiều'
    else:
        _buoi = 'Buổi Tối'

    for sub in subscribers:
        email    = sub.get('email', '')
        holdings = sub.get('holdings') or []
        if not holdings:
            log.info(f'  Skip {email} (khong co holdings)')
            skip += 1
            continue
        html = build_email_html(email, holdings, news_by_symbol)
        if not html:
            log.info(f'  Skip {email} (html rong)')
            skip += 1
            continue
        success = send_email(to=email, subject=f'Wealbee · Bản Tin {_buoi} {today_str}', html=html)
        if success:
            ok += 1
        else:
            fail += 1
        import time as _time; _time.sleep(0.6)

    log.info(f'=== XONG: Gui OK={ok} | Fail={fail} | Skip={skip} ===')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--test', metavar='EMAIL', help='Gui test den 1 email cu the')
    args = parser.parse_args()
    run(test_email=args.test)
