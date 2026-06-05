-- Link existing digest_subscribers rows (user_id IS NULL) to auth users by email
UPDATE public.digest_subscribers ds
SET user_id = au.id
FROM auth.users au
WHERE ds.user_id IS NULL
  AND au.email = ds.email;
