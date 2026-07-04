# Báo cáo phân tích Vietstock + ActionHub NotebookLM

> Tính năng: mục "Báo cáo phân tích" ở dashboard hiển thị báo cáo phân tích **doanh nghiệp** từ
> Vietstock; kéo báo cáo vào ActionHub → AI đọc **toàn văn** để phân tích (kiểu NotebookLM);
> nút "Xem" → mở PDF gốc. Ngày làm: 2026-06-27.

## 1. Pipeline ingest (scraper)

**File:** [`toolcrawldata/sync_vietstock_reports.py`](../toolcrawldata/sync_vietstock_reports.py)

```bash
python sync_vietstock_reports.py --dry --pages 1    # in ra, không ghi DB
python sync_vietstock_reports.py --pages 3          # crawl 3 trang + upsert (~27 báo cáo)
```

**Nguồn:** `finance.vietstock.vn/bao-cao-phan-tich`, `reportTypeID=58` (Phân tích Doanh nghiệp).
- List qua AJAX `POST /View/ChannelEDocumentPage` `{reportTypeID, page, pageSize:9, __RequestVerificationToken}`
  (token + rptid lấy từ trang category `/bao-cao-phan-tich/phan-tich-doanh-nghiep`).
- Mỗi báo cáo: `/bao-cao-phan-tich/{edocs_id}/{slug}.htm` → trang chi tiết có link PDF gốc
  `https://static1.vietstock.vn/edocs/{id}/*.pdf`.
- **PDF là text thật (không scan)** → trích bằng **fitz (PyMuPDF)**, đầy đủ thông tin, không OCR.
- Metadata: ticker/khuyến nghị/giá mục tiêu parse từ **slug** + `og:title`; CTCK phát hành nhận từ
  800 ký tự đầu PDF (SSI/VNDirect/DSC/Vietcap/ACBS/Mirae...); ngày từ 1500 ký tự đầu PDF.

**Đã chạy thật:** 27 báo cáo (3 trang) → upsert thành công. ticker 27/27, khuyến nghị+giá mục tiêu ~21/27,
full_text 5k–48k ký tự.

## 2. Supabase — bảng `analyst_reports`

**Migration:** [`supabase/migrations/20260627000000_analyst_reports.sql`](../supabase/migrations/20260627000000_analyst_reports.sql)

| Cột | Ý nghĩa |
|---|---|
| `id` (PK) | Vietstock edocs id |
| `ticker` | mã cổ phiếu |
| `title` | tiêu đề (og:title) |
| `source_firm` | CTCK phát hành |
| `recommendation` | MUA / Khả quan / Tích lũy / Trung lập / BÁN... |
| `target_price` | giá mục tiêu (VND) |
| `report_date` | ngày báo cáo |
| `pdf_url` | link PDF gốc (KHÔNG lưu binary) |
| `full_text` | toàn văn trích từ PDF |

- RLS bật + policy anon SELECT (frontend đọc bằng anon key).
- Tạo bằng Supabase Management API (`POST api.supabase.com/v1/projects/{ref}/database/query`,
  personal access token).

## 3. Frontend — mục "Báo cáo phân tích"

**File:** [`src/pages/app/dashboard-new.tsx`](../src/pages/app/dashboard-new.tsx) (component LIVE qua `routes.tsx` → `NewLayout`)

- Thêm `interface AnalystReport` + state `reports`/`reportsLoading` + loader `loadReports()`
  (đọc `analyst_reports`, order id desc, limit 12).
- **Thay** render mục (trước đọc `briefs` nội bộ) → render báo cáo Vietstock: tiêu đề, badge
  ticker · CTCK · ngày · khuyến nghị+giá mục tiêu.
- **Nút "Xem"** → `window.open(pdf_url)` (PDF gốc, không cần lưu bản gốc).
- Card kéo được, mang `ContextCard { id: report.id, type: "report", badge: source_firm, ... }`.
- Build pass (`npm run build`).

## 4. ActionHub grounding (NotebookLM) — `bee-ai-chat`

**File:** [`supabase/functions/bee-ai-chat/index.ts`](../supabase/functions/bee-ai-chat/index.ts) — **đã deploy**

- Hạ tầng drag-drop có sẵn: `new-action-hub.tsx` `handleDrop` → `cardPayloads=[{id,type,...}]` →
  `sendChatMessage` → body `context_cards`.
- Sửa `buildContextHint` thành **async**: khi có card `type === "report"` + `id` → query
  `analyst_reports.full_text` theo id → nạp **toàn văn (≤40k ký tự)** vào system prompt như tài liệu nền,
  kèm chỉ dẫn "TRẢ LỜI DỰA TRÊN TÀI LIỆU NÀY, không bịa số ngoài tài liệu".

→ Kéo báo cáo vào ActionHub → AI phân tích grounded đúng nội dung báo cáo đó.

## 5. Còn lại (chưa làm)

1. **Commit + push frontend** (`dashboard-new.tsx`) → Vercel deploy để UI mới hiện cho người dùng
   (bee-ai-chat đã live, không cần Vercel).
2. **Lịch chạy scraper (realtime)** — hiện chạy thủ công; cần cron (hằng ngày/vài giờ) để tự kéo
   báo cáo mới.