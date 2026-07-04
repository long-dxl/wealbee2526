# Script thuyết trình — Luồng hệ thống Wealbee Agent

> Thời lượng: ~3–4 phút. Đọc theo từng chặng, mỗi chặng 1–2 câu.

---

## Mở đầu (15 giây)

"Wealbee là nền tảng cho phép nhà đầu tư tạo ra **AI Agent phân tích chứng khoán của riêng mình** —
cấu hình một lần, hệ thống tự động chạy mỗi ngày và gửi bản tin phân tích về tận Inbox và email.
Tôi xin trình bày luồng hệ thống qua **4 bước**: Cấu hình → Thu thập dữ liệu → Xử lý AI → Phân phối."

---

## Bước 1 — Nhà đầu tư cấu hình Agent (30 giây)

"Đầu tiên, người dùng cấu hình Agent trong **Agent Studio** với 3 lựa chọn chính:

- **Chọn mã cổ phiếu** cần theo dõi — ví dụ VCB, FPT, HPG hay cả danh mục VN30.
- **Chọn Template và Model** — quyết định 'tính cách' phân tích (bản tin thị trường, sức khỏe danh mục…)
  và mô hình AI sử dụng.
- **Đặt lịch chạy** — ví dụ mỗi ngày 8 giờ sáng, hoặc các ngày trong tuần.

Cấu hình này được lưu lại và một **Scheduler tự động** sẽ kích hoạt Agent đúng giờ đã hẹn."

---

## Bước 2 — Thu thập dữ liệu (45 giây)

"Khi được kích hoạt, hệ thống **gom dữ liệu từ 4 nguồn**:

1. **Giá cổ phiếu & chỉ số** (OHLCV) — lấy từ API của DNSE, gồm VN-Index, HNX và giá VN30.
2. **Tin tức thị trường** — thu thập từ các nguồn báo tài chính qua RSS, đã được lọc và chấm điểm tác động.
3. **Dữ liệu tài chính** — báo cáo tài chính, cổ tức, giao dịch nội bộ, lưu trong cơ sở dữ liệu Supabase.
4. **Danh mục cá nhân** — cổ phiếu người dùng đang nắm giữ, giá vốn và lãi/lỗ.

Điểm quan trọng: hệ thống áp dụng nguyên tắc **'chỉ dùng dữ liệu có thật'** — mọi con số đều phải
gắn nguồn trích dẫn, AI **không được bịa số liệu**."

---

## Bước 3 — Xử lý bằng AI (45 giây)

"Toàn bộ dữ liệu được đưa vào **AI Engine** qua 3 khâu:

- **Prompt Builder** — ghép dữ liệu thị trường, danh mục cá nhân và ngữ cảnh thành một prompt hoàn chỉnh.
- **Mô hình AI** — hệ thống hỗ trợ **nhiều mô hình**: mặc định dùng OpenAI, và có thể chọn Claude của Anthropic
  cho các phân tích chuyên sâu.
- **Streaming** — với chế độ chạy tay, kết quả được **stream real-time** về màn hình qua SSE,
  người dùng thấy AI 'suy nghĩ' và gọi từng công cụ dữ liệu ngay trước mắt.

Ở chế độ tự động theo lịch, Agent chạy nền, không cần streaming, và lưu thẳng kết quả."

---

## Bước 4 — Phân phối kết quả (30 giây)

"Cuối cùng, bản phân tích được **phân phối theo 2 kênh**:

- **Inbox trong ứng dụng** — một bản brief có cấu trúc, kèm nguồn trích dẫn để người dùng kiểm chứng.
- **Email** — gửi qua Resend API dưới dạng HTML được thiết kế đẹp, đọc tiện ngay trên điện thoại.

Nhà đầu tư nhận được bản tin đầy đủ mà **không cần mở app**, đúng giờ mỗi ngày."

---

## Kết (15 giây)

"Tóm lại, Wealbee biến một quy trình phân tích thủ công mất hàng giờ thành **một Agent tự động chạy 24/7**:
từ cấu hình một lần, đến gom dữ liệu đa nguồn, xử lý bằng AI có kiểm chứng, và giao tận tay nhà đầu tư.
Đó là cách chúng tôi giúp mỗi người có một **chuyên viên phân tích riêng**. Xin cảm ơn."

---

## Ghi chú kỹ thuật (khi bị hỏi sâu)

- **2 luồng chạy:**
  - *Chạy tay* (`run-agent`): dùng **function-calling** — LLM tự quyết định gọi tool nào (price_feed,
    news_feed, financials, portfolio_read, kb_search) + **stream SSE**.
  - *Chạy theo lịch* (`agent-scheduler`): **prefetch** dữ liệu nhét sẵn vào prompt, chạy nền, không stream.
    pg_cron quét mỗi 15 phút, chạy agent nào tới hạn `next_run_at`.
- **Đa mô hình:** OpenAI (`gpt-4.1-mini` / `gpt-4o-mini`) mặc định; Anthropic
  (`claude-sonnet-4-6`, `claude-opus-4-7`) khi được chọn và có API key.
- **Grounding:** mỗi số liệu bắt buộc gắn token `[ref:N]`; có disclaimer pháp lý theo Luật Chứng khoán 2019.
- **Nguồn giá:** DNSE entrade API (đơn vị ×1000). **Nguồn trích dẫn hiển thị:** FireAnt.