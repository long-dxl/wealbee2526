"""core/email_sender.py — Gửi brief agent qua email (Resend).

CHỈ gửi khi agent bật `email_notify=true`. Mặc định agent KHÔNG gửi email —
người dùng tự bật + tự đặt lịch chạy (trigger_type=scheduled, daily:HH:MM).

Cần env (đặt trong kg-stock-vn/.env trên VPS): RESEND_API_KEY, EMAIL_FROM.
Không thêm dependency — dùng urllib (stdlib).
"""
from __future__ import annotations

import os
import re
import json
import html as _html
import urllib.request

RESEND_URL = "https://api.resend.com/emails"
BRAND = "#0849ac"
SF = "font-family:Helvetica,Arial,sans-serif;"


def _esc(s) -> str:
    return _html.escape(str(s if s is not None else ""))


def _reflink(m, refs) -> str:
    n = int(m.group(1))
    e = next((r for r in (refs or []) if r.get("index") == n), None)
    if not e:
        return ""
    return (f'<a href="{_esc(e.get("url"))}" style="color:{BRAND};text-decoration:none;'
            f'font-weight:600;font-size:11px;background:#EBF0FA;padding:1px 6px;border-radius:3px;'
            f'margin-left:3px;">{_esc(e.get("label"))} ↗</a>')


def _inline(s: str, refs) -> str:
    s = _esc(s)  # escape trước; *,[,],(,) sống sót → markdown regex vẫn chạy
    s = re.sub(r"\*\*([^*]+)\*\*", r'<strong style="color:#1a1a2e;">\1</strong>', s)
    s = re.sub(r"\[ref:(\d+)\]", lambda m: _reflink(m, refs), s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
               lambda m: f'<a href="{m.group(2)}" style="color:{BRAND};text-decoration:none;">{m.group(1)}</a>', s)
    return s


def _cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def _table(tbl: list[str], refs) -> str:
    data = [l for l in tbl if re.sub(r"[\s|:\-]", "", l)]  # bỏ hàng phân cách
    if not data:
        return ""
    head, *body = data
    h = "".join(f'<th style="background:{BRAND};color:#fff;padding:8px 12px;text-align:left;'
                f'font-weight:700;{SF}">{_inline(c, refs)}</th>' for c in _cells(head))
    b = ""
    for ri, row in enumerate(body):
        bg = "#ffffff" if ri % 2 == 0 else "#f7f9fd"
        b += (f'<tr style="background:{bg};">' + "".join(
            f'<td style="padding:7px 12px;border-bottom:1px solid #e5e9f5;color:#374151;{SF}">'
            f'{_inline(c, refs)}</td>' for c in _cells(row)) + "</tr>")
    return (f'<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;'
            f'margin:12px 0;font-size:13px;border:1px solid #dde6f5;"><tr>{h}</tr>{b}</table>')


def _md_to_html(md: str, refs) -> str:
    lines = (md or "").split("\n")
    out, i = [], 0
    while i < len(lines):
        t = lines[i].strip()
        if not t:
            i += 1
            continue
        if t.startswith("|") and t.endswith("|"):
            tbl = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                tbl.append(lines[i].strip())
                i += 1
            out.append(_table(tbl, refs))
            continue
        mh = re.match(r"^(#{1,4})\s+(.*)$", t)
        if mh:
            sz = {1: 20, 2: 17, 3: 15, 4: 14}.get(len(mh.group(1)), 14)
            out.append(f'<div style="font-size:{sz}px;font-weight:700;color:#1a1a2e;'
                       f'margin:16px 0 6px;{SF}">{_inline(mh.group(2), refs)}</div>')
            i += 1
            continue
        if re.match(r"^[-*•]\s+", t):
            items = []
            while i < len(lines) and re.match(r"^[-*•]\s+", lines[i].strip()):
                items.append(re.sub(r"^[-*•]\s+", "", lines[i].strip()))
                i += 1
            out.append('<ul style="margin:6px 0;padding-left:20px;color:#374151;">' +
                       "".join(f'<li style="margin:3px 0;line-height:1.55;">{_inline(x, refs)}</li>'
                               for x in items) + "</ul>")
            continue
        out.append(f'<p style="margin:6px 0;line-height:1.6;color:#374151;{SF}">{_inline(t, refs)}</p>')
        i += 1
    return "".join(out)


def _shell(title: str, inner: str) -> str:
    return (f'<!doctype html><html lang="vi"><body style="margin:0;background:#f4f5f7;padding:24px;{SF}">'
            f'<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;'
            f'box-shadow:0 6px 24px rgba(0,0,0,.06);">'
            f'<div style="background:{BRAND};padding:20px 26px;color:#fff;font-weight:700;font-size:17px;">Wealbee</div>'
            f'<div style="padding:22px 26px;">'
            f'<div style="font-size:19px;font-weight:800;color:#1a1a2e;margin-bottom:14px;">{_esc(title)}</div>'
            f'{inner}</div>'
            f'<div style="padding:14px 26px;border-top:1px solid #eee;color:#98a2b3;font-size:11px;">'
            f'Bản tin tự động từ agent Wealbee của bạn · '
            f'<a href="https://wealbee.com/app/inbox" style="color:{BRAND};">Xem trong Inbox</a></div>'
            f'</div></body></html>')


def send_brief_email(to_email: str, agent_name: str, title: str,
                     markdown: str, sources=None) -> bool:
    """Gửi 1 brief qua Resend. Trả True nếu gửi thành công."""
    key = os.environ.get("RESEND_API_KEY", "").strip()
    frm = os.environ.get("EMAIL_FROM", "Wealbee <no-reply@wealbee.com>")
    if not key or not to_email:
        return False
    html = _shell(title, _md_to_html(markdown, sources or []))
    payload = json.dumps({
        "from": frm, "to": [to_email],
        "subject": f"[{agent_name}] {title[:80]}",
        "html": html,
    }).encode("utf-8")
    req = urllib.request.Request(
        RESEND_URL, data=payload, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 # Cloudflare trước api.resend.com CHẶN User-Agent mặc định của urllib
                 # (Python-urllib) → lỗi 1010. Đặt UA riêng để qua.
                 "User-Agent": "Wealbee/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"    [!] gửi email lỗi: {str(e)[:140]}")
        return False


def get_user_email(sb, user_id: str):
    """(email, full_name) của user từ user_profiles; (None, None) nếu không có."""
    try:
        r = (sb.table("user_profiles").select("email,full_name")
             .eq("user_id", user_id).limit(1).execute().data)
        if r:
            return r[0].get("email"), r[0].get("full_name")
    except Exception:
        pass
    return None, None
