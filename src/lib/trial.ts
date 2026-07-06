/** Pro trial 7 ngày — user tự KÍCH HOẠT trong Gói dịch vụ (1 lần/TK), rồi đếm ngược về free. */
import { supabase } from "./supabase/client";

/** Còn lượt kích hoạt trial không? (pending_trial_grant=true & đang free). */
export async function getTrialAvailable(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_profiles")
    .select("pending_trial_grant, plan")
    .eq("user_id", userId)
    .limit(1);
  const row = data?.[0];
  return !!row?.pending_trial_grant && (row.plan ?? "free") === "free";
}

/** Kích hoạt Pro trial → RPC activate_pro_trial. Trả {activated, days?, reason?}. */
export async function activateTrial(): Promise<{ activated: boolean; days?: number; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc("activate_pro_trial");
    if (error) return { activated: false, reason: error.message };
    return (data ?? { activated: false }) as { activated: boolean; days?: number; reason?: string };
  } catch (e) {
    return { activated: false, reason: String(e) };
  }
}

/** (Cũ) Nhận trial tự động — giữ để tương thích, không còn gọi khi login. */
export async function claimTrial(): Promise<{ granted: boolean; days?: number }> {
  try {
    const { data, error } = await supabase.rpc("claim_pro_trial");
    if (error) return { granted: false };
    return (data ?? { granted: false }) as { granted: boolean; days?: number };
  } catch {
    return { granted: false };
  }
}
