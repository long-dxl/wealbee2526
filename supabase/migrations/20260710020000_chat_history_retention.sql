-- Tự động dọn lịch sử chat (Action Hub) cũ hơn 30 ngày để giải phóng DB.
-- Panel "Lịch sử chat" trên frontend chỉ hiển thị chat_sessions trong 30 ngày
-- gần nhất (lọc theo updated_at ở phía client) — job này đảm bảo dữ liệu quá
-- hạn cũng KHÔNG còn tồn tại trong DB, không chỉ ẩn khỏi UI.
--
-- Xoá theo updated_at (không phải created_at): một hội thoại vẫn đang được
-- tiếp tục trong 30 ngày qua sẽ không bị xoá dù được TẠO từ lâu hơn.
-- chat_messages tự động bị xoá theo do session_id có ON DELETE CASCADE
-- (xem 20260525000000_platform_tables.sql).
--
-- YÊU CẦU: extension pg_cron phải được bật thủ công qua Supabase Dashboard
-- → Database → Extensions → bật "pg_cron" TRƯỚC KHI chạy migration này.
-- (Dòng CREATE EXTENSION IF NOT EXISTS "pg_cron" ở 20260525000000_platform_
-- tables.sql không đủ để tạo ra schema `cron` trên project này — verify
-- thực tế 2026-07-10: chạy cron.schedule() trực tiếp báo lỗi "3F000: schema
-- cron does not exist" dù dòng CREATE EXTENSION đó không hề báo lỗi khi áp.)

create or replace function public.purge_old_chat_history()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.chat_sessions
  where updated_at < now() - interval '30 days';
$$;

-- cron.schedule(job_name, ...) là idempotent — chạy lại migration sẽ cập nhật
-- job cùng tên thay vì báo lỗi trùng.
select cron.schedule(
  'purge-chat-history-30d',
  '0 20 * * *', -- 20:00 UTC = 03:00 sáng giờ VN (UTC+7), giờ thấp điểm
  $$ select public.purge_old_chat_history(); $$
);
