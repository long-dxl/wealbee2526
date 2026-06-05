# Wealbee Web Interface — Platform Feature Audit

> Đánh giá toàn bộ tính năng hiện có trong giao diện với dữ liệu mock.  
> Ngày: 2026-05-17 | Phiên bản: MVP v0.2

---

## 1. Tổng Quan Nền Tảng

| Hạng mục | Chi tiết |
|---|---|
| **Loại sản phẩm** | Dashboard dữ liệu tài chính + AI Agent cho thị trường chứng khoán Việt Nam |
| **Framework** | React 18 + Vite + Tailwind CSS |
| **Số trang** | 13 trang |
| **Dữ liệu** | 100% mock — 15 mã CP, 5 năm BCTC, lịch sử giá tổng hợp |
| **Trạng thái** | Giao diện hoàn chỉnh, chưa kết nối backend thực |
| **Theme** | Light / Dark / Midnight (lưu localStorage) |

---

## 2. Cấu Trúc Điều Hướng

### Sidebar (trái)
- **Dashboard** — Tổng quan thị trường
- **Inbox** — Thông báo & brief từ AI agent
- **Agents** — Quản lý automation agent
- **Templates** — Thư viện template agent
- **Tools** — Thư viện công cụ dữ liệu
- **Knowledge** — Cơ sở kiến thức
- **Portfolio** — Danh mục đầu tư
- **Settings** — Cài đặt hệ thống

Sidebar có thể thu gọn (64px icon / 240px mở rộng).

### ActionHub (phải)
- Panel ngữ cảnh có thể kéo thay đổi kích thước (mặc định 380px)
- Hiển thị Context Cards liên quan đến trang hiện tại
- Cards có thể kéo thả (`react-dnd`)

### Global Search (trên)
- Thanh tìm kiếm toàn cục
- Tự động gợi ý mã chứng khoán

---

## 3. Các Trang & Tính Năng Chi Tiết

### 3.1 Dashboard
**Mục đích:** Màn hình chính — cái nhìn toàn cảnh thị trường.

**Tính năng hiện có:**
- Bảng chỉ số thị trường (VN-Index, HNX)
- Top 5 mã tăng mạnh nhất trong ngày
- Top 5 mã giảm mạnh nhất trong ngày
- Hiệu suất theo ngành (sector performance bar chart)
- Tin tức thị trường nổi bật
- Điểm nhanh danh mục cá nhân
- Context Cards kéo thả vào ActionHub

**Dữ liệu mock:**
- `topGainers`, `topLosers` array inline trong component
- Sectors inline với giá trị % thay đổi

---

### 3.2 Portfolio — Danh Mục Đầu Tư
**Mục đích:** Theo dõi và phân tích danh mục cổ phiếu cá nhân.

**Tính năng hiện có:**
- **Biểu đồ phân bổ (Pie Chart)** — Tỷ trọng theo từng mã CP
- **Biểu đồ hiệu suất** — So sánh portfolio vs VN-Index vs HNX  
  - Các khoảng thời gian: 5D / 1M / 3M / YTD / 5Y
- **Bảng danh mục:** Symbol, tên, SL, giá vốn, giá hiện tại, P&L (giá trị + %)
- **Thêm/sửa/xóa vị thế** — Nút action trên bảng
- **Import CSV** — Tải danh mục từ file CSV
- **Export CSV** — Xuất danh mục ra file

**Dữ liệu mock:**
- `CHART_DATA` với 5 khoảng thời gian, điểm portfolio/VN-Index/HNX
- Holdings table với dữ liệu mẫu

---

### 3.3 Ticker Detail — Chi Tiết Mã Chứng Khoán
**Mục đích:** Phân tích chuyên sâu một mã cổ phiếu cụ thể.

**Tính năng hiện có:**
- **Biểu đồ giá lịch sử** — Area/Candlestick, khoảng 5D/1M/3M/YTD/5Y
- **Chỉ số tổng quan:** Giá, thay đổi %, KLGD, vốn hóa, P/E, P/B, ROE
- **Khoảng giá:** Day Low/High, 52-week Low/High
- **Tab điều hướng:**
  - _Overview_ — Thông tin công ty, ban lãnh đạo, website
  - _Financials_ — Bảng dữ liệu BCTC 5 năm (doanh thu, lợi nhuận, EPS, dòng tiền)
  - _Valuation_ — P/E, P/B, ROE, Debt/Equity, Current Ratio theo năm
