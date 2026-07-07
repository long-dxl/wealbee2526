-- Model ví mới: RESET mỗi ngày (0h VN) về đúng daily quota (free 10, pro 100, premium 250),
-- KHÔNG cộng dồn/cap. sync_wallet() cho frontend gọi khi mở app → reset + hạ gói hết hạn.

-- 1) RPC frontend gọi khi load: đồng bộ gói (hết hạn→free), reset ngày mới, trả balance.
create or replace function public.sync_wallet()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  prof record;
  wal record;
  eff_plan text;
  daily numeric;
  days_left int;
begin
  if uid is null then return jsonb_build_object('plan','free','balance',0,'days_left',null); end if;

  select coalesce(plan,'free') as plan, plan_expires_at into prof
  from public.user_profiles where user_id = uid;

  eff_plan := coalesce(prof.plan, 'free');
  days_left := null;
  if eff_plan <> 'free' and prof.plan_expires_at is not null then
    if prof.plan_expires_at < now() then
      eff_plan := 'free';
      update public.user_profiles set plan='free', plan_expires_at=null where user_id=uid;
    else
      days_left := ceil(extract(epoch from (prof.plan_expires_at - now())) / 86400.0);
    end if;
  end if;

  daily := case eff_plan when 'pro' then 100 when 'premium' then 250 else 10 end;

  select * into wal from public.user_credits where user_id = uid;
  if not found then
    insert into public.user_credits (user_id, plan, balance, last_refill_date)
    values (uid, eff_plan, daily, today);
    return jsonb_build_object('plan', eff_plan, 'balance', daily, 'days_left', days_left);
  end if;

  if wal.last_refill_date is distinct from today then
    -- Sang ngày mới → RESET về daily quota
    update public.user_credits
    set balance = daily, plan = eff_plan, last_refill_date = today, updated_at = now()
    where user_id = uid;
    return jsonb_build_object('plan', eff_plan, 'balance', daily, 'days_left', days_left);
  end if;

  -- Cùng ngày: giữ balance, chỉ đồng bộ plan nếu đổi
  if wal.plan is distinct from eff_plan then
    update public.user_credits set plan = eff_plan where user_id = uid;
  end if;
  return jsonb_build_object('plan', eff_plan, 'balance', wal.balance, 'days_left', days_left);
end;
$$;
grant execute on function public.sync_wallet() to authenticated;

-- 2) Signup trigger: tặng Pro trial = daily quota 100 (không phải 150)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.user_profiles (user_id, email, full_name, plan, plan_expires_at)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'pro', now() + interval '7 days')
  on conflict (user_id) do nothing;

  insert into public.user_credits (user_id, plan, balance, last_refill_date)
  values (new.id, 'pro', 100, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  on conflict (user_id) do nothing;

  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (new.id, 100, 100, 'signup', 'Tặng Pro dùng thử 7 ngày khi đăng ký');

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.watchlists (user_id, name, is_default) values (new.id, 'Watchlist chính', true) on conflict do nothing;
  return new;
end;
$$;

-- 3) claim_pro_trial: cấp balance = 100 (thay 150)
create or replace function public.claim_pro_trial()
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare uid uuid := auth.uid(); pend boolean; cur_plan text; do_grant boolean := false;
begin
  if uid is null then return jsonb_build_object('granted', false); end if;
  select pending_trial_grant, coalesce(plan,'free') into pend, cur_plan from public.user_profiles where user_id = uid;
  if not found then
    insert into public.user_profiles (user_id, email, plan, plan_expires_at)
    select uid, u.email, 'pro', now() + interval '7 days' from auth.users u where u.id = uid
    on conflict (user_id) do update set plan='pro', plan_expires_at=now()+interval '7 days';
    do_grant := true;
  elsif coalesce(pend,false) and cur_plan = 'free' then
    update public.user_profiles set plan='pro', plan_expires_at=now()+interval '7 days', pending_trial_grant=false where user_id = uid;
    do_grant := true;
  elsif coalesce(pend,false) then
    update public.user_profiles set pending_trial_grant=false where user_id = uid;
  end if;
  if not do_grant then return jsonb_build_object('granted', false); end if;
  insert into public.user_credits (user_id, plan, balance, last_refill_date)
  values (uid, 'pro', 100, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  on conflict (user_id) do update set plan='pro', balance=greatest(public.user_credits.balance,100),
    last_refill_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date, updated_at=now();
  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (uid, 100, 100, 'signup', 'Tặng Pro dùng thử 7 ngày');
  return jsonb_build_object('granted', true, 'plan','pro','days',7);
end;
$$;
