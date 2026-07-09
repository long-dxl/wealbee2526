-- Thanh toán QR (VietQR/MB) + auto-upgrade gói qua webhook SePay.
-- Mỗi đơn có mã nội dung CK riêng (memo) để webhook khớp tiền vào → nâng gói.

alter table public.user_profiles add column if not exists plan_expires_at timestamptz;

create table if not exists public.payment_orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan        text not null,                     -- pro | premium
  amount      integer not null,                  -- VND
  memo        text not null unique,              -- mã nội dung CK: WBExxxxxx
  status      text not null default 'pending',   -- pending | paid | expired
  sepay_id    text,                              -- id giao dịch SePay (chống trùng)
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);
create index if not exists payment_orders_memo_idx on public.payment_orders (memo);

alter table public.payment_orders enable row level security;

-- User chỉ ĐỌC đơn của mình; TẠO/CẬP NHẬT đơn chỉ qua service role (edge function).
drop policy if exists payment_orders_own_read on public.payment_orders;
create policy payment_orders_own_read on public.payment_orders
  for select using (auth.uid() = user_id);
