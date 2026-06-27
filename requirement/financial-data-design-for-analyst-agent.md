# 📊 Thiết kế lưu trữ Báo cáo Tài chính cho Analyst Agent
### Nên giữ lại gì từ BCTC full hàng năm — để phân tích & tính Financial Ratios cho 4 loại hình DN
**Báo cáo trình Founder · Bối cảnh TTCK Việt Nam**

---

## 0. Executive Summary (đọc trong 1 phút)

- **Nguồn dữ liệu:** 401 mã HOSE, mỗi mã 1 file BCTC Vietcap full (4 sheet: Balance Sheet / Income Statement / Cash Flow / Thuyết minh), lịch sử **năm 2018–2025 + quý từ Q1/2018**.
- **Vấn đề:** một BCTC full có **~250–400 dòng**; lưu hết thì cồng kềnh & nhiễu, lưu sơ sài (như DB hiện tại — chỉ ~19 chỉ tiêu) thì Agent **không phân tích đúng bản chất ngành**.
- **Khuyến nghị cốt lõi:** giữ **bộ ~40–70 dòng cốt lõi / loại hình + nhóm thuyết minh đặc thù**, chuẩn hóa theo `company_type`, tách riêng **lớp số liệu thô** và **lớp ratio tính sẵn**. Gọn hơn ~60% so với lưu full mà **không mất giá trị phân tích**.
- **Vị thế cạnh tranh:** thiết kế này là **SUPERSET của FireAnt** — phủ toàn bộ ratio chuẩn của FireAnt, **cộng** lớp chuyên biệt ngành (NIM, NPL, CASA, combined ratio, margin lending) và **chất lượng dòng tiền** mà FireAnt không có. Điểm thua duy nhất là **khối Định giá cho mã ngoài VN30** — do thiếu **dữ liệu giá**, không phải thiếu thiết kế.

| Câu hỏi của Founder | Trả lời |
|---|---|
| DB hiện tại có đủ cho Analyst Agent? | **Chưa** — mới đạt ~25-30%, thiếu phân loại ngành + chi tiết IS/BS + thuyết minh |
| Có bằng FireAnt không? | **Có**, sau khi ETL dữ liệu đã có sẵn trong file (không cần mua thêm) |
| Có hơn FireAnt không? | **Có** — chuyên biệt ngành + dòng tiền + lịch sử nhiều kỳ + máy-đọc cho AI |
| Còn thiếu gì thật sự? | Chỉ **giá thị trường** cho 374/401 mã (khối định giá) |

---

## 1. Bối cảnh & Mục tiêu

Xây một **Analyst Agent tài chính** đọc hiểu BCTC của **4 loại hình** đặc thù TTCK Việt Nam — mỗi loại có chuẩn mực kế toán & bộ chỉ tiêu **khác nhau hoàn toàn**:

| Loại hình | Đặc thù | Ví dụ mã HOSE |
|---|---|---|
| **DN thường** (SX/TM/DV) | Doanh thu – giá vốn – tồn kho | FPT, HPG, MWG, GAS, VHM |
| **Ngân hàng** | Thu nhập lãi, chất lượng tín dụng, an toàn vốn | VCB, ACB, TCB, MBB, CTG |
| **Chứng khoán** | Tự doanh (FVTPL/AFS/HTM) + margin + phí | SSI, VND, VCI, HCM |
| **Bảo hiểm** | Phí bảo hiểm, dự phòng nghiệp vụ, kết quả đầu tư | BVH, BMI, MIG, BIC, PGI |

Agent cần: (1) tính **mọi financial ratio đúng theo loại hình**, (2) **đọc cấu trúc** doanh thu–chi phí–dòng tiền để giải thích *vì sao* lợi nhuận biến động, (3) **kiểm tra nhất quán liên báo cáo** để phát hiện red flag.

---

## 2. Cấu trúc một BCTC full (đo thực tế từ file)

