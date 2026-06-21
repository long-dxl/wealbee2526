-- Balance sheet table (quarterly data from Simplize)
create table if not exists balance_sheet (
  id bigserial primary key,
  symbol text not null,
  period text not null,         -- e.g. "Q4/2025", "Q1/2026"
  period_date date not null,    -- e.g. 2025-12-31
  total_assets numeric,
  cash numeric,
  total_debt numeric,           -- total liabilities (nợ phải trả)
  equity numeric,               -- total equity incl. minority interest
  created_at timestamptz default now(),
  unique (symbol, period)
);

-- Cash flow table (quarterly data from Simplize)
create table if not exists cash_flow_statement (
  id bigserial primary key,
  symbol text not null,
  period text not null,
  period_date date not null,
  operating_cf numeric,
  capex numeric,                -- chi mua sắm TSCĐ (negative = outflow)
  fcf numeric,                  -- operating_cf + capex
  net_cash_change numeric,
  created_at timestamptz default now(),
  unique (symbol, period)
);

-- Enable RLS
alter table balance_sheet enable row level security;
alter table cash_flow_statement enable row level security;

-- Public read access (same as other financial tables)
create policy "balance_sheet_public_read" on balance_sheet for select using (true);
create policy "cash_flow_public_read" on cash_flow_statement for select using (true);
