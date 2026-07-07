// Zalo Bot Platform API client. Token = ZALO_BOT_TOKEN (secret, chỉ server-side).
// Base: https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>
// deno-lint-ignore-file no-explicit-any

const TOKEN = Deno.env.get("ZALO_BOT_TOKEN") ?? "";
const BASE = `https://bot-api.zaloplatforms.com/bot${TOKEN}`;

/** Gửi tin nhắn văn bản tới 1 chat_id. Trả {ok, error?}. text ≤ 2000 ký tự. */
export async function zaloSend(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!TOKEN) return { ok: false, error: "ZALO_BOT_TOKEN chưa cấu hình" };
  if (!chatId) return { ok: false, error: "thiếu chat_id" };
  try {
    const res = await fetch(`${BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 2000) }),
    });
    const j: any = await res.json().catch(() => ({}));
    return j?.ok ? { ok: true } : { ok: false, error: j?.description || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Kiểm tra token (getMe). */
export async function zaloGetMe(): Promise<any> {
  if (!TOKEN) return { ok: false, error: "no-token" };
  const res = await fetch(`${BASE}/getMe`, { method: "POST" });
  return await res.json().catch(() => ({ ok: false }));
}

/** Đăng ký webhook (setWebhook). secretToken sẽ về ở header X-Bot-Api-Secret-Token. */
export async function zaloSetWebhook(url: string, secretToken: string): Promise<any> {
  if (!TOKEN) return { ok: false, error: "no-token" };
  const res = await fetch(`${BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secretToken }),
  });
  return await res.json().catch(() => ({ ok: false }));
}
