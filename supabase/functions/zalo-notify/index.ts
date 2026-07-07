// zalo-notify — gửi thông báo Zalo tới user đã liên kết.
// 2 chế độ gọi:
//  a) User đăng nhập (Authorization: Bearer <jwt>) → gửi tin TEST cho chính mình.
//  b) Nội bộ (header X-Internal-Key = ZALO_INTERNAL_KEY) → body {user_id, text, type} → gửi cho user đó
//     (dùng cho cron digest/alert từ brain/scheduler). type ∈ 'digest'|'alert'|'test' để tôn trọng toggle.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zaloSend } from "../_shared/zalo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const INTERNAL_KEY = Deno.env.get("ZALO_INTERNAL_KEY") ?? "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-key",
};
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function sendToUser(userId: string, text: string, type: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await sb.from("zalo_links")
    .select("chat_id, notify_digest, notify_alert").eq("user_id", userId).limit(1);
  const link = data?.[0];
  if (!link) return { ok: false, error: "Chưa liên kết Zalo" };
  if (type === "digest" && !link.notify_digest) return { ok: false, error: "Đã tắt digest" };
  if (type === "alert" && !link.notify_alert) return { ok: false, error: "Đã tắt cảnh báo" };
  return await zaloSend(String(link.chat_id), text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body: any = await req.json().catch(() => ({}));

  // Chế độ nội bộ (cron/brain)
  const internal = req.headers.get("X-Internal-Key") ?? req.headers.get("x-internal-key") ?? "";
  if (internal && INTERNAL_KEY && internal === INTERNAL_KEY) {
    const uid = String(body.user_id ?? "");
    const text = String(body.text ?? "");
    const type = String(body.type ?? "alert");
    if (!uid || !text) return json({ error: "thiếu user_id/text" }, 400);
    const r = await sendToUser(uid, text, type);
    return json(r, r.ok ? 200 : 400);
  }

  // Chế độ user (test gửi cho chính mình)
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user }, error } = await anon.auth.getUser();
  if (error || !user) return json({ error: "Unauthorized" }, 401);

  const text = String(body.text ?? "🐝 Đây là tin nhắn thử từ Wealbee. Kết nối Zalo hoạt động tốt!");
  const r = await sendToUser(user.id, text, "test");
  return json(r, r.ok ? 200 : 400);
});
