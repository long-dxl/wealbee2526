# Thiết kế Logic "Analyst Tài chính" — Phân tích sâu BCTC theo 4 loại hình (TTCK Việt Nam)

> Mục tiêu: Khi user hỏi phân tích sâu BCTC/chỉ số (ở **ActionHub** hoặc **prompt Agent Studio + "Tối ưu với AI"**),
> Wealbee AI hành xử như **một Analyst**: kéo dữ liệu thật trong DB → dựng **4 bảng (IS, BS, CF, Chỉ số)** tùy biến
> theo loại hình, dễ nhìn qua **3–5 năm** + **quý gần nhất** → **insight cho từng bảng** → **luận điểm tổng**.
> Qua đó chứng minh (1) chất lượng dữ liệu trong DB, (2) mỗi loại hình chọn bộ chỉ số riêng, (3) bộ khung tư duy
> tài chính của Wealbee phân tích sâu & dùng được cho analyst thật.

---

## 0. Dữ liệu nền (đã kiểm chứng trong DB)

| Bảng | Vai trò | Cột chính |
|---|---|---|
| `tickers.company_type` | Phân loại 4 nhóm | normal / bank / securities / insurance |
| `financial_statements` | IS/BS/CF dạng long-form | symbol, company_type, statement(IS/BS/CF), period, period_type(FY/QUARTER), item_code, item_label_vi, value, is_derived |
| `financial_ratios` | Chỉ số long-form | symbol, company_type, period, period_type, ratio_code, value, unit |

Độ phủ: normal 354 mã, bank 21, securities 20, insurance 5. Đủ FY (3–5 năm) và QUARTER.

---

## 1. Khi nào kích hoạt "Analyst mode" (Intent routing)

Kích hoạt khi câu hỏi/prompt chạm **1 mã cụ thể** + **ý định tài chính**:

- **Từ khóa tài chính:** "phân tích sâu", "báo cáo tài chính", "BCTC", "IS/BS/CF", "kết quả kinh doanh", "sức khỏe tài chính", "chỉ số tài chính", hoặc tên chỉ số ("ROE", "NIM", "biên lợi nhuận", "nợ xấu", "combined ratio"…).
- **Có mã hợp lệ** trong câu (regex `[A-Z]{3}` ∩ bảng `tickers`).
- Ở **Agent Studio**: prompt chứa ý định trên → nút **"Tối ưu với AI"** rewrite prompt sang khung Analyst (mục 5).

Nếu thiếu mã → hỏi lại "Bạn muốn phân tích mã nào?". Nếu hỏi so sánh nhiều mã → lặp khung cho từng mã rồi thêm bảng so sánh chéo.

---

## 2. Cấu trúc bài phân tích (output chuẩn)

```
[Tên CTY · MÃ · Loại hình · Sàn]  — Phân tích tài chính (FY 20XX–20YY)

1) BẢNG KẾT QUẢ KINH DOANH (IS)  — 3–5 năm + cột quý gần nhất
   → Insight IS: xu hướng doanh thu/biên LN/động lực

2) BẢNG CÂN ĐỐI KẾ TOÁN (BS)
   → Insight BS: cơ cấu tài sản–nguồn vốn, đòn bẩy, thanh khoản

3) BẢNG LƯU CHUYỂN TIỀN TỆ (CF)
   → Insight CF: chất lượng lợi nhuận (OCF/LNST), CAPEX, FCF

4) BẢNG CHỈ SỐ TÀI CHÍNH (Ratios) — bộ chỉ số RIÊNG theo loại hình
   → Insight Ratios: hiệu quả vốn, rủi ro, định giá

★ KQKD QUÝ GẦN NHẤT (nếu 2026 chưa có quý → lấy quý mới nhất, kèm YoY cùng kỳ)

⮞ LUẬN ĐIỂM TỔNG (Analyst takeaway): điểm mạnh / điểm yếu / rủi ro / hàm ý định giá
```

**Quy tắc trình bày:** bảng Markdown, **cột = năm** (mới nhất bên phải), đơn vị tỷ đồng (gọn), %, lần. Không gạch ngang trống — thiếu số thì ghi "n/a" kèm lý do ngắn. Tối giản: mỗi bảng ~5–8 dòng cốt lõi (xem mục 3), chi tiết để link "xem đầy đủ".

**Quý fallback:** query `period_type=QUARTER` lấy `period` lớn nhất của mã. 2026 chưa có → tự lùi về quý gần nhất (vd Q4/2025). Luôn kèm **YoY** (so cùng kỳ năm trước) vì doanh nghiệp VN có mùa vụ.

---

## 3. Ma trận 4 loại hình — dòng BCTC & chỉ số RIÊNG (theo item_code/ratio_code có thật)

