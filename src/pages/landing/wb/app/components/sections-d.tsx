import { useState } from "react";
import { Check, Plus, Minus } from "lucide-react";
import { Reveal, Eyebrow, Button } from "./primitives";

/* ───────────────────────────── Pricing ───────────────────────────── */
type BillingPeriod = "monthly" | "yearly";

interface Plan {
  name: string;
  tagline: string;
  monthly: { amount: string; currency: string; sub: string };
  yearly: { amount: string; currency: string; sub: string };
  features: string[];
  inherit?: string;
  cta: string;
  ctaAction?: "demo" | "link";
  highlight: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    name: "Free",
    tagline: "Bắt đầu khám phá Wealbee",
    monthly: { amount: "0", currency: "đ", sub: "Miễn phí mãi mãi" },
    yearly:  { amount: "0", currency: "đ", sub: "Miễn phí mãi mãi" },
    features: [
      "10 credits/ngày",
      "2 chuyên gia AI",
      "Báo cáo cơ bản",
      "Hỗ trợ cộng đồng",
    ],
    cta: "Bắt đầu miễn phí",
    ctaAction: "demo",
    highlight: false,
  },
  {
    name: "Pro",
    tagline: "Theo dõi danh mục hàng ngày",
    monthly: { amount: "199.000", currency: "đ", sub: "mỗi tháng" },
    yearly:  { amount: "169.000", currency: "đ", sub: "mỗi tháng · tiết kiệm 15%" },
    features: [
      "Tất cả tính năng Free",
      "100 credits/ngày",
      "5 chuyên gia AI",
      "5 Agent active",
      "Hỗ trợ ưu tiên",
    ],
    inherit: "Tất cả tính năng Free, cộng thêm:",
    cta: "Yêu cầu Demo",
    ctaAction: "demo",
    highlight: true,
    badge: "Phổ biến nhất",
  },
  {
    name: "Premium",
    tagline: "Toàn quyền truy cập & dữ liệu cao cấp",
    monthly: { amount: "499.000", currency: "đ", sub: "mỗi tháng" },
    yearly:  { amount: "424.000", currency: "đ", sub: "mỗi tháng · tiết kiệm 15%" },
    features: [
      "Tất cả tính năng Pro",
      "1.000 credits/ngày",
      "Unlimited Agent",
      "Ưu tiên xử lý tức thì",
      "Truy cập sớm tính năng mới",
    ],
    inherit: "Tất cả tính năng Pro, cộng thêm:",
    cta: "Liên hệ",
    ctaAction: "demo",
    highlight: false,
  },
];