Mỗi file `.xlsx` Vietcap:

| Sheet | Số dòng (DN thường / bank / CK / bảo hiểm) | Vai trò |
|---|---|---|
| **Balance Sheet** | 122 / 88 / 200 / ~150 | Snapshot tài sản – nguồn vốn tại 1 thời điểm |
| **Income Statement** | 25 / 32 / 86 / ~80 | Kết quả KD trong kỳ |
| **Cash Flow** | 41 / 60 / ~55 / ~50 | Dòng tiền thực trong kỳ |
| **Thuyết minh (Note)** | ~170–240 | Bóc tách chi tiết mọi dòng tổng |

> Phần lớn dòng **thuyết minh** là breakdown phục vụ kiểm toán (nguyên giá/hao mòn từng loại TSCĐ, chi tiết thuế phải nộp…) — **không cần** cho phân tích đầu tư. Nhưng vài dòng thuyết minh lại **giá trị nhất** (phân loại nợ ngân hàng, dư nợ margin, dự phòng nghiệp vụ bảo hiểm).

### Mối liên hệ 4 báo cáo (điều khiến Agent "hiểu" thay vì "đọc số")
```
IS  ──(LNST)──►  BS (LN chưa phân phối)  ◄──(cổ tức)── CF tài chính
IS  ──(LNTT + khấu hao + lãi vay)──►  CF gián tiếp
BS  ──(Δ tiền)──►  CF (tiền cuối kỳ = Tiền & tương đương trên BS)
Note ──► bóc tách mọi dòng tổng của IS/BS
```
Agent phải kiểm tra các **đẳng thức nối** này → phát hiện bất thường (vd: LN tăng nhưng OCF âm kéo dài = "lãi ảo").

---

## 3. Nguyên tắc thiết kế lưu trữ

1. **Minimal-but-sufficient** — chỉ giữ dòng nào (a) là đầu vào của ≥1 ratio, hoặc (b) là "câu chuyện" Agent cần (cơ cấu DT, chất lượng tài sản, dòng tiền).
2. **Chuẩn hóa theo `item_code`** thống nhất — KHÔNG lưu theo tên dòng tiếng Việt (4 loại hình đặt tên khác nhau → Agent không so sánh chéo được).
3. **Tách "fact" và "ratio"** — line-item thô (đã chuẩn hóa) ở một lớp, ratio tính sẵn (version-hóa công thức) ở lớp khác.
4. **Phân loại `company_type`** là cột nền tảng — nếu thiếu thì mọi ratio ngành đều sai (vd cột `revenue` gộp chung Doanh thu thuần của HPG với Tổng thu nhập hoạt động của VCB là **vô nghĩa**).

---

## 4. Mô hình dữ liệu khuyến nghị (3 lớp)

| Lớp | Bảng đề xuất | Khóa / Nội dung | Vì sao |
|---|---|---|---|
| **0. Phân loại** | `tickers.company_type` | normal · bank · securities · insurance | Nền tảng cho mọi logic ratio |
| **1. Line-items chuẩn hóa** | `financial_statements` (long-form) | `(symbol, company_type, statement, period, period_type, item_code, value)` | Giữ ~40–70 dòng cốt lõi/loại hình; Agent query theo code đồng nhất |
| **2. Dictionary** | `statement_item_map` | `(company_type, statement, item_code, vn_label, parent_code, sign)` | Ánh xạ nhãn VN → code; xử lý 4 loại hình |
| **3. Ratio dẫn xuất** | `financial_ratios` (long-form) | `(symbol, period, ratio_code, value, formula_version)` | Tính sẵn, đồng nhất, tái tạo được |

> **Vì sao long-form thay vì wide:** 4 loại hình có bộ dòng khác nhau → bảng wide đầy cột NULL. Long-form + `company_type` là chuẩn ngành cho multi-sector financial DB, và mở rộng HNX/UPCoM không cần đổi schema.

