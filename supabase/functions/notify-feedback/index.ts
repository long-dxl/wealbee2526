/**
 * notify-feedback — Gửi email báo cho admin mỗi khi có feedback mới từ app.
 * POST { feedbackId: string }
 * Headers: Authorization: Bearer <user_jwt>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM     = Deno.env.get("EMAIL_FROM") ?? "Wealbee <no-reply@wealbee.com>";

const NOTIFY_TO = ["longsctn55@gmail.com", "pminh7794@gmail.com"];
const ATTACHMENT_URL_TTL = 60 * 60 * 24 * 7; // link xem ảnh còn hạn 7 ngày

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Nội dung feedback do user nhập tự do — escape trước khi chèn vào HTML email
// để tránh user chèn thẻ/link giả mạo vào mail gửi cho admin.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TYPE_LABEL: Record<string, string> = {
  bug: "Báo lỗi",
  feature: "Đề xuất tính năng mới",
  experience: "Chia sẻ trải nghiệm",
  other: "Khác",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);
  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 503);

  const { feedbackId } = await req.json().catch(() => ({}));
  if (!feedbackId) return json({ error: "feedbackId required" }, 400);

  const { data: fb, error: dbErr } = await sb
    .from("feedback")
    .select("id, user_id, user_email, user_name, type, message, rating, attachments, page_url, created_at")
    .eq("id", feedbackId)
    .eq("user_id", user.id)
    .single();

  if (dbErr || !fb) return json({ error: "Feedback not found" }, 404);

  const attachments = Array.isArray(fb.attachments) ? (fb.attachments as { path: string; name: string }[]) : [];
  const signedImages: { url: string; name: string }[] = [];
  for (const att of attachments) {
    const { data: signed } = await sb.storage
      .from("feedback-attachments")
      .createSignedUrl(att.path, ATTACHMENT_URL_TTL);
    if (signed?.signedUrl) signedImages.push({ url: signed.signedUrl, name: att.name });
  }

  const typeLabel = TYPE_LABEL[fb.type] ?? fb.type;
  const ratingHtml = fb.rating
    ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;"><strong>Đánh giá:</strong> ${"&#9733;".repeat(fb.rating)}${"&#9734;".repeat(5 - fb.rating)} (${fb.rating}/5)</p>`
    : "";
  const imagesHtml = signedImages.length
    ? `<div style="margin-top:16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1A1A2E;">Ảnh đính kèm (${signedImages.length}):</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${signedImages.map((img) => `
            <a href="${img.url}" style="display:block;" target="_blank">
              <img src="${img.url}" alt="${escapeHtml(img.name)}" width="140" style="border-radius:8px;border:1px solid #E5E9F5;display:block;" />
            </a>`).join("")}
        </div>
      </div>`
    : "";

  const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="background:#0849AC;padding:16px 24px;text-align:center;">
    <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">Wealbee</span>
  </div>
  <div style="max-width:640px;margin:0 auto;padding:24px 20px;background:#fff;">
    <span style="display:inline-block;padding:4px 12px;border-radius:99px;background:#EBF3FF;color:#0849AC;font-size:12px;font-weight:700;margin-bottom:14px;">${escapeHtml(typeLabel)}</span>
    <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Người gửi:</strong> ${escapeHtml(fb.user_name)} (${escapeHtml(fb.user_email)})</p>
    <p style="margin:0 0 12px;font-size:12px;color:#9CA3AF;">${new Date(fb.created_at).toLocaleString("vi-VN")}${fb.page_url ? ` · trang: ${escapeHtml(fb.page_url)}` : ""}</p>
    ${ratingHtml}
    <div style="padding:14px 16px;background:#F5F5F7;border-radius:10px;font-size:14px;color:#1A1A2E;white-space:pre-wrap;line-height:1.6;">${escapeHtml(fb.message)}</div>
    ${imagesHtml}
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: NOTIFY_TO,
      subject: `[Wealbee Feedback] ${typeLabel} — ${fb.user_name}`,
      html: emailHtml,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return json({ error: `Resend error: ${err}` }, 502);
  }

  return json({ ok: true });
});
