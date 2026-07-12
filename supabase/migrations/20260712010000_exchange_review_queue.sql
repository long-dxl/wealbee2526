-- Lớp 1 (anomaly detector) của cơ chế phát hiện chủ động mã bị gán sai sàn
-- niêm yết (HOSE/HNX/UPCoM) — xem toolcrawldata/detect_exchange_anomalies.py.
--
-- Bối cảnh: stocks.exchange KHÔNG có cơ chế đồng bộ lại sau khi seed 1 lần
-- (đã xác nhận qua điều tra 2026-07-12: SDA/AAV/DDG/VAF bị hủy niêm yết
-- HOSE/HNX, chuyển UPCoM, nhưng exchange vẫn giữ giá trị cũ nhiều tháng liền
-- → lộ ra ở Top tăng/giảm dashboard với %biến động vượt trần sàn đang gán).
--
-- Bảng này chỉ GHI NHẬN nghi vấn (giá vượt trần sàn đang gán trong stocks),
-- KHÔNG tự sửa exchange — vì biết sai không đồng nghĩa biết đúng là sàn nào,
-- cần review (thủ công hoặc đối chiếu thêm nguồn khác ở Lớp 2) trước khi ghi đè.

CREATE TABLE IF NOT EXISTS public.exchange_review_queue (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol             text NOT NULL,
  date               date NOT NULL,
  pct_change         numeric NOT NULL,
  assigned_exchange  text NOT NULL,          -- giá trị stocks.exchange tại thời điểm phát hiện
  threshold_pct      numeric NOT NULL,       -- trần biên độ của assigned_exchange (vd 6.9 cho HOSE)
  status             text NOT NULL DEFAULT 'pending',  -- pending | resolved | dismissed
  resolved_exchange  text,                   -- sàn đúng sau khi review (điền khi status = resolved)
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  UNIQUE (symbol, date)   -- 1 mã/1 ngày chỉ cần 1 dòng nghi vấn, upsert idempotent khi job chạy lại
);

CREATE INDEX IF NOT EXISTS exchange_review_queue_pending_idx
  ON public.exchange_review_queue (status, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.exchange_review_queue ENABLE ROW LEVEL SECURITY;

-- Chỉ service_role (pipeline) ghi; đọc cho phép người dùng đã đăng nhập (dùng
-- được cho 1 trang review nội bộ sau này nếu cần) — không có policy INSERT/UPDATE
-- cho authenticated, tránh user thường ghi đè hàng đợi review.
CREATE POLICY exchange_review_queue_read ON public.exchange_review_queue
  FOR SELECT TO authenticated USING (true);