---

## 5. Bộ chỉ tiêu GIỮ LẠI theo từng loại hình

> Ký hiệu **[K]** = dòng then chốt (đầu vào nhiều ratio).

### 🟦 A. Doanh nghiệp thường
**Income Statement (~15 dòng):** Doanh thu thuần [K] · Giá vốn · **Lợi nhuận gộp** [K] · Doanh thu tài chính · Chi phí tài chính · **Chi phí lãi vay** [K] · Chi phí bán hàng · Chi phí QLDN · Lãi/lỗ LD-LK · **LN thuần HĐKD** [K] · LN khác ròng · **LNTT** [K] · Chi phí thuế TNDN · **LNST** [K] · **LNST cổ đông mẹ** [K] · **EPS cơ bản & pha loãng** [K]

**Balance Sheet (~22 dòng):** Tiền & tương đương [K] · Đầu tư TC ngắn hạn · **Phải thu ngắn hạn** [K] · **Hàng tồn kho** [K] · **TS ngắn hạn** [K] · TSCĐ ròng [K] · Đầu tư dài hạn · **Tổng tài sản** [K] · **Vay & nợ ngắn hạn** [K] · Phải trả người bán · **Nợ ngắn hạn** [K] · **Vay & nợ dài hạn** [K] · **Nợ phải trả** [K] · Vốn góp · LN chưa phân phối · **VCSH** [K] · Lợi ích CĐ thiểu số

**Cash Flow (~12 dòng):** LNTT · **Khấu hao** [K] · Δ phải thu · Δ tồn kho · Δ phải trả · **OCF** [K] · **Capex** [K] · LCTT đầu tư · Vay nhận/trả · Cổ tức đã trả · **LCTT thuần**

**Thuyết minh:** Cơ cấu DT theo mảng · Chi tiết vay (kỳ hạn, lãi suất) · Chi phí theo yếu tố · Phải thu quá hạn/dự phòng.

### 🟩 B. Ngân hàng *(không có DT/giá vốn/tồn kho — trục là NIM, chất lượng TD, an toàn vốn)*
**IS (~12):** **Thu nhập lãi thuần (NII)** [K] · Thu nhập lãi · Chi phí lãi · **Lãi thuần dịch vụ** · Lãi ngoại hối · Lãi chứng khoán · **Tổng thu nhập HĐ (TOI)** [K] · Chi phí HĐ (opex) [K] · **LN trước dự phòng** · **Chi phí dự phòng RRTD** [K] · **LNTT** [K] · LNST · **LNST cổ đông mẹ** [K] · EPS

**BS (~15):** Tiền mặt · Tiền gửi NHNN · Tiền gửi & cho vay TCTD · Chứng khoán KD · **Cho vay khách hàng** [K] · **Dự phòng RR cho vay** [K] · Chứng khoán đầu tư · TSCĐ · **Tổng tài sản** [K] · Tiền gửi & vay TCTD · **Tiền gửi khách hàng** [K] · Giấy tờ có giá · **Tổng nợ** [K] · Vốn điều lệ · **VCSH** [K]

**Thuyết minh BẮT BUỘC (giá trị cao nhất):** **Phân loại nợ Nhóm 1→5** [K] (→ NPL) · **Tiền gửi không kỳ hạn** [K] (→ CASA) · CAR nếu có · cơ cấu cho vay theo kỳ hạn/ngành.

### 🟨 C. Công ty chứng khoán
**IS (~14):** Lãi tài sản FVTPL [K] · Lãi HTM · **Lãi cho vay & phải thu (margin)** [K] · Lãi AFS · **DT môi giới** [K] · DT bảo lãnh PH · DT tư vấn · **Doanh thu HĐ** [K] · Lỗ FVTPL · Chi phí môi giới · **Chi phí HĐ** [K] · **LN gộp** [K] · Chi phí QLDN · **LNTT** [K] · LNST mẹ · EPS

