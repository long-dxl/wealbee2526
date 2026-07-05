-- ============================================================================
-- Hợp nhất 2 tầng dữ liệu BCTC → chỉ còn financial_statements + financial_ratios
-- (long-form, sector-aware, Năm + 5 Quý gần nhất) làm nguồn duy nhất.
--
-- 3 bảng dưới đây (tầng cũ, wide-form) đã được retire:
-- - financials_annual: agent-scheduler đã migrate sang financialReport() (financial_statements/
--   financial_ratios); run-agent::buildSymbolSources đã đổi query sang financial_statements.
--   Đây là nguồn xung đột số liệu thật đã verify (ROE/P/E khác tầng mới cho cùng mã cùng kỳ).
-- - balance_sheet, cash_flow_statement: không còn code nào đọc (verify bằng grep toàn bộ
--   supabase/functions + src trước khi xoá).
--
-- studio-test-run (edge function đọc financials_annual, không được gọi từ frontend) đã xoá
-- cùng đợt (supabase/functions/studio-test-run/ + `supabase functions delete`).
-- ============================================================================

DROP TABLE IF EXISTS financials_annual;
DROP TABLE IF EXISTS balance_sheet;
DROP TABLE IF EXISTS cash_flow_statement;
