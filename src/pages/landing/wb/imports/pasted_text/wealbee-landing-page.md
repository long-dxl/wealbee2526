Thiết kế một LANDING PAGE marketing hoàn chỉnh cho "Wealbee" — nền tảng No-code 
xây dựng đội ngũ AI Agent phân tích tài chính cá nhân hóa, hoạt động 24/7 cho 
nhà đầu tư cá nhân Việt Nam. KHÔNG phải app giao dịch — đây là "lớp trí tuệ" 
chủ động giám sát danh mục, cảnh báo và phân tích CÓ DẪN CHỨNG.

═══════════════════ ART DIRECTION ═══════════════════
Phong cách: premium dark-tech kiểu Linear, nhúng khối "AI trả lời có citation" 
kiểu Perplexity/Finchat, tín hiệu tin cậy fintech kiểu Stripe. Tinh tế, nhiều 
khoảng trắng, cao cấp, ĐÁNG TIN. Tránh cảm giác app giao dịch nhiều số rối mắt.
- Mặc định DARK MODE, có toggle sang Light. Hero nền navy #0B0D18 với glow 
  gradient mesh xanh (#0849AC → #4D8FE8) tỏa mềm phía sau product visual, tiết 
  chế, chỉ 1 tông xanh thương hiệu (không cầu vồng).
- Hiệu ứng: scroll-triggered — số đếm tăng dần, chart tự vẽ khi cuộn tới, 
  notification trượt vào, card nâng nhẹ khi hover (shadow glow xanh).
- Hiển thị "SẢN PHẨM THẬT" (mock UI Action Hub), tuyệt đối không dùng ảnh stock.

═══════════════════ BRAND TOKENS ═══════════════════
Font: Montserrat. H1 700 (-0.01em), H2/H3 600, body 400, button/label 500.
Primary #0849AC | brand sáng #4D8FE8 | deep #032D6B | nền nhạt #E8F0FE
Số TĂNG/tốt = xanh #34C759 | số GIẢM/rủi ro = đỏ #FF3B30
Citation/dẫn chứng = cam #FF6B35 | highlight = vàng #FFD60A
Dark: canvas #0B0D18, card #131824, viền rgba(255,255,255,.07)
Light: canvas #F5F5F7, card #FFFFFF, chữ #1A1A2E
Bo góc 14px. Shadow glow xanh 0 20px 60px rgba(8,73,172,.16).
Logo: icon con ong/tổ ong + wordmark "Wealbee".

═══════════════════ CẤU TRÚC SECTION (theo thứ tự) ═══════════════════

[1] NAVBAR (sticky, mờ nền blur)
Trái: logo Wealbee. Giữa: Tính năng · Cách hoạt động · Bảng giá · Dành cho ai · FAQ.
Phải: toggle Light/Dark · "Đăng nhập" (ghost) · "Dùng thử miễn phí" (nút xanh #0849AC).

[2] HERO (full-height, nền navy + glow mesh xanh)
- Badge nhỏ trên cùng: "✦ Trí tuệ tài chính chủ động cho nhà đầu tư Việt"
- H1 (lớn, 2 dòng): 
  "Đội ngũ AI phân tích tài chính
   làm việc 24/7 cho riêng danh mục của bạn"
- Phụ đề: "Wealbee chủ động theo dõi thị trường, lọc tin quan trọng và gửi bạn 
  phân tích có dẫn chứng — trước khi bạn kịp hỏi. Không cần biết code."
- 2 CTA: [Dùng thử miễn phí →] (xanh đậm)  ·  [Xem Wealbee hoạt động] (ghost, icon play)
- Dòng tin cậy nhỏ dưới CTA: "Miễn phí 10 credits/ngày · Không cần thẻ tín dụng · 
  Dữ liệu từ Vietstock, FiinGroup, CafeF"
- VISUAL CHÍNH (bên phải/dưới): mock UI Action Hub trong khung browser tối — 
  hiển thị một Agent Report Card "VCB Watch Agent · 08:00, 01/06/2026" với:
  • bullet có số xanh "tăng 18%", citation cam "[cafef | 29/04/26]"
  • dòng "Tác động danh mục của bạn: +2.250.000 VND (VCB +0,8%)" (xanh)
  • mini line-chart, badge "✦ Xem quá trình phân tích 8s"

[3] TRUST STRIP (băng ngang, nền tối hơn)
Tiêu đề mờ: "Dữ liệu từ các nguồn uy tín nhất thị trường"
Hàng logo/tag mờ: Vietstock · FiinGroup · CafeF · VnExpress · NHNN · DNSE
3 số liệu đếm tăng: "12,9 triệu tài khoản chứng khoán VN" · "<30 giây nhận cảnh báo" 
· "100% nhận định có dẫn chứng"

[4] PROBLEM → tương phản (nền chuyển light hoặc card tối)
H2: "Nhà đầu tư cá nhân đang chơi một ván game không cân sức"
3 cột pain-point (icon + tiêu đề + mô tả):
  • "Bỏ lỡ tin quan trọng" — Bận họp, bạn lỡ sự kiện ảnh hưởng trực tiếp tới cổ 
    phiếu đang nắm.
  • "Ngợp trong nhiễu thông tin" — 2 giờ/tuần đọc báo cáo mà không biết điều gì 
    thật sự quan trọng với DANH MỤC của mình.
  • "Chatbot AI không nhớ bạn" — Phải giải thích lại portfolio từ đầu mỗi lần, 
    câu trả lời chung chung, không dẫn chứng.
Dòng chốt: "90-95% nhà đầu tư cá nhân thua lỗ dài hạn. Wealbee sinh ra để đổi điều đó."

[5] CÁCH HOẠT ĐỘNG — 3 bước (timeline ngang, mỗi bước 1 mini-visual)
H2: "Tạo trợ lý AI của riêng bạn trong chưa đến 60 giây"
  Bước 1 — "Gõ yêu cầu bằng tiếng Việt"
    Mock input: "Báo tôi mỗi sáng 8h về HPG và VCB, tin tức + giá, tác động danh mục"
  Bước 2 — "Wealbee tự cấu hình Agent"
    Hiện chip tự chọn: News Feed · Market Data · My Portfolio · Sector Intelligence
  Bước 3 — "Nhận báo cáo chủ động mỗi ngày"
    Mini Agent Report Card + icon kênh: In-app · Telegram · Email

[6] KHỐI PROOF "CITATION" — TRÁI TIM TRANG (nổi bật nhất)
H2: "Mọi con số, mọi nhận định — đều có dẫn chứng"
Phụ: "AI bịa một con số = mất tiền thật. Wealbee chặn điều đó bằng Citation Engine: 
không có nguồn = không được phép xuất."
VISUAL: khối chat lớn mô phỏng Chat Mode, người dùng hỏi "Định giá cổ phiếu HPG":
  - thanh "✦ Xem quá trình phân tích 8s ∨" (expand ra 4 bước có thời gian)
  - section "Định giá P/E" + line-chart 3 series (HPG xanh, ngành cam, TB 5 năm tím)
  - text: "P/E = 9,6: thấp hơn TB 5 năm (12,60) và thấp hơn TB ngành 
    [fiingroup | 29/05/26]" — số 9,6 xanh, citation cam clickable
  - disclaimer cuối: "⚠️ Phân tích thông tin. Không phải khuyến nghị đầu tư."
Chú thích bên cạnh giải thích color-coding: 🟢 xanh = nguồn gốc · 🔵 xanh dương = 
dữ liệu tài chính · 🟠 cam = tin tức.

[7] TÍNH NĂNG — BENTO GRID (lưới ô không đều, mỗi ô mini-visual động)
H2: "Một đội ngũ chuyên gia AI, luôn thức cùng thị trường"
  • Ô lớn: "Action Hub — vừa hỏi sâu, vừa tạo Agent trong cùng 1 màn hình. 
    Kéo thẳng card báo cáo/tin tức/giá vào chat để AI phân tích có ngữ cảnh."
  • "Chủ động, không chờ hỏi" — Agent tự thức dậy khi có sự kiện, đẩy cảnh báo <30s.
  • "Hiểu đúng danh mục bạn" — phân tích gắn tỷ trọng & P&L thực tế của bạn.
  • "Knowledge Graph" — mini-sơ đồ: Fed tăng LS → USD/VND tăng → HPG, VHM bị ảnh hưởng.
  • "Minh bạch lý luận" — mở "Xem quá trình phân tích" thấy từng bước AI làm.
  • "Không khóa dữ liệu" — export toàn bộ knowledge base & lịch sử bất cứ lúc nào.

[8] TEMPLATE AGENTS (4 card có sẵn, bật là chạy)
H2: "Bắt đầu ngay với các Agent dựng sẵn"
  📰 Morning Brief — Bản tin sáng tinh gọn về watchlist của bạn.
  👁 Watchlist Monitor — Giám sát giá & khối lượng bất thường theo thời gian thực.
  📊 Earnings Digest — Tóm tắt KQKD, so với kỳ vọng & lịch sử.
  🔍 Insider Tracker — Cảnh báo giao dịch cổ đông nội bộ.
Mỗi card: tên, mô tả 1 dòng, badge credit, nút "Kích hoạt".

[9] DÀNH CHO AI — 3 PERSONA (tab hoặc 3 cột)
H2: "Wealbee phù hợp với ai?"
  • "Nhà đầu tư bận rộn" — 'Khi có tin quan trọng về cổ phiếu tôi nắm, alert tôi 
    ngay kèm phân tích tác động đã sẵn sàng.'
  • "Môi giới & KOL" — 'Tự tổng hợp tin, viết sẵn bản tin sáng mang thương hiệu 
    của tôi — tôi chỉ review rồi gửi.' (Pro)
  • "Công ty chứng khoán (B2B)" — 'AI Agent gắn thương hiệu công ty tôi, tích hợp 
    trong 3 tháng, không cần build từ đầu.' (White-label)

[10] VÌ SAO WEALBEE KHÁC BIỆT (moat — nền tối, sang)
H2: "Không chỉ là một chatbot tài chính"
Bảng so sánh 2 cột "Chatbot thường" vs "Wealbee":
  Text thuần ✕ → Render chart, bảng inline ✓
  Trả lời từ knowledge cutoff ✕ → Kéo dữ liệu realtime ✓
  Không biết bạn nắm gì ✕ → Nhớ toàn bộ danh mục & lịch sử Agent ✓
  Không dẫn chứng ✕ → Mọi claim có citation [nguồn | ngày] ✓
  Bị động chờ hỏi ✕ → Chủ động đẩy insight 24/7 ✓
Dải nhỏ phía dưới: "Được tăng cường bởi bộ dữ liệu gắn nhãn chuẩn CFA & mạng lưới 
Dawn of Finance."

[11] BẢNG GIÁ (3 cột, cột Pro highlight viền xanh + badge 'Phổ biến nhất')
H2: "Bắt đầu miễn phí. Nâng cấp khi cần."
  FREE — 0đ — "10 credits/ngày · 2 chuyên gia AI · Báo cáo cơ bản" → [Bắt đầu]
  PRO — 199.000đ/tháng — "100 credits/ngày · 5 chuyên gia AI · Telegram alert · 
    5 Agent active" → [Dùng thử Pro] (nút xanh đậm)
  PREMIUM — 499.000đ/tháng — "1.000 credits/ngày · Unlimited Agent · Ưu tiên xử lý" 
    → [Liên hệ]
Dòng dưới: "Cần white-label cho công ty chứng khoán? Liên hệ giải pháp B2B."
Trust badge cạnh CTA: "Không cần thẻ · Huỷ bất cứ lúc nào · Dữ liệu của bạn luôn 
export được."

[12] TESTIMONIAL (2-3 card, có avatar + tên + vai trò)
H2: "Nhà đầu tư nói gì về Wealbee"
(card mẫu) "Lần đầu một công cụ AI thật sự nhớ danh mục của tôi và cảnh báo đúng 
lúc — kèm dẫn chứng để tôi tự tin quyết định." — Anh Minh, Kỹ sư phần mềm, đang thi CFA L2.

[13] FAQ (accordion)
H2: "Câu hỏi thường gặp"
  • Wealbee có đưa khuyến nghị mua/bán không? → Không. Wealbee cung cấp phân tích & 
    thông tin có dẫn chứng để bạn tự quyết định. Mọi output có disclaimer pháp lý.
  • Tôi không biết code có dùng được không? → Có. Bạn chỉ cần gõ yêu cầu bằng tiếng 
    Việt, Wealbee tự cấu hình Agent.
  • Dữ liệu lấy từ đâu? → Vietstock, FiinGroup, CafeF, VnExpress, NHNN... cập nhật 
    liên tục, mọi số liệu đều dẫn nguồn.
  • Credit là gì? → Đơn vị tính cho mỗi lần Agent chạy/phân tích. Gói Free có 
    10 credits/ngày.
  • Tôi có export được dữ liệu không? → Có, toàn bộ knowledge base, lịch sử Agent 
    & cấu hình — không khoá dữ liệu.

[14] CTA CUỐI (full-width, nền gradient xanh đậm + glow)
H2 lớn: "Để AI lo việc theo dõi thị trường. Bạn lo việc quyết định."
[Dùng thử Wealbee miễn phí →] (nút trắng nổi trên nền xanh)
Dòng nhỏ: "Tạo Agent đầu tiên trong 60 giây. Không cần thẻ tín dụng."

[15] FOOTER (nền tối nhất)
Cột 1: logo + tagline "Trí tuệ tài chính chủ động cho nhà đầu tư Việt." + social.
Cột 2 Sản phẩm: Tính năng · Bảng giá · Template Agents · Agent Studio.
Cột 3 Công ty: Về Wealbee · Blog · Tuyển dụng · Liên hệ B2B.
Cột 4 Pháp lý: Điều khoản · Bảo mật · Disclaimer đầu tư.
Dải đáy: "© 2026 Wealbee. Thông tin trên nền tảng chỉ mang tính tham khảo, không 
phải khuyến nghị đầu tư."

═══════════════════ RESPONSIVE & CHI TIẾT ═══════════════════
- Desktop 1440px / tablet / mobile 375px. Mobile: nav thành hamburger, bento 
  xếp 1 cột, hero visual full-width dưới text, pricing vuốt ngang.
- Accessibility: tương phản AA, focus ring xanh, target chạm ≥44px.
- Mọi mã cổ phiếu (HPG, VCB) render dạng chip clickable. Mọi citation màu cam, 
  gạch chân khi hover.
- Tông tiếng Việt: tự tin, rõ ràng, không hype quá, nhấn "chủ động" & "có dẫn chứng".
