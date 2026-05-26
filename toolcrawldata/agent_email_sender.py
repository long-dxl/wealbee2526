"""
Agent Email Sender — Gửi email báo cáo agent output cho người dùng.

Truy vấn tất cả agent có tool 'email_send' được bật,
lấy brief mới nhất và gửi email định dạng Wealbee tới đúng địa chỉ người dùng.

Chạy:
    python agent_email_sender.py
    python agent_email_sender.py --test EMAIL
    python agent_email_sender.py --agent-id <uuid>   # chỉ gửi 1 agent cụ thể
"""

import sys
import os
import re
import logging
import argparse
from datetime import datetime, timezone
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))
from supabase_writer import get_client

import resend

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM     = os.getenv("EMAIL_FROM", "Wealbee <no-reply@wealbee.app>")

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "agent_email_sender.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("agent_email_sender")

# ── Template mapping ──────────────────────────────────────────────────────────

TEMPLATE_LABEL = {
    "deep_research":    "Phân tích chuyên sâu",
    "daily_digest":     "Bản tin hàng ngày",
    "portfolio_health": "Sức khoẻ danh mục",
}

TEMPLATE_COLOR = {
    "deep_research":    "#8b5cf6",
    "daily_digest":     "#0849AC",
    "portfolio_health": "#0ea5a0",
}

TOOL_LABEL = {
    "price_feed":  "Dữ liệu giá",
    "news_feed":   "Tin tức",
    "financials":  "Tài chính DN",
    "kb_search":   "Tìm kiếm KB",
    "email_send":  "Gửi email",
    "alert_send":  "Cảnh báo",
}

# ── Logo HTML ─────────────────────────────────────────────────────────────────

WEALBEE_LOGO_HTML = """
<table cellpadding="0" cellspacing="0">
  <tr>
    <td style="vertical-align:middle;padding-right:10px;">
      <img src="https://fkwsvyzguehtsjpwmttb.supabase.co/storage/v1/object/public/assets/logo-white.svg"
           width="44" height="44" alt="Wealbee" style="display:block;"/>
    </td>
    <td style="vertical-align:middle;">
      <span style="color:#ffffff;font-size:21px;font-weight:600;letter-spacing:-0.3px;
                   font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Wealbee</span>
    </td>
  </tr>
</table>"""


# ── Markdown → safe HTML ──────────────────────────────────────────────────────

