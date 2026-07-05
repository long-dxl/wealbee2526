// create-checkout — tạo đơn + sinh URL & field checkout SePay PG (đã ký HMAC bằng SDK).
// POST { plan } → { checkoutURL, fields }. Frontend POST form tới checkoutURL để chuyển hướng.
// Secrets cần đặt: SEPAY_MERCHANT_ID, SEPAY_SECRET_KEY, (tùy) SEPAY_ENV=sandbox|production, APP_URL.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SePayPgClient } from "npm:sepay-pg-node@latest";
import { PLAN_PRICE, genMemo } from "../_shared/payment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MERCHANT_ID = Deno.env.get("SEPAY_MERCHANT_ID") ?? "";
const SEPAY_SECRET = Deno.env.get("SEPAY_SECRET_KEY") ?? "";
const SEPAY_ENV = (Deno.env.get("SEPAY_ENV") ?? "sandbox") as "sandbox" | "production";
const APP_URL = Deno.env.get("APP_URL") ?? "https://wealbee.com";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

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

  // Tạo đơn (memo = order_invoice_number gửi SePay)
  let order: any = null;
  for (let i = 0; i < 3 && !order; i++) {
    const memo = genMemo();
    const { data, error } = await sb.from("payment_orders")
      .insert({ user_id: user.id, plan, amount, memo, status: "pending" })
      .select("id, memo").single();
    if (!error) order = data;
  }
  if (!order) return json({ error: "Không tạo được đơn" }, 500);

  try {
    const client = new SePayPgClient({ env: SEPAY_ENV, merchant_id: MERCHANT_ID, secret_key: SEPAY_SECRET });
    const checkoutURL = client.checkout.initCheckoutUrl();
    const fields = client.checkout.initOneTimePaymentFields({
      operation: "PURCHASE",
      payment_method: "BANK_TRANSFER",
      order_invoice_number: order.memo,
      order_amount: amount,
      currency: "VND",
      order_description: `Wealbee - nang cap goi ${plan.toUpperCase()}`,
      success_url: `${APP_URL}/app/settings?payment=success&order=${order.memo}`,
      error_url: `${APP_URL}/app/settings?payment=error`,
      cancel_url: `${APP_URL}/app/settings?payment=cancel`,
    });
    return json({ checkoutURL, fields, orderId: order.id, memo: order.memo, amount, plan });
  } catch (e) {
    return json({ error: `Lỗi SePay SDK: ${String(e).slice(0, 200)}` }, 500);
  }
});
