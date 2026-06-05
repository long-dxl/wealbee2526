ALTER TABLE public.digest_subscribers
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
