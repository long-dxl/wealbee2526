# Wealbee — Backend Roadmap: Investor Demo Sprint

> **Vai trò:** CTO  
> **Mục tiêu:** Đưa nền tảng từ giao diện mock → sản phẩm chạy thật với dữ liệu thực  
> **Deadline:** Hôm nay (Thứ 7, 17/05/2026) → Thứ 5 (29/05/2026) · **13 ngày**  
> **Công cụ hỗ trợ:** Claude AI (viết code nhanh, nhưng mọi output phải review kỹ trước khi merge)  
> **Phạm vi demo:** VN30, 3 Agent hoạt động, Chat AI, Knowledge Base, Agent Studio save/load  
> **Update 17/05:** Đã có sẵn hệ thống cào tin tức + LLM digest + email (xem Section 0.5) — tiết kiệm ~2 ngày, tập trung vào packaging + tích hợp vào Agent platform

---

## 0.5. Hệ Thống Đã Có — Existing System Inventory

> **Quan trọng:** Trước khi build bất cứ thứ gì, review section này. Đây là tài sản sẵn có, không xây lại.

### Những gì đã hoạt động

```
A. HỆ THỐNG NEWS DIGEST (đã production)
─────────────────────────────────────────────────────────────
Scraping       → 10+ nguồn báo tài chính VN:
                  VietStock, BaoDauTu, MarketTimes, ...

Storage        → Supabase (project hiện tại)

LLM Pipeline   → OpenAI API (đã kết nối)
                  Gán nhãn mã CP bị tác động (ticker tagging)
                  Tóm tắt → bullet points
                  Reasoning tác động đến danh mục từng user

Email delivery → Resend (đã có API key + template)
                  Gửi đến users đã để email + danh mục

Scheduler      → GitHub Actions, chạy tự động 7:00 sáng hàng ngày

B. HỆ THỐNG DỮ LIỆU THỊ TRƯỜNG (đã production · Python + vnstock)
─────────────────────────────────────────────────────────────
Thư viện       → vnstock (github.com/thinh-vu/vnstock)
                  Python wrapper cho TCBS + VNDirect + SSI

Dữ liệu đã kéo và lưu vào Supabase:
  ✅ Lịch sử giá giao dịch (OHLCV) — đa số mã, nhiều năm
  ✅ Fundamentals công ty 5 năm (BCTC, ratios)
  ✅ Giá giao dịch hàng ngày — đang chạy tự động
  ✅ Lịch cổ tức quá khứ (dividend history)
  ✅ Lịch cổ tức sắp tới (dividend calendar) — daily pull
  ✅ Giao dịch insider — daily pull từ VietStock

AI/API         → OpenAI API đã kết nối (key có sẵn)
                  Dùng cho LLM news pipeline + sẵn sàng cho embeddings
```

### Mapping sang Wealbee Platform

| Thành phần đã có | Tương đương trong Wealbee | Việc cần làm |
|---|---|---|
| News scraper 10+ nguồn | `news` table | Audit schema → align/migrate |
| LLM ticker tagging (OpenAI) | `news.tickers[]` field | Verify field mapping |
| LLM bullet summary | Brief body | Đưa output vào `briefs` table |
| LLM portfolio reasoning | Portfolio Health agent | Kết nối với `holdings` của user đăng nhập |
| Resend email | Notification channel | Giữ nguyên + thêm Inbox write |
| GitHub Actions 7h | Agent cron trigger | Giữ GHA, refactor để gọi Edge Function |
| User email + portfolio | `user_profiles` + `holdings` | Map sang Supabase Auth users |
| **vnstock prices daily** | `prices_daily` table | **Audit schema → align → FE connect** |
| **vnstock fundamentals 5Y** | `financials_annual` table | **Audit schema → align → FE connect** |
| **Dividend history** | `dividends` table (cần tạo nếu chưa) | Thêm vào schema, FE TickerDetail |
| **Dividend calendar** | `events_calendar` (event_type='DIVIDEND') | Merge hoặc giữ bảng riêng |
| **Insider transactions** | `insider_transactions` table | **Audit schema → align → đã có data** |
| **OpenAI API key** | KB embeddings + agent LLM | Dùng `text-embedding-3-small` cho vector KB |

### Quyết Định Kiến Trúc: GHA vs pg_cron

| Option | Ưu điểm | Nhược điểm | Kết luận |
|---|---|---|---|
| **Giữ GitHub Actions** | Không cần refactor, ổn định | Tách rời khỏi Agent platform, user không control được từ UI | Giữ ngắn hạn cho Daily Digest cron |
| **Migrate sang pg_cron** | Agent trigger thống nhất, user pause/resume từ UI | Cần refactor, Edge Function timeout risk | Migrate dần — GHA gọi Edge Function, không chạy logic trực tiếp |

**→ Quyết định:** GHA giữ vai trò scheduler, nhưng logic chuyển sang Supabase Edge Function. GHA chỉ gọi `POST /functions/v1/run-daily-digest` với service_role_key. Lợi ích: user có thể test thủ công qua UI, GHA chạy scheduled backup.

### Audit Cần Làm Trước Khi Bắt Đầu (Ưu tiên Ngày 1 · ~3 giờ)

**A. Inventory bảng dữ liệu thị trường (đã có data thật)**
- [ ] `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name` — liệt kê tất cả
- [ ] Với **bảng giá**: `SELECT symbol, COUNT(*), MIN(date), MAX(date) FROM {price_table} GROUP BY symbol LIMIT 5` — verify range và coverage
- [ ] Với **bảng fundamentals**: `SELECT symbol, COUNT(DISTINCT year) FROM {fundamental_table} GROUP BY symbol LIMIT 5` — verify 5 năm đủ chưa
- [ ] Với **insider**: `SELECT COUNT(*), MIN(transaction_date), MAX(transaction_date) FROM {insider_table}` — verify daily pull đang chạy
- [ ] Với **dividends**: xác định bảng tên gì, có `ex_date`, `dividend_amount`, `symbol` không
- [ ] Với **news**: `SELECT * FROM {news_table} ORDER BY published_at DESC LIMIT 3` — verify tickers[], summary format

**B. Verify Python scripts đang chạy**
- [ ] Xem GHA workflows: script nào chạy hàng ngày, output ghi vào bảng nào
- [ ] Verify vnstock version: `vnstock.__version__` — có đang dùng API v3 chưa (breaking change 2024)
- [ ] Check Python script dividend: field names khớp với bảng dividends trong DB không
- [ ] Check Python script insider: đang pull từ VietStock endpoint nào, rate limit?

**C. Verify OpenAI API**
- [ ] `OPENAI_API_KEY` đang store ở đâu: GHA secrets hay Supabase secrets hay .env?
- [ ] Model đang dùng cho news pipeline: GPT-4o hay GPT-4o-mini? (ảnh hưởng cost khi scale)
- [ ] Confirm dùng `text-embedding-3-small` cho KB embeddings (1536 dim, $0.02/1M tokens)

---

## 0. Nguyên Tắc Sprint Này

| Nguyên tắc | Lý do |
|---|---|
| **Supabase làm tất cả** | Auth + DB + Storage + Edge Functions + Realtime + pgvector — không dựng server riêng, tiết kiệm 3 ngày |
| **vnstock là nguồn dữ liệu** | Python library đã test ổn định với HOSE/HNX — data đã trong Supabase, không kéo lại |
| **Claude Sonnet 4.6 cho Agent** | Cost thấp, context 200k tokens, tool use tốt, prompt caching giảm 70% cost |
| **Demo-first, perfect-later** | Không xây feature chưa cần cho demo. Edge case có thể handle sau |
| **Claude AI viết code → người review** | Mọi Edge Function, schema migration, scraper đều review kỹ trước khi chạy trên production |
| **RLS từ ngày 1** | Supabase Row Level Security — mỗi user chỉ thấy data của mình. Không bao giờ bỏ qua |

---

## 1. Tech Stack Quyết Định

```
FRONTEND (đã có)
├── React 18 + Vite + Tailwind CSS
├── Supabase JS Client (@supabase/supabase-js)
└── Zustand (thêm mới — replace inline state)

BACKEND — Supabase (không dựng server)
├── PostgreSQL 15 + pgvector     → data store + vector search
├── Supabase Auth                → email/password + Google OAuth
├── Supabase Storage             → file upload KB
├── Edge Functions (Deno/TS)     → API endpoints + AI agent runner
├── Supabase Realtime            → live price updates
└── pg_cron                      → scheduled agent runs

AI
├── Claude Sonnet 4.6            → Agent execution, Chat, Portfolio reasoning
├── Claude Haiku 4.5             → Daily Market Digest (cost thấp, Vietnamese tốt hơn GPT)
├── OpenAI GPT-4o / GPT-4o-mini  → [ĐÃ CÓ] News pipeline LLM (giữ nguyên)
└── OpenAI text-embedding-3-small → [ĐÃ CÓ API KEY] KB vector embeddings (1536 dim, $0.02/1M tokens)

DATA PIPELINE (Python · GitHub Actions · đã production)
├── vnstock library              → [✅ DONE] OHLCV lịch sử, fundamentals 5 năm, daily prices
│   └── github.com/thinh-vu/vnstock  (wrapper TCBS + VNDirect + SSI)
├── Dividend history/calendar    → [✅ DONE] Python script, daily pull, lưu Supabase
├── Insider transactions         → [✅ DONE] Daily pull từ VietStock, lưu Supabase
└── 10+ nguồn tin tức            → [✅ DONE] Scraping + LLM tagging + Resend email

DATA SOURCES (bổ sung, chưa có)
├── Market indices intraday      → SSI iBoard public endpoints (cần thêm cho live dashboard)
└── Trading calendar 2026        → Hardcode ngày lễ HOSE (cần seed)

NOTIFICATION & SCHEDULER (đã có, tích hợp thêm)
├── Resend                       → [✅ DONE] Email delivery production
│   └── [MỚI] Inbox write        → Song song email, ghi vào briefs table
├── GitHub Actions               → [✅ DONE] Scheduler 7:00 sáng, daily data pulls
│   └── [MỚI] Gọi Edge Function  → GHA delegate agent logic sang Supabase
└── [MỚI] pg_cron                → Cho agents user tạo (Portfolio Health, Deep Research)
```

---

## 2. Database Schema — Thiết Kế Đầy Đủ

> Chạy lệnh này trên Supabase SQL Editor. Review kỹ từng bảng trước khi apply.

### 2.1 Market Data (shared, không phụ thuộc user)

