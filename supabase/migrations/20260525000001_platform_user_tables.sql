-- ============================================================
-- Wealbee Platform — User Tables + Policies + Triggers
-- (v2: chỉ chứa phần chưa có trong DB)
-- ============================================================

-- ── User Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  avatar_url      TEXT,
  email           TEXT,
  plan            TEXT DEFAULT 'free',
  onboarded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme           TEXT DEFAULT 'light',
  language        TEXT DEFAULT 'vi',
  email_digest    BOOLEAN DEFAULT TRUE,
  inbox_alerts    BOOLEAN DEFAULT TRUE,
  risk_profile    TEXT DEFAULT 'moderate',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Watchlist',
  is_default      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,
  UNIQUE (watchlist_id, symbol)
);

-- ── Agent System ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT NOT NULL DEFAULT '',
  tools           TEXT[] DEFAULT '{}',
  default_schedule TEXT DEFAULT 'manual',
  icon            TEXT,
  color           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id     TEXT REFERENCES agent_templates(id),
  name            TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT,
  tools           TEXT[] DEFAULT '{}',
  schedule        TEXT DEFAULT 'manual',
  status          TEXT DEFAULT 'draft',
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  run_count       INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT DEFAULT 'running',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  input           JSONB,
  output          TEXT,
  error           TEXT,
  tokens_used     INTEGER,
  cost_usd        NUMERIC(8, 6)
);

CREATE TABLE IF NOT EXISTS briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_run_id    UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  type            TEXT DEFAULT 'system',
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  content         TEXT,
  impact_score    NUMERIC(4, 1),
  tickers         TEXT[] DEFAULT '{}',
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS briefs_user_id ON briefs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS briefs_unread ON briefs (user_id, is_read) WHERE NOT is_read;

