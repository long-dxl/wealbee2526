-- ============================================================================
-- Analyst Agent data model: line-items chuẩn hóa + ratio dẫn xuất
-- Long-form, đa loại hình (normal | bank | securities | insurance)
-- ============================================================================

-- 0. Phân loại loại hình DN
alter table tickers
  add column if not exists company_type text;   -- normal | bank | securities | insurance
comment on column tickers.company_type is 'normal | bank | securities | insurance';

-- 1. Line-items chuẩn hóa (long-form) — IS / BS / CF / NOTE
create table if not exists financial_statements (
  id            bigserial primary key,
  symbol        text not null,
  company_type  text not null,
  statement     text not null,            -- IS | BS | CF | NOTE
  period        text not null,            -- "2025" (FY) hoặc "Q4/2025"
  period_type   text not null,            -- FY | QUARTER
  item_code     text not null,            -- mã chuẩn hóa, vd IS_REVENUE
  item_label_vi text,                     -- nhãn gốc tiếng Việt (truy vết)
  value         numeric,                  -- VND
  is_derived    boolean default false,    -- true nếu tính ra (vd IS_OPERATING_PROFIT)
  created_at    timestamptz default now(),
  unique (symbol, statement, period, item_code)
);
create index if not exists idx_fs_symbol_period on financial_statements (symbol, period_type, period);
create index if not exists idx_fs_code on financial_statements (item_code);

-- 2. Ratio dẫn xuất (long-form)
create table if not exists financial_ratios (
  id              bigserial primary key,
  symbol          text not null,
  company_type    text not null,
  period          text not null,          -- "2025" hoặc "Q4/2025"
  period_type     text not null,          -- FY | QUARTER | TTM
  ratio_code      text not null,          -- vd ROE, NIM, NPL, CURRENT_RATIO
  value           numeric,
  unit            text,                   -- pct | x | vnd
  formula_version text default 'v1',
  na_reason       text,                   -- not_applicable | missing_data | NULL
  created_at      timestamptz default now(),
  unique (symbol, period, ratio_code)
);
create index if not exists idx_fr_symbol_period on financial_ratios (symbol, period_type, period);
create index if not exists idx_fr_code on financial_ratios (ratio_code);

-- 3. RLS: public read (đồng bộ các bảng tài chính khác)
alter table financial_statements enable row level security;
alter table financial_ratios enable row level security;
create policy "fs_public_read"  on financial_statements for select using (true);
create policy "fr_public_read"  on financial_ratios     for select using (true);
