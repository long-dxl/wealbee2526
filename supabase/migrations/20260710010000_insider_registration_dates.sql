-- insider_transactions.trade_date hiện đang lưu publicDate (ngày CÔNG BỐ disclosure)
-- — không phải ngày đăng ký hay ngày thực hiện thật. VCI's events API chỉ có sự
-- kiện "Đăng kí Mua/Bán" (không có sự kiện "đã hoàn tất" tách riêng), nhưng CÓ
-- sẵn startDate/endDate = khoảng thời gian ĐĂNG KÝ giao dịch — đã verify khớp
-- chính xác với trang tham chiếu (case MBB Phạm Thị Trung Hà: startDate=22/05,
-- endDate=20/06 = đúng y hệt "22/05/2026 - 20/06/2026" hiển thị trên site tham
-- chiếu) nhưng trước đây bị bỏ qua hoàn toàn, không lưu.
--
-- KHÔNG có "ngày/KL thực hiện" thật (executed) trong nguồn này — chỉ có phía
-- đăng ký (registered). Xem seed_financials.py để biết chi tiết giới hạn nguồn.

alter table insider_transactions add column if not exists reg_start_date date;
alter table insider_transactions add column if not exists reg_end_date date;
