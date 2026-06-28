// Token HMAC stateless + tiện ích mật khẩu cho luồng demo (Deno / Web Crypto).
// Dùng chung cho demo-request / demo-approve / demo-reject.

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(body: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return new Uint8Array(sig);
}

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày

export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlMs = DEFAULT_TTL,
): Promise<string> {
  if (!secret) throw new Error("DEMO_SIGNING_SECRET chưa cấu hình");
  const data = { ...payload, exp: Date.now() + ttlMs };
  const body = b64urlEncode(encoder.encode(JSON.stringify(data)));
  const sig = b64urlEncode(await hmac(body, secret));
  return `${body}.${sig}`;
}

export async function verifyToken<T = Record<string, unknown>>(
  token: string,
  secret: string,
): Promise<T | null> {
  if (!secret) return null;
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = b64urlEncode(await hmac(body, secret));
  // so sánh hằng thời gian
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (data.exp && Date.now() > data.exp) return null;
    return data as T;
  } catch {
    return null;
  }
}

// Mật khẩu tạm dễ đọc (bỏ ký tự dễ nhầm 0/O/1/l/I).
export function genPassword(len = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}

export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("EMAIL_FROM") ?? "Wealbee <no-reply@wealbee.com>";
  if (!key) throw new Error("RESEND_API_KEY chưa cấu hình");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend lỗi ${res.status}: ${await res.text()}`);
  }
}
