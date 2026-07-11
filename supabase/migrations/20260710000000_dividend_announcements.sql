-- Bảng riêng cho cổ tức MỚI CÔNG BỐ Ý ĐỊNH (chưa chốt ngày GDKHQ chính thức)
-- — tách biệt khỏi `dividends` (chỉ chứa lịch đã CHỐT) để không lẫn ngày công
-- bố với ngày GDKHQ thật trong cùng 1 cột.
--
-- Vòng đời: khi VCI cập nhật exrightDate thật cho sự kiện này, seed_financials.py
-- sẽ (1) ghi dòng CHÍNH THỨC vào `dividends` như bình thường, và (2) TỰ XÓA
-- dòng tương ứng ở bảng này (không còn "chưa chốt" nữa) — nhờ vậy giao diện
-- tự động chuyển từ hiển thị "Dự kiến" sang ngày GDKHQ thật mà không cần can
-- thiệp tay.

create table if not exists dividend_announcements (
  id              bigserial primary key,
  symbol          text not null references tickers(symbol) on delete cascade,
  dividend_type   text not null,  -- cash | stock | rights
  amount          numeric(10, 4) not null,
  announced_date  date not null,  -- ngày công bố ý định (KHÔNG phải GDKHQ)
  created_at      timestamptz default now(),
  unique (symbol, dividend_type, amount)
);

alter table dividend_announcements enable row level security;
do $$ begin
  create policy "anon can read dividend_announcements" on dividend_announcements for select using (true);
exception when duplicate_object then null; end $$;
