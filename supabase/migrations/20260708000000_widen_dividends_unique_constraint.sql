-- Fix: UNIQUE(symbol, ex_date, dividend_type) trên bảng dividends vẫn còn quá
-- thô — 1 mã có thể có 2 sự kiện CÙNG loại (cash/stock) trên CÙNG 1 ngày
-- GDKHQ nhưng KHÁC tỷ lệ/số tiền (đã verify thực tế MBS 10/08/2023: vừa "Cổ
-- phiếu thưởng 3%" vừa "Trả Cổ tức bằng Cổ phiếu 12%" — 2 đợt của 2 năm tài
-- chính khác nhau, gộp chung 1 ngày GDKHQ). Với constraint cũ, đợt thứ 2 upsert
-- vào sẽ ĐÈ LÊN đợt thứ 1, mất dữ liệu.
--
-- Đổi sang UNIQUE(symbol, ex_date, dividend_type, amount) — amount/tỷ lệ khác
-- nhau giữa 2 sự kiện đồng thời nên đủ để phân biệt.

alter table dividends drop constraint if exists dividends_symbol_ex_date_type_key;
alter table dividends add constraint dividends_symbol_ex_date_type_amount_key unique (symbol, ex_date, dividend_type, amount);
