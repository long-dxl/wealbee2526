-- Fix RLS policies: replace cross-schema subquery with auth.email() JWT function
-- (SELECT email FROM auth.users WHERE id = auth.uid()) is inaccessible to authenticated role

-- ── digest_subscribers ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user can read own subscription"   ON public.digest_subscribers;
DROP POLICY IF EXISTS "user can insert own subscription" ON public.digest_subscribers;
DROP POLICY IF EXISTS "user can update own subscription" ON public.digest_subscribers;

CREATE POLICY "user can read own subscription"
  ON public.digest_subscribers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR email = auth.email()
  );

CREATE POLICY "user can insert own subscription"
  ON public.digest_subscribers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user can update own subscription"
  ON public.digest_subscribers FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid() OR email = auth.email())
  WITH CHECK (user_id = auth.uid() OR email = auth.email());

-- ── Link existing null user_id rows to auth users ─────────────────────────────
UPDATE public.digest_subscribers ds
SET user_id = au.id
FROM auth.users au
WHERE ds.user_id IS NULL
  AND au.email = ds.email;