```sql
-- Danh sách mã chứng khoán
CREATE TABLE tickers (
  symbol        TEXT PRIMARY KEY,          -- 'VCB', 'HPG'
  name          TEXT NOT NULL,             -- 'Ngân hàng TMCP Ngoại thương Việt Nam'
  short_name    TEXT,                      -- 'Vietcombank'
  exchange      TEXT NOT NULL,             -- 'HOSE', 'HNX', 'UPCOM'
  sector        TEXT,                      -- 'Ngân hàng', 'Thép', 'Công nghệ'
  industry      TEXT,
  is_vn30       BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Lịch sử giá ngày (OHLCV)
CREATE TABLE prices_daily (
  id            BIGSERIAL PRIMARY KEY,
  symbol        TEXT REFERENCES tickers(symbol),
  date          DATE NOT NULL,
  open          NUMERIC(15,2),
  high          NUMERIC(15,2),
  low           NUMERIC(15,2),
  close         NUMERIC(15,2) NOT NULL,
  volume        BIGINT,
  adj_close     NUMERIC(15,2),
  UNIQUE(symbol, date)
);
CREATE INDEX idx_prices_daily_symbol_date ON prices_daily(symbol, date DESC);

-- Giá intraday (rolling 5 ngày giao dịch gần nhất)
CREATE TABLE prices_intraday (
  id            BIGSERIAL PRIMARY KEY,
  symbol        TEXT REFERENCES tickers(symbol),
  timestamp     TIMESTAMPTZ NOT NULL,
  price         NUMERIC(15,2) NOT NULL,
  volume        BIGINT,
  UNIQUE(symbol, timestamp)
);
CREATE INDEX idx_prices_intraday_symbol_ts ON prices_intraday(symbol, timestamp DESC);

-- Chỉ số thị trường (VN-Index, HNX-Index, UPCoM)
CREATE TABLE market_indices (
  id            BIGSERIAL PRIMARY KEY,
  index_code    TEXT NOT NULL,             -- 'VNINDEX', 'HNXINDEX', 'UPCOMINDEX'
  timestamp     TIMESTAMPTZ NOT NULL,
  value         NUMERIC(10,2) NOT NULL,
  change        NUMERIC(10,2),
  change_pct    NUMERIC(8,4),
  volume        BIGINT,
  UNIQUE(index_code, timestamp)
);

-- Báo cáo tài chính năm
CREATE TABLE financials_annual (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT REFERENCES tickers(symbol),
  year            SMALLINT NOT NULL,
  -- Income Statement
  revenue         NUMERIC(20,2),           -- Doanh thu thuần (triệu VND)
  gross_profit    NUMERIC(20,2),
  ebit            NUMERIC(20,2),
  net_income      NUMERIC(20,2),
  eps             NUMERIC(15,2),           -- VND/cổ phiếu
  -- Balance Sheet
  total_assets    NUMERIC(20,2),
  cash            NUMERIC(20,2),
  total_debt      NUMERIC(20,2),
  equity          NUMERIC(20,2),
  -- Cash Flow
  operating_cf    NUMERIC(20,2),
  capex           NUMERIC(20,2),
  fcf             NUMERIC(20,2),
  -- Ratios (snapshot cuối năm)
  pe_ratio        NUMERIC(10,4),
  pb_ratio        NUMERIC(10,4),
  roe             NUMERIC(10,4),           -- %
  de_ratio        NUMERIC(10,4),
  current_ratio   NUMERIC(10,4),
  market_cap      NUMERIC(20,2),           -- triệu VND
  UNIQUE(symbol, year)
);

-- Thông tin công ty
CREATE TABLE company_info (
  symbol          TEXT PRIMARY KEY REFERENCES tickers(symbol),
  ceo             TEXT,
  founded         TEXT,
  website         TEXT,
  headquarters    TEXT,
  employees       INT,
  about           TEXT,                    -- ~500 từ
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Tin tức
-- ⚠️ TRƯỚC KHI TẠO: kiểm tra bảng news hiện có trong Supabase.
-- Nếu đã tồn tại với schema khác → viết migration ALTER TABLE thay vì CREATE TABLE mới.
-- Các field bắt buộc phải có: url (UNIQUE), tickers (TEXT[]), published_at
CREATE TABLE news (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  summary         TEXT,                    -- bullet points từ LLM (đã có trong hệ thống hiện tại)
  url             TEXT UNIQUE,
  source          TEXT,                    -- 'vietstock', 'baodautu', 'markettimes', ...
  published_at    TIMESTAMPTZ NOT NULL,
  tickers         TEXT[],                  -- mảng symbol bị tác động (LLM tagged)
  relevance_score NUMERIC(4,3) DEFAULT 0.5,
  raw_content     TEXT,                    -- nội dung gốc scrape được
  llm_reasoning   TEXT,                    -- LLM reasoning tác động danh mục (đã có)
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_news_tickers ON news USING GIN(tickers);
CREATE INDEX idx_news_published ON news(published_at DESC);

-- Lịch sử email digest đã gửi (track để tránh gửi trùng + hiển thị trong Inbox)
-- Bảng này bridge giữa hệ thống email cũ và Inbox mới
CREATE TABLE digest_emails (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id),      -- NULL nếu user chưa có tài khoản Wealbee
  recipient_email TEXT NOT NULL,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  subject         TEXT,
  body_html       TEXT,
  body_markdown   TEXT,                    -- convert từ HTML để hiển thị trong Inbox
  tickers         TEXT[],                  -- mã CP được đề cập
  news_ids        BIGINT[],                -- references news.id đã được dùng
  resend_message_id TEXT,                  -- ID từ Resend để track delivery
  status          TEXT DEFAULT 'sent'      -- 'sent', 'failed', 'bounced'
);

-- Cổ tức (lịch sử + lịch sắp tới) — Python script đang pull hàng ngày
-- ⚠️ Kiểm tra bảng hiện có trước: nếu đã tồn tại → chỉ verify schema, không tạo lại
CREATE TABLE dividends (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT REFERENCES tickers(symbol),
  ex_date         DATE NOT NULL,            -- Ngày GDKHQ (ngày không được hưởng cổ tức)
  payment_date    DATE,                     -- Ngày thực trả
  dividend_type   TEXT DEFAULT 'cash',      -- 'cash', 'stock'
  dividend_amount NUMERIC(15,2),            -- VND/cổ phiếu (tiền mặt) hoặc tỷ lệ (cổ phiếu)
  dividend_yield  NUMERIC(8,4),             -- % tính tại thời điểm công bố
  fiscal_year     SMALLINT,
  announcement_date DATE,
  is_upcoming     BOOLEAN DEFAULT false,    -- true nếu ex_date trong tương lai
  source          TEXT DEFAULT 'vietstock', -- nguồn dữ liệu
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, ex_date, dividend_type)
);
CREATE INDEX idx_dividends_symbol_date ON dividends(symbol, ex_date DESC);
CREATE INDEX idx_dividends_upcoming ON dividends(ex_date) WHERE is_upcoming = true;

-- Giao dịch nội bộ (insider trading) — Python script kéo hàng ngày từ VietStock
-- ⚠️ Kiểm tra bảng hiện có trước: nếu đã tồn tại → chỉ verify schema, không tạo lại
CREATE TABLE insider_transactions (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT REFERENCES tickers(symbol),
  trader_name     TEXT,
  position        TEXT,                    -- 'CEO', 'Chủ tịch HĐQT', ...
  transaction_type TEXT,                   -- 'buy', 'sell'
  quantity        BIGINT,
  price           NUMERIC(15,2),
  transaction_date DATE,
  filing_date     DATE,
  disclosure_url  TEXT,
  UNIQUE(symbol, trader_name, transaction_date, transaction_type)
);

-- Lịch sự kiện (ĐHCĐ, GDKHQ, earnings)
CREATE TABLE events_calendar (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT REFERENCES tickers(symbol),
  event_type      TEXT NOT NULL,           -- 'AGM', 'DIVIDEND', 'EARNINGS', 'LISTING'
  event_date      DATE NOT NULL,
  description     TEXT,
  ex_dividend_date DATE,
  dividend_amount  NUMERIC(15,2)
);

-- Lịch giao dịch HOSE 2026
CREATE TABLE trading_calendar (
  date            DATE PRIMARY KEY,
  is_trading_day  BOOLEAN NOT NULL,
  note            TEXT
);
```

### 2.2 User Data (RLS bắt buộc)

```sql
-- Hồ sơ người dùng (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  avatar_url      TEXT,
  plan            TEXT DEFAULT 'free',     -- 'free', 'pro', 'pro_plus'
  plan_expires_at TIMESTAMPTZ,
  onboarding_done BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Cài đặt người dùng
CREATE TABLE user_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id),
  theme           TEXT DEFAULT 'dark',     -- 'light', 'dark', 'midnight'
  notif_email     BOOLEAN DEFAULT true,
  notif_push      BOOLEAN DEFAULT true,
  notif_digest    BOOLEAN DEFAULT true,
  notif_agent     BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Danh mục đầu tư
CREATE TABLE portfolios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT DEFAULT 'Danh mục chính',
  is_default      BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE holdings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id    UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol          TEXT REFERENCES tickers(symbol),
  quantity        NUMERIC(15,4) NOT NULL,
  avg_cost        NUMERIC(15,2) NOT NULL,   -- VND/cp, giá vốn TB
  entry_date      DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Watchlist
CREATE TABLE watchlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT DEFAULT 'Watchlist'
);

CREATE TABLE watchlist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol          TEXT REFERENCES tickers(symbol),
  added_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(watchlist_id, symbol)
);

-- Agent templates (system-level, không thuộc user)
CREATE TABLE agent_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  trigger_config  JSONB NOT NULL,          -- {type, cron_expr, event_type}
  system_prompt   TEXT NOT NULL,
  user_prompt     TEXT,
  tools           TEXT[],                  -- ['price.realtime', 'news.digest', ...]
  model           TEXT DEFAULT 'claude-sonnet-4-6',
  est_tokens      INT,
  is_active       BOOLEAN DEFAULT true
);

-- Agents của user (tạo từ đầu hoặc clone từ template)
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES agent_templates(id),  -- NULL nếu tạo từ đầu
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'active',   -- 'active', 'paused', 'error'
  trigger_config  JSONB NOT NULL,
  system_prompt   TEXT NOT NULL,
  user_prompt     TEXT,
  tools           TEXT[],
  model           TEXT DEFAULT 'claude-sonnet-4-6',
  kb_file_ids     UUID[],                  -- files từ KB đính kèm
  runs_today      INT DEFAULT 0,
  runs_total      INT DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Lịch sử chạy agent
CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT,                    -- 'running', 'success', 'error', 'skipped'
  tokens_input    INT,
  tokens_output   INT,
  error_message   TEXT
);

-- Inbox — brief/alert từ agent
CREATE TABLE briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES agents(id),
  agent_run_id    UUID REFERENCES agent_runs(id),
  title           TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  tickers         TEXT[],
  severity        TEXT DEFAULT 'info',     -- 'info', 'warn', 'critical'
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_briefs_user_unread ON briefs(user_id, is_read, created_at DESC);

-- Knowledge Base files
CREATE TABLE kb_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  file_type       TEXT NOT NULL,           -- 'pdf', 'md', 'txt'
  size_bytes      BIGINT,
  storage_path    TEXT NOT NULL,           -- Supabase Storage path
  chunk_count     INT DEFAULT 0,
  is_processed    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- KB chunks với vector embedding
CREATE TABLE kb_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID REFERENCES kb_files(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  chunk_index     INT NOT NULL,
  embedding       vector(1536),            -- OpenAI text-embedding-3-small (1536 dim, key đã có)
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Chat sessions
CREATE TABLE chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type    TEXT,                    -- 'ticker', 'portfolio', 'general'
  context_id      TEXT,                    -- symbol nếu context_type = 'ticker'
  title           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,           -- 'user', 'assistant', 'tool'
  content         TEXT,
  tool_calls      JSONB,
  tool_results    JSONB,
  tokens_used     INT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 RLS Policies (bắt buộc cho mọi bảng user)

```sql
-- Bật RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Pattern chung: user chỉ đọc/sửa/xóa data của mình
-- (lặp cho từng bảng)
CREATE POLICY "user_own_data" ON portfolios
  FOR ALL USING (user_id = auth.uid());

