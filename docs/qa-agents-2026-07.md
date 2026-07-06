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

## Đánh giá chuyên gia (vòng 2 — sau khi 4 agent "đạt")

Đọc lại output cuối cùng với vai trò chuyên gia phân tích tài chính VN, đối chiếu thêm với DB (cổ tức HPG/VCB khớp 100%). Không còn số bịa ở cả 4 agent. 3 khoảng trống thực chất còn lại:

1. **daily_digest thiếu ổn định** — mục "Top tăng/giảm" có/mất ngẫu nhiên giữa các lượt chạy giống hệt nhau (đã xác nhận mất ngay từ bản thô, trước cả bước validate) — lỗi độ tin cậy, không phải lỗi dữ liệu.
2. **"Tin ảnh hưởng danh mục" đánh đồng tin toàn ngành với tin riêng mã** — VD tin "lãi suất huy động toàn hệ thống tăng" bị gắn nhãn như thể là tin riêng của VCB.
3. **insider_buy/volume_spike không cảnh báo độ mới dữ liệu khi chạy tay** — trình bày giao dịch/phiên đột biến từ 11 tháng / 18 ngày trước với văn phong y hệt tin mới, dễ gây hiểu nhầm là sự kiện vừa xảy ra. Đã cải thiện một phần: sau khi tối ưu context (mục dưới), bản thân model tự ghi rõ "đã qua gần 1 năm, không có giao dịch mua mới hơn" — nhưng đây là model tự giác, chưa phải cảnh báo cứng từ hệ thống.

Deep Research đọc BCTC chắc tay (tự nghi ngờ lợi nhuận đột biến, bắt đúng NIM/CIR/LDR cho ngân hàng) nhưng thiếu lớp "câu chuyện ngành" (VD: CAPEX khổng lồ của HPG chính là dự án Dung Quất 2, nhưng model chỉ viết chung chung "mở rộng năng lực sản xuất") — giới hạn của nguồn tin tức trong `market_news`, không sửa được bằng prompt.

## Tối ưu chi phí — đã triển khai

**Phát hiện định lượng:** so tỷ lệ token input:output giữa 4 agent — Deep Research (phân tích sâu 1 mã, đầy đủ 5 năm BCTC) đạt 2,4:1, hiệu quả nhất. insider_buy đạt **11,2:1** — tệ gấp gần 5 lần — vì gọi tool `financials` đầy đủ (5 năm + 5 quý IS/BS/CF/tỷ số) cho cả 3 mã, dù output cuối chỉ trích P/E, P/B và 1-2 dòng tăng trưởng gần nhất.

**Fix:** thêm tham số `depth: "full" | "brief"` cho `financialReport()` — brief mode giữ mục "Định giá hiện tại" (P/E, P/B, BVPS...) nhưng thay 4 bảng 5-năm/5-quý bằng: 1 bảng KQKD tóm tắt 2 năm (chỉ dòng doanh thu/lợi nhuận trọng yếu), 1 bảng KQKD quý gần nhất so cùng kỳ (đúng 2 quý YoY, không rolling 5 quý), và chỉ số cốt lõi của FY gần nhất (không bảng đa kỳ). Áp dụng brief cho `insider_buy`/`volume_spike` (cả trong `run-agent` lẫn `agent-scheduler`), giữ full cho `deep_research`/`portfolio_health`.

**Kết quả đo thực tế (chạy lại y hệt HPG/VIC/VCB):**

| Agent | Trước | Sau | Tiết kiệm |
|---|---|---|---|
| Lãnh đạo mua CP | 545đ (38.558 in / 3.457 out) | **337đ** (17.704 in / 3.667 out) | **-38% chi phí, -54% input** |
| Phiên KL đột biến | 292đ (14.462 in / 3.398 out) | 274đ (13.857 in / 3.120 out) | -6% (agent này không bật tool `financials` nên ít bị ảnh hưởng) |

Chất lượng output **giữ nguyên hoặc tốt hơn** sau khi rút gọn — đọc lại insider_buy sau fix còn tự phát hiện thêm chi tiết tinh vi hơn (VD: giao dịch VINSPEED mua VIC trùng đúng ngày ông Phạm Nhật Vượng bán ra — chưa xuất hiện ở lượt test trước), có thể vì bớt dữ liệu thừa giúp model tập trung hơn vào phần thực sự liên quan.

## Known issues còn lại (chưa fix — kèm hướng xử lý)

- **daily_digest thỉnh thoảng rơi mục "Top tăng/giảm"**. Hướng 0-token: chèn mục movers vào output bằng code (server đã tính sẵn) thay vì nhờ model chép.
- **Validator pass 2** vẫn gửi lại gần như toàn bộ ngữ cảnh + bản nháp (+~85% input/lượt cho agent context lớn), qua 15+ lượt test không lượt nào cần sửa gì đáng kể. Hướng: thêm bước kiểm tra cơ học (regex số output ↔ nguồn, 0 token) trước, chỉ gọi LLM validator khi phát hiện số lạ.
- **`agent-dry-run`** ("Chạy thử" trong Studio) còn bản builder riêng, không có price context, không có brief-mode financials → kết quả chạy thử nghèo hơn và đắt hơn chạy thật. Hướng: import `_shared/market-context.ts` + tham số depth.
- **Không cảnh báo cứng độ mới dữ liệu** cho insider_buy/volume_spike khi chạy tay (xem mục đánh giá chuyên gia ở trên).
- **Dữ liệu**: `insider_transactions.position` trống (nhiều dòng), `FCF_YIELD` CURRENT bị hỏng (giá trị hàng chục triệu %) — cần sửa ETL; ratios CURRENT trễ ~1 tuần (2026-06-28 vs phiên 2026-07-03).
- **agent-scheduler** dùng chung builder mới nhưng `max_tokens` vẫn 2000 (run-agent 8000) → brief scheduled có thể cụt với agent nhiều mã.

## Đánh giá kiến trúc & chi phí (CTO)

- **Prefetch-1-lần thay tool-loop**: đúng hướng, tiết kiệm lớn; giữ.
- **Ép mọi model về gpt-4.1-mini**: hợp lý — sau khi dữ liệu được cấu trúc sẵn (bảng, %, nhãn [DANH MỤC]), chất lượng đạt mà không cần model to. Chất lượng output phụ thuộc **chất lượng context** hơn là model — bằng chứng rõ nhất là brief-mode financials vừa rẻ hơn vừa không giảm chất lượng.
- **Tỷ lệ input:output token** là chỉ số hữu ích để phát hiện lãng phí context — nên theo dõi định kỳ cho agent mới, không chỉ nhìn tổng chi phí tuyệt đối.
- Tổng chi phí QA (2 vòng, ~17 lượt): **~4.000đ**. Chi phí/lượt sau fix nằm trong biên lợi nhuận Beeny hiện tại (1 Beeny = 40đ).

## Tài sản QA để regression

- User QA + 4 agent giữ nguyên (credentials trong scratchpad phiên này — `qa-user.txt`; cần thì reset password qua Auth Admin).
- Output từng vòng lưu tại scratchpad `qa-runs/` (v1 → v7 daily_digest, HPG/VCB/VCB-v2 deep research, insider v1-v2, volume v1-v2).
