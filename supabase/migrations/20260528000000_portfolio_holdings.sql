-- ============================================================
-- Portfolio Holdings — flat user-owned table
-- ============================================================

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  quantity      NUMERIC(18, 4) NOT NULL DEFAULT 0,
  avg_cost      NUMERIC(18, 0),          -- giá mua TB (VND)
  purchase_date DATE,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS portfolio_holdings_user_id ON portfolio_holdings (user_id);

ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users can manage own holdings"
    ON portfolio_holdings FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