-- ── Knowledge Base ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  file_size       BIGINT,
  storage_path    TEXT,
  status          TEXT DEFAULT 'pending',
  chunk_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT,
  context_ticker  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  tokens          INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages (session_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages         ENABLE ROW LEVEL SECURITY;

-- Policies (dùng DO block để tránh lỗi duplicate)
DO $$ BEGIN
  CREATE POLICY "users can manage own profile"
    ON user_profiles FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own settings"
    ON user_settings FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own watchlists"
    ON watchlists FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own watchlist items"
    ON watchlist_items FOR ALL
    USING (EXISTS (SELECT 1 FROM watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own agents"
    ON agents FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can view own agent runs"
    ON agent_runs FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own briefs"
    ON briefs FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own kb files"
    ON kb_files FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own chat sessions"
    ON chat_sessions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage own chat messages"
    ON chat_messages FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Market data read-only
ALTER TABLE tickers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_daily          ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_indices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE financials_annual     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividends             ENABLE ROW LEVEL SECURITY;
ALTER TABLE insider_transactions  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "anon can read tickers" ON tickers FOR SELECT USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon can read prices_daily" ON prices_daily FOR SELECT USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon can read market_indices" ON market_indices FOR SELECT USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon can read financials_annual" ON financials_annual FOR SELECT USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon can read dividends" ON dividends FOR SELECT USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon can read insider_transactions" ON insider_transactions FOR SELECT USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Auto-create profile trigger ───────────────────────────────────────────────

-- IMPORTANT: SET search_path = public is required because supabase_auth_admin
-- has search_path=auth, so without this the trigger can't find public tables.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.watchlists (user_id, name, is_default)
  VALUES (NEW.id, 'Watchlist chính', TRUE)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Seed agent_templates ──────────────────────────────────────────────────────

INSERT INTO agent_templates (id, name, description, system_prompt, tools, default_schedule, icon, color) VALUES
('daily_digest', 'Daily Market Digest',
 'Bản tin thị trường hàng ngày: VN-Index, top movers VN30, tin tức tóm tắt',
 'Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Tóm tắt diễn biến thị trường: VN-Index, VN30, HNX, top 5 tăng/giảm VN30, tin tức quan trọng. KHÔNG đưa ra khuyến nghị mua/bán.',
 ARRAY['market_indices', 'news_feed', 'price_feed'], 'daily_7am', 'Mail', '#0849ac'),
('portfolio_health', 'Portfolio Health',
 'Theo dõi danh mục: cảnh báo biến động, tóm tắt P&L',
 'Phân tích hiệu suất danh mục người dùng: P&L, cổ phiếu tăng/giảm mạnh, cảnh báo biến động >3%. KHÔNG đưa ra khuyến nghị mua/bán.',
 ARRAY['portfolio_read', 'price_feed', 'news_feed'], 'weekday_noon', 'BarChart3', '#0ea5a0'),
('deep_research', 'Deep Research',
 'Phân tích chuyên sâu một mã CP: BCTC, cổ tức, insider, tin tức',
 'Phân tích chuyên sâu CP: tóm tắt hoạt động KD, BCTC 5 năm, cổ tức, giao dịch insider, tin tức. KHÔNG đưa ra khuyến nghị mua/bán hay dự đoán giá.',
 ARRAY['financials', 'dividends', 'insider_trades', 'news_feed'], 'manual', 'Search', '#8b5cf6')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  tools = EXCLUDED.tools;

-- ── Seed VN30 tickers ─────────────────────────────────────────────────────────

INSERT INTO tickers (symbol, name, exchange, sector, in_vn30) VALUES
('ACB','Ngân hàng TMCP Á Châu','HOSE','Ngân hàng',TRUE),
('BID','Ngân hàng TMCP Đầu tư và Phát triển VN','HOSE','Ngân hàng',TRUE),
('BVH','Tập đoàn Bảo Việt','HOSE','Bảo hiểm',TRUE),
('CTG','Ngân hàng TMCP Công Thương VN','HOSE','Ngân hàng',TRUE),
('FPT','Công ty Cổ phần FPT','HOSE','Công nghệ',TRUE),
('GAS','Tổng Công ty Khí Việt Nam','HOSE','Năng lượng',TRUE),
('HDB','Ngân hàng TMCP Phát triển TP.HCM','HOSE','Ngân hàng',TRUE),
('HPG','Công ty Cổ phần Tập đoàn Hòa Phát','HOSE','Thép',TRUE),
('MBB','Ngân hàng TMCP Quân đội','HOSE','Ngân hàng',TRUE),
('MSN','Công ty Cổ phần Tập đoàn Masan','HOSE','Tiêu dùng',TRUE),
('MWG','Công ty Cổ phần Thế Giới Di Động','HOSE','Bán lẻ',TRUE),
('PLX','Tập đoàn Xăng dầu Việt Nam','HOSE','Năng lượng',TRUE),
('SAB','Tổng Công ty Cổ phần Bia-Rượu-NGK SG','HOSE','Đồ uống',TRUE),
('SSI','Công ty Cổ phần Chứng khoán SSI','HOSE','Chứng khoán',TRUE),
('STB','Ngân hàng TMCP Sài Gòn Thương Tín','HOSE','Ngân hàng',TRUE),
('TCB','Ngân hàng TMCP Kỹ thương Việt Nam','HOSE','Ngân hàng',TRUE),
('TPB','Ngân hàng TMCP Tiên Phong','HOSE','Ngân hàng',TRUE),
('VCB','Ngân hàng TMCP Ngoại thương VN','HOSE','Ngân hàng',TRUE),
('VHM','Công ty Cổ phần Vinhomes','HOSE','Bất động sản',TRUE),
('VIB','Ngân hàng TMCP Quốc tế Việt Nam','HOSE','Ngân hàng',TRUE),
('VIC','Tập đoàn Vingroup','HOSE','Bất động sản',TRUE),
('VJC','Công ty Cổ phần Hàng không VietJet','HOSE','Hàng không',TRUE),
('VNM','Công ty Cổ phần Sữa Việt Nam','HOSE','Tiêu dùng',TRUE),
('VPB','Ngân hàng TMCP Việt Nam Thịnh Vượng','HOSE','Ngân hàng',TRUE),
('VRE','Công ty Cổ phần Vincom Retail','HOSE','Bất động sản',TRUE)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, in_vn30 = TRUE;