**BS (~16):** Tiền · **Tài sản FVTPL** [K] · HTM · **Cho vay (margin)** [K] · AFS · Phải thu · TS ngắn hạn · **Tổng TS** [K] · Vay ngắn hạn · **Nợ ngắn hạn** [K] · **Nợ phải trả** [K] · Vốn góp · **VCSH** [K]

**Thuyết minh:** Danh mục FVTPL/AFS (giá gốc vs thị trường → lãi/lỗ chưa thực hiện) · **Dư nợ margin** [K] · cơ cấu DT môi giới vs tự doanh.

### 🟥 D. Bảo hiểm
**IS (~14):** **DT phí bảo hiểm gốc** [K] · Phí nhượng tái BH · **DT phí thuần** [K] · DT thuần HĐ bảo hiểm · **Tổng chi bồi thường** [K] · Tăng/giảm dự phòng bồi thường · **LN gộp HĐ bảo hiểm** [K] · **LN hoạt động tài chính** [K] · Chi phí bán hàng · Chi phí QLDN · **LNTT** [K] · LNST mẹ · EPS

**BS (~14):** Tiền · **Đầu tư TC ngắn hạn** [K] · Phải thu phí · TS ngắn hạn · **Đầu tư TC dài hạn** [K] · **Tổng TS** [K] · **Dự phòng nghiệp vụ bảo hiểm** [K] · Nợ ngắn/dài hạn · **Nợ phải trả** [K] · Vốn góp · **VCSH** [K]

**Thuyết minh:** Chi tiết dự phòng nghiệp vụ (phí chưa hưởng, bồi thường, dao động lớn) · danh mục đầu tư · tỷ lệ bồi thường theo nghiệp vụ.

### Cái nên LOẠI (giảm ~60% dung lượng, không mất giá trị)
Nguyên giá/hao mòn từng loại TSCĐ · chi tiết tăng/giảm trong kỳ · các loại thuế phải nộp chi tiết · ký quỹ/ký cược · KPCĐ/BHXH · dòng "Trước năm 2015/2016" (di sản template) · EPS pha loãng nếu = EPS cơ bản · dòng luôn = 0 với loại hình đó.

---

## 6. Danh mục Financial Ratios theo loại hình (SUPERSET của FireAnt)

> Gộp **toàn bộ ratio chuẩn FireAnt** + lớp **chuyên biệt ngành** + **dòng tiền**. ✅ áp dụng · ➕ ta có/FireAnt không · — không áp dụng.

