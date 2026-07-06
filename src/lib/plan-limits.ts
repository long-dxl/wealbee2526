/**
 * Gói dịch vụ + ví Beeny (khớp backend: kg-stock-vn/core/credits.py & _shared/credits.ts).
 * Beeny = đơn vị tiền Wealbee. 1000đ = 25 Beeny → 1 Beeny = 40đ. Trừ theo phí thật mỗi lượt.
 * Ví RESET mỗi ngày (0h VN) về đúng daily quota — KHÔNG cộng dồn.
 *   free   : 2 agent · 10 Beeny/ngày
 *   pro    : 5 agent · 100 Beeny/ngày
 *   premium: 15 agent · 250 Beeny/ngày
 */
import { supabase } from "./supabase/client";

export const PLAN_LIMITS: Record<string, { agents: number; daily: number; label: string; price: string; priceYear: string }> = {
  free:    { agents: 2,  daily: 10,  label: "Free",    price: "0đ",       priceYear: "0đ" },
  pro:     { agents: 5,  daily: 100, label: "Pro",     price: "199.000đ", priceYear: "1.990.000đ" },
  premium: { agents: 15, daily: 250, label: "Premium", price: "499.000đ", priceYear: "4.990.000đ" },
};

export function normPlan(p?: string | null): string {
  const v = (p ?? "").trim().toLowerCase();
  if (v in PLAN_LIMITS) return v;
  if (["199k", "pro-199", "plus"].includes(v)) return "pro";
  if (["499k", "premium-499", "vip"].includes(v)) return "premium";
  return "free";
}

/** Hiển thị Beeny gọn: số thực 1 chữ số thập phân, bỏ .0 nếu tròn (68.5 / 100 / 3.7). */
export function fmtBeeny(n: number): string {
  const r = Math.round(Math.max(0, n) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Gói hiện tại (đã tính hết hạn trial/gói → về free nếu quá hạn). */
export async function getUserPlan(userId: string): Promise<string> {
  const { data } = await supabase.from("user_profiles").select("plan, plan_expires_at").eq("user_id", userId).limit(1);
  const row = data?.[0];
  let plan = normPlan(row?.plan);
  if (plan !== "free" && row?.plan_expires_at && Date.parse(row.plan_expires_at) < Date.now()) plan = "free";
  return plan;
}

/** Số ngày dùng thử/gói còn lại (null nếu không có hạn hoặc free). */
export async function getPlanDaysLeft(userId: string): Promise<number | null> {
  const { data } = await supabase.from("user_profiles").select("plan, plan_expires_at").eq("user_id", userId).limit(1);
  const row = data?.[0];
  if (!row?.plan_expires_at || normPlan(row.plan) === "free") return null;
  const ms = Date.parse(row.plan_expires_at) - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

/** Kiểm tra còn tạo được agent không. Trả {ok, count, limit, plan}. */
export async function canCreateAgent(userId: string): Promise<{ ok: boolean; count: number; limit: number; plan: string }> {
  const plan = await getUserPlan(userId);
  const limit = PLAN_LIMITS[plan].agents;
  const { count } = await supabase
    .from("agents").select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const n = count ?? 0;
  return { ok: n < limit, count: n, limit, plan };
}

/** Số dư Beeny hiện tại (null nếu chưa có ví — ví tự tạo ở lượt chạy đầu). */
export async function getBeenyBalance(userId: string): Promise<number | null> {
  const { data } = await supabase.from("user_credits").select("balance").eq("user_id", userId).limit(1);
  if (!data?.length) return null;
  return Number(data[0].balance);
}

/** Gói + số dư (tổng = ngày + bonus) + bonus + ngày còn lại. Gọi RPC sync_wallet → RESET ví
 *  nếu sang ngày mới + hạ gói hết hạn + dọn bonus hết hạn → số dư luôn tươi khi mở app. */
export async function getPlanAndBeeny(_userId: string): Promise<{ plan: string; label: string; balance: number | null; bonus: number; bonusExpiresAt: string | null; daysLeft: number | null }> {
  const { data, error } = await supabase.rpc("sync_wallet");
  if (!error && data) {
    const r = data as { plan: string; balance: number; bonus: number; total: number; days_left: number | null; bonus_expires_at: string | null };
    const plan = normPlan(r.plan);
    return { plan, label: PLAN_LIMITS[plan].label, balance: Number(r.total ?? r.balance), bonus: Number(r.bonus ?? 0), bonusExpiresAt: r.bonus_expires_at ?? null, daysLeft: r.days_left ?? null };
  }
  // fallback: đọc trực tiếp nếu RPC lỗi
  const [profRes, balance] = await Promise.all([
    supabase.from("user_profiles").select("plan, plan_expires_at").eq("user_id", _userId).limit(1),
    getBeenyBalance(_userId),
  ]);
  const row = profRes.data?.[0];
  let plan = normPlan(row?.plan);
  let daysLeft: number | null = null;
  if (plan !== "free" && row?.plan_expires_at) {
    const ms = Date.parse(row.plan_expires_at) - Date.now();
    if (ms < 0) plan = "free"; else daysLeft = Math.ceil(ms / 86400000);
  }
  return { plan, label: PLAN_LIMITS[plan].label, balance, bonus: 0, bonusExpiresAt: null, daysLeft };
}