- **Nút back** để quay về trang trước
- Có thể mở từ bất kỳ trang nào (overlay toàn trang)

**Dữ liệu mock (`tickerData.ts`):**
- 15 mã: VCB, BID, HPG, HSG, FPT, MWG, VNM, VIC, DXG, TCB, MSN, STB, ACB, NVL, PDR
- `DETAIL_MAP` chi tiết cho 5 mã: VCB, HPG, FPT, TCB, VNM
- `getPriceHistory(symbol, period)` — Sinh giá giả định deterministc theo seed mã
- `getFinancials(symbol)` — 5 năm BCTC đầy đủ cho HPG, FPT, VCB (2021–2025)

---

### 3.4 Agents — Quản Lý AI Agent
**Mục đích:** Xem và quản lý các automation agent đang hoạt động.

**Tính năng hiện có:**
- Danh sách agent card với:
  - Tên, mô tả, trạng thái (active / paused / error) + chấm màu
  - Loại trigger (cron / event / manual) + lịch
  - Lần chạy cuối, số lần chạy hôm nay, số brief đã tạo
- **Pause/Play** agent
- **Edit** — Mở Agent Studio với config hiện tại
- **Delete** agent
- Nút **+ Create Agent** — Mở Agent Studio mới

**Dữ liệu mock:**
- `mockAgents` array inline: 5 agent mẫu với đủ metadata

---

### 3.5 Agent Studio — Trình Xây Dựng Agent
**Mục đích:** Tạo và chỉnh sửa AI agent bằng giao diện no-code/low-code.

**Tính năng hiện có:**
- **Model Selector** — 6 model:
  - GPT-4o, GPT-4o mini
  - Claude Sonnet 4.6, Claude Opus 4.7
  - Gemini 1.5 Pro, Gemini 1.5 Flash
- **System Prompt Editor** — Textarea với gợi ý tối ưu
- **User Prompt Editor** — Mẫu đầu vào cụ thể
- **Knowledge Base Picker** — Đính kèm file từ KB vào agent
- **Tool Selector** — Chọn công cụ dữ liệu (10+ tools)
- **Trigger Configuration** — Cron / Event / Manual
- **Nút Test** — Chạy thử agent
- **Nút Save** — Lưu cấu hình
- Layout full-screen (ẩn Sidebar & ActionHub)
- **Compliance Banner** — Cảnh báo về outputs bị cấm

---

### 3.6 Templates — Thư Viện Template Agent
**Mục đích:** Cung cấp các template agent dựng sẵn để người dùng bắt đầu nhanh.

**6 Template hiện có:**

| # | Tên | Trigger | Tần suất | Mô tả |
|---|---|---|---|---|
| 1 | **Daily Market Digest** | Cron | 08:00 T2-T6 | Tóm tắt thị trường buổi sáng |
| 2 | **Portfolio Health** | Cron + Event | 09:15, 15:05, ngưỡng giá | Cảnh báo sức khỏe danh mục |
| 3 | **Earnings Analyst** | Event | T-24h, T+2h kết quả | Phân tích mùa BCTC |
| 4 | **Insider Tracker** | Event | Nộp hồ sơ HOSE mới | Theo dõi giao dịch nội bộ |
| 5 | **Macro Watch** | Cron | Thứ 2 07:00 (tuần) | Tóm tắt kinh tế vĩ mô |
| 6 | **Deep Research** | Manual | On-demand | Nghiên cứu chuyên sâu |

**Tính năng trên trang:**
- Gallery card với category badge
- Bộ lọc theo danh mục
- Nút **Use Template** — Mở Agent Studio với config template
- Hiển thị model đề xuất, ước tính token/lần chạy

---

### 3.7 Tool Library — Thư Viện Công Cụ Dữ Liệu
**Mục đích:** Danh sách các công cụ dữ liệu có thể gắn vào agent.

**Các công cụ hiện có (18 tools):**

| Nhóm | Công cụ |
|---|---|
| **Market** | Realtime price, Market indices, Top movers |
| **Financial** | BCTC (tài chính), P/E valuation, Dividend analysis |
| **Insider** | Insider trades, Blackout alerts |
| **Technical** | RSI, MACD, Moving averages |
| **News** | News feed, RSS aggregation |
| **Macro** | Economic indicators, FX rates |
| **Custom** | User-defined metrics |

