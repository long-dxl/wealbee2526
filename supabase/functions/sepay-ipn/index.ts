// sepay-ipn — SePay Payment Gateway gọi về khi thanh toán thành công (ORDER_PAID).
// Xác thực bằng header X-Secret-Key (auth type = SECRET_KEY ở SePay) → nâng gói + nạp Beeny.
// Cấu hình IPN URL ở SePay = https://<ref>.supabase.co/functions/v1/sepay-ipn
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PLAN_CAP } from "../_shared/payment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Xác thực IPN (tùy chọn để test). Khi go-live: bật auth type=SECRET_KEY ở SePay +
// set SEPAY_IPN_APIKEY = secret key → chặn IPN giả. Chưa set → bỏ qua kiểm tra (chỉ test).
const IPN_APIKEY = Deno.env.get("SEPAY_IPN_APIKEY") ?? "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "method" }, 405);

  if (IPN_APIKEY) {
    const hdr = req.headers.get("X-Secret-Key") ?? req.headers.get("x-secret-key") ?? "";
    if (hdr !== IPN_APIKEY) return json({ success: false, error: "unauthorized" }, 401);
  }

  const p = await req.json().catch(() => ({} as any));
  // Chỉ xử lý thanh toán thành công
  if (p.notification_type && p.notification_type !== "ORDER_PAID")
    return json({ success: true, skipped: p.notification_type });

  const order = p.order ?? {};
  const inv = String(order.order_invoice_number ?? "");
  const amount = Number(order.order_amount ?? 0);
  const txId = String(p.transaction?.transaction_id ?? p.transaction?.id ?? "");
  if (!inv) return json({ success: true, skipped: "no-invoice" });

  // Tìm đơn theo order_invoice_number (= payment_orders.memo) còn pending
  const { data: rows } = await sb.from("payment_orders")
    .select("id, user_id, plan, amount, status, kind, period, beeny").eq("memo", inv).limit(1);
  if (!rows?.length) return json({ success: true, skipped: "no-order" });
  const o = rows[0];
  if (o.status === "paid") return json({ success: true, skipped: "already-paid" });

  if (amount > 0 && amount < o.amount)
    return json({ success: true, skipped: "amount-low", need: o.amount, got: amount });

  const nowIso = new Date().toISOString();
  const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  await sb.from("payment_orders").update({ status: "paid", paid_at: nowIso, sepay_id: txId || null }).eq("id", o.id);

  // ── Gói Beeny theo ngày (pack): cộng bonus, hết hạn sau 24h ──
  if (o.kind === "pack") {
    const add = Number(o.beeny ?? 0);
    const { data: w } = await sb.from("user_credits").select("bonus_balance, bonus_expires_at").eq("user_id", o.user_id).limit(1);
    const cur = w?.[0];
    const curBonus = (cur?.bonus_expires_at && Date.parse(cur.bonus_expires_at) > Date.now()) ? Number(cur.bonus_balance ?? 0) : 0;
    const newBonus = curBonus + add;
    const bonusExp = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    if (cur) {
      await sb.from("user_credits").update({ bonus_balance: newBonus, bonus_expires_at: bonusExp, updated_at: nowIso }).eq("user_id", o.user_id);
    } else {
      await sb.from("user_credits").insert({ user_id: o.user_id, plan: "pro", balance: 0, bonus_balance: newBonus, bonus_expires_at: bonusExp, last_refill_date: todayVN });
    }
    await sb.from("credit_transactions").insert({
      user_id: o.user_id, delta: add, balance_after: newBonus, kind: "adjust",
      note: `Mua ${add} Beeny (hết hạn 24h) qua SePay (${o.amount}đ)`,
    });
    return json({ success: true, pack: add });
  }

  // ── Nâng/gia hạn gói: cộng dồn theo kỳ (30 ngày / 365 ngày) ──
  const plan = o.plan;
  const days = o.period === "year" ? 365 : 30;
  const { data: prof } = await sb.from("user_profiles").select("plan_expires_at").eq("user_id", o.user_id).limit(1);
  const curExp = prof?.[0]?.plan_expires_at ? Date.parse(prof[0].plan_expires_at) : 0;
  const base = Math.max(Date.now(), Number.isFinite(curExp) ? curExp : 0);
  const expires = new Date(base + days * 86400 * 1000).toISOString();

  await sb.from("user_profiles").update({ plan, plan_expires_at: expires }).eq("user_id", o.user_id);

  const cap = PLAN_CAP[plan] ?? 20;
  const { data: w } = await sb.from("user_credits").select("user_id").eq("user_id", o.user_id).limit(1);
  if (w?.length) {
    await sb.from("user_credits").update({ balance: cap, plan, last_refill_date: todayVN, updated_at: nowIso }).eq("user_id", o.user_id);
  } else {
    await sb.from("user_credits").insert({ user_id: o.user_id, plan, balance: cap, last_refill_date: todayVN });
  }
  await sb.from("credit_transactions").insert({
    user_id: o.user_id, delta: cap, balance_after: cap, kind: "adjust",
    note: `Nâng gói ${plan.toUpperCase()} ${o.period === "year" ? "1 năm" : "1 tháng"} qua SePay (${o.amount}đ)`,
  });

  return json({ success: true, upgraded: plan, days });
});
