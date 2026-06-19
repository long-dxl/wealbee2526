-- Agent test sessions: lưu lịch sử mỗi lần bấm "Chạy thử" trong Agent Studio

CREATE TABLE IF NOT EXISTS agent_test_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      UUID        REFERENCES agents(id) ON DELETE SET NULL,
  template_id   TEXT        NOT NULL DEFAULT 'daily_digest',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  config        JSONB       NOT NULL DEFAULT '{}',
  output        TEXT,
  status        TEXT        NOT NULL DEFAULT 'success'
                              CHECK (status IN ('success', 'error')),
  tokens_used   INTEGER     DEFAULT 0,
  run_time_s    NUMERIC(6,1) DEFAULT 0,
  error         TEXT,
  label         TEXT
);

CREATE INDEX agent_test_sessions_user_agent_idx
  ON agent_test_sessions (user_id, created_at DESC);

ALTER TABLE agent_test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own test sessions"
  ON agent_test_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own test sessions"
  ON agent_test_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own test sessions"
  ON agent_test_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