**Tính năng trên trang:**
- Tool cards với icon, mô tả, stats (số lần dùng, tốc độ, độ chính xác)
- Bộ lọc theo category
- Kéo thả tool vào ActionHub
- Trạng thái: Available / Beta / Coming Soon

---

### 3.8 Knowledge Base — Cơ Sở Kiến Thức
**Mục đích:** Quản lý tài liệu để agent tham chiếu khi phân tích.

**Tính năng hiện có:**
- Danh sách file với metadata: loại (PDF/MD/TXT), kích thước, ngày tải, agent đang dùng
- **Upload** file mới
- **Delete** file
- Badge hiển thị agent nào đang sử dụng file đó
- Hiển thị tổng dung lượng đã dùng

**Dữ liệu mock:**
- `mockItems`: 4 file KB mẫu với các loại khác nhau

---

### 3.9 Inbox — Hộp Thư & Thông Báo
**Mục đích:** Nhận và đọc brief/alert được tạo bởi AI agent.

**Loại thông báo:**
- Market Digest (tóm tắt thị trường hàng ngày)
- Portfolio Alert (giá vượt ngưỡng, lệch phân bổ)
- Insider Alert (giao dịch của lãnh đạo)
- Earnings Note (phân tích kết quả kinh doanh)
- News Alert (tin tức liên quan danh mục)

**Tính năng hiện có:**
- Danh sách brief/alert với badge "chưa đọc"
- Dấu thời gian tạo
- Mức độ: info / warn / critical
- Mở rộng xem nội dung đầy đủ (markdown)
- Đánh dấu đã đọc / chưa đọc
- Lưu trữ / Xóa

**Dữ liệu mock:**
- `mockBriefs`: 3+ brief với nội dung markdown đầy đủ

---

### 3.10 Settings — Cài Đặt
**Mục đích:** Cấu hình tài khoản và hành vi hệ thống.

**Các mục cài đặt:**

| Mục | Nội dung |
|---|---|
| **Profile** | Thông tin người dùng, tài khoản |
| **Notifications** | Bật/tắt: email, push, digest tuần, agent alert |
| **Appearance** | Chọn theme (Light/Dark/Midnight), cỡ chữ |
| **Privacy** | Chia sẻ dữ liệu, API permissions |
| **Billing** | Xem gói hiện tại, nâng cấp |

**Bảng giá 3 gói:**

| Gói | Giá | Agent | Token/ngày | Watchlist |
|---|---|---|---|---|
| **Free** | Miễn phí | 5 | 500k | 10 mã |
| **Pro** | 199k VND/tháng | 20 | 5M | 50 mã |
| **Pro+** | 499k VND/tháng | Không giới hạn | 20M | 200 mã |

---

### 3.11 Onboarding — Luồng Khởi Tạo
**Mục đích:** Hướng dẫn người dùng mới thiết lập lần đầu.

**3 bước:**
1. **Chọn mục tiêu** — Theo dõi thị trường / Quản lý danh mục / Nghiên cứu
2. **Thiết lập danh mục** — Thêm tối đa 10 mã CP, hoặc dùng demo portfolio
3. **Đăng ký email** + xác nhận điều khoản

**Có nút Skip** để bỏ qua toàn bộ flow.

---

### 3.12 Market Pulse
**Mục đích:** Widget tổng quan thị trường nhanh.

**Tính năng:**
- Tổng quan ngành (sector performance)
- Top movers
- Tin tức liên quan

---

### 3.13 Tickers — Danh Sách Mã CP
**Mục đích:** Danh sách toàn bộ mã chứng khoán có thể theo dõi.

**Tính năng:**
- Bảng danh sách 15 mã hiện có
- Lọc theo sàn (HOSE/HNX), ngành
- Click mở Ticker Detail

---

## 4. Dữ Liệu Mock Hiện Có

### `src/app/data/tickerData.ts`

```
TICKER_LIST        15 mã CP (VCB, BID, HPG, HSG, FPT, MWG, VNM, VIC, DXG, TCB, MSN, STB, ACB, NVL, PDR)
DETAIL_MAP         Chi tiết đầy đủ cho VCB, HPG, FPT, TCB, VNM
getPriceHistory()  Giá lịch sử tổng hợp (5D/1M/3M/YTD/5Y) theo seed mã
getFinancials()    BCTC 5 năm (2021-2025) cho HPG, FPT, VCB
                   Tự động tạo dữ liệu ước tính cho 10 mã còn lại
```