-- Market data: public read
ALTER TABLE tickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_tickers" ON tickers FOR SELECT USING (true);
CREATE POLICY "public_read_prices" ON prices_daily FOR SELECT USING (true);
-- (tương tự cho news, company_info, financials_annual, market_indices)
```

---

## 3. Nguồn Dữ Liệu — API Reference

### 3.1 vnstock Library — ĐÃ CÓ, DATA ĐÃ TRONG SUPABASE

> **Không cần call API trực tiếp nữa.** Python scripts dùng vnstock đang chạy và lưu data vào Supabase hàng ngày.  
> Section này giữ lại để tham khảo khi cần debug hoặc backfill thêm data.

```python
# github.com/thinh-vu/vnstock — Python wrapper cho HOSE/HNX data
# Cài đặt: pip install vnstock

from vnstock import *

# Lịch sử giá (OHLCV) — ĐÃ PULL VÀ LƯU
stock = Vnstock().stock(symbol='VCB', source='VCI')
df = stock.quote.history(start='2020-01-01', end='2025-12-31', interval='1D')
# Fields: time, open, high, low, close, volume

# Fundamentals — ĐÃ PULL VÀ LƯU  
df_income = stock.finance.income_statement(period='year', lang='vi')
df_balance = stock.finance.balance_sheet(period='year', lang='vi')
df_cashflow = stock.finance.cash_flow(period='year', lang='vi')
df_ratio = stock.finance.ratio(period='year', lang='vi')

# Thông tin công ty
df_company = stock.company.overview()
df_officers = stock.company.officers()

# Cổ tức — ĐÃ PULL VÀ LƯU (daily script)
df_dividend = stock.company.dividends()

# Insider trading — ĐÃ PULL VÀ LƯU (daily từ VietStock)
# VietStock endpoint: https://finance.vietstock.vn/data/transaction-info
# (xem script Python hiện có để biết exact endpoint và params)

# NOTE: vnstock v3 (2024) có breaking changes so với v2
# Verify: pip show vnstock | grep Version
# Nếu < 3.0: upgrade và update scripts
```

**Mapping vnstock fields → Supabase schema** (cần verify với data thực tế):

| vnstock field | Supabase column | Đơn vị | Ghi chú |
|---|---|---|---|
| `time` | `prices_daily.date` | DATE | Convert từ string |
| `close` | `prices_daily.close` | VND | Đã chia 1000 chưa? |
| `volume` | `prices_daily.volume` | Cổ phiếu | Verify đơn vị |
| Net Revenue | `financials_annual.revenue` | Tỷ VND? | **Xác nhận đơn vị** |
| Net Profit | `financials_annual.net_income` | Tỷ VND? | **Xác nhận đơn vị** |
| EPS | `financials_annual.eps` | VND | Thường đúng |
| P/E | `financials_annual.pe_ratio` | x | Verify |

> ⚠️ **Critical:** Xác nhận đơn vị tiền tệ trong DB (tỷ VND hay triệu VND) TRƯỚC KHI FE hiển thị.  
> Sai đơn vị → số hiện sai 1000 lần → investor demo thảm họa.

### 3.2 News Sources — ĐÃ CÓ HỆ THỐNG SCRAPING

> **Không cần build mới.** Hệ thống đang scrape 10+ nguồn và lưu vào Supabase.
> Task cần làm: audit schema hiện có → align với `news` table ở Section 2.

```
Nguồn đã scrape (xác nhận với team):
  VietStock, BaoDauTu, MarketTimes, ... (10+ nguồn)

LLM pipeline đã có:
  Input:  raw article content
  Output: ticker tags + bullet summary + portfolio reasoning

Cần verify:
  - Bảng hiện tại tên là gì? (news? articles? news_articles?)
  - Có field tickers[] chưa hay đang store khác?
  - LLM summary đang store ở field nào?
  - llm_reasoning per-user hay per-article?
  - Tần suất scrape hiện tại là bao nhiêu?

Nếu schema khác với Section 2.1 → viết migration:
  ALTER TABLE {existing_table} ADD COLUMN IF NOT EXISTS llm_reasoning TEXT;
  ALTER TABLE {existing_table} ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(4,3);
  -- Không rename bảng nếu GHA đang reference — update GHA query thay thế
```

### 3.3 VN-Index / Market Indices

```
SSI iBoard (public):
GET https://iboard.ssi.com.vn/dchart/api/history
  ?symbol=VNINDEX&resolution=D&from={unix}&to={unix}

TCBS intraday index:
GET https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/his-price
  ?ticker=VNINDEX&type=index&resolution=1&from={unix}&to={unix}
Resolution: 1 = 1 phút · D = ngày
```

### 3.4 VN30 Danh Sách Chuẩn (2026)

```
Seed data SQL (30 mã):
ACB, BCM, BID, BVH, CTG, FPT, GAS, GVR, HDB, HPG,
MBB, MWG, MSN, NVL, PDR, PLX, PNJ, POW, SAB, SHB,
SSB, SSI, STB, TCB, TPB, VCB, VHM, VIC, VJC, VNM
+ VPB (nếu vẫn trong VN30 tại thời điểm demo · kiểm tra lại)

Sector mapping (cần verify với HOSE):
Banking:      VCB, BID, CTG, MBB, TCB, ACB, STB, HDB, SSB, TPB, VPB, SHB
Real Estate:  VIC, VHM, NVL, PDR
Technology:   FPT
Steel:        HPG
Consumer:     MWG, VNM, MSN, PNJ, SAB
Energy:       GAS, PLX, POW, GVR
Securities:   SSI
Insurance:    BVH
Conglomerate: BCM
```

### 3.5 Resend Email — Đã Có, Cần Mở Rộng

```
Hiện tại:
  Resend gửi email HTML đến danh sách user đã để email + danh mục
  Template: HTML cố định, dynamic fields từ LLM output

Cần bổ sung cho Wealbee platform:
  1. Sau khi gửi email → insert vào digest_emails (bridge table)
  2. Nếu user có tài khoản Wealbee → cũng insert vào briefs table
     (để hiển thị trong Inbox trong app)
  3. Resend webhook (optional): nhận delivery/bounce status → update digest_emails.status

Cách tìm user_id từ email:
  SELECT id FROM auth.users WHERE email = recipient_email
  -- Nếu NULL → user chưa có tài khoản → chỉ gửi email, không write briefs

Env vars cần có trong Edge Function:
  RESEND_API_KEY    (đã có trong GHA secrets → copy sang Supabase secrets)
```

### 3.6 GitHub Actions — Scheduler Hiện Tại

```yaml
# .github/workflows/daily-digest.yml (tên file cần confirm)
# Hiện tại: chạy Python/Node script trực tiếp trong runner

# Sau khi refactor (không thay đổi schedule, chỉ thay logic):
name: Daily Market Digest
on:
  schedule:
    - cron: '0 0 * * 1-5'    # 07:00 UTC+7 = 00:00 UTC, T2-T6
  workflow_dispatch:           # Cho phép trigger thủ công (test)

jobs:
  run-digest:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Supabase Edge Function
        run: |
          curl -X POST \
            "${{ secrets.SUPABASE_URL }}/functions/v1/run-daily-digest" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"trigger": "scheduled", "date": "'$(date +%Y-%m-%d)'"}'

# Lợi ích sau refactor:
# - Logic tập trung trong Edge Function (test được từ UI)
# - GHA chỉ là scheduler wrapper
# - Có thể add thêm users trigger Edge Function thủ công từ app
```

### 3.7 Lịch Nghỉ Lễ HOSE 2026 (seed data)

```sql
-- Chỉ liệt kê ngày nghỉ HOSE · cập nhật theo thông báo chính thức
INSERT INTO trading_calendar (date, is_trading_day, note) VALUES
('2026-01-01', false, 'Tết Dương lịch'),
('2026-01-26', false, 'Tết Nguyên Đán (nghỉ bù)'),
('2026-01-27', false, 'Tết Nguyên Đán'),
('2026-01-28', false, 'Tết Nguyên Đán'),
('2026-01-29', false, 'Tết Nguyên Đán'),
('2026-01-30', false, 'Tết Nguyên Đán'),
('2026-02-02', false, 'Tết Nguyên Đán'),
('2026-04-07', false, 'Giỗ Tổ Hùng Vương'),
('2026-04-30', false, 'Ngày Giải phóng'),
('2026-05-01', false, 'Quốc tế Lao động'),
('2026-09-02', false, 'Quốc khánh'),
-- Xác nhận ngày nghỉ bù từ thông báo HOSE chính thức
```

---

## 4. Roadmap — Phân Chia Theo Ngày

### PHASE 1 · FOUNDATION (Ngày 1-2 · 17-18/05 Sat-Sun)

> **Mục tiêu:** Supabase chạy, auth hoạt động, FE kết nối được DB

#### Ngày 1 — Thứ 7, 17/05

**Task 1.0 — Audit Hệ Thống Hiện Có (ƯU TIÊN ĐẦU TIÊN · ~2 giờ)**

> Làm việc này TRƯỚC KHI setup bất cứ thứ gì. Kết quả audit quyết định bao nhiêu việc đã xong.

- [ ] Kết nối Supabase hiện có (project đang chạy GHA + email)
- [ ] Chạy: `SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
- [ ] Liệt kê schema từng bảng: `\d+ {table_name}` cho mỗi bảng
- [ ] Xem 5 row mẫu của bảng news/articles: `SELECT * FROM {news_table} LIMIT 5`
- [ ] Mở GitHub Actions workflow → đọc script đang chạy, note: ngôn ngữ (Python/Node), packages, env vars
- [ ] Kiểm tra Resend dashboard: template name, dynamic variables đang dùng
- [ ] Đếm users hiện có: `SELECT COUNT(*), COUNT(DISTINCT portfolio_symbols) FROM {users_table}`
- [ ] Ghi lại kết quả vào comment trong file này ngay bên dưới task

**→ Dựa trên kết quả audit, điều chỉnh các migration task bên dưới.**  
**Nếu Supabase project hiện tại = project mới → skip audit, bắt đầu Task 1.1.**

---

**Task 1.1 — Khởi tạo / Kết Nối Supabase Project**

> Nếu đã có Supabase project với news pipeline → dùng project đó, KHÔNG tạo mới (tránh migrate data).  
> Nếu cần project mới: region Singapore ap-southeast-1 (latency thấp nhất cho VN).

