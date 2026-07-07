-- ============================================================================
-- P2 — Toàn vẹn & tối ưu truy vấn cho tầng Analyst (financial_statements/ratios)
--   1. period_end (date) dẫn xuất từ `period` text  → sort/range đúng ở DB
--      (bỏ bẫy sort chuỗi "Q4/2025" > "Q1/2026"), index theo thời gian.
--   2. CHECK constraint cho unit / period_type / statement / na_reason
--      → chặn dữ liệu sai đơn vị ngay tại DB (ETL kỷ luật là chưa đủ).
-- Áp qua Supabase SQL Editor (DDL không chạy qua REST/CLI khi token hết hạn).
-- ============================================================================

-- 1. period_end ------------------------------------------------------------
alter table financial_statements add column if not exists period_end date;
alter table financial_ratios     add column if not exists period_end date;

-- Backfill: FY "2025"→2025-12-31; QUARTER "Qn/2025"→cuối quý; CURRENT "2026-07-04"→date.
create or replace function _period_to_end(period text, period_type text)
returns date language sql immutable as $$
  select case
    when period_type = 'FY'      then make_date(period::int, 12, 31)
    when period_type = 'CURRENT' then period::date
    when period_type = 'TTM'     then period::date
    when period_type = 'QUARTER' then case substring(period, 2, 1)
        when '1' then make_date(split_part(period, '/', 2)::int, 3, 31)
        when '2' then make_date(split_part(period, '/', 2)::int, 6, 30)
        when '3' then make_date(split_part(period, '/', 2)::int, 9, 30)
        when '4' then make_date(split_part(period, '/', 2)::int, 12, 31)
      end
  end
$$;

update financial_statements set period_end = _period_to_end(period, period_type) where period_end is null;
update financial_ratios     set period_end = _period_to_end(period, period_type) where period_end is null;

create index if not exists idx_fs_symbol_periodend on financial_statements (symbol, period_type, period_end desc);
create index if not exists idx_fr_symbol_periodend on financial_ratios     (symbol, period_type, period_end desc);

-- 2. CHECK constraints -----------------------------------------------------
-- (drop-if-exists rồi add để migration chạy lại được)
do $$ begin
  alter table financial_statements drop constraint if exists chk_fs_statement;
  alter table financial_statements drop constraint if exists chk_fs_period_type;
  alter table financial_ratios     drop constraint if exists chk_fr_unit;
  alter table financial_ratios     drop constraint if exists chk_fr_period_type;
  alter table financial_ratios     drop constraint if exists chk_fr_na_reason;
end $$;

alter table financial_statements
  add constraint chk_fs_statement   check (statement in ('IS','BS','CF','NOTE')),
  add constraint chk_fs_period_type check (period_type in ('FY','QUARTER'));

alter table financial_ratios
  add constraint chk_fr_unit        check (unit is null or unit in ('pct','x','vnd','share')),
  add constraint chk_fr_period_type check (period_type in ('FY','QUARTER','CURRENT','TTM')),
  add constraint chk_fr_na_reason   check (
    na_reason is null or na_reason in
    ('negative_base','non_positive_revenue','negative_equity','revenue_not_representative','outlier_small_denominator','data_anomaly','missing_data','not_applicable')
  );

-- Ghi chú: giá trị bị gắn cờ (mẫu số ≤0 / DT không đại diện) lưu value=NULL + na_reason,
-- KHÔNG lưu số rác. Consumer nên hiển thị "n/a (<lý do>)".
