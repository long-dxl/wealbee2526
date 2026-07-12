-- Thêm updated_at (tự động cập nhật qua trigger) cho prices_daily + market_indices.
--
-- Vì sao cần: created_at CHỈ set 1 lần lúc dòng (symbol,date) được TẠO LẦN ĐẦU
-- trong ngày, không đổi khi job intraday (seed_prices_dnse.py --intraday, chạy
-- mỗi 5-10 phút trong phiên) upsert đè lên nhiều lần — nên không dùng được để
-- hiện "Cập nhật lúc HH:mm:ss" cho user biết giá vừa xem là tại thời điểm nào.
--
-- Dùng lại public.set_updated_at() — trigger function đã có sẵn trong DB (tạo ở
-- migration 20260525000002_knowledge_base.sql cho bảng knowledge_documents),
-- không cần định nghĩa lại.

ALTER TABLE public.prices_daily   ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.market_indices ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS prices_daily_updated_at ON public.prices_daily;
CREATE TRIGGER prices_daily_updated_at
  BEFORE UPDATE ON public.prices_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS market_indices_updated_at ON public.market_indices;
CREATE TRIGGER market_indices_updated_at
  BEFORE UPDATE ON public.market_indices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