### 3.1 DOANH NGHIỆP THƯỜNG (normal — 354 mã)
- **IS:** Doanh thu → Giá vốn → **LN gộp** → CP bán hàng/QLDN → **LN từ HĐKD** (=LNTT − LN khác) → LNTT → **LNST** → LNST cổ đông mẹ → **EPS**
- **BS:** Tổng TS · TS ngắn hạn · TS dài hạn · Nợ phải trả · Nợ ngắn hạn · **Vốn CSH**
- **CF:** CFO · CFI · CFF · **FCF**
- **Chỉ số:** ROE, ROA, ROIC · Biên gộp/HĐKD/ròng · Vòng quay TS/HTK/phải thu · Current/Quick · D/E, Interest coverage · Tăng trưởng DT & LNST · OCF/NI · EPS, BVPS, PE, PB, PS, Dividend yield
- **Insight ưu tiên:** biên LN & động lực → hiệu quả vốn (ROE phân rã DuPont) → vòng quay/thanh khoản → đòn bẩy → tăng trưởng → chất lượng LN (OCF/NI) → định giá.

### 3.2 NGÂN HÀNG (bank — 21 mã)
- **IS:** Thu nhập lãi & DV → **Thu nhập lãi thuần (NII)** → Lãi thuần từ DV → **Tổng thu nhập HĐ (TOI)** → Chi phí HĐ → **LN trước dự phòng (= LN từ HĐKD)** → Chi phí dự phòng → LNTT → **LNST** → **EPS**
- **BS:** Tổng TS · **Cho vay KH** · (Dự phòng) · **Tiền gửi KH** · Giấy tờ có giá · **Vốn CSH**
- **CF:** CFO · CFI · biến động tiền thuần *(CFF bỏ — ít giá trị phân tích với NH)*
- **Chỉ số ĐẶC THÙ:** **NIM** (=YOEA−COF), **YOEA, COF, CIR, CASA, LDR, NPL, NPL_COVERAGE, CREDIT_COST, LAR** + ROE, ROA, BVPS, PE, PB
- **Insight ưu tiên:** biên lãi ròng (NIM & cấu phần YOEA/COF) → hiệu quả chi phí (CIR) → **chất lượng tài sản** (NPL, bao phủ nợ xấu, chi phí tín dụng) → vốn rẻ (CASA) → thanh khoản (LDR) → tăng trưởng tín dụng → ROE.

### 3.3 CHỨNG KHOÁN (securities — 20 mã)
- **IS:** Doanh thu HĐ (môi giới + tự doanh + **cho vay margin** + IB) → Chi phí HĐ → **LN từ HĐKD** → LNTT → **LNST** → **EPS**
- **BS:** Tổng TS · Tài sản tài chính (FVTPL/AFS/HTM) · **Dư nợ cho vay (margin)** · Nợ phải trả · **Vốn CSH**
- **Chỉ số ĐẶC THÙ:** **MARGIN_TO_EQUITY** (dư nợ margin/VCSH) + ROE, ROA, ROIC, biên LN, D/E, PE, PB
- **Insight ưu tiên:** cơ cấu doanh thu (môi giới vs tự doanh vs margin — độ ổn định/bền vững) → **dư nợ margin/VCSH** (đòn bẩy cho vay & rủi ro thị trường) → hiệu quả tự doanh → ROE & định giá.

### 3.4 BẢO HIỂM (insurance — 5 mã)
- **IS:** Doanh thu phí BH thuần → Chi bồi thường → Chi phí HĐ → **LN từ HĐ bảo hiểm** → **LN từ HĐ tài chính (đầu tư)** → LNTT → **LNST** → **EPS**
- **BS:** Tổng TS · **Đầu tư tài chính** · Dự phòng nghiệp vụ · **Vốn CSH**
- **Chỉ số ĐẶC THÙ:** **COMBINED_RATIO**, **CLAIM_RATIO** (loss ratio) + ROE, ROA, biên LN, PE, PB
- **Insight ưu tiên:** **combined ratio** (<100% = lãi nghiệp vụ) → tỷ lệ bồi thường → **đóng góp của LN đầu tư tài chính** (bảo hiểm sống nhờ float) → ROE & định giá.

---

## 4. Bộ khung tư duy tài chính (6 bước reasoning của Analyst)

1. **Phân loại** → đọc `company_type` → nạp đúng bộ dòng + chỉ số (mục 3).
2. **Xu hướng (3–5 năm):** chỉ tiêu nào tăng/giảm, tốc độ CAGR, gãy xu hướng.
3. **Động lực (driver):** *vì sao* thay đổi (vd biên gộp giảm do giá vốn ↑; ROE giảm do đòn bẩy hay biên?).
4. **Chất lượng:** LN thật hay kế toán (OCF/LNST), một lần vs bền vững, nợ xấu/dự phòng, pha loãng EPS.
5. **So sánh:** với chính lịch sử + (nếu có) trung bình ngành/loại hình.
6. **Rủi ro & định giá:** đòn bẩy/thanh khoản/chất lượng tài sản → PE/PB đặt cạnh ROE (đắt/rẻ tương đối).