- [ ] Xác định project Supabase nào sẽ dùng cho Wealbee platform (hiện có hay mới)
- [ ] Lưu `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local`
- [ ] Enable extensions nếu chưa có: `uuid-ossp`, `pgvector`, `pg_cron` (Settings → Database → Extensions)
- [ ] Verify pgvector version ≥ 0.5.0 (hỗ trợ IVFFlat index)

**Task 1.2 — Chạy Schema Migration**
- [ ] **Trước khi chạy:** so sánh schema Section 2 với kết quả audit Task 1.0
- [ ] Với bảng **chưa tồn tại**: chạy `CREATE TABLE` từ Section 2
- [ ] Với bảng **đã tồn tại nhưng thiếu cột**: viết `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- [ ] Với bảng **đã tồn tại và đủ cột**: skip, chỉ verify RLS
- [ ] **Đặc biệt với bảng news:** dùng ALTER, không DROP + CREATE (không mất data hiện có)
- [ ] Chạy RLS policies cho các bảng mới
- [ ] Verify: các tables cần thiết tồn tại trong Table Editor
- [ ] Verify: pgvector index tạo thành công (`\d kb_chunks`)

**Task 1.3 — Supabase Auth Setup**
- [ ] Enable Email Auth (Settings → Auth → Providers)
- [ ] Enable Google OAuth:
  - Tạo Google Cloud project → OAuth 2.0 Client ID
  - Redirect URI: `https://{project}.supabase.co/auth/v1/callback`
  - Dán Client ID + Secret vào Supabase Auth settings
- [ ] Tắt "Confirm email" để demo không cần verify email
- [ ] Tạo `auth.users` trigger → auto-insert vào `user_profiles` + `user_settings` + `portfolios` + `watchlists`

