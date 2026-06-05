# SOP — VN30 Real-time Stock Dashboard

> **Dán file này vào Claude Code** và nói: _"Hãy giúp tôi chạy dashboard theo SOP này"_
> Claude sẽ tự kiểm tra môi trường, cài đặt và chạy mà không cần bạn làm gì thêm.

---

## Mục đích

Dashboard terminal hiển thị **30 mã cổ phiếu VN30** theo thời gian thực (~2 giây/lần cập nhật), chạy liên tục từ lúc mở đến 15:15 rồi tự dừng và in giá đóng cửa.

---

## Cấu trúc thư mục

```
vn30_dashboard/
├── dashboard.py      ← code chính, chạy file này
├── requirements.txt  ← danh sách thư viện cần cài
└── SOP.md            ← file này
```

---

## Yêu cầu hệ thống

| Mục | Yêu cầu tối thiểu |
|-----|-------------------|
| Python | **3.10 trở lên** (khuyến nghị 3.12+) |
| Hệ điều hành | macOS, Linux, Windows (WSL khuyến nghị) |
| Kết nối mạng | Cần internet để gọi API |
| Terminal | Hỗ trợ màu ANSI (Terminal.app, iTerm2, VS Code Terminal, Windows Terminal) |
| Màn hình | Tối thiểu rộng **160 cột** để hiển thị đủ bảng |

---

## Bước 1 — Kiểm tra Python

```bash
python3 --version
```

Nếu ra `Python 3.10.x` trở lên → OK. Nếu thấp hơn hoặc không có:

```bash
# macOS (dùng Homebrew)
brew install python@3.12

# Ubuntu/Debian
sudo apt update && sudo apt install python3.12 python3.12-pip
```

---

## Bước 2 — Cài thư viện

```bash
cd ~/vn30_dashboard
pip install -r requirements.txt
```

Hoặc cài trực tiếp:

```bash
pip install "vnstock>=3.4.2" "rich>=13.0.0"
```

**Kiểm tra cài thành công:**

```bash
python3 -c "import vnstock, rich; print('OK')"
# Kết quả mong đợi: OK
```

> **Lưu ý:** Nếu thấy cảnh báo `📦 Vnstock X.X.X is available` khi chạy — đây chỉ là thông báo có bản mới, **không phải lỗi**, bỏ qua được.

---

## Bước 3 — Chạy dashboard

```bash
python3 ~/vn30_dashboard/dashboard.py
```

**Khởi động thành công trông như sau:**

```
╭──────────────────────────────────╮
│ VN30 Real-time Dashboard         │
│ Khởi động hệ thống đa nguồn...   │
╰──────────────────────────────────╯
[09:00:01] VN30: 30 mã — ACB BID CTG ...
[09:00:01] Sources sẵn sàng: [1] VCI  [2] KBS
Đang fetch lần đầu...
```

Sau ~2 giây bảng dữ liệu hiện ra tự động.

---

## Giao diện dashboard

```
🇻🇳 VN30 Dashboard  ● PHIÊN SÁNG  ● LIVE  09:15:32  #47
Nguồn: VCI ● 310ms 99%   KBS ○ 100%
▲12  ▼16  ■2   GT VN30: 3.24 nghìn tỷ   310ms

 #   Mã      Giá       ±        %      TC      Mở     Cao    Thấp    Bid     Ask    KL(trCP)  GT(tỷ)
 1   VIC  130,000   -5,100  -3.77%  135,100  136,000  137,000  129,800  130,000  130,100     2.13    277.3
 2   MWG   75,000   -4,900  -6.13%   79,900   81,000   82,600   74,700   75,000   75,100     8.08    608.1
...
30   VNM   61,000    +500   +0.83%   60,500   60,800   62,000   60,400   60,900   61,000     3.17    193.2
```

### Ý nghĩa màu sắc

| Màu | Ý nghĩa |
|-----|---------|
| 🟢 Xanh lá | Giá tăng so với tham chiếu |
| 🔴 Đỏ | Giá giảm so với tham chiếu |
| 🟡 Vàng | Giá bằng tham chiếu (đứng) |
| 🟣 Tím | Mã chạm **trần** |
| 🔵 Xanh nhạt | Mã chạm **sàn** |

### Ý nghĩa cột

