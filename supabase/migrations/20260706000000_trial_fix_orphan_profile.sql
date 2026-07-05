-- Fix: user không có dòng user_profiles (vd đăng ký lúc trigger chưa tạo profile) bị
-- bỏ sót trial. Làm claim_pro_trial ROBUST: thiếu profile → tự tạo + tặng Pro 7 ngày.

create or replace function public.claim_pro_trial()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  pend boolean;
  cur_plan text;
  do_grant boolean := false;
begin
  if uid is null then
    return jsonb_build_object('granted', false);
  end if;

  select pending_trial_grant, coalesce(plan, 'free') into pend, cur_plan
  from public.user_profiles where user_id = uid;

  if not found then
    -- Mồ côi (không có profile) → tạo profile + tặng trial
    insert into public.user_profiles (user_id, email, plan, plan_expires_at)
    select uid, u.email, 'pro', now() + interval '7 days' from auth.users u where u.id = uid
    on conflict (user_id) do update set plan = 'pro', plan_expires_at = now() + interval '7 days';
    do_grant := true;
  elsif coalesce(pend, false) and cur_plan = 'free' then
    update public.user_profiles
    set plan = 'pro', plan_expires_at = now() + interval '7 days', pending_trial_grant = false
    where user_id = uid;
    do_grant := true;
  elsif coalesce(pend, false) then
    -- Có cờ nhưng đang có gói → chỉ tắt cờ, không tặng
    update public.user_profiles set pending_trial_grant = false where user_id = uid;
  end if;

  if not do_grant then
    return jsonb_build_object('granted', false);
  end if;

  insert into public.user_credits (user_id, plan, balance, last_refill_date)
  values (uid, 'pro', 150, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  on conflict (user_id) do update
    set plan = 'pro',
        balance = greatest(public.user_credits.balance, 150),
        last_refill_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date,
        updated_at = now();

  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (uid, 150, 150, 'signup', 'Tặng Pro dùng thử 7 ngày');

  return jsonb_build_object('granted', true, 'plan', 'pro', 'days', 7);
end;
$$;
