-- Chỉ số VĨ MÔ VIỆT NAM dạng SỐ (GDP/CPI/lãi suất/tín dụng/PMI/thương mại/FDI).
-- Không có API free sạch → trích từ tin đã crawl (market_news) bằng LLM (seed_vn_macro.py),
-- LƯU snippet + link nguồn để verify. Cron hằng ngày. macro tool đọc bảng này.
create table if not exists public.vn_macro (
  code         text primary key,   -- gdp | cpi | policy_rate | interbank_rate | credit_growth | pmi | trade_balance | fdi
  name         text not null,
  value        numeric,
  unit         text,               -- % | điểm | tỷ USD
  period       text,               -- 'Q2/2026' | 'Tháng 6/2026' | 'YTD 2026'...
  note         text,               -- ngắn: chiều/bối cảnh
  source_title text,
  source_url   text,
  as_of        date,
  updated_at   timestamptz not null default now()
);
alter table public.vn_macro enable row level security;
drop policy if exists "vn_macro read anon" on public.vn_macro;
create policy "vn_macro read anon" on public.vn_macro for select using (true);
