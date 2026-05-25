-- ============================================================
-- Wealbee Platform Tables Migration
-- Date: 2026-05-25
-- Dùng CREATE TABLE IF NOT EXISTS và ALTER TABLE ADD COLUMN IF NOT EXISTS
-- KHÔNG DROP bảng có dữ liệu cũ
-- ============================================================

-- ── Enable extensions (idempotent) ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- MARKET DATA TABLES
-- ============================================================

-- Danh sách mã VN30
CREATE TABLE IF NOT EXISTS tickers (
  symbol          TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  exchange        TEXT NOT NULL DEFAULT 'HOSE',  -- HOSE | HNX | UPCOM
  sector          TEXT,
  industry        TEXT,
  market_cap      NUMERIC(20, 2),
  in_vn30         BOOLEAN DEFAULT FALSE,
  in_vn100        BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Giá ngày (OHLCV)
CREATE TABLE IF NOT EXISTS prices_daily (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
  date            DATE NOT NULL,
  open            NUMERIC(15, 2),
  high            NUMERIC(15, 2),
  low             NUMERIC(15, 2),
  close           NUMERIC(15, 2) NOT NULL,
  volume          BIGINT,
  value           NUMERIC(20, 2),  -- khối lượng giao dịch theo giá trị (VNĐ)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, date)
);
CREATE INDEX IF NOT EXISTS prices_daily_symbol_date ON prices_daily (symbol, date DESC);

-- Chỉ số thị trường (VN-Index, HNX, UPCOM, VN30)
CREATE TABLE IF NOT EXISTS market_indices (
  id              BIGSERIAL PRIMARY KEY,
  index_code      TEXT NOT NULL,  -- VNINDEX | HNX | UPCOM | VN30
  date            DATE NOT NULL,
  open            NUMERIC(10, 2),
  high            NUMERIC(10, 2),
  low             NUMERIC(10, 2),
  close           NUMERIC(10, 2) NOT NULL,
  volume          BIGINT,
  change_pt       NUMERIC(8, 2),   -- thay đổi điểm
  change_pct      NUMERIC(6, 2),   -- % thay đổi
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (index_code, date)
);

-- BCTC hàng năm
CREATE TABLE IF NOT EXISTS financials_annual (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
  year            SMALLINT NOT NULL,
  revenue         NUMERIC(20, 2),   -- doanh thu (VNĐ)
  net_profit      NUMERIC(20, 2),   -- lợi nhuận ròng
  eps             NUMERIC(10, 2),   -- EPS
  pe_ratio        NUMERIC(8, 2),
  pb_ratio        NUMERIC(8, 2),
  roe             NUMERIC(6, 2),    -- %
  roa             NUMERIC(6, 2),    -- %
  debt_to_equity  NUMERIC(8, 2),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, year)
);

-- Thông tin công ty
CREATE TABLE IF NOT EXISTS company_info (
  symbol          TEXT PRIMARY KEY REFERENCES tickers(symbol) ON DELETE CASCADE,
  description     TEXT,
  website         TEXT,
  founded_year    SMALLINT,
  employees       INTEGER,
  headquarters    TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Cổ tức
CREATE TABLE IF NOT EXISTS dividends (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
  ex_date         DATE NOT NULL,
  payment_date    DATE,
  dividend_type   TEXT DEFAULT 'cash',  -- cash | stock
  amount          NUMERIC(10, 2),  -- VNĐ/CP hoặc % đối với cổ tức cổ phiếu
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, ex_date)
);

