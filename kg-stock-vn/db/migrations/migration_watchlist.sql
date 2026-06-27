-- ============================================================
-- migration_watchlist.sql
-- DANH SÁCH MÃ THEO DÕI (watchlist) — để mở rộng phạm vi crawl tin KHÔNG cần sửa code.
-- Pipeline tin đọc tập mã từ bảng này (fallback Top-10 nếu bảng trống/chưa tạo).
-- Thêm mã = INSERT 1 dòng; bật/tắt = cột active. Chạy 1 lần trên Supabase SQL Editor.
-- ============================================================

create table if not exists watchlist (
    ticker     text primary key,
    name       text,
    sector     text,
    active     boolean default true,         -- false = tạm ngừng crawl mã này
    priority   int default 100,              -- nhỏ = ưu tiên cao (mã trọng điểm)
    added_at   timestamptz default now()
);

create index if not exists idx_watchlist_active on watchlist (active) where active;

-- Seed Top-10 hiện tại (idempotent)
insert into watchlist (ticker, name, sector, priority) values
    ('HPG', 'Hòa Phát',        'Thép',          1),
    ('VHM', 'Vinhomes',        'Bất động sản',  1),
    ('VIC', 'Vingroup',        'Bất động sản',  1),
    ('VCB', 'Vietcombank',     'Ngân hàng',     1),
    ('TCB', 'Techcombank',     'Ngân hàng',     1),
    ('BID', 'BIDV',            'Ngân hàng',     1),
    ('MSN', 'Masan',           'Tiêu dùng',     1),
    ('VNM', 'Vinamilk',        'Tiêu dùng',     1),
    ('MWG', 'Thế Giới Di Động','Bán lẻ',        1),
    ('FPT', 'FPT',             'Công nghệ',     1)
on conflict (ticker) do nothing;

comment on table watchlist is 'Danh sách mã được crawl tin hàng ngày. Mở rộng = INSERT thêm dòng (không cần sửa code).';
