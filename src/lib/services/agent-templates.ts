import { supabase } from "../supabase/client";

export interface UserAgent {
  id: string;
  template_id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "draft";
  schedule: string;
  last_run_at: string | null;
  run_count: number;
  system_prompt?: string;
  target_symbols?: string[];
  trigger_type?: "manual" | "scheduled" | "event";
  trigger_config?: { event_type?: string; [k: string]: unknown } | null;
}

// Template đã hoàn thiện, sẵn sàng kích hoạt — dùng chung giữa trang Mẫu Agent và Agent của tôi.
export const READY_TEMPLATE_IDS = ["daily_digest", "deep_research", "insider_buy", "volume_spike"];

// Agent user đã có sẵn cho template này chưa (tránh tạo trùng khi bấm "Dùng" nhiều lần).
export async function findAgentByTemplate(userId: string, templateId: string): Promise<UserAgent | null> {
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .maybeSingle();
  return (data as UserAgent) ?? null;
}

// Tạo agent mới cho user từ 1 template — copy prompt/tools/schedule mặc định của template.
export async function activateAgentTemplate(
  userId: string,
  template: { id: string; name: string; description: string },
): Promise<UserAgent | null> {
  const { data: full } = await supabase
    .from("agent_templates")
    .select("id, tools, system_prompt, trigger_type, trigger_config, default_schedule")
    .eq("id", template.id)
    .single();

  const { data: agent } = await supabase
    .from("agents")
    .insert({
      user_id: userId,
      template_id: template.id,
      name: template.name,
      description: template.description,
      status: "active",
      schedule: full?.default_schedule ?? "manual",
      trigger_type: full?.trigger_type ?? "manual",
      trigger_config: full?.trigger_config ?? null,
      tools: full?.tools ?? [],
      system_prompt: full?.system_prompt ?? null,
    })
    .select("*")
    .single();

  return (agent as UserAgent) ?? null;
}
