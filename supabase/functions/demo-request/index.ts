// POST /functions/v1/demo-request
// Nhận yêu cầu demo từ landing → lưu demo_requests (pending) → mail admin (duyệt/từ chối) + auto-reply khách.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signToken, sendEmail, isEmail } from "../_shared/demo-token.ts";
import { adminNotifyEmail, customerAckEmail } from "../_shared/demo-emails.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNING_SECRET = Deno.env.get("DEMO_SIGNING_SECRET") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* noop */ }

  // Honeypot chống bot
  if (body.website) return json({ ok: true });

  const lead = {
    email: (body.email || "").trim(),
    ho_ten: (body.ho_ten || "").trim(),
    dien_thoai: (body.dien_thoai || "").trim(),
    cong_ty: (body.cong_ty || "").trim(),
    loai_nha_dau_tu: (body.loai_nha_dau_tu || "").trim(),
    loi_nhan: (body.loi_nhan || "").trim(),
  };
  if (!isEmail(lead.email)) return json({ error: "Email không hợp lệ." }, 400);
  if (!lead.ho_ten) return json({ error: "Vui lòng nhập họ tên." }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: inserted, error: dbErr } = await supabase
      .from("demo_requests")
      .insert({ ...lead, status: "pending" })
      .select("id")
      .single();
    if (dbErr) throw dbErr;

    const id = inserted.id as string;
    const token = await signToken({ id, email: lead.email, ho_ten: lead.ho_ten }, SIGNING_SECRET);
    const fnBase = `${SUPABASE_URL}/functions/v1`;
    const approveUrl = `${fnBase}/demo-approve?t=${encodeURIComponent(token)}`;
    const rejectUrl = `${fnBase}/demo-reject?t=${encodeURIComponent(token)}`;

    // Admin nhận email duyệt: từ ADMIN_EMAIL (secret) + luôn kèm 2 admin cố định. Dedupe.
    const ALWAYS_ADMIN = ["longsctn55@gmail.com", "pminh7794@gmail.com"];
    const adminTo = [...new Set(
      [...ADMIN_EMAIL.split(","), ...ALWAYS_ADMIN].map((s) => s.trim().toLowerCase()).filter(Boolean),
    )];
    await Promise.all([
      adminTo.length
        ? sendEmail({ to: adminTo, subject: `🎉 Yêu cầu demo mới — ${lead.ho_ten}`, html: adminNotifyEmail(lead, approveUrl, rejectUrl), replyTo: lead.email })
        : Promise.resolve(),
      sendEmail({ to: lead.email, subject: "Wealbee đã nhận yêu cầu demo của bạn", html: customerAckEmail(lead) }),
    ]);

    return json({ ok: true });
  } catch (err) {
    console.error("demo-request error:", err);
    return json({ error: "Không gửi được yêu cầu, vui lòng thử lại sau." }, 500);
  }
});
