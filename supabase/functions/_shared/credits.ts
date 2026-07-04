// _shared/credits.ts — Ví Beeny (Deno/Edge), NHẤT QUÁN với kg-stock-vn/core/credits.py.
// Beeny = đơn vị tiền của Wealbee. Quy đổi: 1000đ = 25 Beeny  →  1 Beeny = 40đ.
// Mỗi lượt gọi AI trả về token thật → tính phí USD → ×26.000 = VND → ÷40 = Beeny (SỐ THỰC,
// trừ theo phí thật, KHÔNG làm tròn lên số nguyên). Refill LAZY theo ngày VN, chặn ở trần.

// deno-lint-ignore-file no-explicit-any

export const VND_PER_BEENY = 40;   // 1000đ = 25 Beeny
const USD_VND = 26000;
const PRICE_IN = 0.25 / 1e6;    // gpt-5-mini USD/token input (chưa cache)
const PRICE_CACHED = 0.025 / 1e6; // input ĐÃ CACHE = 10% giá (OpenAI prompt caching)
const PRICE_OUT = 2.00 / 1e6;   // gpt-5-mini USD/token output

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

/** Còn Beeny để chạy? (gọi TRƯỚC khi chạy). Lỗi hạ tầng ví → không chặn. */
export async function hasCredits(sb: any, userId: string): Promise<{ ok: boolean; balance: number }> {
  try {
    const w = await getWallet(sb, userId);
    return { ok: w.balance > 0, balance: w.balance };
  } catch (_e) {
    return { ok: true, balance: -1 };
  }
}

/** Trừ Beeny theo phí thật SAU khi chạy (cho phép âm nhẹ với lượt đang dở).
 *  cachedIn = token input phục vụ từ cache (tính 10% giá). */
export async function deduct(sb: any, userId: string, tokensIn: number, tokensOut: number,
                             note = "", cachedIn = 0): Promise<{ credits_used: number; balance: number | null }> {
  const n = beenyFor(tokensIn, tokensOut, cachedIn);
  if (n <= 0) return { credits_used: 0, balance: null };
  try {
    const w = await getWallet(sb, userId);
    const newBal = Math.round((w.balance - n) * 10000) / 10000;
    await sb.from("user_credits").update({
      balance: newBal, updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    await log(sb, userId, -n, newBal, "deduct", tokensIn, tokensOut,
              Math.round(costVnd(tokensIn, tokensOut, cachedIn) * 100) / 100, note);
    return { credits_used: n, balance: newBal };
  } catch (_e) {
    return { credits_used: n, balance: null };
  }
}
