-- Gói Beeny theo ngày (hết hạn 24h) + thanh toán theo năm.
-- bonus_balance: Beeny mua thêm, hết hạn bonus_expires_at (24h). Tiêu TRƯỚC balance ngày.

alter table public.payment_orders
  add column if not exists kind   text not null default 'plan',   -- 'plan' | 'pack'
  add column if not exists period text,                            -- 'month' | 'year' (plan)
  add column if not exists beeny  numeric;                         -- Beeny (pack)

alter table public.user_credits
  add column if not exists bonus_balance    numeric not null default 0,
  add column if not exists bonus_expires_at timestamptz;

-- sync_wallet: reset ngày + dọn bonus hết hạn + trả về balance/bonus/total.
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
  bonus numeric := 0;
  bonus_exp timestamptz;
begin
  if uid is null then return jsonb_build_object('plan','free','balance',0,'bonus',0,'total',0,'days_left',null,'bonus_expires_at',null); end if;

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
    return jsonb_build_object('plan',eff_plan,'balance',daily,'bonus',0,'total',daily,'days_left',days_left,'bonus_expires_at',null);
  end if;

  -- Reset balance ngày mới
  if wal.last_refill_date is distinct from today then
    update public.user_credits set balance = daily, plan = eff_plan, last_refill_date = today, updated_at = now()
    where user_id = uid;
    wal.balance := daily;
  elsif wal.plan is distinct from eff_plan then
    update public.user_credits set plan = eff_plan where user_id = uid;
  end if;

  -- Dọn bonus hết hạn
  bonus := coalesce(wal.bonus_balance, 0);
  bonus_exp := wal.bonus_expires_at;
  if bonus_exp is not null and bonus_exp < now() then
    bonus := 0; bonus_exp := null;
    update public.user_credits set bonus_balance = 0, bonus_expires_at = null where user_id = uid;
  end if;

  return jsonb_build_object(
    'plan', eff_plan, 'balance', wal.balance, 'bonus', bonus,
    'total', wal.balance + bonus, 'days_left', days_left, 'bonus_expires_at', bonus_exp);
end;
$$;
grant execute on function public.sync_wallet() to authenticated;
