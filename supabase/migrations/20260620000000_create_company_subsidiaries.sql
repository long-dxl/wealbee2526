-- Bảng công ty con / công ty liên kết của các mã VN30
CREATE TABLE IF NOT EXISTS company_subsidiaries (
  id              BIGSERIAL PRIMARY KEY,
  parent_symbol   TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  ticker          TEXT,                      -- NULL nếu không niêm yết
  charter_capital BIGINT,                    -- VND
  ownership_pct   NUMERIC(6, 2),             -- %
  relation_type   TEXT NOT NULL DEFAULT 'con', -- 'con' | 'lien_ket'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (parent_symbol, company_name, relation_type)
);

ALTER TABLE company_subsidiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read company_subsidiaries"
  ON company_subsidiaries FOR SELECT USING (TRUE);
