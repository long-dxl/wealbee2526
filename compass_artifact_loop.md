# Loop Library của Forward Future: Nó là gì và có miễn phí không?

## TL;DR
- **Loop Library** (tại signals.forwardfuture.ai/loop-library) là một **thư viện miễn phí, mã nguồn mở** gồm các "loop" — tức là các prompt/quy trình lặp lại dành cho AI agent (như Claude Code, Cursor, Codex, Factory, Devin), mỗi loop có điều kiện kiểm tra và điều kiện dừng rõ ràng. Đây là dự án của Forward Future, công ty truyền thông AI của Matthew Berman.
- **Hoàn toàn miễn phí**: không có gói trả phí, không yêu cầu đăng ký tài khoản, không có tường phí. Bạn có thể duyệt và sao chép các loop ngay lập tức, và cài "skill" qua một lệnh npx miễn phí. Toàn bộ dự án được phát hành theo giấy phép MIT (mã nguồn mở).
- Đây **không phải** là tín hiệu giao dịch tài chính, khóa học hay danh bạ công cụ AI — mà là một bộ sưu tập "công thức" prompt thực dụng do các nhà thực hành đóng góp, có thể đóng góp thêm và đăng ký nhận một email mỗi tuần (tùy chọn, miễn phí).

## Key Findings
- Loop Library được Matthew Berman ra mắt qua bài đăng trên X có dấu thời gian "6:56 PM · Jun 18, 2026" (731.6K lượt xem): *"Just launched Loop Library - a curated list of agent loops you can use right now. Find loops, submit your own, tokenmaxx!!"*
- Trang chủ hiện hiển thị **44 loop**, được cập nhật ngày 20 tháng 6 năm 2026 ("Showing 44 loops · Updated June 20, 2026"), chia thành các danh mục: Engineering, Evaluation, Operations, Content, Design.
- Mỗi loop tuân theo cấu trúc: trigger (kích hoạt) → action (hành động) → verify (kiểm tra) → stop (dừng), kèm ghi công cho người đóng góp.
- Truy cập hoàn toàn miễn phí, mã nguồn mở theo giấy phép MIT, không cần tài khoản để duyệt/sao chép.
- Trang được lưu trữ — header và footer ghi "Hosted by here.now" (liên kết tới here.now/r/signals) — bởi here.now, một dịch vụ lưu trữ web tĩnh miễn phí dành cho AI agent.

## Details

### Loop Library là gì?
Loop Library là một bộ sưu tập các "loop" có thể tái sử dụng để giúp AI agent làm việc tốt hơn. Theo mô tả chính thức của trang, mỗi loop "cho agent biết phải làm gì, cách kiểm tra công việc của mình, thử gì tiếp theo, và khi nào nên dừng". Khác với prompt thông thường (yêu cầu agent làm một việc một lần), một loop bổ sung cơ chế phản hồi để công việc có thể lặp lại cho đến khi đạt mục tiêu. Trang giải thích có hai loại loop: loại "deterministic" (xác định, ví dụ: khi tốc độ trang dưới 50ms) và loại "LLM as judge" (dùng mô hình ngôn ngữ làm trọng tài, ví dụ: khi website "đủ nhanh").

Trang web có ba phần chính:
- **Loops**: lưới các loop có thể tìm kiếm và lọc theo danh mục, mỗi loop có nút "Copy loop" để sao chép prompt.
- **Learn**: hướng dẫn cách viết và chạy loop trong các công cụ agent (Cursor, Codex, Claude Code, Factory, Devin), bao gồm cả mẫu prompt để sao chép và điều chỉnh.
- **For agents**: hướng dẫn dành cho chính các AI agent đọc catalog (qua các file llms.txt, catalog.json, catalog.txt) để tự tìm và đề xuất loop phù hợp.

Các loop được đóng góp bởi nhiều nhà thực hành — gồm Peter Steinberger, Hiten Shah, Lukas Kucinski và những người khác (theo explainx.ai) — trong đó nhiều loop do chính Matthew Berman đăng. Ví dụ các loop: "The docs sweep" (giữ tài liệu đồng bộ với codebase), "The sub-50 ms page-load loop" (tối ưu tốc độ tải trang dưới 50ms), "The 100% test coverage loop", "The production error sweep", "The architecture satisfaction loop" của Peter Steinberger, v.v.

Có thể cài đặt một "skill" (kỹ năng) cho agent qua lệnh: `npx skills add Forward-Future/loop-library --skill loop-library -g`. Skill này giúp agent tìm loop phù hợp, điều chỉnh loop theo công cụ/giới hạn của bạn, hoặc thiết kế loop mới qua một cuộc hội thoại ngắn. Quan trọng: việc cài skill **không** tự động cấp quyền chạy các hành động nguy hiểm (triển khai, lên lịch, xóa, gửi tin nhắn) — những hành động đó vẫn cần phê duyệt thông thường.

