import { AlertTriangle, BellOff, Newspaper, MessageSquareOff, MessageSquare, Settings2, BellRing } from "lucide-react";
import { Reveal, CountUp, Eyebrow, Ticker } from "./primitives";
import { AgentStudio3D } from "./agent-studio-mock";

/* ───────────────────────────── Trust strip ───────────────────────────── */
const STATS = [
  { sup: "Template", num: "4", sub: "Agent dựng sẵn, bật là chạy" },
  { sup: "Theo dõi", num: "24/7", sub: "Giám sát & phân tích thị trường" },
  { sup: "Dữ liệu", num: "100%", sub: "Nhận định có thể truy xuất nguồn" },
  { sup: "Tuỳ chỉnh", num: "∞", sub: "Khả năng cấu hình Agent của bạn" },
];

export function TrustStrip() {
  return (
    <section className="py-20" style={{ borderTop: "1px solid var(--wb-border)", borderBottom: "1px solid var(--wb-border)", background: "var(--wb-elev)" }}>
      <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-16 px-5 lg:flex-row lg:gap-20">

        {/* Left - heading + description (matches reference left column) */}
        <Reveal className="flex-1 max-w-[460px]">
          <h2 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: "clamp(32px,4vw,50px)", lineHeight: 1.1, letterSpacing: "-0.015em", color: "var(--wb-text)" }}>
            Điểm nổi bật của Wealbee
          </h2>
          <p className="mt-5" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 17, lineHeight: 1.65, color: "var(--wb-muted)" }}>
            Không còn phân mảnh công cụ. Tin tức, dữ liệu thị trường, báo cáo phân tích - tất cả trong một nền tảng AI, chủ động làm việc cho riêng danh mục của bạn.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Vietstock", "FiinGroup", "CafeF", "NHNN"].map((s) => (
              null
            ))}
          </div>
        </Reveal>

        {/* Right - 2×2 stat grid (matches reference right column) */}
        <Reveal delay={0.1} className="w-full flex-shrink-0 lg:w-auto">
          <div className="grid grid-cols-2 gap-3" style={{ width: "min(100%, 560px)" }}>
            {STATS.map((s, i) => (
              <div
                key={s.num}
                className="flex flex-col gap-2 rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_var(--wb-glow)]"
                style={{
                  background: "var(--wb-card)",
                  borderColor: "var(--wb-border)",
                  boxShadow: "var(--wb-shadow-card)",
                }}
              >
                {/* top label */}
                <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 12.5, color: "var(--wb-faint)" }}>
                  {s.sup}
                </span>

                {/* big number - blue glow shadow matching reference orange glow adapted to blue */}
                <span style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 400,
                  fontSize: s.num === "∞" ? 58 : 52,
                  lineHeight: 1,
                  color: "var(--wb-text)",
                  filter: "drop-shadow(2px 1px 14px rgba(77,143,232,0.55))",
                }}>
                  {s.num === "∞" ? "∞" : (
                    <CountUp
                      value={s.num === "4" ? 4 : s.num === "100%" ? 100 : 24}
                      suffix={s.num === "100%" ? "%" : s.num === "24/7" ? "/7" : "+"}
                      decimals={0}
                      duration={1.4}
                    />
                  )}
                </span>

                {/* bottom label */}
                <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 12.5, color: "var(--wb-faint)" }}>
                  {s.sub}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

      </div>
    </section>
  );
}

/* ───────────────────────────── Problem ───────────────────────────── */
const PAINS = [
  { icon: BellOff, title: "Bỏ lỡ tin quan trọng", desc: "Bận họp, bạn lỡ sự kiện ảnh hưởng trực tiếp tới cổ phiếu đang nắm." },
  { icon: Newspaper, title: "Ngợp trong nhiễu thông tin", desc: "2 giờ/tuần đọc báo cáo mà không biết điều gì thật sự quan trọng với danh mục của mình." },
  { icon: MessageSquareOff, title: "Chatbot AI không nhớ bạn", desc: "Phải giải thích lại portfolio từ đầu mỗi lần, câu trả lời chung chung, không dẫn chứng." },
];

