// _shared/credits.ts — Ví credit (Deno/Edge), NHẤT QUÁN với kg-stock-vn/core/credits.py.
// 1 credit = 40đ giá trị API (gpt-5-mini). Trừ theo token thật, tối thiểu 1 credit/lượt.
// Refill LAZY: lần chạm ví đầu tiên mỗi ngày (giờ VN) cộng refill của gói, chặn ở trần.

// deno-lint-ignore-file no-explicit-any

export const VND_PER_CREDIT = 40;
const USD_VND = 26000;
const PRICE_IN = 0.25 / 1e6;   // gpt-5-mini USD/token input
const PRICE_OUT = 2.00 / 1e6;  // gpt-5-mini USD/token output

export const PLANS: Record<string, { agents: number; refill: number; cap: number }> = {
  free:    { agents: 2,  refill: 10,  cap: 20 },
  pro:     { agents: 5,  refill: 100, cap: 150 },
  premium: { agents: 15, refill: 250, cap: 500 },
};

export function normPlan(p?: string | null): string {
  const v = (p ?? "").trim().toLowerCase();
  if (v in PLANS) return v;
  if (["199k", "pro-199", "plus"].includes(v)) return "pro";
  if (["499k", "premium-499", "vip"].includes(v)) return "premium";
  return "free";
}

export function costVnd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * PRICE_IN + tokensOut * PRICE_OUT) * USD_VND;
}

export function creditsFor(tokensIn: number, tokensOut: number): number {
  if (tokensIn <= 0 && tokensOut <= 0) return 0;
  return Math.max(1, Math.ceil(costVnd(tokensIn, tokensOut) / VND_PER_CREDIT));
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

/** Lấy ví + lazy refill (tạo mới = tặng đầy trần). */
export async function getWallet(sb: any, userId: string): Promise<{ plan: string; balance: number }> {
  let plan = "free";
  try {
    const { data: pr } = await sb.from("user_profiles").select("plan").eq("user_id", userId).limit(1);
    if (pr?.length) plan = normPlan(pr[0].plan);
  } catch (_e) { /* mặc định free */ }
  const cfg = PLANS[plan];
  const today = todayVN();

  const { data: rows } = await sb.from("user_credits").select("*").eq("user_id", userId).limit(1);
  if (!rows?.length) {
    await sb.from("user_credits").insert({ user_id: userId, plan, balance: cfg.cap, last_refill_date: today });
    await log(sb, userId, cfg.cap, cfg.cap, "signup", undefined, undefined, undefined, `tặng khi tạo ví (${plan})`);
    return { plan, balance: cfg.cap };
  }
  const w = rows[0];
  let balance = Number(w.balance);
  if (w.last_refill_date !== today) {
    let newBal = Math.min(balance + cfg.refill, cfg.cap);
    newBal = Math.max(newBal, Math.min(balance, cfg.cap)); // không tịch thu phần tích trên trần
    const delta = newBal - balance;
    await sb.from("user_credits").update({
      balance: newBal, last_refill_date: today, plan, updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (delta > 0) await log(sb, userId, delta, newBal, "refill", undefined, undefined, undefined, `refill ngày (${plan})`);
    balance = newBal;
  }
  return { plan, balance };
}

/** Đủ chạy ≥1 lượt? (gọi TRƯỚC khi chạy). Lỗi hạ tầng ví → không chặn. */
export async function hasCredits(sb: any, userId: string): Promise<{ ok: boolean; balance: number }> {
  try {
    const w = await getWallet(sb, userId);
    return { ok: w.balance >= 1, balance: w.balance };
  } catch (_e) {
    return { ok: true, balance: -1 };
  }
}

/** Trừ theo token thật SAU khi chạy (cho phép âm nhẹ với lượt đang dở). */
export async function deduct(sb: any, userId: string, tokensIn: number, tokensOut: number,
                             note = ""): Promise<{ credits_used: number; balance: number | null }> {
  const n = creditsFor(tokensIn, tokensOut);
  if (n <= 0) return { credits_used: 0, balance: null };
  try {
    const w = await getWallet(sb, userId);
    const newBal = w.balance - n;
    await sb.from("user_credits").update({
      balance: newBal, updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    await log(sb, userId, -n, newBal, "deduct", tokensIn, tokensOut,
              Math.round(costVnd(tokensIn, tokensOut) * 100) / 100, note);
    return { credits_used: n, balance: newBal };
  } catch (_e) {
    return { credits_used: n, balance: null };
  }
}
