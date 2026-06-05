/**
 * resend-brief — Gửi lại một brief từ Inbox về email của user
 * POST { briefId: string }
 * Headers: Authorization: Bearer <user_jwt>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type BriefOutput } from "../_shared/generate-brief.ts";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM     = Deno.env.get("EMAIL_FROM") ?? "Wealbee <no-reply@wealbee.com>";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ── Build email HTML from BriefOutput ────────────────────────────────────────

const LABEL_VN: Record<string, { text: string; color: string; bg: string }> = {
  very_positive: { text: "Rất tích cực", color: "#1a7a3a", bg: "#e6f9ed" },
  positive:      { text: "Tích cực",     color: "#1a7a3a", bg: "#e6f9ed" },
  negative:      { text: "Tiêu cực",     color: "#c0392b", bg: "#feeaea" },
  very_negative: { text: "Rất tiêu cực", color: "#c0392b", bg: "#feeaea" },
};

function briefToEmailHtml(brief: BriefOutput): string {
  let html = "";
  for (const sec of brief.sections) {
    if (sec.type === "portfolio_chips") {
      const chips = (arr: string[], color: string) =>
        arr.map(s => `<span style="display:inline-block;padding:2px 10px;border-radius:99px;background:${color};color:#0849AC;font-size:12px;font-weight:700;margin:2px;font-family:sans-serif;">${s}</span>`).join("");
      html += `<div style="padding:12px 20px 8px;">
        <span style="font-size:11px;font-weight:700;color:#888;">CÓ TIN:</span> ${chips(sec.has_news, "#EBF3FF")}
        ${sec.no_news.length ? `<br><span style="font-size:11px;font-weight:700;color:#aaa;margin-top:4px;display:inline-block;">KHÔNG TIN:</span> ${chips(sec.no_news, "#F0F0F0")}` : ""}
      </div>`;

    } else if (sec.type === "section_header") {
      html += `<div style="padding:18px 20px 6px;font-size:16px;font-weight:800;color:#1A1A2E;font-family:sans-serif;border-top:2px solid #EEF0FA;">${sec.title}</div>`;

    } else if (sec.type === "alert_banner") {
      const bg = sec.level === "critical" ? "#feeaea" : sec.level === "warning" ? "#fff4e6" : "#EBF3FF";
      const col = sec.level === "critical" ? "#c0392b" : sec.level === "warning" ? "#c05000" : "#0849AC";
      html += `<div style="margin:10px 20px;padding:12px 16px;border-radius:10px;background:${bg};color:${col};font-size:14px;font-weight:600;font-family:sans-serif;">${sec.message}</div>`;

    } else if (sec.type === "news_card") {
      const lc = LABEL_VN[sec.label] ?? { text: sec.label, color: "#555", bg: "#f0f0f0" };
      html += `<div style="margin:10px 20px;border:1px solid #E5E9F5;border-radius:12px;overflow:hidden;">
        <div style="padding:12px 16px;background:#FAFBFF;border-bottom:1px solid #E5E9F5;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="padding:2px 8px;border-radius:99px;background:${lc.bg};color:${lc.color};font-size:11px;font-weight:700;font-family:sans-serif;">${lc.text}</span>
          <span style="font-size:11px;color:#888;font-family:sans-serif;">${sec.news_type ?? ""} · ${sec.source}</span>
          ${sec.affected_symbols.map(s => `<span style="padding:2px 7px;border-radius:99px;background:#EBF3FF;color:#0849AC;font-size:11px;font-weight:700;font-family:sans-serif;">${s}</span>`).join("")}
        </div>
        <div style="padding:12px 16px;">
          <div style="font-size:15px;font-weight:700;color:#1A1A2E;margin-bottom:8px;font-family:sans-serif;">${sec.title}</div>
          ${sec.url ? `<a href="${sec.url}" style="font-size:13px;color:#0849AC;text-decoration:none;font-family:sans-serif;">Đọc bài báo gốc →</a>` : ""}
          ${sec.summary.length ? `<ul style="margin:8px 0;padding-left:18px;">${sec.summary.map(l => `<li style="font-size:13px;color:#374151;margin-bottom:4px;font-family:sans-serif;">${l}</li>`).join("")}</ul>` : ""}
          ${sec.reasoning.length ? `
            <div style="font-size:10px;font-weight:700;color:#0849AC;letter-spacing:.06em;margin:10px 0 4px;font-family:sans-serif;">AI REASONING</div>
            <ul style="margin:0;padding-left:18px;">${sec.reasoning.map(l => `<li style="font-size:13px;color:#374151;margin-bottom:4px;font-family:sans-serif;">${l}</li>`).join("")}</ul>
          ` : ""}
        </div>
      </div>`;

    } else if (sec.type === "summary_list") {
      html += `<div style="margin:10px 20px;border:1px solid #E5E9F5;border-radius:10px;overflow:hidden;">`;
      if (sec.title) html += `<div style="padding:8px 14px;font-weight:700;font-size:13px;color:#1A1A2E;background:#F7F9FF;border-bottom:1px solid #E5E9F5;font-family:sans-serif;">${sec.title}</div>`;
      for (const item of sec.items) {
        const lc = item.label ? LABEL_VN[item.label] : null;
        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #F0F0F0;font-size:13px;flex-wrap:wrap;font-family:sans-serif;">
          ${item.symbol ? `<span style="padding:2px 7px;border-radius:99px;background:#EBF3FF;color:#0849AC;font-size:11px;font-weight:700;">${item.symbol}</span>` : ""}
          ${lc ? `<span style="padding:2px 6px;border-radius:99px;background:${lc.bg};color:${lc.color};font-size:10px;font-weight:700;">${lc.text}</span>` : ""}
          <span style="color:#374151;flex:1;">${item.headline}</span>
          ${item.source ? `<span style="color:#aaa;font-size:11px;">${item.source}</span>` : ""}
        </div>`;
      }
      html += `</div>`;

    } else if (sec.type === "comparison_table") {
      html += `<div style="margin:10px 20px;overflow-x:auto;">`;
      if (sec.caption) html += `<div style="font-size:13px;font-weight:700;color:#1A1A2E;margin-bottom:6px;font-family:sans-serif;">${sec.caption}</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:13px;font-family:sans-serif;">
        <thead><tr>${sec.columns.map(c => `<th style="text-align:left;padding:8px 12px;background:#F7F9FF;border-bottom:2px solid #E5E9F5;font-weight:700;color:#1A1A2E;">${c}</th>`).join("")}</tr></thead>
        <tbody>${sec.rows.map(r => `<tr>${sec.columns.map(c => `<td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;color:#374151;">${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;

    } else if (sec.type === "text_block") {
      html += `<div style="padding:12px 20px;font-size:12px;color:#9CA3AF;text-align:center;font-family:sans-serif;">${sec.content}</div>`;
    }
  }
  return html;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);
  if (!user.email) return json({ error: "User has no email" }, 400);
  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 503);

  const { briefId } = await req.json().catch(() => ({}));
  if (!briefId) return json({ error: "briefId required" }, 400);

  const { data: brief, error: dbErr } = await sb
    .from("briefs")
    .select("title, content, type")
    .eq("id", briefId)
    .eq("user_id", user.id)
    .single();

  if (dbErr || !brief) return json({ error: "Brief not found" }, 404);

  let bodyHtml = "";
  try {
    const parsed = JSON.parse(brief.content ?? "");
    const candidate = (parsed.sections || parsed.time) ? parsed
      : Object.values(parsed).find((v: unknown) =>
          v !== null && typeof v === "object" && ("sections" in (v as object))
        ) ?? null;
    if (candidate && Array.isArray((candidate as BriefOutput).sections)) {
      bodyHtml = briefToEmailHtml(candidate as BriefOutput);
    }
  } catch { /* fallback to plain text */ }

  if (!bodyHtml) {
    bodyHtml = `<pre style="font-family:sans-serif;font-size:13px;white-space:pre-wrap;padding:20px;">${brief.content}</pre>`;
  }

  const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="background:#0849AC;padding:16px 24px;text-align:center;">
    <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">Wealbee</span>
  </div>
  <div style="max-width:680px;margin:0 auto;padding:16px 0;background:#fff;">
    <div style="padding:20px 20px 0;font-size:22px;font-weight:800;color:#1A1A2E;letter-spacing:-0.02em;">${brief.title}</div>
    ${bodyHtml}
  </div>
  <div style="max-width:680px;margin:0 auto;padding:16px 20px;text-align:center;">
    <p style="margin:0;color:#9CA3AF;font-size:11px;">Wealbee AI tổng hợp từ dữ liệu công khai</p>
    <p style="margin:4px 0 0;color:#9CA3AF;font-size:10px;">Không phải tư vấn đầu tư theo Luật Chứng khoán 2019, NĐ 155/2020/NĐ-CP</p>
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [user.email],
      subject: `[Wealbee] ${brief.title}`,
      html: emailHtml,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return json({ error: `Resend error: ${err}` }, 502);
  }

  return json({ ok: true });
});