| Nhóm | Ratio | DN thường | Bank | CK | Bảo hiểm | Đầu vào |
|---|---|:---:|:---:|:---:|:---:|---|
| **Định giá** | P/E, P/S, P/B | ✅ | ✅ | ✅ | ✅ | Giá × số CP / LN, DT, VCSH |
| | EPS cơ bản & pha loãng, BVPS | ✅ | ✅ | ✅ | ✅ | IS / VCSH / số CP |
| **Sinh lời** | Biên LN gộp, ròng | ✅ | — | ✅ | ✅ | LN gộp/ròng / DT |
| | Biên LN EBIT, hoạt động | ✅ | — | ✅ | ✅ | EBIT, LN HĐKD / DT |
| | **NIM**, YOEA, COF | — | ✅ | — | — | NII, lãi, TS sinh lãi |
| | ➕ **Combined ratio**, tỷ lệ bồi thường | — | — | — | ➕ | Bồi thường+CP / phí thuần |
| | ➕ Investment yield | — | — | ➕ | ➕ | LN đầu tư / danh mục BQ |
| **Đòn bẩy** | Nợ/VCSH, Nợ/Tổng TS | ✅ | ✅ | ✅ | ✅ | Nợ / VCSH, TTS |
| | TT lãi vay (interest coverage) | ✅ | — | ✅ | ✅ | EBIT / chi phí lãi vay |
| | Equity/Assets, **LAR, LDR, CLR** | — | ✅ | ✅ | ✅ | VCSH, cho vay, tiền gửi |
| **Thanh khoản** | TT hiện hành, TT nhanh | ✅ | — | ✅ | ✅ | TSNH (−HTK) / Nợ NH |
| **Hiệu quả QL** | ROA, ROE | ✅ | ✅ | ✅ | ✅ | LNST / TTS, VCSH BQ |
| | ROIC, ROCE | ✅ | — | ✅ | ✅ | NOPAT/vốn đầu tư; EBIT/vốn SD |
| | **CIR** | — | ✅ | — | — | opex / TOI |
| **Hoạt động** | Vòng quay TTS, TSNH, TSCĐ | ✅ | — | ✅ | ✅ | DT / TTS, TSNH, TSCĐ |
| | Vòng quay HTK, KPT | ✅ | — | ✅ | ✅ | Giá vốn/HTK; DT/phải thu |
| | ➕ **Dư nợ margin/VCSH** | — | — | ➕ | — | margin / VCSH |
| **Chất lượng TS** | **NPL, bao phủ nợ xấu** | — | ✅ | — | — | Nợ N3-5, dự phòng (thuyết minh) |
| | Chi DP/cho vay, DP/cho vay | — | ✅ | — | — | dự phòng, cho vay |
| **Dòng tiền** | ➕ OCF/LNST, FCF, FCF yield | ➕ | ➕ | ➕ | ➕ | OCF, capex, vốn hóa |
| **Tăng trưởng** | ➕ CAGR DT/LN, YoY | ➕ | ➕ | ➕ | ➕ | nhiều kỳ (2018+) |

---

## 6B. Thiết kế hiển thị TỐI GIẢN đa-loại-hình (trang chi tiết cổ phiếu)

> Mục tiêu: giữ UI gọn như hiện tại (4 tab: Chỉ số · IS · BS · CF), nhưng nội dung **đúng bản chất từng loại hình** — điều khiển bằng **config trong DB**, không hard-code ở frontend.

### Nguyên tắc
**Cùng một khung tối giản cho cả 4 loại hình; chỉ NỘI DUNG bên trong đổi theo `company_type`.** DB phải trả lời được: *"loại hình này, tab này → hiện đúng N dòng nào, nhãn gì, thứ tự ra sao."*

### 6B.1 — Template Income Statement (2 mẫu)

**Mẫu A — DÙNG CHUNG cho Thường / Chứng khoán / Bảo hiểm** (5 dòng):

| # | Dòng hiển thị | Lấy từ BCTC |
|---|---|---|
| 1 | **Doanh thu** | thường: DT thuần · CK: Doanh thu hoạt động · BH: DT thuần HĐ KD bảo hiểm |
| 2 | **LN gộp** | Lợi nhuận gộp (BH: LN gộp HĐ KD bảo hiểm) |
| 3 | **LN từ HĐKD** | **dẫn xuất = LNTT − Lợi nhuận khác** *(xem 6B.2)* |
| 4 | **LNST** | LNST cổ đông công ty mẹ |
| 5 | **EPS** | Lãi cơ bản trên cổ phiếu *(đơn vị đ/cp — tách riêng)* |

**Mẫu B — RIÊNG cho Ngân hàng** (5 dòng):

| # | Dòng hiển thị | Lấy từ BCTC (số MBB 2025, tỷ đồng) |
|---|---|---|
| 1 | **Thu nhập lãi và dịch vụ** | TN lãi gộp + TN dịch vụ gộp = 89.088 + 18.062 = **107.150** *(gộp)* |
| 2 | **LN từ lãi & DV** | NII + lãi thuần dịch vụ = 51.610 + 6.579 = **58.189** *(thuần)* |
| 3 | **LN từ HĐKD** | **"Lợi nhuận thuần hoạt động trước khi trích lập dự phòng"** = **48.012** |
| 4 | **LNST** | Lợi nhuận sau thuế (cổ đông mẹ = 26.779) = **27.383** |
| 5 | **EPS** | Lãi cơ bản trên cổ phiếu *(fallback nếu = 0)* |

