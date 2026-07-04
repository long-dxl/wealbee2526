-- Hệ thống credit (thu phí theo lượt gọi AI, trừ theo token thật).
-- 1 credit = 40đ giá trị API. Gói: free (refill 10/ngày, trần 20) ·
-- pro 199k (100/ngày, trần 150, 3.000/tháng) · premium 499k (250/ngày, trần 500, 7.500/tháng).
-- Refill kiểu LAZY: lần chạm ví đầu tiên mỗi ngày (giờ VN) tự cộng, chặn ở trần.
-- Ghi ví CHỈ qua service role (brain); user chỉ đọc ví/giao dịch của mình.

create table if not exists public.user_credits (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  plan             text not null default 'free',          -- free | pro | premium
  balance          numeric not null default 0,
  last_refill_date date,
  updated_at       timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id            bigserial primary key,
  user_id       uuid not null,
  delta         numeric not null,            -- âm = trừ, dương = refill/tặng
  balance_after numeric not null,
  kind          text not null,               -- signup | refill | deduct | adjust
  tokens_in     integer,
  tokens_out    integer,
  cost_vnd      numeric,
  note          text,                        -- endpoint / agent / mô tả
  created_at    timestamptz not null default now()
);
create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);

alter table public.user_credits enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists user_credits_own_read on public.user_credits;
create policy user_credits_own_read on public.user_credits
  for select using (auth.uid() = user_id);

drop policy if exists credit_tx_own_read on public.credit_transactions;
create policy credit_tx_own_read on public.credit_transactions
  for select using (auth.uid() = user_id);
