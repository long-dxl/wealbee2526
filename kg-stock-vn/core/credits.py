"""core/credits.py — Ví credit: trừ theo TOKEN THẬT mỗi lượt gọi AI.

Kinh tế: 1 credit = 40đ giá trị API (gpt-5-mini). Gói 199k → user nhận 3.000cr
(=120k giá trị API) → biên lợi nhuận 40%. Trừ credit = ceil(chi_phí_VND / 40), tối thiểu 1.

Refill kiểu LAZY: lần chạm ví ĐẦU TIÊN mỗi ngày (giờ VN) tự cộng refill của gói,
chặn ở trần balance — không cần cron, chạy được cho cả agent theo lịch.

Ghi ví CHỈ bằng service role (brain). plan đọc từ user_profiles.plan (đồng bộ khi refill).
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

VN_TZ = timezone(timedelta(hours=7))

# ── Kinh tế: Beeny = đơn vị tiền Wealbee. 1000đ = 25 Beeny → 1 Beeny = 40đ ───────
VND_PER_BEENY = 40.0
USD_VND = 26000.0
# Giá gpt-5-mini (USD / 1 token)
PRICE_IN = 0.25 / 1e6
PRICE_CACHED = 0.025 / 1e6   # input đã cache = 10% giá
PRICE_OUT = 2.00 / 1e6

# Gói: agent tối đa · refill/ngày · trần balance
PLANS = {
    "free":    {"agents": 2,  "refill": 10,  "cap": 20},
    "pro":     {"agents": 5,  "refill": 100, "cap": 150},
    "premium": {"agents": 15, "refill": 250, "cap": 500},
}


def norm_plan(p) -> str:
    p = (p or "").strip().lower()
    if p in PLANS:
        return p
    if p in ("199k", "pro-199", "plus"):
        return "pro"
    if p in ("499k", "premium-499", "vip"):
        return "premium"
    return "free"


def cost_vnd(tokens_in: int, tokens_out: int, cached_in: int = 0) -> float:
    fresh = max(0, tokens_in - cached_in)
    return (fresh * PRICE_IN + cached_in * PRICE_CACHED + tokens_out * PRICE_OUT) * USD_VND


def beeny_for(tokens_in: int, tokens_out: int, cached_in: int = 0) -> float:
    """Phí 1 lượt bằng Beeny — SỐ THỰC (làm tròn 4 chữ số, không làm tròn lên)."""
    if tokens_in <= 0 and tokens_out <= 0:
        return 0.0
    return round(cost_vnd(tokens_in, tokens_out, cached_in) / VND_PER_BEENY, 4)


def _today_vn():
    return datetime.now(VN_TZ).date().isoformat()


def get_wallet(sb, user_id: str) -> dict:
    """Lấy ví + LAZY refill (tạo mới nếu chưa có, tặng đầy trần khi đăng ký)."""
    plan = "free"
    try:
        pr = (sb.table("user_profiles").select("plan").eq("user_id", user_id)
              .limit(1).execute().data)
        if pr:
            plan = norm_plan(pr[0].get("plan"))
    except Exception:
        pass
    cfg = PLANS[plan]
    today = _today_vn()

    row = (sb.table("user_credits").select("*").eq("user_id", user_id)
           .limit(1).execute().data)
    if not row:
        w = {"user_id": user_id, "plan": plan, "balance": cfg["cap"],
             "last_refill_date": today}
        sb.table("user_credits").insert(w).execute()
        _log(sb, user_id, cfg["cap"], cfg["cap"], "signup", note=f"tặng khi tạo ví ({plan})")
        return w

    w = row[0]
    w["plan"] = plan  # plan từ profiles là nguồn chân lý
    if w.get("last_refill_date") != today:
        new_bal = min(float(w["balance"]) + cfg["refill"], float(cfg["cap"]))
        # user đã tích trên trần (vd vừa nâng cấp/tặng thêm) thì không tịch thu
        new_bal = max(new_bal, min(float(w["balance"]), float(cfg["cap"])))
        delta = new_bal - float(w["balance"])
        sb.table("user_credits").update({
            "balance": new_bal, "last_refill_date": today, "plan": plan,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
        if delta > 0:
            _log(sb, user_id, delta, new_bal, "refill", note=f"refill ngày ({plan})")
        w["balance"] = new_bal
        w["last_refill_date"] = today
    return w


def has_credits(sb, user_id: str) -> tuple[bool, float]:
    """(còn Beeny để chạy?, balance hiện tại) — gọi TRƯỚC khi chạy."""
    try:
        w = get_wallet(sb, user_id)
        return float(w["balance"]) > 0, float(w["balance"])
    except Exception:
        return True, -1  # lỗi hạ tầng ví → không chặn người dùng


def deduct(sb, user_id: str, tokens_in: int, tokens_out: int, note: str = "", cached_in: int = 0) -> dict:
    """Trừ Beeny theo phí thật SAU khi chạy xong. Cho phép âm nhẹ (lượt đang chạy dở).
    cached_in = token input phục vụ từ cache (tính 10% giá)."""
    n = beeny_for(tokens_in, tokens_out, cached_in)
    if n <= 0:
        return {"credits_used": 0, "balance": None}
    try:
        w = get_wallet(sb, user_id)
        new_bal = round(float(w["balance"]) - n, 4)
        sb.table("user_credits").update({
            "balance": new_bal,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
        _log(sb, user_id, -n, new_bal, "deduct", tokens_in, tokens_out,
             round(cost_vnd(tokens_in, tokens_out, cached_in), 2), note)
        return {"credits_used": n, "balance": new_bal}
    except Exception as e:
        print(f"    [!] trừ Beeny lỗi: {str(e)[:120]}")
        return {"credits_used": n, "balance": None}


def _log(sb, user_id, delta, balance_after, kind,
         tokens_in=None, tokens_out=None, cost=None, note=""):
    try:
        sb.table("credit_transactions").insert({
            "user_id": user_id, "delta": delta, "balance_after": balance_after,
            "kind": kind, "tokens_in": tokens_in, "tokens_out": tokens_out,
            "cost_vnd": cost, "note": note[:200],
        }).execute()
    except Exception as e:
        print(f"    [!] log credit lỗi: {str(e)[:120]}")
