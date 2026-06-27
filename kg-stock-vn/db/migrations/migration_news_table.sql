-- ============================================================
-- migration_news_table.sql
-- Bảng tin tức RIÊNG (denormalized + gán nhãn) — đường ĐỌC NHANH cho Agent.
-- Tách khỏi graph_nodes/edges (KG) để: (1) truy vấn 1 query có index thay vì crawl live,
-- (2) lưu được MỌI mã (không giới hạn Top-10 như KG), (3) gán nhãn chủ đề để lọc.
-- Chạy 1 lần trên Supabase SQL Editor.
-- ============================================================

create table if not exists news_articles (
    id           bigint generated always as identity primary key,
    url          text not null unique,          -- chống trùng theo URL
    title        text not null,
    source       text default 'Vietstock',
    ticker       text,                           -- mã chính (NHÃN) — index
    sector       text,                           -- ngành (NHÃN)
    published_at timestamptz,                    -- ngày đăng — sort/filter nhanh
    sentiment    text,                           -- AFFECTS_POSITIVE / AFFECTS_NEGATIVE / MENTIONS
    confidence   real,
    ai_reason    text,                           -- diễn giải AI (KHÔNG phải dữ kiện gốc)
    tags         text[] default '{}',            -- nhãn chủ đề: cổ tức, nợ xấu, margin, M&A...
    close_price  real,
    pct_change   real,
    content_hash text,
    crawled_at   timestamptz default now()
);

-- Index phục vụ truy vấn của Agent: theo MÃ + mới nhất
create index if not exists idx_news_ticker_pub on news_articles (ticker, published_at desc);
-- Theo NGÀNH + mới nhất (câu hỏi cấp ngành)
create index if not exists idx_news_sector_pub on news_articles (sector, published_at desc);
-- Mới nhất toàn thị trường
create index if not exists idx_news_pub        on news_articles (published_at desc);
-- Lọc theo NHÃN chủ đề
create index if not exists idx_news_tags       on news_articles using gin (tags);

-- Quyền đọc cho anon/service (RLS để mặc định, service key bỏ qua RLS).
-- Nếu bật RLS, thêm policy đọc:
-- alter table news_articles enable row level security;
-- create policy "news read" on news_articles for select using (true);

comment on table news_articles is 'Tin tức Vietstock denormalized + gán nhãn, đường đọc nhanh cho AI Agent (cập nhật hàng ngày qua scheduler).';
