-- ============================================================
-- MIGRATION: Thêm bảng chat_sessions cho persistent chat history
-- Chạy trên Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key TEXT NOT NULL,          -- browser fingerprint (UUID từ localStorage)
    messages    JSONB DEFAULT '[]',     -- [{role, content, tool_calls, ts}]
    title       TEXT DEFAULT '',        -- tự động lấy từ câu hỏi đầu tiên
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_key
    ON chat_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
    ON chat_sessions(updated_at DESC);

-- Auto-update updated_at
CREATE TRIGGER trigger_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Giữ tối đa 50 sessions gần nhất (cleanup job)
-- Có thể chạy định kỳ hoặc thêm vào scheduler
CREATE OR REPLACE FUNCTION cleanup_old_chat_sessions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM chat_sessions
    WHERE id NOT IN (
        SELECT id FROM chat_sessions
        ORDER BY updated_at DESC
        LIMIT 200
    );
END;
$$;
