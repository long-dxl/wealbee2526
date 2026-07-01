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

export type ActivateResult =
  | { status: "created"; agent: UserAgent }
  | { status: "needs_portfolio" };

// Tạo agent mới cho user từ 1 template — copy prompt/tools/schedule mặc định của template.
// Agent trigger "scheduled"/"event" bắt buộc phải có mã theo dõi: lấy từ danh mục nắm giữ
// (portfolio_holdings) của user tại thời điểm kích hoạt (snapshot, không tự đồng bộ về sau).
// Nếu user chưa có danh mục → không tạo agent, trả về "needs_portfolio" để UI dẫn user thêm danh mục.
// Agent trigger "manual" bỏ qua kiểm tra này vì user chọn mã thủ công mỗi lần chạy.
export async function activateAgentTemplate(
  userId: string,
  template: { id: string; name: string; description: string },
): Promise<ActivateResult> {
  const { data: full } = await supabase
    .from("agent_templates")
    .select("id, tools, system_prompt, trigger_type, trigger_config, default_schedule")
    .eq("id", template.id)
    .single();

  const triggerType = full?.trigger_type ?? "manual";
  let targetSymbols: string[] | null = null;

  if (triggerType === "scheduled" || triggerType === "event") {
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("symbol")
      .eq("user_id", userId);
    const symbols = [...new Set((holdings ?? []).map(h => h.symbol))];
    if (symbols.length === 0) return { status: "needs_portfolio" };
    targetSymbols = symbols;
  }

  const { data: agent } = await supabase
    .from("agents")
    .insert({
      user_id: userId,
      template_id: template.id,
      name: template.name,
      description: template.description,
      status: "active",
      schedule: full?.default_schedule ?? "manual",
      trigger_type: triggerType,
      trigger_config: full?.trigger_config ?? null,
      tools: full?.tools ?? [],
      system_prompt: full?.system_prompt ?? null,
      target_symbols: targetSymbols,
    })
    .select("*")
    .single();

  return { status: "created", agent: agent as UserAgent };
}
