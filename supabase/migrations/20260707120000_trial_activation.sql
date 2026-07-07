-- Trial model MỚI: mọi tài khoản đăng ký = FREE tier + có sẵn 1 lượt kích hoạt Pro 7 ngày
-- (pending_trial_grant=true) NHƯNG chưa kích hoạt. User tự bấm "Kích hoạt" trong Gói dịch vụ
-- (activate_pro_trial) → mới bắt đầu tính gói + đếm ngược 7 ngày → hết hạn về free. Chỉ 1 lần/TK.

-- 1) Signup trigger: KHÔNG auto-Pro nữa. Free + cờ trial khả dụng.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.user_profiles (user_id, email, full_name, plan, plan_expires_at, pending_trial_grant)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'free', null, true)
  on conflict (user_id) do nothing;

  insert into public.user_credits (user_id, plan, balance, last_refill_date)
  values (new.id, 'free', 10, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  on conflict (user_id) do nothing;

  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (new.id, 10, 10, 'signup', 'Tài khoản Free (có sẵn 1 lượt dùng thử Pro 7 ngày)');

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.watchlists (user_id, name, is_default) values (new.id, 'Watchlist chính', true) on conflict do nothing;
  return new;
end;
$$;

-- 2) RPC kích hoạt Pro trial (chỉ khi còn cờ + đang free). Trả {activated, days} hoặc {activated:false, reason}.
create or replace function public.activate_pro_trial()
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  pend boolean; cur_plan text; found_prof boolean;
begin
  if uid is null then return jsonb_build_object('activated', false, 'reason', 'unauth'); end if;

  select true, pending_trial_grant, coalesce(plan,'free')
    into found_prof, pend, cur_plan
  from public.user_profiles where user_id = uid;

  if not found_prof then
    -- Mồ côi: tạo profile + kích hoạt luôn
    insert into public.user_profiles (user_id, email, plan, plan_expires_at, pending_trial_grant)
    select uid, u.email, 'pro', now() + interval '7 days', false from auth.users u where u.id = uid
    on conflict (user_id) do update set plan='pro', plan_expires_at=now()+interval '7 days', pending_trial_grant=false;
  elsif coalesce(pend, false) and cur_plan = 'free' then
    update public.user_profiles
    set plan='pro', plan_expires_at = now() + interval '7 days', pending_trial_grant = false
    where user_id = uid;
  elsif not coalesce(pend, false) then
    return jsonb_build_object('activated', false, 'reason', 'used');   -- đã dùng lượt trial
  else
    -- có cờ nhưng đang có gói (pro/premium) → chỉ tắt cờ, coi như đã kích hoạt gói tốt hơn
    update public.user_profiles set pending_trial_grant = false where user_id = uid;
    return jsonb_build_object('activated', false, 'reason', 'has_plan');
  end if;

  -- Cấp quota Pro ngay (100/ngày)
  insert into public.user_credits (user_id, plan, balance, last_refill_date)
  values (uid, 'pro', 100, today)
  on conflict (user_id) do update
    set plan = 'pro',
        balance = greatest(public.user_credits.balance, 100),
        last_refill_date = today,
        updated_at = now();

  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (uid, 100, 100, 'trial', 'Kích hoạt Pro dùng thử 7 ngày');

  return jsonb_build_object('activated', true, 'plan', 'pro', 'days', 7);
end;
$$;
grant execute on function public.activate_pro_trial() to authenticated;

-- 3) Backfill: user free hiện có → bật cờ trial khả dụng.
update public.user_profiles
set pending_trial_grant = true
where coalesce(plan,'free') = 'free' and coalesce(pending_trial_grant, false) = false;

-- 4) Reset các user đang ở Pro do AUTO-trial cũ (KHÔNG có đơn thanh toán gói nào) → về free + mở lại lượt kích hoạt.
--    (User đã TRẢ TIỀN gói → giữ nguyên Pro/Premium.)
with auto_trial as (
  select p.user_id
  from public.user_profiles p
  where coalesce(p.plan,'free') = 'pro'
    and not exists (
      select 1 from public.payment_orders o
      where o.user_id = p.user_id and o.status = 'paid' and coalesce(o.kind,'plan') = 'plan'
    )
)
update public.user_profiles p
set plan = 'free', plan_expires_at = null, pending_trial_grant = true
from auto_trial a where p.user_id = a.user_id;

-- Reset ví các user vừa hạ về free (cap 10)
with auto_trial as (
  select user_id from public.user_profiles where coalesce(plan,'free') = 'free'
)
update public.user_credits c
set plan = 'free', balance = least(c.balance, 10)
from auto_trial a
where c.user_id = a.user_id and c.plan = 'pro';