```sql
-- Trigger tạo user profile khi đăng ký
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_url)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.portfolios (user_id, name, is_default)
    VALUES (NEW.id, 'Danh mục chính', true);
  INSERT INTO public.watchlists (user_id, name) VALUES (NEW.id, 'Watchlist');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

**Task 1.4 — Supabase Storage Setup**
- [ ] Tạo bucket `kb-files` (private, authenticated only)
- [ ] Set max file size: 20MB
- [ ] Allowed MIME types: `application/pdf`, `text/markdown`, `text/plain`
- [ ] RLS policy: user chỉ upload/download file của mình

#### Ngày 2 — Chủ nhật, 18/05

**Task 1.5 — FE: Kết Nối Supabase Client**
- [ ] `npm install @supabase/supabase-js zustand`
- [ ] Tạo `src/lib/supabase.ts` — khởi tạo Supabase client
- [ ] Tạo `src/store/authStore.ts` (Zustand) — `user`, `session`, `loading`
- [ ] Thêm `<AuthProvider>` bao quanh App
- [ ] Route guard: trang nào cần auth → redirect `/login` nếu chưa đăng nhập

**Task 1.6 — Auth UI**
- [ ] Trang Login: Email + Password + Google OAuth button (dùng component có sẵn từ UI lib)
- [ ] Trang Signup: Tương tự login
- [ ] Kết nối Onboarding flow sau signup (đã có UI, cần kết nối `user_profiles.onboarding_done`)
- [ ] Avatar + tên user hiển thị trên Sidebar (lấy từ `user_profiles`)
- [ ] Nút Logout

**Checklist cuối Ngày 2:**
- [ ] Đăng ký tài khoản mới → profile tự tạo
- [ ] Đăng nhập Google → redirect vào dashboard
- [ ] Sidebar hiện tên/avatar đúng
- [ ] Refresh page → vẫn giữ session

---

### PHASE 2 · DATA ALIGNMENT + FE CONNECTION (Ngày 3-4 · 19-20/05 Mon-Tue)

> **Mục tiêu:** Data đã có trong Supabase → align schema → FE hiển thị dữ liệu thật  
> **Tiết kiệm:** ~2 ngày không phải viết scraper. Task 2.1-2.5 chuyển từ "build" sang "verify + align".

#### Ngày 3 — Thứ 2, 19/05

**Task 2.1 — Audit & Align Schema Giá + Tickers** ✅ DATA ĐÃ CÓ, CHỈ ALIGN

- [ ] Kiểm tra tên bảng giá hiện có: thường là `prices`, `stock_prices`, `ohlcv`, hoặc `prices_daily`
- [ ] Verify coverage VN30: `SELECT symbol, COUNT(*) rows, MIN(date), MAX(date) FROM {price_table} WHERE symbol IN ('VCB','HPG','FPT') GROUP BY symbol`
  - Expect: ≥ 1200 rows/symbol, từ 2020 trở đi
- [ ] Verify giá đơn vị: `SELECT symbol, close FROM {price_table} WHERE symbol='VCB' AND date='2025-01-02'` — so với giá thực tế (VCB ~~85,000 VND)
  - Nếu giá ~85 → đang lưu nghìn đồng (chia 1000)
  - Nếu giá ~85000 → đang lưu VND nguyên
  - **Ghi lại đơn vị, nhất quán trong toàn bộ FE**
- [ ] Nếu tên bảng khác `prices_daily` → tạo view hoặc đổi tên trong Edge Function query
- [ ] Seed `tickers` table (nếu chưa có): 30 mã VN30 với symbol, name, sector, is_vn30=true
  - Lấy tên đầy đủ từ: `SELECT DISTINCT symbol FROM {price_table}` + Google để điền tên

**Task 2.2 — Audit & Align Schema Fundamentals** ✅ DATA ĐÃ CÓ, CHỈ ALIGN

- [ ] Verify bảng fundamentals: `SELECT symbol, year, revenue, net_income, eps FROM {fundamental_table} WHERE symbol='HPG' ORDER BY year`
  - So sánh với báo cáo HPG public: revenue 2024 ~140,000 tỷ VND
  - **Xác nhận đơn vị:** tỷ VND? triệu VND? → ghi lại, chuẩn hóa về triệu VND
- [ ] Map tên cột sang schema Section 2.1 nếu khác:
  ```sql
  -- Ví dụ nếu bảng hiện tại tên khác cột:
  ALTER TABLE {fundamental_table} RENAME COLUMN net_profit TO net_income;
  -- Hoặc tạo view thay vì đổi tên (an toàn hơn, không break script Python)
  CREATE VIEW financials_annual AS SELECT ..., net_profit AS net_income FROM {fundamental_table};
  ```
- [ ] Verify 5 năm đủ cho VN30: `SELECT COUNT(DISTINCT year) FROM {fundamental_table} WHERE symbol='VCB'` — expect ≥ 5
- [ ] Verify PE, PB, ROE có giá trị hợp lý (PE VCB ~10-15x, ROE ~20-25%)

**Task 2.3 — Audit Insider + Dividend** ✅ DATA ĐÃ CÓ, CHỈ ALIGN

- [ ] **Insider:** `SELECT * FROM {insider_table} ORDER BY transaction_date DESC LIMIT 10` — verify đang nhận data mới
  - Xác nhận có: symbol, trader_name, transaction_type (buy/sell), quantity, price, transaction_date
  - Nếu thiếu field → ALTER TABLE thêm, update Python script output tương ứng
- [ ] **Dividend:** `SELECT * FROM {dividend_table} ORDER BY ex_date DESC LIMIT 10` — verify format
  - Xác nhận có: symbol, ex_date, dividend_amount, payment_date
  - `is_upcoming`: cần tính hoặc thêm column: `WHERE ex_date >= CURRENT_DATE`
  - Nếu bảng chưa có trong DB → tạo bảng `dividends` từ Section 2.1, cần update Python script để ghi vào đó
- [ ] Company info: `SELECT * FROM {company_table} WHERE symbol='FPT'` — verify ceo, about, website

#### Ngày 4 — Thứ 3, 20/05

**Task 2.4 — Daily Update: Verify Automation Đang Chạy**

> Python scripts đã chạy daily qua GHA — đây là task verify chứ không phải build mới

- [ ] Check GHA run history: vào GitHub → Actions → xem 5 run gần nhất có succeed không
- [ ] Verify giá hôm nay đã có trong DB: `SELECT * FROM {price_table} WHERE date = CURRENT_DATE AND symbol = 'VCB'`
  - Nếu hôm nay là ngày giao dịch mà chưa có → tìm nguyên nhân trong GHA log
- [ ] Verify insider hôm nay: `SELECT * FROM {insider_table} WHERE filing_date = CURRENT_DATE LIMIT 5`
- [ ] Verify dividend calendar được update: `SELECT * FROM {dividend_table} WHERE is_upcoming = true ORDER BY ex_date`
- [ ] **Nếu có lỗi** trong GHA → fix Python script, không viết script mới từ đầu

**Task 2.5 — Edge Function: Market Indices Intraday** ← CÒN THIẾU, CẦN BUILD

> Giá cổ phiếu daily đã có, nhưng VN-Index intraday chưa được pull bởi Python scripts

- [ ] Tạo Edge Function `update-indices` (Deno/TypeScript)
- [ ] Fetch VN-Index + HNX-Index từ SSI iBoard public API (không cần auth)
  ```
  SSI: GET https://iboard.ssi.com.vn/dchart/api/history?symbol=VNINDEX&resolution=D&from={unix}&to={unix}
  ```
- [ ] Upsert vào `market_indices` table (tạo nếu chưa có)
- [ ] pg_cron: mỗi 5 phút trong 09:00-15:30 T2-T6 (chỉ cần daily close cho demo, không cần 1 phút)
- [ ] FE Dashboard: hiển thị VN-Index + HNX-Index từ bảng này

**Task 2.6 — FE: Replace Mock Data với Real Supabase Queries**

> Đây là task FE quan trọng nhất — kết nối UI với data thật đã có

- [ ] Tạo `src/lib/supabase.ts` — Supabase client (nếu chưa có từ Phase 1)
- [ ] Tạo `src/hooks/useMarketData.ts`:
  ```typescript
  // useTicker(symbol) → query prices_daily + tickers + company_info + financials_annual
  // useTopMovers() → query prices_daily ngày hôm qua, ORDER BY change_pct DESC/ASC LIMIT 5
  // useMarketIndices() → query market_indices mới nhất
  // useDividends(symbol) → query dividends WHERE symbol AND ex_date >= today - 2Y
  // useInsiderTrades(symbol) → query insider_transactions WHERE symbol
  ```
- [ ] Replace trong `TickerDetail.tsx`:
  - Giá + chart → `prices_daily` (xử lý đơn vị từ Task 2.1)
  - Company info → `company_info`
  - BCTC bảng → `financials_annual` (xử lý đơn vị từ Task 2.2)
  - **[MỚI]** Tab "Cổ tức" → `dividends` table (đã có data)
  - **[MỚI]** Insider trades → `insider_transactions` (đã có data)
- [ ] Replace trong `Dashboard.tsx`:
  - Top gainers/losers → query SQL thật
  - VN-Index → `market_indices`
  - News → `news` table
- [ ] Loading skeletons cho mọi data fetch
- [ ] **Review kỹ:** Số hiển thị đúng đơn vị không? P/E HPG ~10x, Revenue HPG ~140 nghìn tỷ VND

#### Ngày 5 — Thứ 4, 21/05

**Task 2.7 — News Integration (KHÔNG XÂY LẠI — chỉ bridge + align)**

> ✅ Scraping từ 10+ nguồn đã hoạt động. ✅ LLM tagging đã chạy. Việc cần làm: align schema + kết nối FE.

- [ ] **Schema alignment** (dựa trên kết quả audit Task 1.0):
  - [ ] Verify bảng news có đủ: `url`, `title`, `summary`, `tickers[]`, `published_at`, `source`
  - [ ] Nếu thiếu `tickers TEXT[]` → `ALTER TABLE news ADD COLUMN IF NOT EXISTS tickers TEXT[]`
  - [ ] Nếu thiếu `llm_reasoning TEXT` → `ALTER TABLE news ADD COLUMN IF NOT EXISTS llm_reasoning TEXT`
  - [ ] Tạo index nếu chưa có: `CREATE INDEX IF NOT EXISTS idx_news_tickers ON news USING GIN(tickers)`
- [ ] **Backfill tickers** cho news cũ nếu chưa có (chạy LLM batch 1 lần):
  - [ ] Select news WHERE tickers IS NULL LIMIT 200 → chạy LLM ticker extraction → update
- [ ] **FE connect:** `Dashboard.tsx` news section query `news` table (10 tin mới nhất, `ORDER BY published_at DESC`)
  - [ ] Filter news liên quan VN30: `WHERE tickers && ARRAY['VCB','HPG',...]`
  - [ ] Link "Xem thêm" mở full article URL
- [ ] **Verify scraping vẫn chạy:** sau Task 1.0 audit, confirm GHA workflow active và cron đúng

> **Tiết kiệm:** ~4-6 giờ không cần build scraper mới. Dùng thời gian này cho Phase 6 (Agent packaging).

**Task 2.8 — Intraday Price (Demo Priority: Medium)**

> Daily prices đã có đủ cho phần lớn demo. Intraday nâng cao trải nghiệm nhưng không blocking.

- [ ] Verify: vnstock script hiện có đang pull intraday không? Nếu có → chỉ cần FE Realtime subscribe
- [ ] Nếu chưa có intraday: thêm vào GHA Python script — vnstock `stock.quote.intraday(symbol, page_size=500)`
  - Chỉ pull trong giờ giao dịch 09:00-15:30 — thêm check trong script
  - Upsert vào `prices_intraday` table
- [ ] Supabase Realtime: FE subscribe changes trên `prices_intraday` → auto refresh giá
- [ ] **Nếu không kịp:** dùng giá daily close hiện tại — vẫn demo được, chỉ không "live"

**Checklist cuối Phase 2:**
- [ ] Dashboard: VN-Index + HNX-Index hiển thị đúng (close hôm qua nếu ngoài giờ giao dịch)
- [ ] Top gainers/losers VN30: query SQL từ `prices_daily`, số đúng với HOSE
- [ ] Ticker Detail VCB: chart 5 năm thật, giá đơn vị đúng (VND hoặc nghìn đồng nhất quán)
- [ ] Ticker Detail HPG: BCTC 5 năm — revenue/net income đơn vị đúng, so được với báo cáo công bố
- [ ] **[MỚI]** Ticker Detail: có tab "Cổ tức" với lịch sử + sắp tới
- [ ] **[MỚI]** Ticker Detail: có section "Insider Trades" với giao dịch 90 ngày gần nhất
- [ ] News section Dashboard: tin thật từ 10+ nguồn, có tickers[] tagged
- [ ] GHA Python scripts: verify đang chạy, không lỗi (check Actions run history)
- [ ] **Quan trọng nhất:** Không có số nào sai đơn vị — verify HPG P/E ~10x, VCB ~12x

---

### PHASE 3 · PORTFOLIO + WATCHLIST (Ngày 5-6 · 21-22/05 Wed-Thu)

> **Mục đích:** User có thể nhập danh mục thật, xem P&L thật

#### Ngày 5-6 (song song với Phase 2 tasks còn lại)

**Task 3.1 — Portfolio CRUD API**
- [ ] Supabase query: `holdings` JOIN `prices_daily` (latest price) → tính P&L real-time
- [ ] FE `Portfolio.tsx`: replace mock CHART_DATA bằng query thật
- [ ] Nút thêm holding: modal → insert vào `holdings`
- [ ] Nút sửa/xóa holding
- [ ] CSV Import: parse file → validate → insert batch
- [ ] P&L formula: `(current_price - avg_cost) * quantity`

**Task 3.2 — Portfolio Performance Chart**
- [ ] Tính portfolio value theo ngày: JOIN `holdings` × `prices_daily` GROUP BY date
- [ ] So sánh với VN-Index từ `market_indices`
- [ ] Edge case: holding chưa có price ngày đó → dùng giá gần nhất

**Task 3.3 — Watchlist**
- [ ] CRUD API cho `watchlist_items`
- [ ] FE: thêm/xóa mã khỏi watchlist từ bất kỳ trang nào
- [ ] Global Search: gợi ý từ `tickers` table

**Checklist cuối Phase 3:**
- [ ] Thêm VCB 100cp giá vốn 85,000 → P&L hiển thị đúng
- [ ] Chart portfolio performance 1M so với VN-Index
- [ ] Watchlist lưu qua refresh

---

### PHASE 4 · AI CHAT (Ngày 6-7 · 22-23/05 Thu-Fri)

> **Mục đích:** Chat trong ActionHub hiểu context trang hiện tại, gọi tool thật

**Task 4.1 — Claude API Setup**
- [ ] Thêm `ANTHROPIC_API_KEY` vào Supabase Edge Function secrets
- [ ] Tạo Edge Function `chat` (POST `/functions/v1/chat`)
- [ ] **Prompt caching bắt buộc:** system prompt với `cache_control: {type: "ephemeral"}` — tiết kiệm 70% cost
- [ ] Error handling: rate limit → retry với exponential backoff

**Task 4.2 — Tool Calling Framework**

Claude tool use — implement 5 tools cốt lõi cho Chat:

```typescript
// Tool definitions cho Claude — tất cả đều query Supabase với data thật
const CHAT_TOOLS = [
  {
    name: "get_price",
    description: "Lấy giá cổ phiếu hiện tại hoặc lịch sử",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mã cổ phiếu VD: VCB, HPG" },
        period: { type: "string", enum: ["today", "5D", "1M", "3M", "YTD", "5Y"] }
      },
      required: ["symbol"]
    }
    // → query prices_daily, trả về OHLCV + change%
  },
  {
    name: "get_financials",
    description: "Lấy báo cáo tài chính 5 năm của công ty (đã có data thật từ vnstock)",
    // → query financials_annual, trả về revenue, net_income, EPS, PE, PB, ROE...
  },
  {
    name: "get_news",
    description: "Tìm tin tức liên quan đến mã cổ phiếu (đã có data từ 10+ nguồn)",
    // → query news WHERE tickers @> ARRAY[symbol] ORDER BY published_at DESC
  },
  {
    name: "get_dividends",   // MỚI — data đã có
    description: "Lấy lịch sử cổ tức và ngày GDKHQ sắp tới của cổ phiếu",
    // → query dividends WHERE symbol, ORDER BY ex_date DESC
  },
  {
    name: "get_insider_trades",   // MỚI — data đã có từ VietStock
    description: "Lấy giao dịch nội bộ (insider trading) của ban lãnh đạo công ty",
    // → query insider_transactions WHERE symbol, 90 ngày gần nhất
  },
  {
    name: "get_portfolio",
    description: "Lấy danh mục đầu tư hiện tại của người dùng",
    // → query holdings JOIN prices_daily, tính P&L real-time
  },
  {
    name: "search_knowledge_base",
    description: "Tìm kiếm trong tài liệu người dùng đã upload (PDF, TXT, MD)",
    // → OpenAI embed query → pgvector cosine search → top 5 chunks
  }
]
```

- [ ] Claude viết tool implementations (query Supabase)
- [ ] **Review kỹ:** tool `get_portfolio` phải dùng `user_id` từ JWT — không expose user khác
- [ ] Tool execution loop: Claude gọi tool → hệ thống execute → trả kết quả → Claude tiếp tục
- [ ] Max iterations: 5 (tránh infinite loop)

**Task 4.3 — Context Builder**
- [ ] Khi user đang xem TickerDetail (VCB) → system prompt thêm: "User đang xem VCB. Giá hiện tại: X, P/E: Y..."
- [ ] Khi user đang xem Portfolio → system prompt thêm: holdings summary
- [ ] Context được inject vào system prompt trước khi gửi Claude

**Task 4.4 — FE Chat UI**
- [ ] `ActionHub.tsx`: thêm tab "Chat" bên cạnh Context Cards
- [ ] Chat input + message list (streaming response)
- [ ] Streaming: Claude API với `stream: true` → FE nhận từng chunk qua Server-Sent Events
- [ ] Tool execution hiển thị: "Đang tra giá VCB..." (loading state khi tool đang chạy)
- [ ] Session persistence: lưu `chat_sessions` + `chat_messages` vào Supabase
- [ ] Nút "Xóa chat" → clear session

**Task 4.5 — System Prompt Chất Lượng**
```
Bạn là Wealbee AI — trợ lý phân tích thông tin thị trường chứng khoán Việt Nam.

NGUYÊN TẮC BẮT BUỘC:
- Phân tích dựa trên dữ liệu. Trích dẫn số liệu cụ thể.
- KHÔNG khuyến nghị mua/bán/nắm giữ bất kỳ cổ phiếu nào.
- KHÔNG đưa ra mục tiêu giá hoặc dự báo giá.
- Khi không có dữ liệu → nói rõ "Tôi không có thông tin về X".
- Trả lời bằng tiếng Việt, ngắn gọn, súc tích.
- Số tiền: đơn vị nghìn đồng hoặc tỷ đồng (nhất quán trong 1 phiên).

CONTEXT HIỆN TẠI:
{context_injection}

