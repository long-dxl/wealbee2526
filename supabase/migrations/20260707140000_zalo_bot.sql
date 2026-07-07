-- Zalo Bot Platform: liên kết tài khoản Wealbee ↔ Zalo chat_id + kênh đẩy thông báo.
-- Không có event follow/start → user gửi MÃ (zalo_gen_code) cho bot → webhook khớp mã → liên kết.

create table if not exists public.zalo_links (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  chat_id       text not null unique,
  display_name  text,
  linked_at     timestamptz not null default now(),
  notify_digest boolean not null default true,   -- nhận digest hằng ngày
  notify_alert  boolean not null default true    -- nhận cảnh báo giá/tin
);
create index if not exists zalo_links_chat_id_idx on public.zalo_links(chat_id);

create table if not exists public.zalo_link_codes (
  code        text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists zalo_link_codes_user_idx on public.zalo_link_codes(user_id);

alter table public.zalo_links      enable row level security;
alter table public.zalo_link_codes enable row level security;

drop policy if exists "own zalo_links"  on public.zalo_links;
drop policy if exists "own zalo_codes"  on public.zalo_link_codes;
create policy "own zalo_links" on public.zalo_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own zalo_codes" on public.zalo_link_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sinh mã liên kết 6 ký tự (mỗi user 1 mã còn hiệu lực, hết hạn 15 phút).
create or replace function public.zalo_gen_code()
returns text language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid := auth.uid(); c text;
begin
  if uid is null then raise exception 'unauth'; end if;
  delete from public.zalo_link_codes where user_id = uid;
  loop
    c := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.zalo_link_codes where code = c);
  end loop;
  insert into public.zalo_link_codes (code, user_id, expires_at)
  values (c, uid, now() + interval '15 minutes');
  return c;
end;
$$;
grant execute on function public.zalo_gen_code() to authenticated;
