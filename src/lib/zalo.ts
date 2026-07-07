/** Kết nối Zalo Bot: sinh mã liên kết, xem/huỷ trạng thái, gửi tin test. */
import { supabase } from "./supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ZaloLink {
  chatId: string;
  displayName: string | null;
  linkedAt: string;
  notifyDigest: boolean;
  notifyAlert: boolean;
}

/** Trạng thái liên kết hiện tại (null nếu chưa liên kết). */
export async function getZaloLink(userId: string): Promise<ZaloLink | null> {
  const { data } = await supabase
    .from("zalo_links")
    .select("chat_id, display_name, linked_at, notify_digest, notify_alert")
    .eq("user_id", userId).limit(1);
  const r = data?.[0];
  if (!r) return null;
  return { chatId: r.chat_id, displayName: r.display_name, linkedAt: r.linked_at, notifyDigest: r.notify_digest, notifyAlert: r.notify_alert };
}

/** Sinh mã liên kết 6 ký tự (hết hạn 15 phút). */
export async function genZaloCode(): Promise<string> {
  const { data, error } = await supabase.rpc("zalo_gen_code");
  if (error) throw new Error(error.message);
  return String(data);
}

/** Bật/tắt loại thông báo. */
export async function setZaloNotify(userId: string, patch: Partial<{ notify_digest: boolean; notify_alert: boolean }>): Promise<void> {
  const { error } = await supabase.from("zalo_links").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Huỷ liên kết Zalo. */
export async function unlinkZalo(userId: string): Promise<void> {
  const { error } = await supabase.from("zalo_links").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Gửi tin nhắn test tới Zalo của chính mình (qua edge zalo-notify). */
export async function sendZaloTest(): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: "Bạn cần đăng nhập" };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/zalo-notify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: j.error || `Lỗi ${res.status}` };
}