def _md_to_html(text: str) -> str:
    """Chuyển markdown đơn giản → HTML email-safe."""
    if not text:
        return ""

    lines = text.split("\n")
    html_parts: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # --- markdown table ---
        if "|" in line and i + 1 < len(lines) and re.match(r"^\s*\|[\s\-\|:]+\|\s*$", lines[i + 1]):
            table_lines = [line]
            j = i + 1
            while j < len(lines) and "|" in lines[j]:
                table_lines.append(lines[j])
                j += 1

            headers = [c.strip() for c in table_lines[0].strip("|").split("|")]
            header_html = "".join(
                f'<th style="background:#0849AC;color:#fff;font-size:12px;font-weight:700;'
                f'padding:8px 10px;text-align:left;white-space:nowrap;">{h}</th>'
                for h in headers
            )
            rows_html = ""
            for ri, row in enumerate(table_lines[2:]):
                cells = [c.strip() for c in row.strip("|").split("|")]
                bg = "#f8faff" if ri % 2 == 0 else "#ffffff"
                row_cells = "".join(
                    f'<td style="padding:7px 10px;font-size:12px;color:#374151;border-bottom:1px solid #f0f2f7;">{_inline_md(c)}</td>'
                    for c in cells
                )
                rows_html += f'<tr style="background:{bg};">{row_cells}</tr>'

            html_parts.append(
                f'<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;'
                f'border-radius:8px;overflow:hidden;border:1px solid #e5e9f5;margin-bottom:12px;">'
                f'<thead><tr>{header_html}</tr></thead>'
                f'<tbody>{rows_html}</tbody></table>'
            )
            i = j
            continue

        # --- horizontal rule ---
        if re.match(r"^-{3,}$", line.strip()):
            html_parts.append('<hr style="border:none;border-top:1px solid #e5e9f5;margin:12px 0;"/>')
            i += 1
            continue

        # --- headings ---
        m = re.match(r"^(#{1,3})\s+(.*)", line)
        if m:
            level = len(m.group(1))
            text_h = _inline_md(m.group(2))
            sizes = {1: "18px", 2: "15px", 3: "13px"}
            margins = {1: "20px 0 8px", 2: "16px 0 6px", 3: "12px 0 4px"}
            html_parts.append(
                f'<p style="margin:{margins[level]};font-size:{sizes[level]};font-weight:700;'
                f'color:#1a1a2e;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;">{text_h}</p>'
            )
            i += 1
            continue

        # --- bullet list ---
        if re.match(r"^[\-\*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^[\-\*]\s+", lines[i]):
                items.append(_inline_md(re.sub(r"^[\-\*]\s+", "", lines[i])))
                i += 1
            li_html = "".join(
                f'<li style="margin-bottom:5px;color:#374151;font-size:13px;line-height:1.6;">{item}</li>'
                for item in items
            )
            html_parts.append(f'<ul style="margin:0 0 10px 0;padding-left:18px;">{li_html}</ul>')
            continue

        # --- numbered list ---
        if re.match(r"^\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i]):
                items.append(_inline_md(re.sub(r"^\d+\.\s+", "", lines[i])))
                i += 1
            li_html = "".join(
                f'<li style="margin-bottom:5px;color:#374151;font-size:13px;line-height:1.6;">{item}</li>'
                for item in items
            )
            html_parts.append(f'<ol style="margin:0 0 10px 0;padding-left:18px;">{li_html}</ol>')
            continue

        # --- paragraph ---
        stripped = line.strip()
        if stripped:
            html_parts.append(
                f'<p style="margin:0 0 8px;color:#374151;font-size:13px;line-height:1.7;">{_inline_md(stripped)}</p>'
            )
        i += 1

    return "\n".join(html_parts)


def _inline_md(text: str) -> str:
    """Bold, italic, inline code."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*",     r"<em>\1</em>",         text)
    text = re.sub(r"`(.+?)`",       r'<code style="background:#f0f2f7;padding:1px 5px;border-radius:4px;font-size:11px;">\1</code>', text)
    return text


# ── Email HTML builder ────────────────────────────────────────────────────────

def build_agent_email_html(
    user_email: str,
    agent_name: str,
    template_id: str,
    tools: list[str],
    target_symbol: str | None,
    brief_content: str,
    brief_title: str,
    run_at: str,
) -> str:
    from zoneinfo import ZoneInfo
    vn_now = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    today_str = vn_now.strftime("%d/%m/%Y")
    weekday_full = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
    weekday_display = weekday_full[vn_now.weekday()]

    template_label = TEMPLATE_LABEL.get(template_id, "Báo cáo Agent")
    header_color   = TEMPLATE_COLOR.get(template_id, "#0849AC")

    # Tools chips (hiển thị bên dưới tên agent)
    active_tools = [t for t in tools if t != "email_send"]
    tool_chips = " ".join(
        f'<span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;'
        f'font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;margin-right:4px;">'
        f'{TOOL_LABEL.get(t, t)}</span>'
        for t in active_tools
    ) if active_tools else ""

    # Target symbol badge
    sym_badge = (
        f'<span style="display:inline-block;background:rgba(255,255,255,0.25);color:#ffffff;'
        f'font-size:13px;font-weight:800;padding:3px 12px;border-radius:20px;margin-left:10px;">'
        f'{target_symbol}</span>'
    ) if target_symbol else ""

    content_html = _md_to_html(brief_content)

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>{agent_name} — Wealbee</title>
  <style>
    @media only screen and (max-width:600px){{
      .pw  {{ padding-left:12px!important; padding-right:12px!important; }}
      .card{{ padding:12px!important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#F4F5F7;
             font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#F4F5F7;padding:28px 0;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:640px;width:100%;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:{header_color};border-radius:14px 14px 0 0;padding:22px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  {WEALBEE_LOGO_HTML}
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="color:rgba(255,255,255,0.7);font-size:12px;">
                    {weekday_display}, {today_str}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── HERO BAND ── -->
        <tr>
          <td style="background:{header_color}22;padding:14px 28px;border-left:4px solid {header_color};">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:{header_color};font-size:11px;font-weight:700;
                                letter-spacing:0.8px;text-transform:uppercase;">{template_label}</span>
                  <div style="margin-top:4px;display:flex;align-items:center;flex-wrap:wrap;">
                    <span style="color:#1a1a2e;font-size:17px;font-weight:800;">{agent_name}</span>
                    {sym_badge}
                  </div>
                  {f'<div style="margin-top:6px;">{tool_chips}</div>' if tool_chips else ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── TITLE ── -->
        <tr>
          <td class="pw" style="background:#ffffff;padding:22px 28px 0;">
            <p style="margin:0 0 4px;color:#1a1a2e;font-size:18px;font-weight:800;
                      line-height:1.4;">{brief_title}</p>
            <p style="margin:0;color:#99a1af;font-size:12px;">
              Tạo lúc {run_at}
            </p>
            <div style="border-top:1px solid #ECECF0;margin-top:16px;"></div>
          </td>
        </tr>

        <!-- ── CONTENT ── -->
        <tr>
          <td class="pw" style="background:#ffffff;padding:18px 28px 24px;">
            {content_html}
          </td>
        </tr>

        <!-- ── CTA ── -->
        <tr>
          <td class="pw" style="background:#ffffff;padding:0 28px 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <a href="https://wealbee.com/app/inbox"
                     style="display:inline-block;background:{header_color};color:#ffffff;
                            font-size:13px;font-weight:700;padding:11px 22px;border-radius:10px;
                            text-decoration:none;">
                    Xem chi tiết trong Inbox →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:{header_color};border-radius:0 0 14px 14px;padding:22px 28px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;color:#ffffff;font-size:13px;font-weight:700;">Wealbee</p>
                  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:11px;">
                    Báo cáo tự động từ Agent · Không trả lời email này
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <div style="border-top:1px solid rgba(255,255,255,0.15);"></div>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <a href="https://wealbee.com/unsubscribe?email={user_email}"
                     style="color:rgba(255,255,255,0.45);font-size:11px;text-decoration:none;">
                    Huỷ đăng ký nhận email từ agent này
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


# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_agents_with_email_tool(sb, agent_id: str | None = None) -> list[dict]:
    """Lấy agents có tool 'email_send' được bật."""
    q = (
        sb.table("agents")
        .select("id, user_id, name, description, template_id, tools, system_prompt")
        .eq("status", "active")
        .contains("tools", ["email_send"])
    )
    if agent_id:
        q = q.eq("id", agent_id)
    result = q.execute()
    return result.data or []


def fetch_latest_brief(sb, agent_id: str) -> dict | None:
    """Brief mới nhất của agent."""
    result = (
        sb.table("briefs")
        .select("id, title, content, created_at, tickers")
        .eq("agent_id", agent_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    data = result.data or []
    return data[0] if data else None


def fetch_user_email(sb, user_id: str) -> str | None:
    """Lấy email người dùng từ auth.users (cần service role key)."""
    try:
        result = sb.auth.admin.get_user_by_id(user_id)
        return result.user.email if result and result.user else None
    except Exception as e:
        log.warning(f"  Không lấy được email user {user_id}: {e}")
        return None


def extract_symbol_from_prompt(system_prompt: str | None) -> str | None:
    """Đọc __TARGET_SYMBOL__ marker từ system_prompt."""
    if not system_prompt:
        return None
    first_line = (system_prompt.split("\n")[0] or "").strip()
    prefix = "__TARGET_SYMBOL__: "
    if first_line.startswith(prefix):
        return first_line[len(prefix):].strip() or None
    return None


def format_run_at(iso_str: str | None) -> str:
    if not iso_str:
        return ""
    try:
        from zoneinfo import ZoneInfo
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        vn = dt.astimezone(ZoneInfo("Asia/Ho_Chi_Minh"))
        return vn.strftime("%H:%M ngày %d/%m/%Y")
    except Exception:
        return iso_str[:16] if iso_str else ""


# ── Send ─────────────────────────────────────────────────────────────────────

def send_email(to: str, subject: str, html: str) -> bool:
    resend.api_key = RESEND_API_KEY
    try:
        result = resend.Emails.send({"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html})
        log.info(f"  Gửi → {to} | id={result.get('id', '?')}")
        return True
    except Exception as e:
        log.error(f"  Lỗi gửi {to}: {e}")
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

def run(test_email: str | None = None, only_agent_id: str | None = None):
    if not RESEND_API_KEY:
        log.error("Thiếu RESEND_API_KEY trong .env")
        return

    sb = get_client()

    log.info("=" * 55)
    log.info("  AGENT EMAIL SENDER")
    log.info("=" * 55)

    log.info("[1] Tìm agents có email_send tool...")
    agents = fetch_agents_with_email_tool(sb, only_agent_id)
    log.info(f"  → {len(agents)} agent(s)")

    if not agents:
        log.info("  Không có agent nào. Thoát.")
        return

    ok = fail = skip = 0

    for agent in agents:
        agent_id   = agent["id"]
        user_id    = agent["user_id"]
        agent_name = agent.get("name", "Agent")
        template_id = agent.get("template_id", "")
        tools       = agent.get("tools") or []

        log.info(f"  Agent: {agent_name} ({agent_id[:8]}…)")

        # Lấy email user
        email = test_email or fetch_user_email(sb, user_id)
        if not email:
            log.warning(f"    Không có email cho user {user_id}")
            skip += 1
            continue

        # Lấy brief mới nhất
        brief = fetch_latest_brief(sb, agent_id)
        if not brief:
            log.info(f"    Chưa có brief nào, bỏ qua.")
            skip += 1
            continue

        content = brief.get("content", "")
        title   = brief.get("title", agent_name)
        run_at  = format_run_at(brief.get("created_at"))

        if not content:
            log.info(f"    Brief rỗng, bỏ qua.")
            skip += 1
            continue

        symbol = extract_symbol_from_prompt(agent.get("system_prompt"))

        html = build_agent_email_html(
            user_email=email,
            agent_name=agent_name,
            template_id=template_id,
            tools=tools,
            target_symbol=symbol,
            brief_content=content,
            brief_title=title,
            run_at=run_at,
        )

        from zoneinfo import ZoneInfo
        vn_now = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
        today_str = vn_now.strftime("%d/%m/%Y")
        template_label = TEMPLATE_LABEL.get(template_id, "Báo cáo Agent")
        sym_part = f" · {symbol}" if symbol else ""
        subject = f"Wealbee · {template_label}{sym_part} · {today_str}"

        success = send_email(email, subject, html)
        if success:
            ok += 1
        else:
            fail += 1

        import time as _t
        _t.sleep(0.5)

    log.info("=" * 55)
    log.info(f"  XONG: Gửi OK={ok} | Fail={fail} | Skip={skip}")
    log.info("=" * 55)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test",     metavar="EMAIL",   help="Override email đích (test)")
    parser.add_argument("--agent-id", metavar="UUID",    help="Chỉ gửi cho 1 agent cụ thể")
    args = parser.parse_args()
    run(test_email=args.test, only_agent_id=args.agent_id)
