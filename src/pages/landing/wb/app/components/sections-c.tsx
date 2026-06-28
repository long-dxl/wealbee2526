import { useState } from "react";
import { Briefcase, Megaphone, Building2, Check, X } from "lucide-react";
import { Reveal, Eyebrow } from "./primitives";

/* ───────────────────────────── Personas ───────────────────────────── */
const PERSONAS = [
  {
    icon: Briefcase,
    key: "busy",
    tab: "Nhà đầu tư bận rộn",
    quote: "Khi có tin quan trọng về cổ phiếu tôi nắm, alert tôi ngay kèm phân tích tác động đã sẵn sàng.",
    badge: null as string | null,
  },
  {
    icon: Megaphone,
    key: "kol",
    tab: "Môi giới & KOL",
    quote: "Tự tổng hợp tin, viết sẵn bản tin sáng mang thương hiệu của tôi, tôi chỉ review rồi gửi.",
    badge: "Pro",
  },
  {
    icon: Building2,
    key: "b2b",
    tab: "Công ty chứng khoán (B2B)",
    quote: "AI Agent gắn thương hiệu công ty tôi, tích hợp trong 3 tháng, không cần build từ đầu.",
    badge: "White-label",
  },
];

export function Personas() {
  const [active, setActive] = useState(0);
  const p = PERSONAS[active];
  return (
    <section id="personas" className="py-24">
      <div className="mx-auto max-w-[1000px] px-5">
        <Reveal className="text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Wealbee phù hợp với ai?
          </h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <div className="mx-auto flex max-w-[640px] flex-wrap justify-center gap-2">
            {PERSONAS.map((x, i) => (
              <button
                key={x.key}
                type="button"
                onClick={() => setActive(i)}
                className="rounded-full border px-4 py-2 transition-all"
                style={{
                  borderColor: i === active ? "var(--wb-primary)" : "var(--wb-border)",
                  background: i === active ? "color-mix(in srgb, var(--wb-primary) 14%, transparent)" : "transparent",
                  color: i === active ? "var(--wb-bright)" : "var(--wb-muted)",
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                {x.tab}
              </button>
            ))}
          </div>

          <div className="mx-auto mt-8 max-w-[720px] rounded-[16px] border p-8 text-center shadow-[0_20px_50px_var(--wb-glow)]" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--wb-primary) 16%, transparent)" }}>
              <p.icon size={22} style={{ color: "var(--wb-bright)" }} />
            </div>
            {p.badge && (
              <span className="mt-4 inline-block rounded-full px-3 py-1 text-white" style={{ background: "var(--wb-primary)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{p.badge}</span>
            )}
            <p className="mt-5" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 22, lineHeight: 1.45, color: "var(--wb-text)" }}>
              "{p.quote}"
            </p>
            <div className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: "var(--wb-muted)" }}>{p.tab}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────────── Comparison ───────────────────────────── */
const ROWS = [
  { a: "Trả lời text thuần", b: "Render chart, bảng inline" },
  { a: "Trả lời từ knowledge cutoff", b: "Kéo dữ liệu realtime" },
  { a: "Không biết bạn nắm gì", b: "Nhớ toàn bộ danh mục & lịch sử Agent" },
  { a: "Không dẫn chứng", b: "Mọi claim có citation [nguồn | ngày]" },
  { a: "Bị động chờ hỏi", b: "Chủ động đẩy insight 24/7" },
];

export function Comparison() {
  return (
    <section className="py-24" style={{ background: "var(--wb-elev)" }}>
      <div className="mx-auto max-w-[920px] px-5">
        <Reveal className="text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Không chỉ là một chatbot tài chính
          </h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <div className="overflow-hidden rounded-[16px] border" style={{ borderColor: "var(--wb-border)", background: "var(--wb-card)" }}>
            <div className="grid grid-cols-2 border-b" style={{ borderColor: "var(--wb-border)" }}>
              <div className="px-5 py-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15, color: "var(--wb-muted)" }}>Chatbot thường</div>
              <div className="px-5 py-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15, color: "var(--wb-bright)", background: "color-mix(in srgb, var(--wb-primary) 8%, transparent)" }}>Wealbee</div>
            </div>
            {ROWS.map((r, i) => (
              <div key={i} className="grid grid-cols-2 border-b last:border-b-0" style={{ borderColor: "var(--wb-border)" }}>
                <div className="flex items-center gap-2.5 px-5 py-4">
                  <X size={16} style={{ color: "var(--wb-down)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: "var(--wb-muted)" }}>{r.a}</span>
                </div>
                <div className="flex items-center gap-2.5 px-5 py-4" style={{ background: "color-mix(in srgb, var(--wb-primary) 8%, transparent)" }}>
                  <Check size={16} style={{ color: "var(--wb-up)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: "var(--wb-text)" }}>{r.b}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.14} className="mt-6 text-center">
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "var(--wb-faint)" }}>
            Được hậu thuẫn bởi mạng lưới CFA.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