NGÀY HÔM NAY: {current_date}
NGƯỜI DÙNG: {user_display_name}
```

**Checklist cuối Phase 4:**
- [ ] Chat: "VCB hôm nay như thế nào?" → trả lời với giá thật từ DB
- [ ] Chat: "Danh mục của tôi đang lãi/lỗ bao nhiêu?" → trả về P&L đúng
- [ ] Chat khi đang xem HPG → tự nhận biết context là HPG
- [ ] Claude không bao giờ output "nên mua", "khuyến nghị"
- [ ] Streaming response mượt, không lag

---

### PHASE 5 · KNOWLEDGE BASE + RAG (Ngày 7-8 · 23-24/05 Fri-Sat)

> **Mục đích:** User upload PDF báo cáo phân tích → Agent và Chat có thể tham chiếu

**Task 5.1 — File Upload**
- [ ] FE `KnowledgeBase.tsx`: connect upload button → Supabase Storage
- [ ] Upload flow: file → Storage `kb-files/{user_id}/{uuid}.{ext}` → insert `kb_files` record
- [ ] Hiển thị progress bar trong quá trình upload
- [ ] Validate: max 20MB, chỉ PDF/MD/TXT

**Task 5.2 — Text Extraction**

> Edge Function `process-kb-file` — trigger khi insert vào `kb_files`

```typescript
// Text extraction logic:
// - PDF: dùng @cf-wasm/pdfium hoặc pdf2json (check Deno compatibility)
//   Fallback: nếu quá nặng cho Edge Function → dùng external API (pdfco, Adobe Extract)
// - TXT/MD: đọc thẳng từ Storage
// Chunking: 512 tokens per chunk, overlap 50 tokens
//   Dùng tiktoken hoặc đếm ký tự (4 chars/token estimate)
```

- [ ] Edge Function: download file từ Storage → extract text → chunk → embed → insert `kb_chunks`
- [ ] **Review kỹ:** PDF extraction quality — test với báo cáo phân tích thực tế (VCBS, FPTS Research)
- [ ] **Embedding: dùng OpenAI `text-embedding-3-small`** — API key đã có, 1536 dim, schema đã đúng
  ```typescript
  // Trong Edge Function (Deno):
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',   // 1536 dim, $0.02/1M tokens
    input: chunkText,
  });
  const embedding = response.data[0].embedding; // number[1536]
  ```
  - OPENAI_API_KEY đã có → thêm vào Supabase Edge Function secrets
  - **Nhất quán:** toàn bộ KB dùng text-embedding-3-small, không trộn provider
- [ ] Update `kb_files.is_processed = true`, `chunk_count = N` sau khi xong
- [ ] Supabase trigger: auto-call Edge Function khi insert `kb_files`

**Task 5.3 — Vector Search Function**

```sql
-- Hàm tìm kiếm trong KB của 1 user
CREATE OR REPLACE FUNCTION search_kb(
  query_embedding vector(1536),            -- OpenAI text-embedding-3-small
  user_id_input UUID,
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 5
)
RETURNS TABLE (content TEXT, similarity FLOAT, file_name TEXT)
AS $$
  SELECT
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    kf.name AS file_name
  FROM kb_chunks kc
  JOIN kb_files kf ON kf.id = kc.file_id
  WHERE kc.user_id = user_id_input
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

- [ ] Verify function hoạt động với test query
- [ ] FE: hiển thị "Đã xử lý · N chunks" sau khi file được process

**Task 5.4 — RAG trong Chat**
- [ ] Tool `search_knowledge_base` trong Chat: gọi `search_kb` function → trả top 5 chunks
- [ ] Claude system prompt: "Khi user hỏi về X, hãy kiểm tra Knowledge Base của họ trước"
- [ ] Format context từ KB: `[Từ tài liệu "{file_name}"]: {content}`
- [ ] Test: upload PDF báo cáo VCBS về VCB → hỏi "Theo báo cáo của bạn, VCB có điểm mạnh gì?"

**Checklist cuối Phase 5:**
- [ ] Upload PDF 5MB → process thành công trong < 30 giây
- [ ] KB page hiện file đã upload với chunk count
- [ ] Chat với context từ PDF uploaded: trích dẫn đúng nội dung
- [ ] Xóa file → xóa cả chunks

---

### PHASE 6 · AGENT SYSTEM (Ngày 8-10 · 24-26/05 Sat-Mon)

> **Mục đích:** 3 template agent chạy thật, Agent Studio save/load, user tạo agent mới  
> **Lợi thế:** Daily Market Digest đã có pipeline hoạt động — Phase này tập trung packaging + per-user control

#### Ngày 8 — Thứ 7, 24/05

**Task 6.0 — Refactor GHA → Edge Function (cầu nối quan trọng nhất)**

> Đây là task "unlock" toàn bộ Agent platform. Khi xong, mọi agent có thể test thủ công từ UI.

```
Hiện tại:   GHA runner → script Python/Node → LLM → Resend → done
Mục tiêu:   GHA runner → POST Edge Function → Edge Function (logic + LLM + Resend + Inbox write)

Lợi ích:
  1. User có thể trigger agent thủ công từ nút "Run" trong UI
  2. Agent Studio "Test" button gọi cùng 1 Edge Function → output nhất quán
  3. Logic tập trung ở 1 nơi, không split giữa GHA script và app
  4. Dễ debug (Edge Function log trong Supabase dashboard)
```

- [ ] Tạo Edge Function `run-daily-digest` (Deno/TypeScript)
- [ ] Copy logic từ GHA script vào Edge Function:
  - [ ] Fetch news 24h từ `news` table (đã có data)
  - [ ] Fetch market indices T-1 từ `market_indices`
  - [ ] Fetch top movers VN30 từ `prices_daily`
  - [ ] **[MỚI]** Load user's portfolio từ `holdings` table (per-user thay vì all users)
  - [ ] **[MỚI]** Lấy KB context nếu agent có `kb_file_ids` (RAG search)
  - [ ] Call Claude API với system prompt từ `agents` table
  - [ ] **[MỚI]** Insert kết quả vào `briefs` table (inbox)
  - [ ] **Giữ nguyên** Resend email gửi song song với inbox write
- [ ] **Review kỹ:**
  - [ ] Body Edge Function nhận `agent_id` và `user_id` — không hardcode user nào
  - [ ] Nếu gọi từ GHA (không có `agent_id`) → dùng system template, lặp qua tất cả active users
  - [ ] Service role key chỉ trong Edge Function, không expose ra FE
- [ ] Update GHA workflow: xóa logic, chỉ giữ `curl POST /functions/v1/run-daily-digest`
- [ ] Test thủ công Edge Function từ Supabase dashboard → verify brief xuất hiện trong DB

**Task 6.1 — Seed Agent Templates**
- [ ] Insert 3 templates vào `agent_templates` table
- [ ] Template 1: **Daily Market Digest** (cron 00:00 UTC = 07:00 ICT · T2-T6) — **dùng lại system prompt từ GHA script đang chạy**
- [ ] Template 2: **Portfolio Health** (cron 09:15 + 15:05)
- [ ] Template 3: **Deep Research** (manual)
- [ ] Mỗi template: system_prompt đầy đủ từ `02-agent-templates.md`, tools array, model
- [ ] **Template 1 đặc biệt:** field `execution_fn = 'run-daily-digest'` để link tới Edge Function đã có

**Task 6.2 — Agent Studio → Save/Load**
- [ ] FE `AgentStudio.tsx`: kết nối form với Supabase
- [ ] "Use Template": fetch template từ `agent_templates` → pre-fill form
- [ ] "Save Agent": insert/update `agents` table
- [ ] "Edit Agent": load agent config từ DB → populate form
- [ ] KB file picker: query `kb_files` của user → multi-select → lưu `agents.kb_file_ids`
- [ ] Tool selector: checkboxes → lưu `agents.tools` array
- [ ] Trigger config UI: Cron expression picker hoặc free-text + timezone display
- [ ] Validation: tên bắt buộc, ít nhất 1 tool, system prompt không trống

**Task 6.3 — Agent Execution Engine**

> Edge Function `run-agent` — core logic

```typescript
// POST /functions/v1/run-agent
// Body: { agent_id, user_id, manual: true/false }
//
// Flow:
// 1. Load agent config từ DB (tools, system_prompt, model, kb_file_ids)
// 2. Check trading_calendar — nếu không phải ngày giao dịch → skip (log "skipped")
// 3. Build data context dựa trên tools:
//    - price.realtime → query prices_daily + prices_intraday
//    - news.digest → query news table (24h)
//    - portfolio.holdings → query holdings JOIN prices
//    - calendar.events → query events_calendar
// 4. Build KB context nếu kb_file_ids không rỗng:
//    - Embed agent's system_prompt → vector search trong kb_chunks
//    - Inject top 5 chunks vào context
// 5. Call Claude API với:
//    - system prompt (cached)
//    - user prompt với data context
//    - tools definitions nếu cần tool use
// 6. Insert kết quả vào briefs table
// 7. Update agents.last_run_at, runs_total, runs_today
// 8. Update agent_runs.status = 'success'
```

- [ ] Claude viết Edge Function — review kỹ:
  - [ ] RLS: agent chỉ chạy cho đúng user_id
  - [ ] Token tracking: lưu vào `agent_runs`
  - [ ] Error handling: nếu Claude API fail → status = 'error', không crash Edge Function
  - [ ] Timeout: Edge Function max 50s — cần timeout handling cho Claude call

#### Ngày 9 — Chủ nhật, 25/05

**Task 6.4 — Agent: Daily Market Digest (Template 1 · PACKAGING hệ thống đã có)**

> ✅ Logic LLM đã chạy production. Task này là packaging + per-user personalization + Inbox integration.  
> Ước tính: 4-5 giờ thay vì 1 ngày từ đầu.

```
Workflow HIỆN TẠI (GHA):
  news scrape → LLM summary → Resend email (all users cùng 1 email)

Workflow MỚI (Edge Function, per-user):
  1. query news WHERE published_at > now() - interval '24h'
                AND tickers && user_portfolio_tickers  ← filter theo danh mục CỦA user
  2. query prices_daily T-1: top5 tăng, top5 giảm (VN30)
  3. query market_indices T-1: VN-Index, HNX-Index
  4. query holdings JOIN prices → portfolio snapshot của user
  5. query events_calendar WHERE event_date = CURRENT_DATE
  6. [MỚI] KB search: tìm chunks liên quan từ kb_files của user (nếu có)
  7. Claude Haiku 4.5: compose brief, format 3-section
     Khác trước: có section "Danh mục của bạn" cá nhân hóa theo từng user
  8. Insert vào briefs (Inbox)
  9. Gửi Resend email (giữ nguyên channel cũ, song song với Inbox)
```

- [ ] Verify Edge Function từ Task 6.0 đã chạy đúng với user cụ thể
- [ ] Kiểm tra brief trong `briefs` table: `SELECT * FROM briefs WHERE user_id = '{demo_user_id}' ORDER BY created_at DESC LIMIT 1`
- [ ] So sánh brief mới vs email cũ: nội dung có cá nhân hóa portfolio section không?
- [ ] Verify: không có "nên mua", "khuyến nghị", giá mục tiêu trong output
- [ ] Verify: email vẫn được gửi qua Resend song song với Inbox write
- [ ] pg_cron **chỉ là backup** (GHA là primary scheduler): `SELECT cron.schedule('daily-digest-backup', '5 0 * * 1-5', $$...$$)` — chạy 00:05 UTC phòng GHA fail

**Task 6.5 — Agent: Portfolio Health (Template 2)**

```
Workflow:
1. query holdings JOIN prices_intraday → current P&L mỗi mã
2. Tính allocation drift: current_weight vs target_weight (5% threshold)
3. query events_calendar WHERE event_date = CURRENT_DATE AND symbol IN (portfolio_symbols)
4. query insider_transactions WHERE transaction_date >= CURRENT_DATE - 30 AND symbol IN portfolio
5. Claude Sonnet 4.6: chỉ tạo brief nếu có alert thực sự (P&L > ±5% trong ngày)
6. Insert vào briefs với severity: 'warn' nếu >±5%, 'critical' nếu >±10%
```

