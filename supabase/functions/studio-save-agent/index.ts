/**
 * studio-save-agent — Upsert agent config + schedule vào DB.
 *
 * POST {
 *   agent_id?,        // nếu có → update, không có → insert mới
 *   user_id?,         // default: user đầu tiên trong user_profiles
 *   name, system_prompt, tools, model,
 *   target_symbols, kb_document_ids?,
 *   email_notify,
 *   schedule_config: { mode, frequency, time, days }
 * }
 * Response: { ok: true, agent_id, next_run_at }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UI day index: 0=T2(Mon)…4=T6(Fri), 5=T7(Sat), 6=CN(Sun)
// JS Date.getDay(): 0=Sun, 1=Mon…6=Sat
function uiDayToJS(d: number): number {
  return d === 6 ? 0 : d + 1;
}

interface ScheduleConfig {
  mode: "scheduled" | "realtime";
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  time: string;      // "HH:MM"
  days: number[];    // UI day indices
}

function calcNextRunAt(cfg: ScheduleConfig): string | null {
  if (cfg.mode !== "scheduled") return null;

  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowUTC = Date.now();
  const nowVN = new Date(nowUTC + VN_OFFSET_MS);

  const [hour, minute] = cfg.time.split(":").map(Number);

  let validJSDays: number[];
  if (cfg.frequency === "daily") {
    validJSDays = [0, 1, 2, 3, 4, 5, 6];
  } else if (cfg.frequency === "weekdays") {
    validJSDays = [1, 2, 3, 4, 5];
  } else {
    validJSDays = (cfg.days ?? []).map(uiDayToJS);
  }
  if (!validJSDays.length) return null;

  // Tìm ngày gần nhất hợp lệ (trong 8 ngày tới)
  for (let ahead = 0; ahead <= 7; ahead++) {
    const candidate = new Date(nowVN);
    candidate.setDate(candidate.getDate() + ahead);
    candidate.setHours(hour, minute, 0, 0);

    if (!validJSDays.includes(candidate.getDay())) continue;
    if (ahead === 0 && candidate <= nowVN) continue; // giờ đã qua hôm nay

    // Chuyển về UTC
    return new Date(candidate.getTime() - VN_OFFSET_MS).toISOString();
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: {
    agent_id?: string;
    user_id?: string;
    name?: string;
    system_prompt?: string;
    tools?: string[];
    model?: string;
    target_symbols?: string[];
    kb_document_ids?: string[];
    email_notify?: boolean;
    schedule_config?: ScheduleConfig;
  };

  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Resolve user_id: dùng param hoặc lấy user đầu tiên trong profiles
  let userId = body.user_id;
  if (!userId) {
    const { data: profile } = await sb
      .from("user_profiles")
      .select("user_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    userId = profile?.user_id;
  }
  if (!userId) {
    return new Response(JSON.stringify({ error: "No user found" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const schedCfg = body.schedule_config ?? { mode: "scheduled", frequency: "daily", time: "09:15", days: [0,1,2,3,4] };
  const nextRunAt = calcNextRunAt(schedCfg);
  const scheduleStr = JSON.stringify(schedCfg);
  const status = schedCfg.mode === "scheduled" ? "active" : "active";

  const payload = {
    user_id:          userId,
    name:             body.name ?? "Agent",
    system_prompt:    body.system_prompt ?? "",
    tools:            body.tools ?? [],
    model:            body.model ?? "gpt-4o-mini",
    target_symbols:   body.target_symbols ?? [],
    kb_document_ids:  body.kb_document_ids ?? [],
    email_notify:     body.email_notify ?? false,
    schedule:         scheduleStr,
    next_run_at:      nextRunAt,
    status,
    updated_at:       new Date().toISOString(),
  };

  let agentId = body.agent_id;
  let error: unknown;

  if (agentId) {
    // Update existing agent
    const { error: upErr } = await sb
      .from("agents")
      .update(payload)
      .eq("id", agentId)
      .eq("user_id", userId);
    error = upErr;
  } else {
    // Insert new agent
    const { data: inserted, error: insErr } = await sb
      .from("agents")
      .insert(payload)
      .select("id")
      .single();
    agentId = inserted?.id;
    error = insErr;
  }

  if (error) {
    console.error("studio-save-agent error:", JSON.stringify(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, agent_id: agentId, next_run_at: nextRunAt }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
