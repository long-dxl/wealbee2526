// Định dạng số theo chuẩn ngành chứng khoán Việt Nam (khác chuẩn số học phổ thông
// vi-VN "1.234,56"): các nền tảng giao dịch (SSI iBoard, VNDirect, TCBS, DNSE,
// Finpath...) đều dùng ký hiệu quốc tế — dấu PHẨY ngăn cách hàng nghìn, dấu CHẤM
// thập phân — vì bảng giá gốc kế thừa từ hệ thống khớp lệnh/terminal quốc tế.
//
// Giá cổ phiếu (không áp dụng cho chỉ số) hiển thị theo đơn vị "nghìn đồng" —
// quy ước bước giá (tick size) truyền thống của HOSE/HNX, ví dụ 12.600đ hiện là
// "12.60". Chỉ số (VN-Index/HNX-Index/VN30/UPCOM) là điểm số, KHÔNG chia 1000.
const US = "en-US";

export const fmtStockPrice = (rawVnd: number): string =>
  (rawVnd / 1000).toLocaleString(US, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtStockChange = (rawVnd: number): string =>
  `${rawVnd >= 0 ? "+" : ""}${fmtStockPrice(rawVnd)}`;

export const fmtIndexValue = (points: number): string =>
  points.toLocaleString(US, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtIndexChange = (points: number): string =>
  `${points >= 0 ? "+" : ""}${fmtIndexValue(points)}`;

// Số liệu BCTC / chỉ số tài chính khác (tỷ VND, EPS theo đồng...) — giữ nguyên
// đơn vị gốc (không chia 1000), chỉ đổi cách ngăn cách hàng nghìn.
export const fmtFinNumber = (n: number, decimals = 0): string =>
  n.toLocaleString(US, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
