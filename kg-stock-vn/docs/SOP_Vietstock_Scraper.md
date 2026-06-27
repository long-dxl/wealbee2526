# SOP — Tải Tin Tức Vietstock Ra Excel

## Mục đích
Tự động tải toàn bộ bài viết từ trang **Điểm tin** của Vietstock (`/chu-de/1-8/tat-ca.htm`), bao gồm nội dung đầy đủ từng bài, và xuất ra file Excel có định dạng chuyên nghiệp.

---

## Yêu cầu hệ thống

| Thành phần | Phiên bản |
|---|---|
| Python | 3.10+ |
| requests | `pip install requests` |
| beautifulsoup4 | `pip install beautifulsoup4` |
| pandas | `pip install pandas` |
| openpyxl | `pip install openpyxl` |

Cài tất cả một lần:
```bash
pip install requests beautifulsoup4 pandas openpyxl
```

---

## Các file trong folder

| File | Chức năng |
|---|---|
| `vietstock_scraper.py` | Script duy nhất — chạy 1 lần ra kết quả hoàn chỉnh |
| `vietstock_news_thang3_2026.xlsx` | Kết quả — 1,859 bài viết tháng 3/2026 |

---

## Quy trình thực hiện

Chỉ cần **một lệnh duy nhất:**

```bash
python3 vietstock_scraper.py
```

Script tự động chạy 3 bước:

| Bước | Nội dung | Thời gian |
|---|---|---|
| 1 | Tải danh sách bài từ API | ~2–3 phút |
| 2 | Tải nội dung đầy đủ từng bài (5 luồng song song) | ~8–10 phút |
| 3 | Xuất file Excel có định dạng | ~1 phút |

**Tổng: ~10–15 phút** cho khoảng 1,800 bài

---

## Tùy chỉnh khoảng thời gian

Mở `vietstock_scraper.py`, chỉnh dòng:

```python
START_DATE = date(2026, 3, 1)   # Thay đổi ngày bắt đầu tại đây
```

Ví dụ lấy từ đầu năm 2026:
```python
START_DATE = date(2026, 1, 1)
```

---

## Cấu trúc file Excel

### Sheet 1: Tin tức Vietstock
| Cột | Mô tả |
|---|---|
| STT | Số thứ tự |
| Tiêu đề | Tiêu đề bài viết |
| Nội dung | Toàn bộ nội dung bài (sau Bước 2) |
| Ngày đăng | Ngày giờ đăng bài (dd/mm/yyyy HH:MM) |
| Mã CK | Mã chứng khoán liên quan |
| Tác giả | Nguồn / tác giả |
| Giá đóng cửa | Giá cổ phiếu tại thời điểm đăng |
| Thay đổi giá | +/- so với phiên trước (màu xanh/đỏ) |
| % Thay đổi | % biến động giá |
| Link bài viết | URL bài viết gốc |
| Link tài chính | URL trang tài chính mã CK |

### Sheet 2: Thống kê
- Tổng số bài, khoảng thời gian, nguồn
- Top 20 mã chứng khoán xuất hiện nhiều nhất

---

## Kỹ thuật

- **API sử dụng:** `POST https://vietstock.vn/_Partials/GetStockNewsByMarketPaging`
- **Dữ liệu trả về:** JSON — 15 bài/trang, tổng ~488,000 bài trên hệ thống
- **Tải nội dung:** requests + BeautifulSoup, parse `.article-content > p`
- **Song song:** `ThreadPoolExecutor` 5 luồng + delay 0.3s/request
- **Dừng tự động:** Khi gặp bài có ngày trước `START_DATE`

---

## Lưu ý

- Không chạy quá nhanh (đã có delay) để tránh bị block IP
- File Excel có thể lớn (~50–100MB) nếu có nhiều bài với nội dung dài
- Nếu bị lỗi giữa chừng ở Bước 2, có thể chạy lại — script sẽ ghi đè file cũ
