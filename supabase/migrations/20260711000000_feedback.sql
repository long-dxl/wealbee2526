-- Bảng "feedback" đã tồn tại sẵn trên DB (tạo tay ngoài migration, phục vụ trang landing
-- /feedback cũ — xem memory supabase-db-audit-2026-07: 0 dòng vì /api/save-feedback chưa
-- từng tồn tại nên không submit nào thành công). Schema cũ (name/subject, không có user_id)
-- khác hẳn schema mới cho feedback trong app (đăng nhập). Đổi tên bảng cũ sang
-- feedback_legacy_landing để giữ lại (phòng khi có dữ liệu) thay vì DROP thẳng.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'feedback'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'user_id'
  ) then
    execute 'alter table public.feedback rename to feedback_legacy_landing';
  end if;
end $$;

-- Bảng feedback: người dùng gửi từ nút Feedback trong sidebar app (không phải trang landing).
-- attachments lưu tối đa 3 ảnh/feedback (ràng buộc ở phía client), mỗi ảnh <=10MB (ràng buộc ở bucket).
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  user_email   text not null,
  user_name    text not null,
  type         text not null check (type in ('bug', 'feature', 'experience', 'other')),
  message      text not null,
  rating       smallint check (rating between 1 and 5),
  attachments  jsonb not null default '[]', -- [{ path, name, size }]
  page_url     text,
  status       text not null default 'new' check (status in ('new', 'in_review', 'resolved')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- public.set_updated_at() đã được tạo ở migration 20260423000000_create_subscribers.sql
create or replace trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;

drop policy if exists "service_role full access" on public.feedback;
create policy "service_role full access"
  on public.feedback
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "users insert own feedback" on public.feedback;
create policy "users insert own feedback"
  on public.feedback
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users read own feedback" on public.feedback;
create policy "users read own feedback"
  on public.feedback
  for select
  to authenticated
  using (user_id = auth.uid());

-- Storage bucket cho ảnh đính kèm feedback (private, 10MB/ảnh, chỉ ảnh)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments', 'feedback-attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "users upload own feedback attachments" on storage.objects;
create policy "users upload own feedback attachments"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'feedback-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users read own feedback attachments" on storage.objects;
create policy "users read own feedback attachments"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'feedback-attachments' and auth.uid()::text = (storage.foldername(name))[1]);