export function Pricing({ onOpenDemo }: { onOpenDemo: () => void }) {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto max-w-[1100px] px-5">
        <Reveal className="text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: "clamp(28px,3.6vw,42px)", lineHeight: 1.15, color: "var(--wb-text)" }}>
            Chọn chiến lược của bạn
          </h2>
          <p className="mx-auto mt-3 max-w-[480px]" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 16, lineHeight: 1.6, color: "var(--wb-muted)" }}>
            Từ khám phá đến chuyên sâu. Tìm gói phù hợp với nhu cầu của bạn.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-3">
            <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13.5, color: billing === "monthly" ? "var(--wb-text)" : "var(--wb-muted)" }}>
              Hàng tháng
            </span>
            <button
              type="button"
              onClick={() => setBilling(b => b === "monthly" ? "yearly" : "monthly")}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: billing === "yearly" ? "var(--wb-primary)" : "var(--wb-track)" }}
              aria-label="Toggle billing"
            >
              <span
                className="absolute left-1 top-1/2 size-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: billing === "yearly" ? "translate(20px, -50%)" : "translate(0, -50%)" }}
              />
            </button>
            <span className="flex items-center gap-1.5">
              <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13.5, color: billing === "yearly" ? "var(--wb-text)" : "var(--wb-muted)" }}>
                Hàng năm
              </span>
              <span className="rounded-full px-2 py-0.5" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 11, fontWeight: 600, color: "#4D8FE8", background: "rgba(77,143,232,0.12)" }}>
                Tiết kiệm 15%
              </span>
            </span>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((p, i) => {
            const price = billing === "yearly" ? p.yearly : p.monthly;
            return (
              <Reveal key={p.name} delay={i * 0.07}>
                <div
                  className="relative flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-300"
                  style={{
                    background: "var(--wb-card)",
                    borderColor: p.highlight ? "rgba(77,143,232,0.45)" : "var(--wb-border)",
                    boxShadow: p.highlight ? "0 0 0 1px rgba(77,143,232,0.1), 0 32px 80px rgba(8,73,172,0.2)" : "none",
                  }}
                >
                  {/* gradient separator at top - reference design pattern */}
                  <div
                    className="absolute left-[10%] right-[10%] top-0 h-px"
                    style={{ background: p.highlight ? "linear-gradient(to right, transparent, rgba(77,143,232,0.7), transparent)" : "linear-gradient(to right, transparent, var(--wb-hairline), transparent)" }}
                  />

                  {/* badge */}
                  {p.badge && (
                    <div className="absolute right-5 top-5 rounded-full px-3 py-1 text-white" style={{ background: "var(--wb-primary)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.04em" }}>
                      {p.badge}
                    </div>
                  )}

                  <div className="flex flex-col flex-1 p-7">
                    {/* plan header */}
                    <div>
                      <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 16, color: "var(--wb-text)" }}>{p.name}</div>
                      <div className="mt-1" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, color: "var(--wb-muted)" }}>{p.tagline}</div>
                    </div>

                    {/* price - reference: huge number with small currency prefix */}
                    <div className="mt-6 flex items-start gap-1">
                      <span className="mt-2" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 18, color: "var(--wb-muted)" }}>
                        {price.amount === "0" ? "" : "₫"}
                      </span>
                      <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 800, fontSize: price.amount === "0" ? 52 : 44, lineHeight: 1, color: "var(--wb-text)", letterSpacing: "-0.02em" }}>
                        {price.amount === "0" ? "0" : price.amount}
                        {price.amount === "0" && <span style={{ fontSize: 28, fontWeight: 700 }}>đ</span>}
                      </span>
                    </div>
                    <div className="mt-1.5" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "var(--wb-faint)" }}>
                      {price.sub}
                    </div>

                    {/* CTA */}
                    <Button
                      type="button"
                      onClick={p.ctaAction === "demo" ? onOpenDemo : undefined}
                      variant={p.highlight ? "primary" : "secondary"}
                      size="md"
                      fullWidth
                      className="mt-6"
                    >
                      {p.cta}
                    </Button>

                    {/* divider */}
                    <div className="my-6 h-px" style={{ background: "var(--wb-border)" }} />

                    {/* features */}
                    <ul className="flex-1 space-y-3">
                      {p.inherit && (
                        <li className="mb-1" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "var(--wb-faint)", fontStyle: "italic" }}>
                          {p.inherit}
                        </li>
                      )}
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(77,143,232,0.12)" }}>
                            <Check size={10} style={{ color: "#4D8FE8" }} />
                          </span>
                          <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13.5, color: "var(--wb-muted)", lineHeight: 1.5 }}>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.1} className="mt-10 text-center">
          <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: "var(--wb-muted)" }}>
            Cần white-label cho công ty chứng khoán?{" "}
            <button type="button" onClick={onOpenDemo} className="underline-offset-2 hover:underline" style={{ color: "var(--wb-bright)", background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}>Liên hệ giải pháp B2B.</button>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────────── Testimonials ───────────────────────────── */
const QUOTES = [
  {
    text: "Lần đầu một công cụ AI thật sự nhớ danh mục của tôi và cảnh báo đúng lúc, kèm dẫn chứng để tôi tự tin quyết định.",
    name: "Anh Minh",
    role: "Kỹ sư phần mềm · đang thi CFA L2",
    initials: "M",
  },
  {
    text: "Mỗi sáng tôi mở email là có bản tin gọn về watchlist, số liệu nào cũng có nguồn. Tiết kiệm cho tôi cả tiếng đồng hồ.",
    name: "Chị Hà",
    role: "Nhà đầu tư cá nhân",
    initials: "H",
  },
  {
    text: "Là môi giới, tôi để Wealbee dựng bản tin mang thương hiệu của mình. Khách hàng nghĩ tôi có cả một phòng phân tích.",
    name: "Anh Tuấn",
    role: "Môi giới chứng khoán",
    initials: "T",
  },
];

export function Testimonials() {
  return (
    <section className="py-24" style={{ background: "var(--wb-elev)" }}>
      <div className="mx-auto max-w-[1100px] px-5">
        <Reveal className="text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Nhà đầu tư nói gì về Wealbee
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <Reveal key={q.name} delay={i * 0.08}>
              <div className="flex h-full flex-col rounded-[14px] border p-6" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
                <p className="flex-1" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 15, lineHeight: 1.65, color: "var(--wb-text)" }}>"{q.text}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full text-white" style={{ background: "var(--wb-primary)", fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 16 }}>{q.initials}</span>
                  <div>
                    <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 14, color: "var(--wb-text)" }}>{q.name}</div>
                    <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "var(--wb-muted)" }}>{q.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── FAQ ───────────────────────────── */
const FAQS = [
  {
    q: "Wealbee khác gì ChatGPT và các chatbot AI tài chính khác?",
    a: "Chatbot thường trả lời thụ động từ dữ liệu cũ, không nhớ bạn đang nắm gì và hiếm khi dẫn nguồn. Wealbee chủ động giám sát thị trường 24/7, kéo dữ liệu real-time, hiểu đúng tỷ trọng & P&L danh mục của bạn, và mọi nhận định đều kèm citation [nguồn | ngày] để bạn tự kiểm chứng. Quan trọng nhất: Wealbee báo trước khi một sự kiện ảnh hưởng tới cổ phiếu bạn nắm, thay vì chờ bạn hỏi.",
  },
  {
    q: "Làm sao tôi tin phân tích của AI là chính xác, không 'bịa'?",
    a: "Mỗi số liệu và nhận định đều gắn citation dẫn về nguồn gốc (vd [Vietstock | 30/05/26]) để bạn click kiểm chứng tận gốc. Bạn cũng có thể mở 'Xem quá trình phân tích' để thấy từng bước AI suy luận và dữ liệu nó dùng. Wealbee được hậu thuẫn bởi mạng lưới CFA và ưu tiên truy xuất nguồn thật thay vì phỏng đoán.",
  },
  {
    q: "Wealbee có đưa khuyến nghị mua/bán không?",
    a: "Không. Wealbee là công cụ phân tích và thông tin, không phải nơi tư vấn đầu tư. Chúng tôi cung cấp dữ liệu, bối cảnh và phân tích có dẫn chứng để bạn tự ra quyết định. Mọi báo cáo đều kèm disclaimer pháp lý; quyết định và rủi ro cuối cùng thuộc về bạn.",
  },
  {
    q: "Tôi không rành công nghệ, không biết code - có dùng được không?",
    a: "Hoàn toàn được. Bạn chỉ cần gõ yêu cầu bằng tiếng Việt như đang nói chuyện (vd 'Báo tôi mỗi sáng 8h về HPG và VCB, kèm tác động tới danh mục'), Wealbee tự cấu hình Agent cho bạn. Hoặc bật một Template Agent dựng sẵn là chạy ngay - không cần một dòng code.",
  },
  {
    q: "'Chủ động' nghĩa là gì và Wealbee báo cho tôi bằng cách nào?",
    a: "Thay vì chờ bạn hỏi, Agent tự thức dậy khi có sự kiện liên quan tới danh mục - tin tức, biến động giá/khối lượng bất thường, kết quả kinh doanh - và đẩy cảnh báo kèm phân tích tác động, thường dưới 30 giây. Bạn nhận báo cáo định kỳ (vd Morning Brief lúc 08:00) và cảnh báo tức thời qua In-app, Zalo/Telegram và Email.",
  },
  {
    q: "Wealbee theo dõi thị trường và những mã nào?",
    a: "Wealbee tập trung sâu vào thị trường chứng khoán Việt Nam (HOSE, HNX, UPCoM), với dữ liệu liên tục từ Vietstock, FiinGroup, CafeF, VnExpress, NHNN... Bạn tự chọn watchlist các mã mình quan tâm, và Agent sẽ giám sát giá, khối lượng, tin tức cùng sự kiện doanh nghiệp của đúng những mã đó theo thời gian thực.",
  },
  {
    q: "Credit là gì? Tôi có dễ bị dùng hết không?",
    a: "Credit là đơn vị tính cho mỗi lần Agent chạy hoặc phân tích. Gói Free có 10 credits/ngày (đủ để theo dõi vài mã), Pro 100 credits/ngày, Premium 1.000 credits/ngày. Credit được làm mới mỗi ngày nên bạn khó 'cháy' gói; cần nhiều hơn thì nâng cấp bất cứ lúc nào.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24">
      <div className="mx-auto max-w-[800px] px-5">
        <Reveal className="text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Câu hỏi thường gặp
          </h2>
        </Reveal>

        <div className="mt-12 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={i} delay={i * 0.04}>
                <div className="overflow-hidden rounded-[14px] border" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15.5, color: "var(--wb-text)" }}>{f.q}</span>
                    {isOpen ? <Minus size={18} style={{ color: "var(--wb-bright)", flexShrink: 0 }} /> : <Plus size={18} style={{ color: "var(--wb-muted)", flexShrink: 0 }} />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14.5, lineHeight: 1.6, color: "var(--wb-muted)" }}>
                      {f.a}
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
