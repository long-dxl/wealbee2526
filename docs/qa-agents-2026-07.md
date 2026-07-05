# Báo cáo QA 4 Agent mẫu — 2026-07-05

Kiểm định như user thật: user QA `wealbee.qa.agent@gmail.com` (plan pro), danh mục **HPG 1.000 @24.000 · VIC 200 @200.000 · VCB 500 @60.000**, kích hoạt 4 agent từ template mặc định, chạy qua đúng endpoint UI dùng (`run-agent`, SSE). Vòng lặp: chạy → chuyên gia review (đối chiếu từng số với DB) → CTO fix → deploy → chạy lại.

## Kết quả tổng quan

| Agent | Trước QA | Sau QA | Chi phí/lượt (thực đo) |
|---|---|---|---|
| Bản tin buổi sáng (daily_digest) | Sai nặng: thiếu giá VIC/VCB, top movers bịa, tin danh mục gán nhầm (BVBank), sai ngày | **Đạt** — 100% số liệu khớp DB, tin danh mục thật, movers thật kèm % | ~10-12k tokens ≈ 150-185đ ≈ 4-4,6 Beeny |
| Deep Research (deep_research) | Khá, nhưng thiếu P/E/P/B/giá hiện tại (nói "không có dữ liệu" dù DB có), bỏ qua cổ tức/insider | **Đạt** — có định giá hiện tại đặt cạnh ROE + mục cổ tức/nội bộ | ~23-25k tokens ≈ 440-500đ ≈ 11-12,5 Beeny |
| Lãnh đạo mua CP (insider_buy) | **Vô dụng** — `tools` rỗng trong DB → chạy không có dữ liệu | **Đạt** — phân tích đúng bản chất (VD: VINSPEED nhận chuyển nhượng = cơ cấu sở hữu, không phải tín hiệu niềm tin), trung thực về giới hạn dữ liệu | ~42k tokens ≈ 545đ ≈ 13,6 Beeny |
| Phiên KL đột biến (volume_spike) | **Vô dụng** — `tools` rỗng + không có dữ liệu KL/TB20 | **Đạt** — bắt đúng phiên đột biến VIC 18/06 (2,06× TB20, +6,98%, verify khớp DB), mã không đột biến kết luận gọn | ~18k tokens ≈ 292đ ≈ 7,3 Beeny |

## Lỗi gốc đã tìm ra & fix

1. **`buildPriceContext` mù 90% thị trường** — query `prices_daily order by date desc limit 75` khi DB có 712 mã/phiên → chỉ thấy 75 mã ngẫu nhiên 1 phiên, không mã nào đủ 2 phiên để tính %; "Giá VN30" và "Top movers" thực chất không tồn tại, model tự chế. **Fix**: lọc theo `tickers.in_vn30` + mã theo dõi, 2 phiên/mã → giá, %Δ, KL có `[ref]`; movers tính đúng; thêm thanh khoản 21 phiên (KL/TB20, phiên KL max) cho mã theo dõi.
2. **Validator pass 2 chạy với nguồn RỖNG** — đọc nguồn từ `messages role="tool"` nhưng đường prefetch không tạo tool message → vừa đốt ~2× input token vô ích, vừa (sau khi có nguồn) cắt nhầm số thật do so định dạng ("3/7/2026" ≠ "2026-07-03"). **Fix**: nạp `prefetchedContext` làm nguồn (cap 60k) + prompt validator so số theo giá trị, nghi ngờ thì giữ.
3. **`insider_buy`/`volume_spike` seed `tools: []`** trong prod (không có trong migrations) → run-agent không prefetch gì → output chỉ bảo "bật tool". **Fix**: seed tools + "CHẾ ĐỘ CHẠY TAY" trong prompt + backfill agents đã kích hoạt + migration `20260705120000` để tái lập.
4. **`run-agent` bỏ qua `agents.target_symbols`** — chỉ nhận mã từ request body → gọi API trực tiếp/scheduler lệch cấu hình. **Fix**: fallback body → prompt cũ → `target_symbols` DB.
5. **`financialReport` bỏ sót định giá** — PE/PB/PRICE nằm ở `period_type=CURRENT` không được đọc. **Fix**: mục "0) Định giá hiện tại" (dùng chung cho run-agent, bee-ai-chat, scheduler, dry-run).
6. **3 bản copy builder giá/tin** (run-agent, scheduler, dry-run) đã drift. **Fix**: gộp về `_shared/market-context.ts` (run-agent + scheduler đã dùng chung).
7. **Prompt templates** viết lại: daily_digest v3 (heading không đánh số — chịu được việc validator xoá mục; mục danh mục tách khỏi VN30; movers chép từ dữ liệu), deep_research v2 (+định giá, +cổ tức/nội bộ).

## Known issues còn lại (chưa fix — kèm hướng xử lý)

- **daily_digest thỉnh thoảng rơi mục "Top tăng/giảm"** (gpt-4.1-mini bỏ mục dù prompt ép). Hướng 0-token: chèn mục movers vào output bằng code (server đã tính sẵn) thay vì nhờ model chép.
- **insider_buy input nặng nhất (38,5k tokens)** vì nạp full BCTC 3 mã. Hướng: template này chỉ cần bảng định giá + KQKD tóm tắt → giảm ~60-70% input (~350đ→~120đ/lượt).
- **`agent-dry-run` ("Chạy thử" trong Studio) còn bản builder riêng, không có price context** → kết quả chạy thử nghèo hơn chạy thật. Hướng: import `_shared/market-context.ts`.
- **Dữ liệu**: `insider_transactions.position` trống (nhiều dòng), `FCF_YIELD` CURRENT bị hỏng (giá trị hàng chục triệu %) — cần sửa ETL; ratios CURRENT trễ ~1 tuần (2026-06-28 vs phiên 2026-07-03).
- **agent-scheduler** dùng chung builder mới nhưng `max_tokens` vẫn 2000 (run-agent 8000) → brief scheduled có thể cụt với agent nhiều mã.

## Đánh giá kiến trúc & chi phí (CTO)

- **Prefetch-1-lần thay tool-loop**: đúng hướng, tiết kiệm lớn; giữ.
- **Ép mọi model về gpt-4.1-mini**: hợp lý — sau khi dữ liệu được cấu trúc sẵn (bảng, %, nhãn [DANH MỤC]), chất lượng đạt mà không cần model to. Chất lượng output phụ thuộc **chất lượng context** hơn là model.
- **Validator pass 2** = +~85% input/lượt. Giữ được (chống bịa) sau khi sửa nguồn + high-precision, nhưng đáng cân nhắc thay bằng check cơ học (regex số trong output ↔ nguồn, 0 token) cho các template số-nhiều.
- Tổng chi phí QA: 13 lượt = **3.405đ** (~170k input + 40k output tokens). Chi phí/lượt sau fix nằm trong biên lợi nhuận Beeny hiện tại (1 Beeny = 40đ).

## Tài sản QA để regression

- User QA + 4 agent giữ nguyên (credentials trong scratchpad phiên này — `qa-user.txt`; cần thì reset password qua Auth Admin).
- Output từng vòng lưu tại scratchpad `qa-runs/` (v1 → v7 daily_digest, HPG/VCB deep research, insider, volume).
