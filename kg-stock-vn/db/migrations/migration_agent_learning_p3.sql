-- ============================================================
-- migration_agent_learning_p3.sql — P3: SELF-EVAL (LLM-judge) + ĐỀ XUẤT CẢI TIẾN (human-gated)
-- ============================================================
-- Tầng học NHANH (không chờ horizon như P2): LLM-as-judge chấm chất lượng câu trả lời theo rubric
-- → gom điểm thấp + 👎 + nhận định sai → tự ĐỀ XUẤT cải tiến (knowledge card / prompt tweak) dạng
-- DRAFT để NGƯỜI duyệt (chống drift/reward-hacking — GEPA spirit nhưng human-gated). CHẠY 1 LẦN.
-- ============================================================

-- ── Tự đánh giá từng câu trả lời (LLM-judge theo rubric) ─────────────────────────
create table if not exists answer_evals (
    id         bigint generated always as identity primary key,
    run_id     bigint references agent_runs(id) on delete cascade,
    created_at timestamptz default now(),
    scores     jsonb,        -- {evidence, citation, structure, calibration, compliance, clarity} 0..1
    overall    numeric,      -- trung bình 0..1
    critique   text          -- 1-2 câu điểm yếu chính
);
create index if not exists idx_evals_run     on answer_evals (run_id);
create index if not exists idx_evals_overall on answer_evals (overall);

-- ── Đề xuất cải tiến (DRAFT — chờ người duyệt mới áp) ────────────────────────────
create table if not exists improvement_proposals (
    id         bigint generated always as identity primary key,
    created_at timestamptz default now(),
    kind       text,         -- knowledge_card | prompt_tweak | tool_policy
    title      text,
    detail     text,         -- nội dung đề xuất cụ thể (card body / chỉnh prompt)
    rationale  text,         -- vì sao (dựa bằng chứng nào)
    evidence   jsonb,        -- {n_low_evals, n_thumbsdown, n_wrong_claims, examples[]}
    status     text default 'draft',   -- draft | approved | rejected | applied
    reviewed_at timestamptz,
    applied_at  timestamptz
);
create index if not exists idx_proposals_status on improvement_proposals (status, created_at desc);

comment on table answer_evals is 'P3 LLM-judge chấm chất lượng câu trả lời (rubric) — tín hiệu học nhanh';
comment on table improvement_proposals is 'P3 đề xuất cải tiến DRAFT (knowledge/prompt/tool) — human-gated trước khi áp';