→ **4 loại hình thống nhất 3 dòng cuối (LN từ HĐKD / LNST / EPS)** ⇒ Agent so sánh chéo được.

### 6B.2 — Công thức "LN từ HĐKD" thống nhất (insight cốt lõi)

```
LN từ HĐKD = LNTT − Lợi nhuận khác          (Lợi nhuận khác = Thu nhập khác − Chi phí khác)
```

Kiểm chứng trên BCTC thật (2025, tỷ đồng):

| Loại hình | LNTT | Lợi nhuận khác | **LN từ HĐKD** | Đối chiếu dòng trực tiếp |
|---|---:|---:|---:|---|
| Thường (FPT) | 13.043,6 | 91,96 | **12.951,7** | ✅ khớp "Lãi/(lỗ) từ HĐKD" |
| Chứng khoán (SSI) | 5.083,0 | 5,94 | **5.077,0** | ✅ khớp "KẾT QUẢ HOẠT ĐỘNG" |
| Bảo hiểm (BVH) | 3.554,4 | **0** | **3.554,4** | ✅ dương, đúng nghĩa |

**Vì sao phải dùng công thức này (không lấy dòng "operating" trực tiếp):**
- **Chứng khoán** không có dòng "LN từ HĐKD" tên chuẩn (IS đi thẳng từ LN gộp → KẾT QUẢ HOẠT ĐỘNG → LNTT).
- **Bảo hiểm** có dòng "Lợi nhuận thuần HĐ bảo hiểm" nhưng = **−7.650** (chỉ là kết quả nghiệp vụ, **chưa gồm lãi đầu tư**) → gây hiểu nhầm nếu show cạnh LNST dương. Công thức `LNTT − Lợi nhuận khác` cho ra **+3.554** đúng bản chất (lãi đầu tư là hoạt động cốt lõi của bảo hiểm).
- ⚠️ **BVH lưu ý:** "Lợi nhuận hoạt động khác" = **0 mọi năm** (cái cần trừ), **khác** với "Lãi thuần từ các hoạt động khác" (≠0, là HĐKD khác — **không trừ**).

### 6B.3 — Bộ "headline ratio" tab Chỉ số (giữ 6 ô, hoán nội dung theo loại hình)

| # | Thường | Ngân hàng | Chứng khoán | Bảo hiểm |
|---|---|---|---|---|
| 1-4 | P/E · P/B · ROE · ROA | P/E · P/B · ROE · ROA | P/E · P/B · ROE · ROA | P/E · P/B · ROE · ROA |
| 5 | Biên LN ròng | **NIM** | **Margin/VCSH** | **Combined ratio** |
| 6 | D/E hoặc Current | **NPL** | Biên LN ròng | D/E |

### 6B.4 — Metadata DB cần thêm để UI tối giản chạy đúng

| Cần thêm | Mục đích |
|---|---|
| `tickers.company_type` | Chọn template + bộ ratio |
| `statement_template ∈ {standard, bank}` | UI chọn 1 trong 2 khung IS |
| Item_code chuẩn hóa: `IS_REVENUE`, `IS_GROSS_PROFIT`, `IS_PRETAX`, `IS_OTHER_PROFIT`, `IS_OPERATING_PROFIT` (dẫn xuất), `IS_NET_PROFIT_PARENT`, `IS_EPS`; bank: `BANK_INT_SVC_INCOME`, `BANK_NET_INT_SVC`, `BANK_PREPROVISION_PROFIT` | Map dòng VN từng loại hình vào code thống nhất |
| `is_headline` / `display_level` | View tối giản lấy đúng 5 dòng, chi tiết ẩn |
| `display_label` & `display_order` **theo company_type** | Cùng slot, khác nhãn (vd bank dòng 1 chú thích "Tổng thu nhập HĐ") |
| `na_reason ∈ {not_applicable, missing_data}` | Phân biệt "không áp dụng" (ẩn dòng) vs "thiếu dữ liệu" (hiện "—") |
| `period_type ∈ {FY, TTM, QUARTER}` + `is_complete` | Tránh cột năm hiện hành nửa trống (vd 2026) |
| `unit` (tỷ đồng vs đ/cp) | Tách EPS khỏi các dòng tiền tệ |