export function Problem() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-5">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Nhà đầu tư cá nhân đang chơi một ván game không cân sức
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PAINS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div
                className="h-full rounded-[14px] border p-6 transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_var(--wb-glow)]"
                style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}
              >
                <div className="flex size-11 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--wb-down) 14%, transparent)" }}>
                  <p.icon size={20} style={{ color: "var(--wb-down)" }} />
                </div>
                <h3 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 18, color: "var(--wb-text)" }}>
                  {p.title}
                </h3>
                <p className="mt-2" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14.5, lineHeight: 1.6, color: "var(--wb-muted)" }}>
                  {p.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-12 text-center">
          <p
            className="mx-auto inline-flex items-center gap-2 rounded-full border px-5 py-2.5"
            style={{ borderColor: "var(--wb-border)", background: "var(--wb-card)", fontFamily: "Montserrat, sans-serif", fontSize: 15, color: "var(--wb-text)" }}
          >
            <AlertTriangle size={16} style={{ color: "var(--wb-highlight)" }} />
            <span><strong style={{ color: "var(--wb-down)" }}>90-95%</strong> nhà đầu tư cá nhân thua lỗ dài hạn</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */
export function HowItWorks() {
  return (
    <section id="how" className="pt-24 pb-8" style={{ background: "var(--wb-elev)" }}>
      <div className="mx-auto max-w-[1200px] px-5">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Tạo trợ lý AI của riêng bạn trong chưa đến 5 phút
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <Reveal>
            <StepCard num={1} icon={MessageSquare} title="Gõ yêu cầu bằng tiếng Việt">
              <div className="rounded-[10px] border px-3 py-2.5" style={{ borderColor: "var(--wb-border)", background: "var(--wb-canvas)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "var(--wb-muted)", lineHeight: 1.5 }}>
                "Báo tôi mỗi sáng 8h về <Ticker symbol="HPG" /> và <Ticker symbol="VCB" />, tin tức + giá, tác động danh mục"
              </div>
            </StepCard>
          </Reveal>
          {/* Step 2 */}
          <Reveal delay={0.1}>
            <StepCard num={2} icon={Settings2} title="Wealbee tự cấu hình Agent">
              <div className="flex flex-wrap gap-2">
                {["LLM", "Knowledge base", "Research tool", "My Portfolio"].map((c) => (
                  <span key={c} className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--wb-border)", background: "color-mix(in srgb, var(--wb-primary) 10%, transparent)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "var(--wb-bright)" }}>
                    {c}
                  </span>
                ))}
              </div>
            </StepCard>
          </Reveal>
          {/* Step 3 */}
          <Reveal delay={0.2}>
            <StepCard num={3} icon={BellRing} title="Nhận báo cáo chủ động mỗi ngày">
              <div className="rounded-[10px] border px-3 py-3" style={{ borderColor: "var(--wb-border)", background: "var(--wb-canvas)" }}>
                <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 13, color: "var(--wb-text)" }}>Morning Brief · 08:00</div>
                <div className="mt-1" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "var(--wb-muted)" }}>3 tin tác động danh mục · 1 cảnh báo giá</div>
                <div className="mt-3 flex gap-2">
                  {["In-app", "Zalo", "Email"].map((ch) => (
                    <span key={ch} className="rounded-md px-2 py-1" style={{ background: "color-mix(in srgb, var(--wb-up) 12%, transparent)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "var(--wb-up)" }}>{ch}</span>
                  ))}
                </div>
              </div>
            </StepCard>
          </Reveal>
        </div>

        {/* 3D Agent Studio showcase */}
        <div className="mt-16 text-center">
          <Reveal>
            <h3 className="mx-auto mt-3 max-w-[620px]" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(22px,2.8vw,32px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
              Tinh chỉnh sâu mọi chi tiết của Agent mà không cần một dòng code
            </h3>
            <p className="mx-auto mt-4 max-w-[560px]" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 15.5, lineHeight: 1.6, color: "var(--wb-muted)" }}>
              Điều chỉnh prompt, bộ não suy luận, knowledge base, kết nối công cụ phân tích và lịch chạy. Chạy thử trực tiếp trước khi lưu.
            </p>
          </Reveal>
          <div className="mx-auto mt-12 hidden max-w-[980px] overflow-visible pb-16 md:block">
            <AgentStudio3D />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ num, icon: Icon, title, children }: { num: number; icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-[14px] border p-6" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full text-white" style={{ background: "var(--wb-primary)", fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 15 }}>
          {num}
        </span>
        <Icon size={18} style={{ color: "var(--wb-bright)" }} />
      </div>
      <h3 className="mb-4 mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 17, color: "var(--wb-text)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
