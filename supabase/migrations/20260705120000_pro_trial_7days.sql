-- Tặng Pro trial 7 ngày cho MỌI user đăng ký mới (hook vào handle_new_user).
-- Hết hạn (plan_expires_at < now) → logic ví/plan tự hạ về free (xử lý ở backend/frontend).

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Profile + Pro trial 7 ngày
  INSERT INTO public.user_profiles (user_id, email, full_name, plan, plan_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'pro',
    now() + interval '7 days'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Ví Beeny khởi tạo theo gói Pro (trần 150)
  INSERT INTO public.user_credits (user_id, plan, balance, last_refill_date)
  VALUES (NEW.id, 'pro', 150, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, delta, balance_after, kind, note)
  VALUES (NEW.id, 150, 150, 'signup', 'Tặng Pro dùng thử 7 ngày khi đăng ký');

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.watchlists (user_id, name, is_default)
  VALUES (NEW.id, 'Watchlist chính', TRUE)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
