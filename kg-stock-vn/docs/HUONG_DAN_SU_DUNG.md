# Hướng dẫn sử dụng — KG Stock VN

Hệ thống phân tích đầu tư cổ phiếu Việt Nam (Top 10 HoSE) dựa trên **Knowledge Graph động theo thời gian** (lấy cảm hứng từ FinDKG) + AI Agent Gemini. Hai tính năng cốt lõi:

1. **Bản đồ Tác động Nhân quả** — hỏi tự nhiên, AI suy luận chuỗi nhân quả vĩ mô → cổ phiếu, **chỉ dựa trên quan hệ có thật trong đồ thị** và luôn dẫn nguồn.
2. **Dòng thời gian Sự kiện & Tâm lý** — tin tức thật từ Vietstock được trích xuất thành sự kiện có thời gian, sentiment, độ tin cậy và link gốc.

> ⚠️ **Miễn trừ trách nhiệm:** Toàn bộ thông tin chỉ mang tính tham khảo, **KHÔNG phải khuyến nghị đầu tư**. Nhà đầu tư tự chịu trách nhiệm với quyết định của mình.

---

## 1. Cài đặt lần đầu

```bash
# 1) Cài thư viện
pip install -r requirements.txt

# 2) Cấu hình biến môi trường
cp .env.example .env
#   Điền: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
#   Lấy GEMINI_API_KEY miễn phí: https://aistudio.google.com/app/apikey

# 3) Tạo schema trên Supabase (chạy trên SQL Editor, theo thứ tự):
#    - schema.sql                  (bảng + RPC gốc)
#    - migration_temporal_kg.sql   (nâng cấp Temporal KG: cột thời gian/nguồn + RPC mới)

# 4) Nạp dữ liệu nền (cổ phiếu, vĩ mô, quan hệ chuyên gia)
python3 sync_top10_graph.py
```

---

## 2. Nạp dữ liệu thật

```bash
# Tin tức Vietstock 30 ngày, chỉ giữ tin độ tin cậy ≥ 0.5
python3 sync_vietstock_news.py --days 30 --min-confidence 0.5

# Xem trước không ghi DB (kiểm tra chất lượng trích xuất)
python3 sync_vietstock_news.py --days 3 --dry-run

# Dữ liệu cơ bản (giá, P/E, ROE… từ vnstock)
python3 sync_fundamentals.py
```

Nếu bạn nâng cấp Temporal KG trên DB đã có dữ liệu tin cũ, chạy một lần:
```bash
python3 fix_news_edges.py     # gắn lại data_source='news' cho các cạnh tin tức
```

---

## 3. Chạy ứng dụng

```bash
streamlit run app.py
```
Mở trình duyệt tại địa chỉ Streamlit in ra (mặc định http://localhost:8501).

**Các trang:**
- **AI Chat** (`app.py`) — Tính năng 1: hỏi đáp phân tích nhân quả.
- **Dashboard** (`pages/2_Dashboard.py`) — tổng quan giá & định giá Top 10.
- **KG Explorer** (`pages/3_KG_Explorer.py`) — duyệt trực quan đồ thị quan hệ.
- **News & Sentiment** (`pages/4_News.py`) — Tính năng 2: dòng thời gian sự kiện.

---

## 4. Cách dùng Tính năng 1 — Hỏi tác động nhân quả

Vào trang **AI Chat**, gõ câu hỏi tiếng Việt tự nhiên, ví dụ:
- *"Tỷ giá USD/VND tăng mạnh ảnh hưởng thế nào đến HPG?"*
- *"Fed neo lãi suất cao, VHM và VIC bị tác động ra sao?"*
- *"FPT có tin gì gần đây?"* (gọi dòng thời gian tin tức)

Cách đọc câu trả lời:
- AI trình bày **chuỗi nhân quả** men theo các cạnh có thật, kèm **loại quan hệ + độ tin cậy + nguồn**.
- Mục **"Chi tiết suy luận"** liệt kê các tool đã gọi và dữ liệu thô — bấm để kiểm chứng.
- Nếu thấy **"Không đủ dữ liệu trong Knowledge Graph"** → đồ thị chưa có quan hệ đó (hệ thống **không bịa**).

**Nguyên tắc tin cậy:** AI không đưa khuyến nghị mua/bán, không đặt giá mục tiêu. Mọi nhận định nhân quả đều phải truy được về một cạnh trong đồ thị.

---

## 5. Cách dùng Tính năng 2 — Dòng thời gian Sự kiện

Vào trang **News & Sentiment**:
- **Bộ lọc** (sidebar): theo mã, sentiment, từ khóa, và **độ tin cậy tối thiểu**.
- **Chip % tin cậy** trên mỗi tin: xanh ≥70% · vàng ≥50% · xám <50%.
- **"Cụm tin bất thường"**: cảnh báo khi một mã có mật độ tin cao bất thường (thuần thống kê) — nên xem kỹ.
- **"Nhận định AI (tham khảo)"**: diễn giải tự động của AI — **không phải dữ kiện gốc**; tiêu đề + link mới là bằng chứng.

---

## 6. Tự động hóa cập nhật (tùy chọn)

```bash
python3 scheduler.py                 # chạy nền: tin tức 07:00 hằng ngày, cơ bản 07:30 thứ Hai
python3 scheduler.py --now news      # chạy đồng bộ tin ngay
python3 scheduler.py --now all       # đồng bộ tất cả ngay
```

---

## 7. Hiểu về dữ liệu (minh bạch, chống bịa)

Mỗi quan hệ (cạnh) trong đồ thị có nhãn nguồn `data_source`:
- `expert_seed` — tri thức chuyên gia ổn định (vd: ngân hàng tài trợ BĐS).
- `macro_logic` — quan hệ nhân quả vĩ mô (vd: Fed → tỷ giá → cổ phiếu).
- `news` — trích từ tin tức thật, **bắt buộc** có `source_url` + `evidence_quote` (tiêu đề gốc) + `observed_at` (ngày) + `confidence`.

Cạnh tin tức thiếu nguồn sẽ bị loại ở khâu nạp — đây là cơ chế chống hallucination cốt lõi.

---

## 8. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `Thiếu GEMINI_API_KEY` | Kiểm tra file `.env` ở thư mục gốc |
| Agent báo lỗi 503/quota | Free tier giới hạn 15 req/phút; chờ rồi thử lại (hệ thống tự fallback model) |
| Trang News rỗng timeline | Chạy `sync_vietstock_news.py` để nạp tin, hoặc `fix_news_edges.py` cho dữ liệu cũ |
| RPC báo NOT_FOUND | Mã hỏi ngoài Top 10, hoặc chưa chạy `sync_top10_graph.py` |

**Phạm vi hỗ trợ (Top 10 HoSE):** HPG, VHM, VIC, VCB, TCB, BID, MSN, VNM, MWG, FPT.