-- Giao dịch insider
CREATE TABLE IF NOT EXISTS insider_transactions (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
  trade_date      DATE NOT NULL,
  insider_name    TEXT NOT NULL,
  position        TEXT,
  trade_type      TEXT NOT NULL,  -- buy | sell | register_buy | register_sell
  volume          BIGINT,
  price           NUMERIC(15, 2),
  total_value     NUMERIC(20, 2),
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Bridge: email digest → Inbox khi user đăng ký
CREATE TABLE IF NOT EXISTS digest_emails (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL,
  subject         TEXT NOT NULL,
  content         TEXT,
  sent_at         TIMESTAMPTZ NOT NULL,
  resend_id       TEXT UNIQUE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_to_inbox BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS digest_emails_email ON digest_emails (email);

-- ============================================================
-- USER DATA TABLES (với RLS)
-- ============================================================

-- Profiles (extend nếu chưa có)
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  avatar_url      TEXT,
  email           TEXT,
  plan            TEXT DEFAULT 'free',  -- free | pro | pro_plus
  onboarded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Settings per user
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

-- Watchlists
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

-- Templates (global, không phải của user)
CREATE TABLE IF NOT EXISTS agent_templates (
  id              TEXT PRIMARY KEY,  -- e.g. 'daily_digest', 'portfolio_health'
  name            TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT NOT NULL,
  tools           TEXT[] DEFAULT '{}',
  default_schedule TEXT DEFAULT 'manual',
  icon            TEXT,
  color           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Agents của user (từ template hoặc custom)
CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id     TEXT REFERENCES agent_templates(id),
  name            TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT,
  tools           TEXT[] DEFAULT '{}',
  schedule        TEXT DEFAULT 'manual',
  status          TEXT DEFAULT 'draft',  -- draft | active | paused
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  run_count       INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Agent run logs
CREATE TABLE IF NOT EXISTS agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT DEFAULT 'running',  -- running | completed | failed
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  input           JSONB,
  output          TEXT,
  error           TEXT,
  tokens_used     INTEGER,
  cost_usd        NUMERIC(8, 6)
);

-- Inbox briefs (output từ agent runs)
CREATE TABLE IF NOT EXISTS briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_run_id    UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  type            TEXT DEFAULT 'system',  -- daily_digest | portfolio_alert | market_alert | system
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  content         TEXT,
  impact_score    NUMERIC(4, 1),
  tickers         TEXT[] DEFAULT '{}',
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS briefs_user_id ON briefs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS briefs_unread ON briefs (user_id, is_read) WHERE is_read = FALSE;

-- ── Knowledge Base ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  file_type       TEXT NOT NULL,  -- pdf | md | txt
  file_size       BIGINT,
  storage_path    TEXT,
  status          TEXT DEFAULT 'pending',  -- pending | processing | ready | error
  chunk_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID NOT NULL REFERENCES kb_files(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  chunk_index     INTEGER NOT NULL,
  embedding       VECTOR(1536),  -- OpenAI text-embedding-3-small
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kb_chunks_user_id ON kb_chunks (user_id);

-- ── Chat ─────────────────────────────────────────────────────────────────────

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
  role            TEXT NOT NULL,  -- user | assistant
  content         TEXT NOT NULL,
  tokens          INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages (session_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages         ENABLE ROW LEVEL SECURITY;

-- user_profiles
CREATE POLICY IF NOT EXISTS "users can manage own profile"
  ON user_profiles FOR ALL USING (auth.uid() = user_id);

-- user_settings
CREATE POLICY IF NOT EXISTS "users can manage own settings"
  ON user_settings FOR ALL USING (auth.uid() = user_id);

-- watchlists
CREATE POLICY IF NOT EXISTS "users can manage own watchlists"
  ON watchlists FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users can manage own watchlist items"
  ON watchlist_items FOR ALL
  USING (EXISTS (SELECT 1 FROM watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));

-- agents
CREATE POLICY IF NOT EXISTS "users can manage own agents"
  ON agents FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users can view own agent runs"
  ON agent_runs FOR ALL USING (auth.uid() = user_id);

-- briefs
CREATE POLICY IF NOT EXISTS "users can manage own briefs"
  ON briefs FOR ALL USING (auth.uid() = user_id);

-- kb
CREATE POLICY IF NOT EXISTS "users can manage own kb files"
  ON kb_files FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users can manage own kb chunks"
  ON kb_chunks FOR ALL USING (auth.uid() = user_id);

-- chat
CREATE POLICY IF NOT EXISTS "users can manage own chat sessions"
  ON chat_sessions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users can manage own chat messages"
  ON chat_messages FOR ALL USING (auth.uid() = user_id);

-- Market data tables: read-only for authenticated users
ALTER TABLE tickers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_daily          ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_indices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE financials_annual     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_info          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividends             ENABLE ROW LEVEL SECURITY;
ALTER TABLE insider_transactions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon can read tickers"
  ON tickers FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "anon can read prices_daily"
  ON prices_daily FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "anon can read market_indices"
  ON market_indices FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "anon can read financials_annual"
  ON financials_annual FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "anon can read company_info"
  ON company_info FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "anon can read dividends"
  ON dividends FOR SELECT USING (TRUE);

CREATE POLICY IF NOT EXISTS "anon can read insider_transactions"
  ON insider_transactions FOR SELECT USING (TRUE);

-- ============================================================
-- AUTO-CREATE PROFILE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create default watchlist
  INSERT INTO watchlists (user_id, name, is_default)
  VALUES (NEW.id, 'Watchlist chính', TRUE)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger nếu đã tồn tại, rồi tạo lại
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEED AGENT TEMPLATES
-- ============================================================

INSERT INTO agent_templates (id, name, description, system_prompt, tools, default_schedule, icon, color) VALUES
(
  'daily_digest',
  'Daily Market Digest',
  'Bản tin thị trường hàng ngày: VN-Index, top movers VN30, tin tức tóm tắt',
  'Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Hãy tóm tắt diễn biến thị trường ngày hôm nay bao gồm:
1. Điểm số và % thay đổi của VN-Index, VN30, HNX
2. Top 5 cổ phiếu tăng mạnh nhất VN30
3. Top 5 cổ phiếu giảm mạnh nhất VN30
4. 3-5 tin tức quan trọng nhất trong ngày

Tone: chuyên nghiệp, súc tích. KHÔNG đưa ra khuyến nghị mua/bán. Chỉ mô tả dữ liệu thị trường.',
  ARRAY['market_indices', 'news_feed', 'price_feed'],
  'daily_7am',
  'Mail',
  '#0849ac'
),
(
  'portfolio_health',
  'Portfolio Health',
  'Theo dõi danh mục: cảnh báo biến động, tóm tắt P&L',
  'Bạn là trợ lý quản lý danh mục đầu tư. Hãy phân tích hiệu suất danh mục người dùng:
1. Tổng giá trị và % P&L
2. Cổ phiếu tăng/giảm mạnh nhất hôm nay
3. Cảnh báo nếu có CP biến động >3%
4. Tóm tắt tin tức liên quan đến các CP trong danh mục

KHÔNG đưa ra khuyến nghị mua/bán. Chỉ trình bày dữ liệu.',
  ARRAY['portfolio_read', 'price_feed', 'news_feed', 'pnl_calc'],
  'weekday_noon',
  'BarChart3',
  '#0ea5a0'
),
(
  'deep_research',
  'Deep Research',
  'Phân tích chuyên sâu một mã CP: BCTC, cổ tức, insider, tin tức',
  'Bạn là nhà phân tích chứng khoán chuyên sâu. Khi được yêu cầu phân tích một mã CP, hãy:
1. Tóm tắt hoạt động kinh doanh và vị thế trong ngành
2. Điểm nổi bật BCTC 5 năm gần nhất (doanh thu, lợi nhuận, ROE)
3. Lịch sử chi trả cổ tức
4. Giao dịch insider đáng chú ý gần đây
5. Tóm tắt 5 tin tức quan trọng nhất về công ty

KHÔNG đưa ra khuyến nghị mua/bán hay dự đoán giá. Chỉ trình bày dữ liệu thực tế.',
  ARRAY['financials', 'dividends', 'insider_trades', 'news_feed', 'kb_search'],
  'manual',
  'Search',
  '#8b5cf6'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  tools = EXCLUDED.tools;

-- ============================================================
-- SEED VN30 TICKERS
-- ============================================================

INSERT INTO tickers (symbol, name, exchange, sector, in_vn30) VALUES
('ACB',  'Ngân hàng TMCP Á Châu',                    'HOSE', 'Ngân hàng',      TRUE),
('BCM',  'Tổng Công ty Đầu tư và Phát triển CN',     'HOSE', 'Bất động sản',   TRUE),
('BID',  'Ngân hàng TMCP Đầu tư và PT VN',           'HOSE', 'Ngân hàng',      TRUE),
('BVH',  'Tập đoàn Bảo Việt',                        'HOSE', 'Bảo hiểm',       TRUE),
('CTG',  'Ngân hàng TMCP Công Thương VN',            'HOSE', 'Ngân hàng',      TRUE),
('FPT',  'Công ty Cổ phần FPT',                      'HOSE', 'Công nghệ',      TRUE),
('GAS',  'Tổng Công ty Khí Việt Nam',                'HOSE', 'Năng lượng',     TRUE),
('GVR',  'Tập đoàn Công nghiệp Cao su VN',           'HOSE', 'Nông nghiệp',    TRUE),
('HDB',  'Ngân hàng TMCP Phát triển TP.HCM',         'HOSE', 'Ngân hàng',      TRUE),
('HPG',  'Công ty Cổ phần Tập đoàn Hòa Phát',        'HOSE', 'Thép',           TRUE),
('MBB',  'Ngân hàng TMCP Quân đội',                  'HOSE', 'Ngân hàng',      TRUE),
('MSN',  'Công ty Cổ phần Tập đoàn Masan',           'HOSE', 'Tiêu dùng',      TRUE),
('MWG',  'Công ty Cổ phần Đầu tư Thế Giới Di Động', 'HOSE', 'Bán lẻ',         TRUE),
('PLX',  'Tập đoàn Xăng dầu Việt Nam',               'HOSE', 'Năng lượng',     TRUE),
('POW',  'Tổng Công ty Điện lực Dầu khí VN',         'HOSE', 'Điện lực',       TRUE),
('SAB',  'Tổng Công ty Cổ phần Bia-Rượu-NGK SG',     'HOSE', 'Đồ uống',        TRUE),
('SHB',  'Ngân hàng TMCP Sài Gòn-Hà Nội',           'HOSE', 'Ngân hàng',      TRUE),
('SSI',  'Công ty Cổ phần Chứng khoán SSI',          'HOSE', 'Chứng khoán',    TRUE),
('STB',  'Ngân hàng TMCP Sài Gòn Thương Tín',        'HOSE', 'Ngân hàng',      TRUE),
('TCB',  'Ngân hàng TMCP Kỹ thương Việt Nam',        'HOSE', 'Ngân hàng',      TRUE),
('TPB',  'Ngân hàng TMCP Tiên Phong',                'HOSE', 'Ngân hàng',      TRUE),
('VCB',  'Ngân hàng TMCP Ngoại thương Việt Nam',     'HOSE', 'Ngân hàng',      TRUE),
('VHM',  'Công ty Cổ phần Vinhomes',                 'HOSE', 'Bất động sản',   TRUE),
('VIB',  'Ngân hàng TMCP Quốc tế Việt Nam',         'HOSE', 'Ngân hàng',      TRUE),
('VIC',  'Tập đoàn Vingroup',                        'HOSE', 'Bất động sản',   TRUE),
('VJC',  'Công ty Cổ phần Hàng không VietJet',       'HOSE', 'Hàng không',     TRUE),
('VNM',  'Công ty Cổ phần Sữa Việt Nam',             'HOSE', 'Tiêu dùng',      TRUE),
('VPB',  'Ngân hàng TMCP Việt Nam Thịnh Vượng',      'HOSE', 'Ngân hàng',      TRUE),
('VRE',  'Công ty Cổ phần Vincom Retail',            'HOSE', 'Bất động sản',   TRUE),
('WSS',  'Công ty Cổ phần Chứng khoán Phố Wall',    'HOSE', 'Chứng khoán',    TRUE)
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  in_vn30 = EXCLUDED.in_vn30;
