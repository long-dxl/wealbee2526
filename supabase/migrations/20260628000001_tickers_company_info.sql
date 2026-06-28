-- Thông tin doanh nghiệp bổ sung cho tickers (từ vnstock + parse company_context)
alter table tickers
  add column if not exists founded_year   smallint,   -- năm thành lập (parse từ company_context)
  add column if not exists listing_date    date,        -- ngày niêm yết (vnstock)
  add column if not exists market_cap       numeric,     -- vốn hóa (vnstock, VND)
  add column if not exists info_updated_at  timestamptz;
