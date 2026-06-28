// GET /functions/v1/demo-reject?t=<token>  (public — admin bấm từ email)
// Đánh dấu yêu cầu là từ chối, không gửi email gì cho khách. Trả 302 về /demo-result.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken } from "../_shared/demo-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNING_SECRET = Deno.env.get("DEMO_SIGNING_SECRET") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://wealbee.vercel.app").replace(/\/$/, "");

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
    const { data: existing } = await supabase
      .from("demo_requests").select("status").eq("id", data.id).maybeSingle();
    if (existing?.status === "approved") return redirect("already", data.email);
    await supabase.from("demo_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    return redirect("rejected", data.email);
  } catch (err) {
    console.error("demo-reject error:", err);
    return redirect("error", data.email);
  }
});
