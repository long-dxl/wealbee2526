-- Tặng Pro trial 7 ngày cho user FREE hiện tại — nhận khi ĐĂNG NHẬP lần tới (7 ngày
-- tính từ lúc nhận, không lãng phí). Cờ pending_trial_grant + hàm claim_pro_trial().

alter table public.user_profiles add column if not exists pending_trial_grant boolean not null default false;

-- Đánh dấu user free hiện tại đủ điều kiện (user mới đã có Pro trial qua trigger nên không dính)
update public.user_profiles
set pending_trial_grant = true
where (plan is null or plan = 'free') and plan_expires_at is null;

-- User tự "nhận" trial khi đăng nhập (chạy dưới quyền chủ tài khoản qua auth.uid()).
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
begin
  if uid is null then
    return jsonb_build_object('granted', false);
  end if;

  select pending_trial_grant, coalesce(plan, 'free') into pend, cur_plan
  from public.user_profiles where user_id = uid;

  if not coalesce(pend, false) then
    return jsonb_build_object('granted', false);
  end if;

  -- Chỉ tặng khi đang free (không đè lên gói đang có)
  if cur_plan <> 'free' then
    update public.user_profiles set pending_trial_grant = false where user_id = uid;
    return jsonb_build_object('granted', false);
  end if;

  update public.user_profiles
  set plan = 'pro', plan_expires_at = now() + interval '7 days', pending_trial_grant = false
  where user_id = uid;

  insert into public.user_credits (user_id, plan, balance, last_refill_date)
  values (uid, 'pro', 150, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  on conflict (user_id) do update
    set plan = 'pro',
        balance = greatest(public.user_credits.balance, 150),
        last_refill_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date,
        updated_at = now();

  insert into public.credit_transactions (user_id, delta, balance_after, kind, note)
  values (uid, 150, 150, 'signup', 'Tặng Pro dùng thử 7 ngày (user cũ)');

  return jsonb_build_object('granted', true, 'plan', 'pro', 'days', 7);
end;
$$;

grant execute on function public.claim_pro_trial() to authenticated;
