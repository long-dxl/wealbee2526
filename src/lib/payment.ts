/** Thanh toán nâng gói qua SePay Payment Gateway (redirect hosted checkout). */
import { supabase } from "./supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Tạo đơn + chuyển hướng sang trang thanh toán SePay (POST form ẩn). */
export async function startCheckout(plan: "pro" | "premium"): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Bạn cần đăng nhập");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `Lỗi ${res.status}`);

  // Dựng form POST ẩn tới checkoutURL → trình duyệt chuyển hướng sang SePay
  const form = document.createElement("form");
  form.method = "POST";
  form.action = j.checkoutURL;
  for (const [k, v] of Object.entries(j.fields as Record<string, unknown>)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = String(v ?? "");
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
