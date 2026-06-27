-- ============================================================
-- migration_agent_learning.sql — LỚP HỌC LIÊN TỤC (P1 capture + P2 outcome/lessons)
-- ============================================================
-- Triết lý: agent học KHÔNG fine-tune — ghi nhận hành vi + nhận định, sau N ngày chấm KẾT QUẢ
-- thị trường (ground-truth), rút "bài học" (lessons) lưu pgvector → tiêm lại vào phân tích sau.
-- Bám khuôn TradingAgents (realised-return reflection) + GEPA/Reflexion (self-improve không trọng số).
-- CHẠY 1 LẦN trên Supabase SQL Editor (không có Postgres connection string trong .env).
-- ============================================================

create extension if not exists vector;   -- pgvector cho retrieval "lessons" theo ngữ nghĩa

-- ── P1: MỖI LƯỢT phân tích (telemetry hành vi + chi phí) ────────────────────────
create table if not exists agent_runs (
    id            bigint generated always as identity primary key,
    created_at    timestamptz default now(),
    session_id    text,
    user_query    text,
    tickers       text[] default '{}',
    intent        text,                       -- deep_analysis | simple | macro_sector ...
    model         text,
    tools         jsonb,                      -- [{tool,ticker,status}] tóm tắt (từ tool_tracker)
    n_tool_calls  int,
    latency_ms    int,
    answer_len    int,
    answer_excerpt text                       -- 600 ký tự đầu (audit, không lưu cả bài)
);
create index if not exists idx_runs_created on agent_runs (created_at desc);
create index if not exists idx_runs_session on agent_runs (session_id);

-- ── P1→P2: NHẬN ĐỊNH định-lượng (datable) để CHẤM outcome sau N ngày ─────────────
-- Lấy DETERMINISTIC từ tool output (pe_danh_gia/peg_danh_gia/vi_the/cờ dồn tích) + giá tại thời điểm
-- → KHÔNG cần LLM trích claim; tránh look-ahead (chỉ dùng số có TẠI thời điểm nhận định).
create table if not exists agent_claims (
    id          bigint generated always as identity primary key,
    run_id      bigint references agent_runs(id) on delete cascade,
    created_at  timestamptz default now(),
    ticker      text,
    claim_type  text,                         -- valuation | quality | growth | risk
    claim_key   text,                         -- pe_danh_gia | peg_danh_gia | accruals | vi_the_roe ...
    claim_value text,                         -- 'rẻ' | 'đắt' | 'cờ dồn tích' | 'vùng CAO' ...
    direction   int,                          -- +1 tích cực / -1 tiêu cực / 0 trung tính (suy từ claim)
    as_of_date  date,
    as_of_price numeric,                      -- giá đóng cửa tại thời điểm (để tính return)
    horizon_days int default 60,
    -- ── outcome điền ở P2 (cron sau N ngày) ──
    scored_at        timestamptz,
    outcome_price    numeric,
    outcome_return_pct numeric,
    index_return_pct numeric,                 -- return VN-Index cùng kỳ (so tương đối)
    correct          boolean,                 -- nhận định khớp chiều giá (vs index) hay không
    brier            numeric                  -- điểm hiệu chỉnh (calibration)
);
create index if not exists idx_claims_ticker  on agent_claims (ticker, as_of_date desc);
create index if not exists idx_claims_unscored on agent_claims (scored_at) where scored_at is null;

-- ── P1: PHẢN HỒI người dùng (👍/👎 + sửa) ───────────────────────────────────────
create table if not exists user_feedback (
    id          bigint generated always as identity primary key,
    run_id      bigint references agent_runs(id) on delete cascade,
    created_at  timestamptz default now(),
    rating      int,                          -- +1 / -1
    note        text,
    edited_text text
);
create index if not exists idx_feedback_run on user_feedback (run_id);

-- ── P2: BÀI HỌC rút ra (reflection) — tiêm lại vào phân tích sau (RAG) ───────────
create table if not exists lessons (
    id           bigint generated always as identity primary key,
    created_at   timestamptz default now(),
    scope        text,                        -- ticker | sector | global
    ticker       text,
    sector       text,
    lesson       text,                        -- 1-3 câu bài học (vì sao đúng/sai)
    source       text,                        -- outcome | user_feedback | self_eval
    source_id    bigint,                      -- claim_id / feedback_id liên quan
    confidence   numeric default 0.5,
    embedding    vector(768),                 -- semantic retrieval (Gemini embedding)
    decay_at     timestamptz,                 -- forgetting (Ebbinghaus) — lesson cũ tự mờ
    active       boolean default true
);
create index if not exists idx_lessons_ticker on lessons (ticker) where active;
create index if not exists idx_lessons_sector on lessons (sector) where active;

comment on table agent_runs   is 'P1 telemetry: mỗi lượt phân tích (hành vi tool + chi phí)';
comment on table agent_claims is 'Nhận định định-lượng datable → P2 chấm outcome thị trường sau N ngày';
comment on table user_feedback is 'P1 phản hồi người dùng (rating/sửa)';
comment on table lessons      is 'P2 bài học rút ra (RAG tiêm lại) — có decay/forgetting + human-gated';
