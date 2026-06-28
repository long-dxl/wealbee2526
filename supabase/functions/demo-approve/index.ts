// GET /functions/v1/demo-approve?t=<token>  (public — admin bấm từ email)
// Duyệt yêu cầu → tạo tài khoản Supabase (mật khẩu tạm, bắt đổi lần đầu) → mail khách.
// Trả 302 redirect về trang /demo-result của app (domain supabase.co ép text/plain nên không serve HTML trực tiếp).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken, genPassword, sendEmail } from "../_shared/demo-token.ts";
import { credentialsEmail } from "../_shared/demo-emails.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNING_SECRET = Deno.env.get("DEMO_SIGNING_SECRET") ?? "";
// Mặc định production wealbee.com; bỏ qua nếu env lỡ trỏ localhost (giá trị dev) → tránh
// admin bấm "Duyệt" từ email lại bị redirect về localhost (phải chạy app local mới mở được).
const _appUrl = Deno.env.get("APP_URL") || "https://wealbee.com";
const APP_URL = (/localhost|127\.0\.0\.1/.test(_appUrl) ? "https://wealbee.com" : _appUrl).replace(/\/$/, "");

interface TokenData { id: string; email: string; ho_ten: string }

function redirect(status: string, email = ""): Response {
  const url = `${APP_URL}/demo-result?status=${encodeURIComponent(status)}${email ? `&email=${encodeURIComponent(email)}` : ""}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const data = await verifyToken<TokenData>(token, SIGNING_SECRET);
  if (!data?.email) return redirect("invalid");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Idempotency: đã duyệt rồi thì không tạo lại / không gửi mail mới
    const { data: existing } = await supabase
      .from("demo_requests").select("status").eq("id", data.id).maybeSingle();
    if (existing?.status === "approved") return redirect("already", data.email);

    const password = genPassword(12);
    let userId: string | undefined;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { name: data.ho_ten, must_change_password: true },
    });
    if (createErr) {
      // Tài khoản đã tồn tại (vd duyệt lại sau khi xóa bản ghi demo) → KHÔNG bỏ qua:
      // tìm user, RESET mật khẩu mới rồi gửi lại email — để luôn cấp được mật khẩu mới.
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
      );
      if (!existing) return redirect("error", data.email);
      const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: { name: data.ho_ten, must_change_password: true },
      });
      if (updErr) return redirect("error", data.email);
      userId = existing.id;
    } else {
      userId = created.user?.id;
    }

    await supabase.from("demo_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), user_id: userId })
      .eq("id", data.id);

    await sendEmail({
      to: data.email,
      subject: "🚀 Tài khoản demo Wealbee của bạn đã sẵn sàng",
      html: credentialsEmail({ email: data.email, ho_ten: data.ho_ten }, password, `${APP_URL}/login`),
    });

    return redirect("approved", data.email);
  } catch (err) {
    console.error("demo-approve error:", err);
    return redirect("error", data.email);
  }
});
