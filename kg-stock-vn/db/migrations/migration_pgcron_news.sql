-- ============================================================
-- migration_pgcron_news.sql
-- Lịch chạy Edge Function `sync-news` bằng pg_cron + pg_net (CHẠY TRÊN CLOUD, always-on).
-- Thay cho launchd trên laptop → tin LUÔN tươi kể cả khi máy tắt.
-- Chạy 1 lần trên Supabase SQL Editor (sau khi đã deploy Edge Function).
-- ============================================================

-- 1) Bật extension (Supabase: Dashboard → Database → Extensions, hoặc SQL):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Lưu service key vào Vault (để gọi Edge Function có quyền). Thay <SERVICE_KEY>:
--    (Hoặc dùng anon key nếu Edge Function deploy --no-verify-jwt)
-- select vault.create_secret('<SERVICE_KEY>', 'edge_service_key');

-- 3) Lịch: chạy 4 LẦN/NGÀY — mỗi 6 tiếng lúc phút :05
--    (00:05 / 06:05 / 12:05 / 18:05 UTC = 07:05 / 13:05 / 19:05 / 01:05 giờ VN).
--    Cửa sổ giữa 2 lượt chỉ 6 tiếng → 20 trang feed đủ phủ, không sót tin.
select cron.schedule(
  'sync-news-6h',
  '5 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://dyivojxybikidbxmgiwz.supabase.co/functions/v1/sync-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Xem lịch đã đặt:           select * from cron.job;
-- Xem lịch sử chạy:          select * from cron.job_run_details order by start_time desc limit 20;
-- Gỡ lịch:                   select cron.unschedule('sync-news-6h');
