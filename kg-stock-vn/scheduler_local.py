"""scheduler_local.py — Chạy agent TỰ ĐỘNG ngay trên máy (test) qua bộ não Wealbee.

Đọc agents (status=active) từ Supabase Wealbee, theo `trigger_type`:
  - manual    → bỏ qua (chỉ chạy khi người dùng bấm).
  - scheduled → chạy khi tới giờ (schedule = "daily:HH:MM").
  - event     → kiểm tra điều kiện (trigger_config) trên dữ liệu; đúng → chạy.
Khi chạy: dựng nhiệm vụ từ prompt agent + mã + ngữ cảnh sự kiện → serve.build_report → lưu `briefs`.

Chạy:
  python scheduler_local.py --once     # kiểm 1 lần rồi thoát (để test)
  python scheduler_local.py            # vòng lặp (mặc định mỗi 10 phút)
  python scheduler_local.py --once --agent <id>   # ép chạy 1 agent (bỏ qua điều kiện)

Khi deploy VPS: chạy cùng file này (hoặc systemd/cron) cạnh API.
"""
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import argparse
from datetime import datetime, date, timedelta, timezone

import serve
from core import wealbee_retriever as wb

SB = wb._wb()
VN = timezone(timedelta(hours=7))


# ── Đánh giá điều kiện EVENT ───────────────────────────────────────────────────

def _avg20_volume(sym: str):
    rows = (SB.table("prices_daily").select("date,volume")
            .eq("symbol", sym).order("date", desc=True).limit(21).execute().data) or []
    if len(rows) < 6:
        return None, None
    latest = rows[0]
    prior = rows[1:21]
    avg = sum((r.get("volume") or 0) for r in prior) / max(1, len(prior))
    return latest, avg


def event_fires(agent: dict):
    """Trả (fired, context_text, symbols). Hỗ trợ insider_buy / volume_spike / high_impact_news."""
    cfg = agent.get("trigger_config") or {}
    etype = cfg.get("event_type")
    syms = [s.upper() for s in (cfg.get("symbols") or agent.get("target_symbols") or [])]

    if etype == "insider_buy":
        since = (date.today() - timedelta(days=int(cfg.get("days", 7)))).isoformat()
        q = (SB.table("insider_transactions")
             .select("symbol,trade_date,insider_name,position,volume,price,total_value")
             .eq("trade_type", "buy").gte("trade_date", since))
        if syms:
            q = q.in_("symbol", syms)
        rows = q.order("trade_date", desc=True).limit(20).execute().data or []
        if rows:
            ctx = "Giao dịch MUA của nội bộ/lãnh đạo gần đây:\n" + "\n".join(
                f"- {r['symbol']} {r['trade_date']}: {r.get('insider_name')} "
                f"({r.get('position')}) mua {(r.get('volume') or 0):,} cp" for r in rows[:10])
            return True, ctx, sorted({r["symbol"] for r in rows})

    if etype == "volume_spike":
        k = float(cfg.get("multiple", 2.0))
        fired, lines = [], []
        for sym in syms:
            latest, avg = _avg20_volume(sym)
            v = latest.get("volume") if latest else None
            if v and avg and v > k * avg:
                fired.append(sym)
                lines.append(f"- {sym} phiên {latest['date']}: KL {v:,} > {k}× TB20 ({avg:,.0f})")
        if fired:
            return True, "Khối lượng giao dịch đột biến so với TB20 phiên:\n" + "\n".join(lines), fired

    if etype == "high_impact_news":
        thr = float(cfg.get("min_impact", 5.0))
        since = (datetime.now(timezone.utc) - timedelta(hours=int(cfg.get("hours", 24)))).isoformat()
        rows = (SB.table("market_news")
                .select("title,impact_score,affected_symbols,source,published_at")
                .not_.is_("label", "null").neq("label", "trash")
                .gte("published_at", since).gte("impact_score", thr)
                .order("impact_score", desc=True).limit(15).execute().data) or []
        if syms:
            rows = [r for r in rows if any(s in syms for s in (r.get("affected_symbols") or []))]
        if rows:
            ctx = "Tin tác động mạnh gần đây:\n" + "\n".join(
                f"- [{r.get('impact_score')}] {r['title']} ({r.get('source')})" for r in rows[:8])
            out_syms = sorted({s for r in rows for s in (r.get("affected_symbols") or [])})[:5]
            return True, ctx, out_syms

    return False, "", []


def _due_scheduled(agent: dict) -> bool:
    sch = agent.get("schedule") or ""
    if not sch.startswith("daily:"):
        return False
    hhmm = sch.split(":", 1)[1]
    now = datetime.now(VN).strftime("%H:%M")
    return now == hhmm  # trùng phút (loop mỗi phút) — đơn giản cho local test


def _recent_brief(agent_id: str, hours: int) -> bool:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    r = (SB.table("briefs").select("id").eq("agent_id", agent_id)
         .gte("created_at", since).limit(1).execute().data)
    return bool(r)


# ── Chạy agent qua brain → lưu brief ───────────────────────────────────────────

def run_agent(agent: dict, event_ctx: str = "", event_syms=None) -> str:
    # ĐỒNG BỘ: dùng chung serve.run_agent_core với "Chạy thử" & "Run now"
    syms = event_syms or agent.get("target_symbols") or []
    r = serve.run_agent_core(
        system_prompt=agent.get("system_prompt"), symbols=syms, event_ctx=event_ctx,
        save_brief=True, agent_id=agent["id"], user_id=agent["user_id"],
        name=agent.get("name"), template_id=agent.get("template_id"),
        email_notify=bool(agent.get("email_notify")))
    return r["title"]


def check_once(force_agent: str | None = None):
    rows = (SB.table("agents")
            .select("id,user_id,name,template_id,system_prompt,target_symbols,"
                    "trigger_type,trigger_config,schedule,status,email_notify")
            .eq("status", "active").execute().data) or []
    ran = 0
    for a in rows:
        if force_agent:
            if a["id"] == force_agent:
                print(f"[FORCE] {a['name']} → {run_agent(a)}")
                ran += 1
            continue
        tt = a.get("trigger_type") or "manual"
        if tt == "event":
            if _recent_brief(a["id"], int((a.get("trigger_config") or {}).get("cooldown_hours", 12))):
                continue  # tránh lặp cùng sự kiện
            fired, ctx, syms = event_fires(a)
            if fired:
                print(f"[EVENT] {a['name']} kích hoạt → {run_agent(a, ctx, syms)}")
                ran += 1
        elif tt == "scheduled":
            if _due_scheduled(a) and not _recent_brief(a["id"], 12):
                print(f"[SCHED] {a['name']} tới giờ → {run_agent(a)}")
                ran += 1
    print(f"Kiểm tra {len(rows)} agent · chạy {ran}.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="kiểm 1 lần rồi thoát")
    ap.add_argument("--agent", default=None, help="ép chạy 1 agent theo id (bỏ qua điều kiện)")
    ap.add_argument("--interval", type=int, default=10, help="phút giữa các lần kiểm (loop mode)")
    args = ap.parse_args()

    if args.once or args.agent:
        check_once(force_agent=args.agent)
        return

    from apscheduler.schedulers.blocking import BlockingScheduler
    sch = BlockingScheduler(timezone="Asia/Ho_Chi_Minh")
    sch.add_job(check_once, "interval", minutes=args.interval, next_run_time=datetime.now(VN))
    print(f"Scheduler chạy mỗi {args.interval} phút (Ctrl+C để dừng)...")
    try:
        sch.start()
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
