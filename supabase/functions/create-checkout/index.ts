// create-checkout — tạo đơn + sinh URL & field checkout SePay PG (tự ký HMAC-SHA256).
// Không dùng SDK (tránh rủi ro Deno). Thuật toán ký lấy từ source sepay-pg-node:
//   signature = base64( HMAC-SHA256( secret, "field=value,field=value,...") )  — theo thứ tự chuẩn.
// POST { plan } → { checkoutURL, fields }. Frontend POST form tới checkoutURL để chuyển hướng.
// Secrets: SEPAY_MERCHANT_ID, SEPAY_SECRET_KEY, SEPAY_ENV(sandbox|production), APP_URL.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PLAN_PRICE, genMemo } from "../_shared/payment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MERCHANT_ID = Deno.env.get("SEPAY_MERCHANT_ID") ?? "";
const SEPAY_SECRET = Deno.env.get("SEPAY_SECRET_KEY") ?? "";
const SEPAY_ENV = (Deno.env.get("SEPAY_ENV") ?? "sandbox").toLowerCase();
const APP_URL = Deno.env.get("APP_URL") ?? "https://wealbee.com";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CHECKOUT_URL = SEPAY_ENV === "production"
  ? "https://pay.sepay.vn/v1/checkout/init"
  : "https://pay-sandbox.sepay.vn/v1/checkout/init";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Thứ tự field CHUẨN theo SDK (chỉ ký các field có mặt, bỏ undefined)
const SIGN_ORDER = [
  "merchant", "env", "operation", "payment_method", "order_amount", "currency",
  "order_invoice_number", "order_description", "customer_id",
  "success_url", "error_url", "cancel_url", "order_id",
];

async function signFields(fields: Record<string, any>, secret: string): Promise<string> {
  const parts: string[] = [];
  for (const k of SIGN_ORDER) {
    if (fields[k] === undefined || fields[k] === null) continue;
    parts.push(`${k}=${fields[k]}`);
  }
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts.join(",")));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!MERCHANT_ID || !SEPAY_SECRET) return json({ error: "Chưa cấu hình SEPAY_MERCHANT_ID / SEPAY_SECRET_KEY" }, 500);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user }, error: authErr } = await anon.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan ?? "").toLowerCase();
  if (!(plan in PLAN_PRICE)) return json({ error: "Gói không hợp lệ" }, 400);
  const amount = PLAN_PRICE[plan];

  let order: any = null;
  for (let i = 0; i < 3 && !order; i++) {
    const memo = genMemo();
    const { data, error } = await sb.from("payment_orders")
      .insert({ user_id: user.id, plan, amount, memo, status: "pending" })
      .select("id, memo").single();
    if (!error) order = data;
  }
  if (!order) return json({ error: "Không tạo được đơn" }, 500);

  // Field theo thứ tự chuẩn — KHÔNG ép payment_method (để SePay hiện mọi phương thức)
  const fields: Record<string, any> = {
    merchant: MERCHANT_ID,
    operation: "PURCHASE",
    order_amount: amount,
    currency: "VND",
    order_invoice_number: order.memo,
    order_description: `Wealbee nang cap goi ${plan.toUpperCase()}`,
    success_url: `${APP_URL}/app/settings?payment=success&order=${order.memo}`,
    error_url: `${APP_URL}/app/settings?payment=error`,
    cancel_url: `${APP_URL}/app/settings?payment=cancel`,
  };
  fields.signature = await signFields(fields, SEPAY_SECRET);

  return json({ checkoutURL: CHECKOUT_URL, fields, orderId: order.id, memo: order.memo, amount, plan });
});
