-- Demo-request → admin approve → cấp tài khoản flow.
-- Bảng demo_requests đã tồn tại (id, created_at, email, ho_ten, dien_thoai,
-- cong_ty, loai_nha_dau_tu, loi_nhan). Chỉ BỔ SUNG cột trạng thái duyệt,
-- không phá dữ liệu sẵn có.

alter table public.demo_requests
  add column if not exists status      text not null default 'pending',  -- pending | approved | rejected
  add column if not exists reviewed_at timestamptz,
  add column if not exists user_id     uuid references auth.users(id) on delete set null;

create index if not exists demo_requests_status_idx on public.demo_requests (status);
create index if not exists demo_requests_email_idx  on public.demo_requests (lower(email));

-- RLS: bảng chỉ được thao tác qua Edge Function (service_role bypass RLS).
-- Không mở quyền cho anon/authenticated → lead không bị lộ.
alter table public.demo_requests enable row level security;