Mỗi insight phải **trích số cụ thể** ("ROE 2024 = 21,3%, +3,1đpt YoY nhờ NIM mở rộng từ 3,1%→3,5%"), không nói chung chung.

---

## 5. Logic "Tối ưu với AI" (Agent Studio) & ActionHub

- **Tối ưu với AI:** nếu prompt có ý định tài chính → optimizer **rewrite** thành khung Analyst: chèn (a) yêu cầu 4 bảng theo loại hình, (b) 3–5 năm + quý gần nhất, (c) insight từng bảng, (d) 6 bước tư duy, (e) ràng buộc trích nguồn + disclaimer. Giữ ý gốc của user, chỉ chuẩn hóa cấu trúc.
- **ActionHub:** câu hỏi tự do → intent router (mục 1) → cùng khung. Thẻ "BÁO CÁO" kéo vào → ưu tiên đọc đúng báo cáo gốc.
- **Tool dữ liệu (đề xuất bổ sung):** `get_financial_statements(symbol, statement?, years=5, period_type)` đọc `financial_statements` + `get_ratios(symbol)` đọc `financial_ratios`, **tự lọc theo company_type**. Trả về dạng pivot năm để model dựng bảng. (Hiện `get_financials` chỉ đọc `financials_annual` cũ — nên trỏ sang 2 bảng long-form mới này.)

---

## 6. BỘ CÂU HỎI MẪU (question bank) theo 4 loại hình

### Chung (mọi loại hình)
- "Phân tích sâu báo cáo tài chính của **{MÃ}** 5 năm gần nhất."
- "Sức khỏe tài chính **{MÃ}** thế nào? Mạnh/yếu ở đâu?"
- "KQKD quý gần nhất của **{MÃ}** + so cùng kỳ."
- "Chất lượng lợi nhuận **{MÃ}**: lãi có chuyển thành tiền không?"
- "Định giá **{MÃ}** đang đắt hay rẻ so với hiệu quả vốn (ROE) của nó?"

### Doanh nghiệp thường
- "Biên lợi nhuận gộp/ròng **{MÃ}** thay đổi ra sao và vì sao?"
- "ROE **{MÃ}** đến từ biên LN, vòng quay hay đòn bẩy (DuPont)?"
- "Vòng quay hàng tồn kho/phải thu **{MÃ}** có xấu đi không?"
- "**{MÃ}** có đang vay nợ rủi ro không? Khả năng trả lãi?"

### Ngân hàng
- "NIM của **{MÃ}** mở rộng hay thu hẹp? Do YOEA hay COF?"
- "Chất lượng tài sản **{MÃ}**: NPL, bao phủ nợ xấu, chi phí tín dụng?"
- "CASA và LDR **{MÃ}** nói gì về chi phí vốn & thanh khoản?"
- "CIR **{MÃ}** — ngân hàng có kiểm soát chi phí tốt không?"

### Chứng khoán
- "Cơ cấu doanh thu **{MÃ}**: môi giới/tự doanh/margin — phần nào bền vững?"
- "Dư nợ cho vay margin trên vốn chủ **{MÃ}** có rủi ro không?"
- "Tự doanh **{MÃ}** đang lãi/lỗ và ảnh hưởng LN ra sao?"

### Bảo hiểm
- "Combined ratio **{MÃ}** dưới 100% không — nghiệp vụ có lãi?"
- "Tỷ lệ bồi thường **{MÃ}** xu hướng thế nào?"
- "Lợi nhuận **{MÃ}** đến từ nghiệp vụ hay hoạt động đầu tư tài chính?"

---

## 7. Ý nghĩa với analyst (vì sao bài này "dùng được")
1. **Tiết kiệm thời gian gom số:** 4 bảng chuẩn hóa 5 năm + quý, đúng loại hình — thay vì tự bóc từ BCTC PDF.
2. **Đúng ngôn ngữ ngành:** NH soi NIM/NPL/CASA, CTCK soi margin/VCSH, BH soi combined ratio — không "một khuôn cho tất cả".
3. **Có lập luận nhân–quả:** mỗi insight gắn driver + số liệu → analyst kiểm chứng nhanh.
4. **Trích nguồn & disclaimer:** mọi số gắn kỳ báo cáo; có dòng pháp lý (NĐ 155/2020) — không phải khuyến nghị đầu tư.

---

## 8. Việc cần làm để triển khai (đề xuất)
- [ ] Thêm tool `get_financial_statements` + `get_ratios` (đọc 2 bảng long-form mới, lọc theo company_type) vào `bee-ai-chat` + `run-agent`.
- [ ] Cập nhật `studio-optimize`: rewrite prompt tài chính sang khung Analyst (mục 2 + 4 + ma trận mục 3).
- [ ] System prompt "bộ khung tư duy tài chính": nhúng ma trận 4 loại hình + 6 bước + quy tắc bảng/insight + quý fallback.
- [ ] Render Markdown bảng (đã có MdContent) — kiểm tra hiển thị bảng nhiều cột năm gọn trên mobile.