### 6B.5 — Lưu ý nhất quán hiển thị vs tính ratio
- **Dòng hiển thị "Doanh thu" của ngân hàng** = "Thu nhập lãi và dịch vụ" (gọn cho người xem), **nhưng mẫu số P/S & Biên LN ròng vẫn dùng TOI** (Tổng thu nhập hoạt động) → DB lưu **cả hai**.
- **EPS** đơn vị đ/cp, đặt **dòng cuối có separator**; một số ngân hàng (MBB) thiếu EPS trong dữ liệu Vietcap (=0) → **fallback** = LNST mẹ / số CP lưu hành (cần nguồn số CP).

---

## 7. So sánh với DB hiện tại (Gap Analysis)

**Hiện trạng:** DB chỉ là "summary layer" — `financials_annual` (11 chỉ tiêu/năm) + `balance_sheet` (4) + `cash_flow_statement` (4), phủ 401 mã.

| Lớp khuyến nghị | Hiện trạng | Trạng thái |
|---|---|---|
| `company_type` | ❌ không có | 🔴 thiếu hoàn toàn |
| Line-items chi tiết (~40-70 dòng) | ~13 dòng tổng | 🔴 thiếu ~85% |
| **Income Statement chi tiết** (+ IS quý) | ❌ không có bảng IS | 🔴 thiếu hoàn toàn |
| Thuyết minh ngành (NPL/CASA/margin/dự phòng) | ❌ không có | 🔴 thiếu hoàn toàn |
| Dictionary `item_code` | ❌ | 🔴 |
| `financial_ratios` chuẩn hóa | nhét cứng vào `financials_annual`, chỉ ratio chung | 🟠 thiếu ratio ngành |
| Giá cho định giá | chỉ ~27 mã VN30 (pe/pb 13% lấp đầy) | 🟠 thiếu 93% |

**Lỗi ngữ nghĩa nghiêm trọng nhất:** cột `revenue` đang gộp chung 4 thứ khác bản chất (Doanh thu thuần / TOI ngân hàng / DT chứng khoán / phí bảo hiểm) → so sánh chéo sai.

**Mức độ sẵn sàng cho Agent hiện tại: ~25–30%.**

---

## 8. So sánh với FireAnt (để trình Founder)

> Dữ liệu để bằng FireAnt **đã nằm trong file xlsx** — chủ yếu là việc ETL, không phải mua thêm.

| Tiêu chí | FireAnt | Thiết kế của ta |
|---|:---:|:---:|
| Ratio chuẩn (margin, ROx, đòn bẩy, turnover) | ✅ granular | ✅ bằng |
| **Chuyên biệt ngành** (CASA, combined ratio, margin lending) | ❌ | ✅ **hơn** |
| **Chất lượng dòng tiền** (OCF/LNST, FCF) | ❌ | ✅ **hơn** |
| **Chuẩn hóa theo company_type (máy đọc)** | ⚠️ render cho người | ✅ thiết kế cho **Agent** |
| **Lịch sử nhiều kỳ** (quý từ 2018) | ⚠️ hạn chế | ✅ **hơn** |
| Kiểm tra liên báo cáo / red flag | ❌ | ✅ |
| **Định giá ngoài VN30** | ✅ (có nguồn giá) | 🔴 **thua** (thiếu giá) |

