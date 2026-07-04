/**
 * Gói dịch vụ + ví Beeny (khớp backend: kg-stock-vn/core/credits.py & _shared/credits.ts).
 * Beeny = đơn vị tiền Wealbee. 1000đ = 25 Beeny → 1 Beeny = 40đ. Balance là SỐ THỰC,
 * trừ theo phí thật mỗi lượt gọi AI. Refill mỗi ngày (giờ VN), chặn ở trần.
 *   free    : 2 agent · 10 Beeny/ngày  (trần 20)
 *   pro 199k: 5 agent · 100 Beeny/ngày (trần 150)
 *   premium : 15 agent · 250 Beeny/ngày (trần 500)
 */
import { supabase } from "./supabase/client";

export const PLAN_LIMITS: Record<string, { agents: number; refill: number; cap: number; label: string; price: string }> = {
  free:    { agents: 2,  refill: 10,  cap: 20,  label: "Free",    price: "0đ" },
  pro:     { agents: 5,  refill: 100, cap: 150, label: "Pro",     price: "199.000đ" },
  premium: { agents: 15, refill: 250, cap: 500, label: "Premium", price: "499.000đ" },
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

/** Gói hiện tại của user (từ user_profiles.plan). */
export async function getUserPlan(userId: string): Promise<string> {
  const { data } = await supabase.from("user_profiles").select("plan").eq("user_id", userId).limit(1);
  return normPlan(data?.[0]?.plan);
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

/** Gói + số dư Beeny cùng lúc (cho thanh sidebar). */
export async function getPlanAndBeeny(userId: string): Promise<{ plan: string; label: string; balance: number | null }> {
  const [plan, balance] = await Promise.all([getUserPlan(userId), getBeenyBalance(userId)]);
  return { plan, label: PLAN_LIMITS[plan].label, balance };
}
