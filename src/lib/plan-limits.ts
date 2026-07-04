/**
 * Giới hạn gói + ví credit (khớp backend: kg-stock-vn/core/credits.py & _shared/credits.ts).
 * 1 credit = 40đ giá trị API. free: 2 agent, 10cr/ngày (trần 20) · pro 199k: 5 agent,
 * 100cr/ngày (trần 150) · premium 499k: 15 agent, 250cr/ngày (trần 500).
 */
import { supabase } from "./supabase/client";

export const PLAN_LIMITS: Record<string, { agents: number; refill: number; cap: number; label: string }> = {
  free:    { agents: 2,  refill: 10,  cap: 20,  label: "Free" },
  pro:     { agents: 5,  refill: 100, cap: 150, label: "Pro" },
  premium: { agents: 15, refill: 250, cap: 500, label: "Premium" },
};

export function normPlan(p?: string | null): string {
  const v = (p ?? "").trim().toLowerCase();
  if (v in PLAN_LIMITS) return v;
  if (["199k", "pro-199", "plus"].includes(v)) return "pro";
  if (["499k", "premium-499", "vip"].includes(v)) return "premium";
  return "free";
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

/** Số dư credit hiện tại (null nếu chưa có ví — ví sẽ tự tạo ở lượt chạy đầu). */
export async function getCreditBalance(userId: string): Promise<number | null> {
  const { data } = await supabase.from("user_credits").select("balance").eq("user_id", userId).limit(1);
  if (!data?.length) return null;
  return Number(data[0].balance);
}
