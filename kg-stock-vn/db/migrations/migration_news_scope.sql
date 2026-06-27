-- ============================================================
-- migration_news_scope.sql
-- Bổ sung cột phân loại PHẠM VI tin + dọn tin trung lập/thủ tục.
-- Chạy SAU migration_news_table.sql.
-- ============================================================

-- scope: 'stock' (tin 1 DN cụ thể) | 'sector' (tin ngành) | 'macro' (tin vĩ mô)
alter table news_articles add column if not exists scope text default 'stock';

-- Index cho truy vấn tin ngành/vĩ mô tác động
create index if not exists idx_news_scope_pub on news_articles (scope, published_at desc);

-- ── DỌN DATABASE: loại tin TRUNG LẬP (MENTIONS) — chỉ giữ tin tác động +/- ──
delete from news_articles
 where sentiment is null
    or sentiment not in ('AFFECTS_POSITIVE', 'AFFECTS_NEGATIVE');

comment on column news_articles.scope is 'stock | sector | macro — phạm vi tác động của tin';
