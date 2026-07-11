// _shared/credits.ts — Ví Beeny (Deno/Edge), NHẤT QUÁN với kg-stock-vn/core/credits.py.
// Beeny = đơn vị tiền của Wealbee. Quy đổi: 1000đ = 25 Beeny  →  1 Beeny = 40đ.
// Mỗi lượt gọi AI trả về token thật → tính phí USD → ×26.000 = VND → ÷40 = Beeny (SỐ THỰC,
// trừ theo phí thật, KHÔNG làm tròn lên số nguyên). Refill LAZY theo ngày VN, chặn ở trần.

// deno-lint-ignore-file no-explicit-any

export const VND_PER_BEENY = 40;   // 1000đ = 25 Beeny
const USD_VND = 26000;
// Bảng giá gpt-4.1-mini (USD / token)
const PRICE_IN = 0.40 / 1e6;    // input (chưa cache)
const PRICE_CACHED = 0.10 / 1e6; // input ĐÃ CACHE = 25% giá (OpenAI prompt caching)
const PRICE_OUT = 1.60 / 1e6;   // output

// Model RESET mỗi ngày: balance về đúng `daily` (không cộng dồn/cap).
export const PLANS: Record<string, { agents: number; daily: number }> = {
  free:    { agents: 2,  daily: 10 },
  pro:     { agents: 5,  daily: 100 },
  premium: { agents: 15, daily: 250 },
};

export function normPlan(p?: string | null): string {
  const v = (p ?? "").trim().toLowerCase();
  if (v in PLANS) return v;
  if (["199k", "pro-199", "plus"].includes(v)) return "pro";
  if (["499k", "premium-499", "vip"].includes(v)) return "premium";
  return "free";
}

/** Phí VND. cachedIn = số token input được OpenAI phục vụ từ cache (tính 10% giá). */
export function costVnd(tokensIn: number, tokensOut: number, cachedIn = 0): number {
  const fresh = Math.max(0, tokensIn - cachedIn);
  return (fresh * PRICE_IN + cachedIn * PRICE_CACHED + tokensOut * PRICE_OUT) * USD_VND;
}

/** Phí 1 lượt tính bằng Beeny — SỐ THỰC (làm tròn 4 chữ số thập phân, không ceil). */
export function beenyFor(tokensIn: number, tokensOut: number, cachedIn = 0): number {
  if (tokensIn <= 0 && tokensOut <= 0) return 0;
  return Math.round((costVnd(tokensIn, tokensOut, cachedIn) / VND_PER_BEENY) * 10000) / 10000;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function log(sb: any, userId: string, delta: number, balanceAfter: number, kind: string,
                   tokensIn?: number, tokensOut?: number, cost?: number, note = "") {
  try {
    await sb.from("credit_transactions").insert({
      user_id: userId, delta, balance_after: balanceAfter, kind,
      tokens_in: tokensIn ?? null, tokens_out: tokensOut ?? null,
      cost_vnd: cost ?? null, note: note.slice(0, 200),
    });
  } catch (_e) { /* log lỗi không chặn luồng chính */ }
}

function isExpired(iso?: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < Date.now();
}

/** Lấy ví: reset ngày + dọn bonus hết hạn. Trả balance (ngày) + bonus (đang hiệu lực). */
export async function getWallet(sb: any, userId: string): Promise<{ plan: string; balance: number; bonus: number }> {
  let plan = "free";
  try {
    const { data: pr } = await sb.from("user_profiles").select("plan, plan_expires_at").eq("user_id", userId).limit(1);
    if (pr?.length) {
      plan = normPlan(pr[0].plan);
      if (plan !== "free" && isExpired(pr[0].plan_expires_at)) {
        plan = "free";
        try { await sb.from("user_profiles").update({ plan: "free", plan_expires_at: null }).eq("user_id", userId); } catch (_e) { /* */ }
      }
    }
  } catch (_e) { /* mặc định free */ }
  const cfg = PLANS[plan];
  const today = todayVN();

  const { data: rows } = await sb.from("user_credits").select("*").eq("user_id", userId).limit(1);
  if (!rows?.length) {
    await sb.from("user_credits").insert({ user_id: userId, plan, balance: cfg.daily, last_refill_date: today });
    await log(sb, userId, cfg.daily, cfg.daily, "signup", undefined, undefined, undefined, `tạo ví (${plan})`);
    return { plan, balance: cfg.daily, bonus: 0 };
  }
  const w = rows[0];
  let balance = Number(w.balance);
  if (w.last_refill_date !== today) {
    balance = cfg.daily;  // sang ngày mới → RESET về daily quota
    await sb.from("user_credits").update({ balance, last_refill_date: today, plan, updated_at: new Date().toISOString() }).eq("user_id", userId);
    await log(sb, userId, balance - Number(w.balance), balance, "refill", undefined, undefined, undefined, `reset ngày (${plan})`);
  }
  // Bonus (Beeny mua thêm) — dọn nếu hết hạn 24h
  let bonus = Number(w.bonus_balance ?? 0);
  if (w.bonus_expires_at && isExpired(w.bonus_expires_at)) {
    bonus = 0;
    try { await sb.from("user_credits").update({ bonus_balance: 0, bonus_expires_at: null }).eq("user_id", userId); } catch (_e) { /* */ }
  }
  return { plan, balance, bonus };
}

/** Còn Beeny để chạy? (tổng = balance ngày + bonus). Lỗi hạ tầng → không chặn. */
export async function hasCredits(sb: any, userId: string): Promise<{ ok: boolean; balance: number }> {
  try {
    const w = await getWallet(sb, userId);
    const total = w.balance + w.bonus;
    return { ok: total > 0, balance: total };
  } catch (_e) {
    return { ok: true, balance: -1 };
  }
}

/**
 * Trừ Beeny theo phí thật SAU khi chạy. Tiêu BONUS trước (hết hạn 24h), rồi balance ngày.
 * @param costVndOverride nếu có → dùng giá này thay vì tính lại từ giá gpt-4.1-mini.
 *   Dùng khi model đắt hơn (gpt-4o / claude-sonnet / claude-opus) — tính qua costVndForModel().
 */
export async function deduct(sb: any, userId: string, tokensIn: number, tokensOut: number,
                             note = "", cachedIn = 0, costVndOverride?: number): Promise<{ credits_used: number; balance: number | null }> {
  const vnd = costVndOverride ?? costVnd(tokensIn, tokensOut, cachedIn);
  const VND_PER_BEENY_LOCAL = 40;
  const n = costVndOverride != null
    ? Math.round((vnd / VND_PER_BEENY_LOCAL) * 10000) / 10000
    : beenyFor(tokensIn, tokensOut, cachedIn);
  if (n <= 0) return { credits_used: 0, balance: null };
  try {
    const w = await getWallet(sb, userId);
    const fromBonus = Math.min(n, w.bonus);
    const newBonus = Math.round((w.bonus - fromBonus) * 10000) / 10000;
    const newBal = Math.round((w.balance - (n - fromBonus)) * 10000) / 10000;
    await sb.from("user_credits").update({
      balance: newBal, bonus_balance: newBonus, updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    await log(sb, userId, -n, newBal + newBonus, "deduct", tokensIn, tokensOut,
              Math.round(vnd * 100) / 100, note);
    return { credits_used: n, balance: newBal + newBonus };  // tổng còn lại
  } catch (_e) {
    return { credits_used: n, balance: null };
  }
}