- [ ] Implement event-based trigger (kiểm tra ngưỡng giá)
- [ ] Test: simulate price drop > 5% → brief tự sinh
- [ ] pg_cron: chạy 09:15 + 15:05 + mỗi 5 phút trong giờ (check ngưỡng)

**Task 6.6 — Agent: Deep Research (Template 3 · Manual)**

```
Workflow (triggered by user click "Run") — tất cả dữ liệu input đã có thật:
1. User input: chọn symbol (VD: "HPG")
2. query financials_annual 5 năm  ← ✅ đã có từ vnstock
3. query company_info              ← ✅ đã có từ vnstock
4. query prices_daily 1 năm       ← ✅ đã có từ vnstock
5. query news 30 ngày              ← ✅ đã có từ news pipeline
6. query insider_transactions 90 ngày ← ✅ đã có từ VietStock daily pull
7. query dividends 2 năm          ← ✅ đã có từ dividend script
8. KB search: embed "HPG deep research" → tìm tài liệu liên quan (nếu user có upload)
9. Claude Sonnet 4.6: viết báo cáo ~600-800 từ
   Sections: Tổng quan · Tài chính 5 năm · Cổ tức · Insider · Rủi ro · Cơ hội
10. Insert vào briefs với type = 'research'
```

- [ ] Nút "Run Research" trong Agents page + Agent Studio test button
- [ ] Hiển thị progress: "Đang thu thập dữ liệu... → Đang phân tích... → Hoàn thành"
- [ ] Output chất lượng: có số liệu cụ thể, có trích dẫn, không có khuyến nghị

#### Ngày 10 — Thứ 2, 26/05

**Task 6.7 — Inbox Kết Nối Thật**
- [ ] FE `Inbox.tsx`: replace mock briefs → query `briefs` table (của user hiện tại)
- [ ] Supabase Realtime: subscribe → brief mới tự xuất hiện không cần refresh
- [ ] Mark as read: update `briefs.is_read = true`
- [ ] Xóa brief: delete từ DB
- [ ] Unread count badge trên Sidebar icon

**Task 6.7b — Bridge Email History → Inbox (Bonus cho demo)**

> User đã nhận email digest từ trước khi đăng ký Wealbee → hiển thị lịch sử trong Inbox

- [ ] Khi user đăng ký với email đã có trong `digest_emails`:
  - [ ] Query `digest_emails WHERE recipient_email = new_user_email`
  - [ ] Convert `body_html → body_markdown` (dùng html-to-md hoặc đơn giản là strip tags)
  - [ ] Bulk insert vào `briefs` với `user_id = new_user.id`, `created_at = sent_at`
- [ ] FE: briefs cũ hiện trong Inbox với label "Email cũ" (badge khác màu)
- [ ] **Demo value:** user thấy ngay lịch sử 7-14 ngày digest khi vừa đăng ký — ấn tượng với investor

**Task 6.8 — Agent Management UI**
- [ ] FE `Agents.tsx`: query `agents` table của user (replace mock)
- [ ] Pause/Resume: update `agents.status`
- [ ] Delete: soft delete hoặc hard delete với confirm dialog
- [ ] Stats: `runs_today`, `last_run_at`, `runs_total` từ DB
- [ ] Status indicator: active (xanh) / paused (vàng) / error (đỏ)

**Checklist cuối Phase 6:**
- [ ] Use Template "Daily Digest" → Agent Studio pre-fill → Save → Agent xuất hiện trong Agents page
- [ ] Tạo Agent từ đầu (blank) → Save → hoạt động
- [ ] Run thủ công Daily Digest → brief xuất hiện trong Inbox ≤ 15 giây
- [ ] Brief format đúng 3-section, có số liệu thật từ HOSE
- [ ] Portfolio Health chạy 09:15 → nếu có biến động → tạo alert
- [ ] Deep Research cho HPG → báo cáo 500+ từ, có bảng tài chính

---

### PHASE 7 · POLISH & DEMO PREP (Ngày 11-13 · 27-29/05 Tue-Thu)

> **Mục đích:** Mọi luồng demo chạy trơn tru, không crash, dữ liệu hấp dẫn

#### Ngày 11 — Thứ 3, 27/05

**Task 7.1 — Error States & Loading**
- [ ] Mọi data fetch: có skeleton loader (không dùng spinner cho chart/table)
- [ ] Error boundary: nếu Edge Function timeout → hiện message thân thiện, không crash app
- [ ] Empty states: portfolio trống → "Thêm cổ phiếu đầu tiên", inbox trống → "Chưa có brief nào"
- [ ] Network offline indicator

**Task 7.2 — Settings Kết Nối Thật**
- [ ] Profile: update `user_profiles.display_name`, upload avatar → Supabase Storage
- [ ] Notification toggles: update `user_settings`
- [ ] Theme: vẫn dùng localStorage nhưng sync với `user_settings.theme`

**Task 7.3 — Onboarding Kết Nối**
- [ ] Bước 2 (thêm ticker watchlist): insert vào `watchlist_items`
- [ ] Sau hoàn thành: `user_profiles.onboarding_done = true`
- [ ] Không hiện lại onboarding nếu đã done

**Task 7.4 — Compliance Audit**
- [ ] Test tất cả agent outputs: grep cho "nên mua", "khuyến nghị", "buy", "sell recommendation"
- [ ] Chat: prompt thử "HPG nên mua không?" → Claude từ chối đúng cách
- [ ] Disclaimer footer hiển thị trên Dashboard, Portfolio, TickerDetail
- [ ] Compliance banner trong Agent Studio

#### Ngày 12 — Thứ 4, 28/05

**Task 7.5 — Demo User Setup**
- [ ] Tạo tài khoản demo: `demo@wealbee.vn` / `Wealbee2026`
- [ ] **Nếu email này đã có trong `digest_emails`** → brief cũ tự import vào Inbox khi đăng ký (Task 6.7b)
- [ ] **Nếu chưa có** → seed thủ công 3-5 briefs cũ với `created_at` là các ngày trong tuần trước
- [ ] Seed portfolio demo: 5 mã VN30 đa dạng (VCB, HPG, FPT, MWG, TCB) với P&L dương
- [ ] Trigger Daily Digest thủ công 1 lần → verify brief mới xuất hiện trong Inbox VÀ email được gửi
- [ ] Pre-run Deep Research HPG → có sẵn research report
- [ ] Upload 2 file KB mẫu: "VCBS_Report_HPG_Q1_2026.pdf", "Báo cáo ngành Ngân hàng 2025.pdf"
- [ ] 3 agents đã cấu hình sẵn và active
- [ ] **Chuẩn bị demo story:** "Tôi đã dùng email digest từ 2 tuần trước, giờ đăng ký app thì thấy lịch sử ngay"

**Task 7.6 — Performance Check**
- [ ] Dashboard load time < 2 giây (với real data)
- [ ] TickerDetail chart 5Y < 1 giây (index đúng trên prices_daily)
- [ ] Chat response first token < 3 giây
- [ ] Agent run (Daily Digest) < 15 giây end-to-end

**Task 7.7 — Bug Bash**
- [ ] Test toàn bộ happy path (xem checklist demo script bên dưới)
- [ ] Test edge cases: thứ 7/CN → không chạy cron, không có giá intraday
- [ ] Test trên Chrome + Safari (demo thường dùng Mac)
- [ ] Test với portfolio trống, watchlist trống
- [ ] Test upload file KB 10MB

#### Ngày 13 — Thứ 5, 29/05 (Demo Day)

**Task 7.8 — Final Prep**
- [ ] Deploy FE lên Vercel hoặc Netlify (production build)
- [ ] Custom domain (nếu có): app.wealbee.vn
- [ ] Supabase project: upgrade sang Pro plan (không giới hạn Edge Function)
- [ ] Backup DB trước demo
- [ ] Test demo script với tài khoản demo 30 phút trước

---

## 5. Demo Script — Kịch Bản Cho Nhà Đầu Tư

> Thứ tự được thiết kế để kể câu chuyện: "Dữ liệu thật → AI thông minh → Tự động hóa"

```
DEMO FLOW (~15 phút)
Câu chuyện: "Bắt đầu từ email → upgrade lên nền tảng AI đầy đủ"

1. MỞ ĐẦU — STORY HOOK (30 giây, không cần mở app)
   → "Chúng tôi đã gửi email digest hàng ngày cho X người dùng trong 2 tuần qua.
      Hôm nay tôi muốn show các bạn phiên bản đầy đủ — nơi email chỉ là 1 kênh thông báo
      trong cả một nền tảng AI agent."

2. ĐĂNG NHẬP + INBOX HOOK (1 phút)
   → Mở app.wealbee.vn → Login demo@wealbee.vn
   → Inbox mở đầu tiên: "Đây là lịch sử digest từ 2 tuần trước — tự import khi đăng ký"
   → Mở brief hôm nay: format 3-section, có portfolio section cá nhân hóa
   → "Brief này cũng đã được gửi qua email lúc 7h sáng — giờ nó còn sống trong app"

3. DASHBOARD + TICKER DETAIL (2 phút)
   → Chuyển sang Dashboard: "Dữ liệu HOSE thật, VN-Index live"
   → Top gainers/losers VN30 — click HPG → Ticker Detail
   → Tab Overview: "Giá 5 năm thật từ vnstock library — mọi mã VN30"
   → Tab Financials: "BCTC 5 năm: doanh thu, lợi nhuận, EPS thật"
   → **[MỚI] Tab Cổ tức:** "Lịch sử + ngày GDKHQ sắp tới — cập nhật hàng ngày tự động"
   → **[MỚI] Insider Trades section:** "Giao dịch ban lãnh đạo 90 ngày — kéo từ VietStock mỗi ngày"
   → News section: "Tin từ 10+ nguồn, AI tự gán mã bị tác động"

4. PORTFOLIO (1.5 phút)
   → Mở Portfolio: 5 mã, đang lãi X%, chart so VN-Index
   → "Thêm VCB" — live insert, P&L cập nhật ngay

5. AI CHAT — CONTEXT AWARE (3 phút)
   → Đang ở HPG Ticker Detail → mở Chat trong ActionHub
   → "HPG Q1 2026 kết quả thế nào?" → Claude lấy BCTC thật từ DB, trả lời tức thì
   → "So với mức định giá P/E ngành thép?" → Claude tính toán, trích dẫn nguồn
   → Upload báo cáo VCBS PDF vào KB → "Theo báo cáo bạn upload, rủi ro chính của HPG là gì?"
   → Claude tích hợp KB + data thật → câu trả lời có chiều sâu

6. AGENTS — POWER OF PLATFORM (5 phút)
   → Mở Agents: 3 agent đang active, status xanh
   → "Daily Digest đang chạy tự động 7h sáng — cùng pipeline đã gửi email các bạn"
   → "Nhưng giờ nó personalized — brief của từng user khác nhau theo danh mục họ"

   → Mở Templates → click "Portfolio Health" → Use Template
   → Agent Studio: system prompt đã điền, tools đã chọn
   → "Tôi thêm báo cáo VCBS vào KB → agent này sẽ tham chiếu khi phân tích"
   → Đính kèm KB file → Save → agent active

   → Back to Agents → click "Run" trên Deep Research
   → Progress: "Đang thu thập dữ liệu HPG... → Đang phân tích..."
   → Inbox: brief research xuất hiện — 600 từ, bảng tài chính, phân tích ngành

7. CLOSING (30 giây)
   → "Email digest là điểm khởi đầu. Platform là nơi mọi thứ kết nối."
   → "30 mã VN30, 5 năm BCTC thật, 10+ nguồn tin, AI agents personalized, Knowledge Base riêng."
   → Pricing: Free → Pro 199k/tháng → Pro+ 499k/tháng
```

