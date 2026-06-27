# Cron tin tức trên Cloud (Supabase) — thay launchd laptop

Mục tiêu: tin Vietstock tự cập nhật **luôn tươi**, không phụ thuộc laptop bật/thức.

## Kiến trúc
```
pg_cron (lịch, trong Supabase)
   └─ pg_net.http_post ──▶ Edge Function `sync-news` (Deno, always-on)
                              ├─ đọc WATCHLIST động (DB)
                              ├─ quét feed Vietstock 1 lần, lọc theo watchlist
                              ├─ dedup theo NỘI DUNG (tiêu đề chuẩn hoá)
                              └─ upsert → news_articles  ◀── Agent đọc nhanh
```

## Các bước deploy (1 lần)

**1. Tạo bảng watchlist** (nếu chưa): chạy `migration_watchlist.sql` trên Supabase SQL Editor.

**2. Cài Supabase CLI + login**
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <PROJECT_REF>
```

**3. Deploy Edge Function**
```bash
supabase functions deploy sync-news --no-verify-jwt
supabase secrets set SUPABASE_URL=https://<PROJECT_REF>.supabase.co \
                     SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY>
```

**4. Test thủ công**
```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/sync-news
# kỳ vọng: {"watchlist":10,"fetched":N,"upserted":N}
```

**5. Đặt lịch**: sửa `<PROJECT_REF>` trong `migration_pgcron_news.sql` rồi chạy trên SQL Editor.
   - Chạy **2×/ngày** (07:05 & 13:05 VN), `days_back=4` chồng lấp → lỡ 1-2 lượt vẫn không thủng.

**6. Gỡ cron laptop cũ** (sau khi cloud chạy ổn):
```bash
launchctl unload ~/Library/LaunchAgents/com.kgstockvn.news.plist
```

## Mở rộng phạm vi (thêm mã)
Chỉ cần INSERT vào `watchlist` — KHÔNG sửa/deploy lại code:
```sql
insert into watchlist (ticker, name, sector) values ('HSG','Hoa Sen','Thép'),('NKG','Nam Kim','Thép');
```
Lượt crawl kế tiếp sẽ tự bắt tin các mã mới (cùng 1 lần quét feed, không tốn thêm API).

## Giới hạn hiện tại (để biết)
- Edge Function gán sentiment bằng **heuristic từ khoá** (nhẹ, không cần Gemini). Nhãn chủ đề
  (tags) + diễn giải AI (ai_reason) vẫn do pipeline Python làm khi cần enrich sâu (KG v2).
- Dedup theo **tiêu đề chuẩn hoá**: bắt được tin đăng lại/giật tít khác; tin diễn đạt KHÁC HẲN
  về cùng sự kiện cần dedup theo **embedding** (KG v2 pgvector) — pha sau.
- Feed Vietstock gắn 1 StockCode/bài → mã ít tin (đuôi dài) vẫn rơi về `web_search` live khi hỏi.
