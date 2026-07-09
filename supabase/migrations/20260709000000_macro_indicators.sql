-- Chỉ số vĩ mô toàn cầu (nguồn FREE: Yahoo Finance) — cron seed_macro.py kéo hằng ngày.
-- Dùng cho tool "Vĩ mô" của agent + dashboard. VN-Index/HNX đọc từ market_indices (KHÔNG lặp ở đây).
create table if not exists public.macro_indicators (
  code       text primary key,   -- usdvnd | dxy | us10y | brent | gold | sp500 | vix
  name       text not null,
  value      numeric,
  unit       text,
  day_pct    numeric,            -- %thay đổi phiên gần nhất
  ytd_pct    numeric,            -- so đầu năm
  yoy_pct    numeric,            -- so ~1 năm trước
  as_of      date,
  source     text default 'Yahoo Finance',
  updated_at timestamptz not null default now()
);
alter table public.macro_indicators enable row level security;
drop policy if exists "macro read anon" on public.macro_indicators;
create policy "macro read anon" on public.macro_indicators for select using (true);  -- dashboard đọc công khai
