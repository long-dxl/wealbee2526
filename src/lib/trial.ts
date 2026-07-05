/** Nhận Pro trial (user cũ) — gọi RPC claim_pro_trial (idempotent, chỉ tặng 1 lần). */
import { supabase } from "./supabase/client";

export async function claimTrial(): Promise<{ granted: boolean; days?: number }> {
  try {
    const { data, error } = await supabase.rpc("claim_pro_trial");
    if (error) return { granted: false };
    return (data ?? { granted: false }) as { granted: boolean; days?: number };
  } catch {
    return { granted: false };
  }
}
