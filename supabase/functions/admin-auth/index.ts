/**
 * admin-auth — xác thực admin hai lớp:
 *   Lớp 1: ADMIN_ACCESS_CODE (secret env) — phải khớp trước khi chạm Supabase
 *   Lớp 2: email + password Supabase + framework_role = 'expert'
 *
 * Người dùng thông thường KHÔNG THỂ đăng nhập dù có password admin,
 * vì không có ADMIN_ACCESS_CODE.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS } from "../_shared/cors.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ADMIN_ACCESS_CODE = Deno.env.get("ADMIN_ACCESS_CODE") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { username?: string; password?: string; admin_key?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { username, password, admin_key } = body;

  // ── Lớp 1: Kiểm tra Admin Key (server-side, không bypass được từ client) ──
  if (!ADMIN_ACCESS_CODE) {
    // Nếu chưa cấu hình ADMIN_ACCESS_CODE → khoá toàn bộ
    return json({ error: "Admin panel chưa được cấu hình. Liên hệ kỹ thuật." }, 503);
  }
  if (!admin_key || admin_key !== ADMIN_ACCESS_CODE) {
    // Delay 800ms để chống brute force
    await new Promise(r => setTimeout(r, 800));
    return json({ error: "Admin Key không hợp lệ." }, 401);
  }

  if (!username || !password) {
    return json({ error: "Thiếu username hoặc password." }, 400);
  }

  // ── Lớp 2: Xác thực Supabase ─────────────────────────────────────────────
  const email = username.includes("@")
    ? username.trim()
    : `${username.trim().toLowerCase()}@wealbee.com`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });

  if (authErr || !data.session) {
    await new Promise(r => setTimeout(r, 500));
    return json({ error: "Tài khoản hoặc mật khẩu không đúng." }, 401);
  }

  // ── Lớp 3: Kiểm tra vai trò expert ───────────────────────────────────────
  const role = (data.user?.app_metadata as Record<string, unknown>)?.framework_role;
  if (role !== "expert") {
    // Sign out ngay — tài khoản không phải admin
    await supabase.auth.signOut();
    return json({ error: "Tài khoản không có quyền admin." }, 403);
  }

  // Trả session về cho client → client gọi setSession()
  return json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
    user: {
      id:    data.user.id,
      email: data.user.email,
      role,
    },
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
