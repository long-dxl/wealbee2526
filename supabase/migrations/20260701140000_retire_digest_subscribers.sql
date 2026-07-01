-- Loại bỏ hệ thống "bản tin qua digest_subscribers" — một pipeline email chạy ngầm
-- (toolcrawldata/email_notifier.py, cron GitHub Actions) hoàn toàn tách biệt khỏi
-- Agent Studio, trùng chức năng với Agent mẫu "Bản tin buổi sáng" mà user tự bật/tắt
-- được. Từ nay CHỈ CÒN 1 nơi lo "tin theo mã cổ phiếu" là Agent Studio.
--
-- Trước khi xoá bảng: chuyển toàn bộ email đã thu thập sang demo_requests (trạng thái
-- 'pending', y như vừa gửi yêu cầu demo) để không mất lead, rồi mới drop bảng cũ —
-- gộp về DUY NHẤT 1 bảng tổng hợp email trên toàn nền tảng.

insert into public.demo_requests (email, ho_ten, loi_nhan, status, created_at, user_id)
select
  ds.email,
  '(Chưa cung cấp — chuyển từ digest_subscribers)',
  'Tự động chuyển từ hệ thống "bản tin qua email" đã ngừng hoạt động (digest_subscribers), ngày '
    || to_char(now(), 'DD/MM/YYYY') || '. '
    || case when array_length(ds.watch_symbols, 1) > 0
            then 'Mã cổ phiếu quan tâm trước đây: ' || array_to_string(ds.watch_symbols, ', ') || '.'
            else 'Không có mã cổ phiếu quan tâm.'
       end,
  'pending',
  coalesce(ds.created_at, now()),
  ds.user_id
from public.digest_subscribers ds
where not exists (
  select 1 from public.demo_requests dr where lower(dr.email) = lower(ds.email)
);

drop table public.digest_subscribers;
