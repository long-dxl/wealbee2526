-- Báo cáo phân tích doanh nghiệp (Vietstock) — lưu TEXT nhẹ, PDF gốc qua link pdf_url
CREATE TABLE IF NOT EXISTS analyst_reports (
  id             TEXT PRIMARY KEY,        -- Vietstock edocs id
  ticker         TEXT,
  title          TEXT NOT NULL,
  source_firm    TEXT,                    -- CTCK phát hành (SSI, VNDirect, DSC...)
  recommendation TEXT,                    -- MUA / Khả quan / Tích lũy / Trung lập / BÁN...
  target_price   BIGINT,                  -- giá mục tiêu (VND)
  report_date    DATE,
  pdf_url        TEXT NOT NULL,           -- link PDF gốc (không lưu binary)
  full_text      TEXT NOT NULL,           -- toàn văn trích từ PDF (fitz)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analyst_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read analyst_reports"
  ON analyst_reports FOR SELECT USING (TRUE);

CREATE INDEX IF NOT EXISTS analyst_reports_ticker ON analyst_reports(ticker);
CREATE INDEX IF NOT EXISTS analyst_reports_date   ON analyst_reports(report_date DESC);