### Forward Future là gì?
Forward Future là công ty truyền thông AI do Matthew Berman sáng lập, với khẩu hiệu "Make the future legible" (Làm cho tương lai dễ hiểu). Họ vận hành một bản tin AI hàng ngày miễn phí (The Future Today / FF Daily), một kênh YouTube, và Forward Future University. Trang chủ forwardfuture.ai tự công bố cộng đồng "800k professionals" (lưu ý: trang Subscribe lại ghi "a community of 600,000+ people", cho thấy con số dao động tùy trang). Loop Library nằm trên tên miền con "signals.forwardfuture.ai".

### Có miễn phí không?
**Có, hoàn toàn miễn phí.** Các nguồn xác nhận:
- Không tìm thấy bất kỳ trang giá, gói trả phí, hay tường phí nào cho Loop Library.
- Không cần đăng ký tài khoản để duyệt hay sao chép các loop (mỗi loop có nút "Copy" hiển thị trực tiếp).
- Dự án là mã nguồn mở theo giấy phép MIT. README của repo Forward-Future/loop-library trên GitHub ghi rõ: *"Loop Library is a Forward Future project and is available under the MIT License"* (repo công khai, gắn nhãn "MIT license").
- Việc cài skill qua npx cũng miễn phí.
- Bên thứ ba explainx.ai cũng mô tả đây là "a similarly strong, free collection" (một bộ sưu tập miễn phí).

Có một mục đăng ký email **tùy chọn** trên trang ("One useful loop, once a week") để nhận một loop hữu ích mỗi tuần; trang ghi rõ "Weekly only. No spam. Unsubscribe anytime." — đây cũng miễn phí và không bắt buộc. Bạn cũng có thể đóng góp loop của riêng mình qua một biểu mẫu (có quy trình duyệt riêng tư trước khi đăng).

**Lưu ý về chi phí gián tiếp**: bản thân Loop Library miễn phí, nhưng để *chạy* các loop bạn cần một công cụ AI agent (Claude Code, Cursor, Codex, Factory, Devin, v.v.) — các công cụ này có thể tính phí riêng (ví dụ phí API hoặc gói thuê bao), hoàn toàn không liên quan đến Loop Library.

## Recommendations
- **Nếu bạn muốn dùng ngay**: truy cập signals.forwardfuture.ai/loop-library, duyệt theo danh mục, bấm "Copy loop" để sao chép prompt và dán vào công cụ AI agent của bạn. Không cần đăng ký gì.
- **Nếu bạn dùng coding agent thường xuyên**: cài skill bằng lệnh `npx skills add Forward-Future/loop-library --skill loop-library -g` để agent tự tìm/điều chỉnh loop. Hoặc, không cần cài skill, bạn có thể yêu cầu agent đọc file signals.forwardfuture.ai/loop-library/llms.txt để tự tìm loop.
- **Nếu bạn muốn cập nhật**: đăng ký nhận email hàng tuần (miễn phí) hoặc theo dõi GitHub repo Forward-Future/loop-library.
- **Cẩn trọng khi chạy loop**: luôn đặt giới hạn (thời gian, chi phí, số vòng lặp) và yêu cầu phê duyệt cho các hành động nguy hiểm (triển khai production, xóa dữ liệu, gửi tin nhắn). Trang Learn của chính dự án cũng khuyến nghị điều này.

## Caveats
- Có một repo bên thứ ba (github.com/az9713/loop-library) là dự án fan độc lập chuyển các ý tưởng loop của Berman thành prompt chạy được — KHÔNG phải repo chính thức. Repo chính thức là github.com/Forward-Future/loop-library.
- Số lượng loop thay đổi theo thời gian: ra mắt ngày 18/6/2026 với 26 loop (báo chí ban đầu dẫn ~22), và tăng lên 44 tính đến 20/6/2026, khi các đóng góp được duyệt. Con số bạn thấy có thể khác.
- Đừng nhầm "Forward Future Signals / Loop Library" với các dịch vụ "futures signals" (tín hiệu giao dịch hợp đồng tương lai crypto/forex) — đó là các sản phẩm hoàn toàn khác và thường có phí.
- Một số nhà bình luận xem các loop tự cải tiến (tự sửa CLAUDE.md/bộ nhớ agent mà không có người kiểm duyệt) là rủi ro; nên ưu tiên các loop có cơ chế kiểm tra xác định (test, benchmark) làm "trọng tài".