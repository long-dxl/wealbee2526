-- Add gross_profit, ebt, current_ratio to financials_annual
alter table financials_annual
  add column if not exists gross_profit numeric,
  add column if not exists ebt numeric,
  add column if not exists current_ratio numeric;

-- Add current_ratio to balance_sheet
alter table balance_sheet
  add column if not exists current_ratio numeric;
