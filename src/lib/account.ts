/** Đăng xuất + xóa tài khoản. */
import { supabase } from "./supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = "/";
}

/** Xóa vĩnh viễn tài khoản + toàn bộ dữ liệu, rồi đăng xuất. */
export async function deleteAccount(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Bạn cần đăng nhập");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Lỗi ${res.status}`);
  await supabase.auth.signOut();
  window.location.href = "/";
}
