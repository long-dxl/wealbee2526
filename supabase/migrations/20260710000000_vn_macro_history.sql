-- Lịch sử vĩ mô VN theo NĂM từ World Bank API (free, không key, chính chủ, ổn định).
-- Tách khỏi vn_macro (= số MỚI NHẤT theo quý/tháng trích từ tin): bảng này = NỀN lịch sử/năm.
-- seed_worldbank_macro.py upsert (code, year). macro.ts đọc để hiện xu hướng đáng tin.
create table if not exists public.vn_macro_history (
  code       text not null,      -- gdp_growth | cpi | fdi | current_account | gdp_usd | unemployment | lending_rate
  year       int  not null,
  name       text,
  value      numeric,
  unit       text,
  source     text default 'World Bank',
  updated_at timestamptz not null default now(),
  primary key (code, year)
);
alter table public.vn_macro_history enable row level security;
drop policy if exists "vn_macro_history read anon" on public.vn_macro_history;
create policy "vn_macro_history read anon" on public.vn_macro_history for select using (true);