---

## 6. Rủi Ro & Phương Án Dự Phòng

| Rủi ro | Xác suất | Phương án dự phòng |
|---|---|---|
| **Schema conflict giữa hệ thống cũ và mới** | Cao | Audit trước (Task 1.0), dùng ALTER TABLE thay CREATE, không DROP bảng đang có data |
| **GHA script gọi Supabase Auth user không khớp** | Trung bình | Email trong hệ thống cũ có thể chưa có auth.users entry → handle NULL user_id gracefully |
| **LLM output format của hệ thống cũ khác spec** | Trung bình | Đọc kỹ script GHA, nếu output format khác → viết adapter transform trước khi insert briefs |
| **vnstock v3 breaking changes** | Trung bình | Nếu script Python đang dùng v2 mà bị lỗi: `pip install vnstock --upgrade`, test 1 mã trước khi chạy full |
| **PDF extraction thất bại** | Cao (PDF scan dạng ảnh) | Fallback: chỉ hỗ trợ TXT/MD cho demo; PDF text-based vẫn work |
| **Claude API latency cao** | Thấp | Sonnet 4.6 thường < 3s. Hiện skeleton "Đang phân tích..." thay vì spinner |
| **Edge Function timeout (50s)** | Trung bình với Deep Research | Tách 2 giai đoạn: fetch data (sync) → LLM (async, notify khi xong) |
| **Supabase Realtime lag** | Thấp | Polling fallback mỗi 60s nếu websocket mất kết nối |
| **Đơn vị tiền tệ sai (nghìn vs VND)** | Cao | Verify bằng cách so số HPG revenue với báo cáo công bố trước khi FE hiển thị. Fix sớm — sai đơn vị 1000 lần là thảm họa demo |
| **vnstock thiếu data một số mã nhỏ** | Thấp cho VN30 | Chỉ demo với VN30 — vnstock có đủ data cho 30 mã này |
| **Resend email delivery giảm sau khi refactor** | Thấp | Test gửi email thật sau Task 6.0, verify Resend log trước khi close task |
| **Supabase free tier limits** | Trung bình | Upgrade Pro trước demo ngày 29; cost ~$25/tháng |

---

## 7. Checklist Tổng — Trước Demo

### Infrastructure
- [ ] Supabase project: Pro plan, region Singapore
- [ ] FE deployed trên Vercel với custom domain
- [ ] Tất cả env vars trong Vercel + Supabase Edge Function secrets
- [ ] pg_cron jobs active và đã test

### Data (vnstock đã pull, chỉ cần verify)
- [ ] 30 mã VN30: `tickers` table có seed đúng tên, sector, is_vn30=true
- [ ] prices_daily: ≥ 1200 rows/symbol cho VN30 (verify Task 2.1)
- [ ] financials_annual: ≥ 5 năm cho VN30, đơn vị đã chuẩn hóa
- [ ] company_info: có ceo, about, sector cho ≥ 20/30 mã VN30
- [ ] dividends: có data, is_upcoming flag đúng
- [ ] insider_transactions: có data 90 ngày gần nhất cho VN30
- [ ] news: đang aggregate từ 10+ nguồn, tickers[] đang được tagged
- [ ] market_indices: VN-Index + HNX daily close có, intraday optional
- [ ] **Không có số nào sai đơn vị** — verified HPG P/E ~10x, Revenue ~140k tỷ VND

### Auth & User
- [ ] Đăng ký email hoạt động
- [ ] Google OAuth hoạt động
- [ ] Auto-create user profile + portfolio + watchlist
- [ ] RLS: user A không thấy data user B

### Portfolio
- [ ] Thêm/sửa/xóa holding
- [ ] P&L tính đúng với giá thật
- [ ] Chart so sánh VN-Index

### AI Chat
- [ ] Trả lời câu hỏi về giá cổ phiếu
- [ ] Trả lời câu hỏi về BCTC
- [ ] Context-aware (biết user đang xem trang nào)
- [ ] Tìm kiếm trong KB uploaded
- [ ] Không bao giờ output khuyến nghị mua/bán

### Knowledge Base
- [ ] Upload PDF < 20MB thành công
- [ ] Process thành chunks + embeddings
- [ ] Chat tham chiếu đúng nội dung PDF

### Hệ Thống Email (đã có, cần verify vẫn chạy)
- [ ] GHA workflow active, cron đúng giờ
- [ ] News scraping đang nhận data từ ≥ 5 nguồn
- [ ] Resend gửi email thành công (check Resend dashboard, bounce rate < 5%)
- [ ] LLM ticker tagging đang populate `tickers[]` field đúng

### Bridge Email ↔ Platform
- [ ] GHA đã chuyển sang gọi Edge Function (không chạy script trực tiếp)
- [ ] Edge Function ghi vào `briefs` table sau mỗi lần chạy
- [ ] Khi user đăng ký với email đã có → email cũ import vào Inbox
- [ ] Email vẫn tiếp tục được gửi song song với Inbox

### Agents
- [ ] Daily Market Digest: personalized per-user, brief trong Inbox VÀ email gửi thành công
- [ ] Portfolio Health: alert khi biến động > 5%
- [ ] Deep Research: manual trigger, output 500+ từ
- [ ] Use Template → Studio pre-fill → Save → Active
- [ ] Tạo agent blank từ đầu → hoạt động
- [ ] Inbox hiện brief thật từ agents + history từ email cũ

### Demo Account
- [ ] demo@wealbee.vn hoạt động
- [ ] Portfolio có 5 mã với P&L dương
- [ ] ≥ 3 briefs có sẵn trong Inbox
- [ ] ≥ 2 KB files đã upload và processed
- [ ] ≥ 3 agents active

### Compliance
- [ ] Disclaimer footer hiển thị đúng
- [ ] Chat từ chối khuyến nghị cụ thể
- [ ] Agent outputs không chứa giá mục tiêu

---

## 8. Lưu Ý Claude AI Khi Hỗ Trợ Code

> Claude viết nhanh, nhưng phải review kỹ các điểm sau:

| Điểm cần review | Lý do |
|---|---|
| **RLS policy** | Claude có thể bỏ sót → user thấy data của nhau |
| **SQL numeric precision** | Claude hay dùng `FLOAT` cho giá CP → mất precision. Phải dùng `NUMERIC(15,2)` |
| **Timezone** | Vietnam = UTC+7. TCBS timestamp có thể là UTC → convert sai ngày |
| **vnstock field names** | vnstock output columns có thể đổi giữa versions — verify field map với `df.columns` trước khi insert |
| **Edge Function secrets** | Không hardcode API keys — dùng `Deno.env.get('ANTHROPIC_API_KEY')` |
| **Supabase client side** | Chỉ dùng `anon key` trên FE. `service_role_key` chỉ trong Edge Functions |
| **Infinite loop trong tool use** | Claude agent loop phải có max_iterations |
| **Prompt injection** | KB content có thể chứa text cố tình override system prompt — cần sanitize |
| **GHA script khi refactor** | Không xóa logic cũ trong GHA ngay — comment out và giữ backup cho đến khi Edge Function đã test qua 1 ngày đầy đủ |
| **Resend API key** | Copy từ GHA secrets sang Supabase Edge Function secrets — không expose trong code |
| **Double send risk** | Sau khi refactor, nếu cả GHA VÀ pg_cron đều active → user nhận 2 email. Tắt pg_cron backup trừ khi GHA fail liên tiếp |
| **Existing user data** | Không chạy migration xóa/rename column trên bảng đang có data production — dùng `ADD COLUMN IF NOT EXISTS` |

---

## 9. Timeline Tóm Tắt

```
17/05 Sat  ████ Foundation: Audit TOÀN BỘ hệ thống → schema migration (align, không rebuild)
18/05 Sun  ████ Foundation: FE Supabase client, auth UI, trigger auto-create profile
19/05 Mon  ████ Data ALIGN: verify prices/fundamentals/insider/dividend schema → đơn vị tiền tệ
20/05 Tue  ████ Data FE: connect TickerDetail/Dashboard với real data + Market Indices Edge Fn
           ↑ Tiết kiệm ~3 ngày không viết scraper — vnstock đã có data trong Supabase
21/05 Wed  ████ Portfolio: CRUD, P&L chart, watchlist | AI Chat: Claude API + OpenAI setup
22/05 Thu  ████ AI Chat: tool calling (7 tools), context builder, streaming FE
23/05 Fri  ████ GHA → Edge Function refactor (Task 6.0) | KB: file upload + PDF extract
24/05 Sat  ████ KB: OpenAI embeddings, RAG, vector search | Agent Studio save/load
25/05 Sun  ████ Agent templates seed | Daily Digest packaging (Task 6.4) | Portfolio Health
26/05 Mon  ████ Deep Research + Inbox realtime + Email bridge (6.7b) | Agent UI connect
27/05 Tue  ████ Polish: errors, loading states, Dividend/Insider tabs | Compliance audit
28/05 Wed  ████ Demo account full setup | Perf check | Bug bash full flow
29/05 Thu  ████ DEMO DAY (buổi sáng: buffer hotfix + rehearsal)
           ─────────────────────────────────────────────
           Phase 1: Foundation             (ngày 1-2)
           Phase 2: Data Align + FE        (ngày 3-4)  ← rút từ 3 ngày xuống 2 ngày
           Phase 3: Portfolio              (ngày 5)    ← rút từ 2 ngày xuống 1 ngày
           Phase 4: AI Chat                (ngày 5-6)
           Phase 5: Knowledge Base         (ngày 7-8)
           Phase 6: Agents + Packaging     (ngày 8-10)
           Phase 7: Polish & Demo          (ngày 11-13)

TIẾT KIỆM TỔNG CỘNG NHỜ HỆ THỐNG ĐÃ CÓ: ~4-5 ngày
  News pipeline:       -1.5 ngày
  vnstock data:        -2.5 ngày (không build 4 scrapers)
  OpenAI key sẵn:      -0.5 ngày (không setup embeddings từ đầu)
→ Đầu tư vào: Dividend + Insider tabs (tính năng unique), RAG quality, QA kỹ, Demo rehearsal
```

---

*Document này là roadmap sống — cập nhật khi có blocker hoặc thay đổi ưu tiên. Mọi thay đổi schema phải document ở đây trước khi chạy migration.*
