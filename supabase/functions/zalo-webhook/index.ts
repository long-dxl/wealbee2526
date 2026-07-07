// zalo-webhook — Zalo Bot Platform gọi về khi user nhắn bot (setWebhook trỏ tới đây).
// Xác thực header X-Bot-Api-Secret-Token = ZALO_WEBHOOK_SECRET.
// Luồng liên kết: user gửi MÃ 6 ký tự (sinh ở Wealbee) → khớp zalo_link_codes → tạo zalo_links.
// Cấu hình: setWebhook url = https://<ref>.supabase.co/functions/v1/zalo-webhook (verify_jwt=false)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zaloSend, zaloSetWebhook, zaloGetMe } from "../_shared/zalo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("ZALO_WEBHOOK_SECRET") ?? "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const INTERNAL_KEY = Deno.env.get("ZALO_INTERNAL_KEY") ?? "";

Deno.serve(async (req) => {
  // Setup 1 lần: GET ?setup=<ZALO_INTERNAL_KEY> → tự gọi setWebhook trỏ về chính URL này.
  const u = new URL(req.url);
  if (req.method === "GET" && u.searchParams.get("setup")) {
    if (!INTERNAL_KEY || u.searchParams.get("setup") !== INTERNAL_KEY) return json({ ok: false, error: "unauthorized" }, 401);
    const hookUrl = `${SUPABASE_URL}/functions/v1/zalo-webhook`;
    const me = await zaloGetMe();
    const set = await zaloSetWebhook(hookUrl, WEBHOOK_SECRET);
    return json({ ok: true, bot: me?.result ?? me, webhook_url: hookUrl, setWebhook: set });
  }

  if (req.method !== "POST") return json({ ok: false }, 405);

  // Xác thực nguồn gọi (Zalo gắn header này theo secret_token đã đăng ký ở setWebhook)
  if (WEBHOOK_SECRET) {
    const hdr = req.headers.get("X-Bot-Api-Secret-Token") ?? req.headers.get("x-bot-api-secret-token") ?? "";
    if (hdr !== WEBHOOK_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  }

  const body: any = await req.json().catch(() => ({}));
  const r = body?.result ?? body;
  if (r?.event_name !== "message.text.received") return json({ ok: true, skipped: r?.event_name ?? "no-event" });

  const msg = r.message ?? {};
  const chatId = String(msg?.chat?.id ?? msg?.from?.id ?? "");
  const name = String(msg?.from?.display_name ?? "");
  const text = String(msg?.text ?? "").trim();
  if (!chatId) return json({ ok: true, skipped: "no-chat" });

  // Lệnh huỷ liên kết
  if (/^(huỷ|huy|stop|unlink|dừng|dung)$/i.test(text)) {
    await sb.from("zalo_links").delete().eq("chat_id", chatId);
    await zaloSend(chatId, "Đã huỷ nhận thông báo từ Wealbee. Gửi lại mã liên kết bất cứ lúc nào để bật lại.");
    return json({ ok: true, action: "unlinked" });
  }

  // Mã liên kết = 6 ký tự [A-Z0-9]
  const code = text.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z0-9]{6}$/.test(code)) {
    const { data: rows } = await sb.from("zalo_link_codes")
      .select("code, user_id, expires_at").eq("code", code).limit(1);
    const row = rows?.[0];
    if (!row) {
      await zaloSend(chatId, "Mã không đúng hoặc đã hết hạn. Vào Wealbee → Cài đặt → Kết nối Zalo để lấy mã mới.");
      return json({ ok: true, action: "bad-code" });
    }
    if (Date.parse(row.expires_at) < Date.now()) {
      await sb.from("zalo_link_codes").delete().eq("code", code);
      await zaloSend(chatId, "Mã đã hết hạn (15 phút). Lấy mã mới trong Wealbee → Cài đặt → Kết nối Zalo.");
      return json({ ok: true, action: "expired" });
    }
    // Liên kết (1 chat_id ↔ 1 user; ghi đè nếu user đổi Zalo)
    await sb.from("zalo_links").delete().eq("chat_id", chatId);
    await sb.from("zalo_links").upsert({
      user_id: row.user_id, chat_id: chatId, display_name: name, linked_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    await sb.from("zalo_link_codes").delete().eq("user_id", row.user_id);
    await zaloSend(chatId, `✅ Đã kết nối Wealbee${name ? " cho " + name : ""}! Bạn sẽ nhận digest & cảnh báo tại đây. Gửi "huỷ" để ngừng nhận.`);
    return json({ ok: true, action: "linked", user_id: row.user_id });
  }

  // Không phải mã → hướng dẫn
  await zaloSend(chatId, "Chào bạn! Gửi MÃ LIÊN KẾT (6 ký tự) lấy từ Wealbee → Cài đặt → Kết nối Zalo để nhận thông báo. Gửi \"huỷ\" để ngừng nhận.");
  return json({ ok: true, action: "help" });
});