| Cột | Ý nghĩa |
|-----|---------|
| TC | Giá tham chiếu (giá đóng cửa hôm qua) |
| ± | Chênh lệch tuyệt đối so với TC |
| % | Phần trăm thay đổi so với TC |
| Bid | Giá mua tốt nhất hiện tại |
| Ask | Giá bán tốt nhất hiện tại |
| KL | Tổng khối lượng khớp lệnh từ đầu phiên (triệu CP) |
| GT | Tổng giá trị giao dịch từ đầu phiên (tỷ đồng) |

---

## Hệ thống nguồn dữ liệu (tự động)

Dashboard dùng **2 nguồn dự phòng** luân phiên tự động:

```
Ưu tiên 1: VCI  (vietcap.com.vn)   ~300ms  — dùng mặc định
Ưu tiên 2: KBS  (kbsec.com.vn)     ~400ms  — tự chuyển khi VCI lỗi
```

**Quy tắc chuyển nguồn:**
- VCI lỗi **3 lần liên tiếp** → tự chuyển sang KBS, hiển thị `⚡ CHUYỂN NGUỒN`
- Sau **60 giây** → thử kết nối lại VCI, nếu OK tự chuyển về, hiển thị `✓ KHÔI PHỤC`
- Nếu **cả hai nguồn đều lỗi** → giữ nguyên dữ liệu cũ, hiển thị `✗ Mất kết nối Xs`

---

## Giờ giao dịch

| Thời gian | Trạng thái |
|-----------|-----------|
| 09:00 – 11:30 | ● PHIÊN SÁNG |
| 11:30 – 13:00 | ◌ NGHỈ TRƯA (vẫn cập nhật) |
| 13:00 – 14:45 | ● PHIÊN CHIỀU |
| 14:45 – 15:00 | ⚡ ATO/ATC |
| 15:00 – 15:15 | ■ KẾT THÚC |
| **15:15** | **Dashboard tự dừng, in bảng giá đóng cửa** |

> Nếu chạy **ngoài giờ giao dịch**: dashboard vẫn chạy, hiển thị `○ NGOÀI GIỜ` và dữ liệu từ phiên gần nhất.

---

## Dừng dashboard

```
Ctrl + C
```

Khi thoát sẽ in thống kê nguồn dữ liệu:

```
Thống kê nguồn:
  VCI: 1823 ok / 2 lỗi  (99.9%)
  KBS: 3 ok / 0 lỗi  (100.0%)
Đã thoát.
```

---

## Xử lý lỗi thường gặp

### Lỗi: `ModuleNotFoundError: No module named 'vnstock'`
```bash
pip install vnstock rich
```

### Lỗi: `python3: command not found`
```bash
# macOS
brew install python3
# hoặc dùng python thay python3
python dashboard.py
```

### Lỗi: Terminal quá hẹp, bảng bị vỡ
- Kéo rộng cửa sổ terminal tối thiểu **160 cột**
- Hoặc giảm font size trong terminal settings

### Dashboard hiển thị `⚠ Xs trước` (dữ liệu cũ)
- Kiểm tra kết nối mạng
- Đợi 60s để hệ thống tự thử nguồn dự phòng
- Nếu vẫn lỗi: `Ctrl+C` rồi chạy lại

### Thấy nhiều dòng cảnh báo `📦 Vnstock X.X is available`
- Không phải lỗi, chỉ là thông báo cập nhật
- Bỏ qua hoặc chạy `pip install vnstock --upgrade` để tắt

---

## Tuỳ chỉnh

Mở file `dashboard.py`, tìm phần **Cấu hình** ở đầu file:

```python
REFRESH_SEC     = 2      # tăng lên 5 nếu muốn tiết kiệm băng thông
FETCH_TIMEOUT   = 8      # tăng lên nếu mạng chậm
FAIL_THRESHOLD  = 3      # số lỗi trước khi đổi nguồn
RECOVERY_SECS   = 60     # giây chờ trước khi thử khôi phục nguồn chính
SESSION_END     = dtime(15, 15)   # giờ tự dừng
```

---

## Thông tin kỹ thuật

| Mục | Chi tiết |
|-----|---------|
| Nguồn dữ liệu | VCI (Viet Capital Securities) và KBS (KB Securities) qua thư viện vnstock |
| API | `trading.price_board()` — 1 request/lần cho toàn bộ 30 mã |
| Băng thông | ~15–25 KB/request × ~1800 lần/giờ ≈ **~25 MB/giờ** |
| RAM | ~60–80 MB |
| CPU | < 2% |
| Giấy phép vnstock | Miễn phí cho cá nhân, **không dùng thương mại** |

---

*Tạo bởi Claude Code — cập nhật 03/2026*
