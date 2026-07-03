-- ============================================================
-- Đóng gap schema drift: trigger_type/trigger_config đã tồn tại trên production
-- (được thêm trực tiếp qua Studio khi làm tính năng "yêu cầu danh mục khi
-- kích hoạt agent scheduled/event") nhưng chưa có migration nào tạo ra —
-- IF NOT EXISTS nên vô hại trên production, chỉ bổ sung cho môi trường mới.
-- ============================================================
ALTER TABLE public.agent_templates ADD COLUMN IF NOT EXISTS trigger_type   text DEFAULT 'manual';
ALTER TABLE public.agent_templates ADD COLUMN IF NOT EXISTS trigger_config jsonb;

-- ─── Cập nhật mẫu "Bản tin buổi sáng" ──────────────────────────────────────
-- description: bỏ khung "VN30" vì agent-scheduler quét tin market_news toàn thị
-- trường (buildNewsContext), không giới hạn nhóm cổ phiếu nào.
-- system_prompt: viết lại theo cấu trúc Vai trò / Nhiệm vụ / Định dạng / Văn phong,
-- KHÔNG lặp lại các rule đã được agent-scheduler tự động thêm sau system_prompt
-- (GROUNDING_RULES: bắt buộc [ref:N], không khuyến nghị mua/bán, disclaimer cuối bài;
-- portfolioNote: tự phân loại "Tin ảnh hưởng nhiều cổ phiếu trong danh mục" / "Tin
-- riêng - [MÃ]" khi agent có target_symbols) — giảm token trùng lặp, tránh mâu thuẫn.
UPDATE public.agent_templates SET
  description = 'Quét tin tài chính toàn thị trường, ưu tiên tin ảnh hưởng danh mục — kèm số liệu và nguồn trích dẫn',
  system_prompt = 'VAI TRÒ
Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam, viết bản tin buổi sáng ngắn gọn dựa hoàn toàn trên NGUỒN DỮ LIỆU được cung cấp bên dưới.

NHIỆM VỤ
1. Quét toàn bộ tin tức trong dữ liệu — toàn thị trường, không giới hạn riêng nhóm cổ phiếu nào.
2. Ưu tiên đưa lên đầu các tin đã được đánh dấu ảnh hưởng danh mục người dùng; tin thị trường chung xếp sau.
3. Với mỗi tin tài chính được chọn, nêu đúng 1 con số cụ thể làm trọng tâm (%, tỷ đồng, EPS, giá mục tiêu…) kèm trích dẫn nguồn có sẵn trong dữ liệu — không viết chung chung, không có số liệu.

CẤU TRÚC BẢN TIN (đúng thứ tự)
1. **Tổng quan thị trường** — VN-Index, HNX: điểm số, % thay đổi, xu hướng
2. **Tin ảnh hưởng danh mục** — tối đa 4 tin, mỗi tin 1 câu + key metric
3. **Top 3 tăng / Top 3 giảm** mạnh nhất trong dữ liệu giá
4. **Tin thị trường đáng chú ý khác** — tối đa 3 tin, cùng định dạng
5. **Điểm cần chú ý** — 1–2 câu kết luận

VĂN PHONG
Tiếng Việt, chuyên nghiệp, súc tích, ưu tiên gạch đầu dòng. Emoji tiết chế, chỉ dùng ở tiêu đề mục.'
WHERE id = 'daily_digest';