**4 lý do thiết kế của ta tốt hơn cho sản phẩm:**
1. **Đúng bản chất ngành** — FireAnt áp generic cho bảo hiểm/CK (biên LN gộp 3.34% của bảo hiểm gần như vô nghĩa); ta có combined ratio, CASA, margin lending — đúng thứ chuyên viên thật dùng.
2. **Thiết kế cho Agent** — chuẩn hóa code + công thức version-hóa → so sánh chéo đúng; FireAnt chỉ render số cho người.
3. **Chiều sâu thời gian** — quý từ 2018 → thấy xu hướng (NIM nén dần, NPL phình), không chỉ số tĩnh.
4. **Lớp chất lượng & cảnh báo** — phát hiện "lãi ảo" qua dòng tiền & nhất quán liên báo cáo.

---

## 9. Đánh giá & Lộ trình triển khai

| Ưu tiên | Việc | Mở khóa | Nguồn |
|---|---|---|---|
| **P0** | Thêm `company_type` + phân loại 401 mã | Sửa lỗi gộp `revenue`; mọi ratio ngành tính đúng | Suy từ sector/nhãn BCTC (local) |
| **P0** | Bảng `financial_ratios` chuẩn hóa theo loại hình | Agent đọc ratio nhất quán; ~70% danh mục FireAnt | DB + xlsx (local) |
| **P1** | ETL `financial_statements` line-items (năm+quý) + **Note bank: nhóm nợ, CASA** | Bằng FireAnt ở **toàn bộ chỉ tiêu bank** + EBIT/ROIC/turnover; giải thích biến động LN | xlsx (local) |
| **P1** | `statement_item_map` dictionary + chuẩn item_code | So sánh chéo ngành; mở rộng HNX/UPCoM | — |
| **P2** | Nạp `prices_daily` full 401 mã + `market_cap`/số CP | Mở **khối Định giá** — phần duy nhất thua FireAnt | API giá (DNSE/Vietcap) |

> **P0 + P1 dùng 100% dữ liệu local đã có** → đạt ~95% danh mục ratio FireAnt cho cả 4 loại hình mà không cần mua dữ liệu. **P2** cần nguồn giá để hoàn thiện khối định giá.

---

## 10. Kết luận cho Founder

1. **Giữ lại gì:** không phải "càng nhiều càng tốt" — mà **~40–70 dòng cốt lõi/loại hình + nhóm thuyết minh đặc thù + bảng ratio dẫn xuất**. Đủ để Agent tính mọi ratio đúng ngành, đọc cấu trúc DT–CP–dòng tiền, và phát hiện red flag — gọn hơn ~60% so với lưu full.
2. **So với hiện tại:** DB mới đạt ~25-30%; thiếu nghiêm trọng nhất là **company_type + IS chi tiết + thuyết minh ngành** — **tất cả có sẵn trong file**, chỉ cần ETL.
3. **So với FireAnt:** thiết kế là **superset** — bằng ở ratio chuẩn, **hơn** ở chuyên biệt ngành + dòng tiền + lịch sử + máy-đọc-cho-AI. Khoảng cách duy nhất là **dữ liệu giá** (khối định giá ngoài VN30).

> **Thông điệp chốt:** *"Bộ ratio của ta = FireAnt + chiều sâu ngành + chất lượng dòng tiền + sẵn-sàng-cho-AI. Khoảng cách duy nhất là dữ liệu giá, không phải năng lực phân tích — và phần lớn việc còn lại là ETL từ dữ liệu ta đã có, không cần mua thêm."*

---

*Phụ lục — Nguồn dữ liệu: `~/bctc_vietcap/HOSE/*.xlsx` (401 mã, Vietcap IQ) · `~/simplize-scraper/HOSE.md` (context DN). DB Supabase: `financials_annual`, `balance_sheet`, `cash_flow_statement`, `stocks`, `tickers`.*
