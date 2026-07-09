-- Cache giá hàng hóa NO-FEED (tra Brave web_search) dùng CHUNG mọi user → Brave query theo
-- commodity × thời gian (không theo user × run). TTL ~12h ở tầng ứng dụng (value-chain.ts).
create table if not exists public.commodity_cache (
  commodity_id text primary key,      -- id trong COMMODITY (vd GIA_THAN_COC, GIA_THEP_XD)
  snippet      text,
  url          text,
  domain       text,
  fetched_at   timestamptz not null default now()
);
alter table public.commodity_cache enable row level security;
-- Không cần policy: chỉ edge (service_role) đọc/ghi; frontend không truy cập.