### Dữ liệu inline trong components
| Component | Dữ liệu |
|---|---|
| Dashboard | topGainers[5], topLosers[5] |
| Agents | mockAgents[5] với metadata đầy đủ |
| Templates | templates[6] với spec chi tiết |
| ToolLibrary | tools[18] với stats |
| KnowledgeBase | mockItems[4] |
| Inbox | mockBriefs[3+] với nội dung markdown |
| Portfolio | CHART_DATA[5 periods] |

---

## 5. Hệ Thống Giao Diện

### Themes (3 chế độ)
- **Light** — Nền trắng, text tối, viền nhạt
- **Dark** — Nền xám đậm, text sáng
- **Midnight** — Nền đen/navy sâu, accent blue
- Lưu vào `localStorage`, đồng bộ OS preference

### Design Tokens
- **Brand blue:** `#0849AC`
- **Dark blue:** `#032D6B`
- **Light blue:** `#E8F0FE`
- **Font:** Montserrat (13pt–60pt)
- **Grid:** 4px base unit
- **Tăng:** xanh lá / Giảm: đỏ (tuân theo quy ước VN)

### Layout Dimensions
- Sidebar: 64px (thu gọn) / 240px (mở rộng)
- ActionHub: 380px (có thể kéo thay đổi)
- Header height: 52px
- Page max-width: 1200px

---

## 6. Tính Năng Kéo & Thả

Sử dụng `react-dnd` với HTML5 backend:
- Tool cards → ActionHub
- Context cards trong Dashboard
- KnowledgeBase files → Agent Studio

---

## 7. Tuân Thủ Pháp Lý (Compliance)

Theo Luật Chứng khoán 2019, Nghị định 155/2020, Thông tư 121/2020:

| Cho phép | Bị cấm |
|---|---|
| Tổng hợp dữ liệu thị trường | Khuyến nghị mua/bán cụ thể |
| Tính toán P/E, P/B, ROE | Đưa ra mục tiêu giá |
| Tóm tắt tin tức | Dự báo giá |
| Brief thị trường định kỳ | Mô phỏng "tư vấn đầu tư" |

**Triển khai trên giao diện:**
- Disclaimer footer trên mọi trang
- Compliance banner trong Agent Studio
- Cảnh báo blackout period khi có insider trade
- Ngăn output chứa "nên mua", "khuyến nghị", giá mục tiêu

---

## 8. Tình Trạng Kỹ Thuật

### Đã hoàn thiện
- [x] Toàn bộ UI/UX của 13 trang
- [x] Routing client-side (state-based)
- [x] Theme system (3 chế độ)
- [x] Mock data đầy đủ cho demo
- [x] Recharts charts (area, bar, line, pie)
- [x] Drag-and-drop (react-dnd)
- [x] Resizable panels
- [x] Compliance framework

### Chưa có / Cần bổ sung cho production
- [ ] Backend API / REST / WebSocket
- [ ] Authentication & authorization
- [ ] State management (Redux / Zustand)
- [ ] Dữ liệu thị trường thời gian thực
- [ ] Thực thi agent (LLM calls)
- [ ] File upload thực (S3/storage)
- [ ] Push notifications
- [ ] Testing (unit / integration / e2e)
- [ ] Error boundaries & loading states
- [ ] Internationalization (i18n)
- [ ] Mobile responsive (hiện tối ưu cho desktop)

---

## 9. Phụ Lục — Tài Liệu Tham Chiếu

| File | Nội dung |
|---|---|
| `src/imports/00-feature-requirement-main.md` | Design language, tokens, layout spec, IA đầy đủ |
| `src/imports/02-agent-templates.md` | System prompt, tool DAG, output spec cho 6 templates |
| `src/imports/04-compliance-disclaimers.md` | Khung pháp lý, disclaimer templates, compliance rules |
| `src/app/data/tickerData.ts` | Nguồn dữ liệu mock chính |

---

*Audit này phản ánh trạng thái tại phiên bản MVP v0.2 — giao diện đã hoàn chỉnh với dữ liệu mock, sẵn sàng để kết nối backend.*
