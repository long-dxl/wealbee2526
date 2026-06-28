import React from "react";
import { Zap, PieChart, Network, Eye, Newspaper, Activity, BarChart3, Search, ShieldCheck, Layers, Send } from "lucide-react";
import { Reveal, Eyebrow, Ticker, Button } from "./primitives";

/* ─── Base card ─── */
function Card({ children, className = "", accent = false }: { children: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <div
      className={`h-full rounded-2xl border p-6 transition-all duration-300 ${className}`}
      style={{
        background: accent ? "rgba(8,73,172,0.07)" : "var(--wb-card)",
        borderColor: accent ? "rgba(77,143,232,0.3)" : "var(--wb-border)",
        boxShadow: accent ? "0 0 0 1px rgba(77,143,232,0.08), 0 24px 60px rgba(8,73,172,0.14)" : "none",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Satellite card - small uniform tile ─── */
function SatCard({
  icon: Icon,
  iconColor = "var(--wb-bright)",
  iconBg = "rgba(77,143,232,0.1)",
  title,
  desc,
  children,
}: {
  icon: any;
  iconColor?: string;
  iconBg?: string;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex size-9 items-center justify-center rounded-xl" style={{ background: iconBg }}>
        <Icon size={17} style={{ color: iconColor }} />
      </div>
      <h3 className="mb-1.5" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 14.5, color: "var(--wb-text)", lineHeight: 1.3 }}>
        {title}
      </h3>
      {desc && <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, lineHeight: 1.55, color: "var(--wb-muted)" }}>{desc}</p>}
      {children}
    </Card>
  );
}

/* ─── Features ─── */
export function Features() {
  return (
    <section id="features" className="py-24" style={{ background: "var(--wb-elev)" }}>
      <div className="mx-auto max-w-[1200px] px-5">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Một đội ngũ chuyên gia AI, luôn thức cùng thị trường
          </h2>
        </Reveal>

        {/* Bento grid - 3 cols */}
        <div className="mt-14 grid grid-cols-1 gap-3.5 md:grid-cols-3">

          {/* ── Action Hub - hero tile, spans 2×2 ── */}
          <Reveal className="md:col-span-2 md:row-span-2">
            <Card accent className="flex h-full flex-col">
              {/* eyebrow */}
              <div className="mb-5 flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: "rgba(77,143,232,0.15)" }}>
                  <Layers size={17} style={{ color: "#4D8FE8" }} />
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", color: "#4D8FE8" }}>
                  TRUNG TÂM ĐIỀU KHIỂN
                </span>
              </div>

              <h3 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 26, color: "var(--wb-text)", lineHeight: 1.15 }}>
                Action Hub
              </h3>
              <p className="mt-2.5 max-w-[420px]" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 15, lineHeight: 1.65, color: "var(--wb-muted)" }}>
                Vừa hỏi sâu, vừa tạo Agent trong cùng một màn hình. Kéo thẳng card báo cáo / tin tức / giá vào chat để AI phân tích có ngữ cảnh.
              </p>

              {/* drag target visual */}
              <div className="mt-6 flex-1">
                <div className="grid grid-cols-3 gap-2.5">
                  {[{ t: "Báo cáo", i: BarChart3 }, { t: "Tin tức", i: Newspaper }, { t: "Giá", i: Activity }].map((x) => (
                    <div key={x.t} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors hover:border-[rgba(77,143,232,0.4)]" style={{ borderColor: "var(--wb-border)", background: "var(--wb-canvas)" }}>
                      <x.i size={13} style={{ color: "#4D8FE8" }} />
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "var(--wb-muted)" }}>{x.t}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2 rounded-xl border px-3.5 py-2.5" style={{ borderColor: "var(--wb-border)", background: "var(--wb-canvas)" }}>
                  <span className="flex-1 truncate" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, color: "var(--wb-faint)" }}>
                    Tôi có thể giúp gì cho bạn hôm nay?
                  </span>
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--wb-primary)" }}>
                    <Send size={13} style={{ color: "#fff" }} />
                  </div>
                </div>
              </div>

              {/* bottom tag */}
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 self-start" style={{ borderColor: "color-mix(in srgb, var(--wb-up) 35%, transparent)", background: "color-mix(in srgb, var(--wb-up) 10%, transparent)" }}>
                <span className="size-1.5 rounded-full animate-pulse" style={{ background: "var(--wb-up)" }} />
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "var(--wb-up)" }}>
                  Real-time · 24/7
                </span>
              </div>
            </Card>
          </Reveal>

          {/* ── Satellite: Chủ động ── */}
          <Reveal delay={0.06}>
            <SatCard
              icon={Zap}
              title="Chủ động, không chờ hỏi"
              desc="Agent tự thức dậy khi có sự kiện, đẩy cảnh báo dưới 30 giây."
            />
          </Reveal>

          {/* ── Satellite: Citation ── */}
          <Reveal delay={0.1}>
            <SatCard
              icon={ShieldCheck}
              title="Mọi nhận định đều có dẫn chứng"
            >
              <p className="mb-3" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, lineHeight: 1.55, color: "var(--wb-muted)" }}>
                Dễ dàng truy xuất nguồn gốc dữ liệu.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["cafef", "fiingroup", "vietstock"].map((s) => (
                  <span key={s} className="rounded px-1.5 py-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: "var(--wb-bright)", background: "rgba(77,143,232,0.1)", border: "1px solid rgba(77,143,232,0.2)" }}>
                    [{s}]
                  </span>
                ))}
              </div>
            </SatCard>
          </Reveal>

          {/* ── Satellite: Hiểu danh mục ── */}
          <Reveal delay={0.06}>
            <SatCard
              icon={PieChart}
              title="Hiểu đúng danh mục bạn"
              desc="Phân tích gắn tỷ trọng và P&L thực tế của bạn."
            />
          </Reveal>

          {/* ── Satellite: Knowledge Graph ── */}
          <Reveal delay={0.1}>
            <SatCard icon={Network} title="Knowledge Graph">
              <div className="mt-2 flex flex-wrap items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--wb-muted)" }}>
                <span className="rounded border px-2 py-0.5" style={{ borderColor: "var(--wb-border)" }}>Fed tăng LS</span>
                <span style={{ color: "var(--wb-bright)" }}>→</span>
                <span className="rounded border px-2 py-0.5" style={{ borderColor: "var(--wb-border)" }}>USD/VND</span>
                <span style={{ color: "var(--wb-bright)" }}>→</span>
                <Ticker symbol="HPG" />
                <Ticker symbol="VHM" />
              </div>
            </SatCard>
          </Reveal>

          {/* ── Satellite: Minh bạch ── */}
          <Reveal delay={0.14}>
            <SatCard
              icon={Eye}
              title="Minh bạch lý luận"
              desc='Mở "Xem quá trình phân tích" để thấy từng bước AI làm.'
            />
          </Reveal>


        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Template Agents ─────────────────────────── */
const TEMPLATES = [
  { icon: Newspaper, name: "Morning Brief", desc: "Bản tin sáng tinh gọn về watchlist của bạn.", credit: "2 credits/lần" },
  { icon: Eye, name: "Watchlist Monitor", desc: "Giám sát giá & khối lượng bất thường theo thời gian thực.", credit: "1 credit/lần" },
  { icon: BarChart3, name: "Earnings Digest", desc: "Tóm tắt KQKD, so với kỳ vọng & lịch sử.", credit: "3 credits/lần" },
  { icon: Search, name: "Insider Tracker", desc: "Cảnh báo giao dịch cổ đông nội bộ.", credit: "2 credits/lần" },
];

export function TemplateAgents() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-5">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <h2 className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.2, color: "var(--wb-text)" }}>
            Bắt đầu ngay với các Agent dựng sẵn
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.06}>
              <div className="flex h-full flex-col rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_var(--wb-glow)]" style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}>
                <div className="mb-4 flex size-9 items-center justify-center rounded-xl" style={{ background: "rgba(77,143,232,0.1)" }}>
                  <t.icon size={17} style={{ color: "var(--wb-bright)" }} />
                </div>
                <h3 className="mb-1.5" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 15, color: "var(--wb-text)" }}>{t.name}</h3>
                <p className="flex-1" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, lineHeight: 1.55, color: "var(--wb-muted)" }}>{t.desc}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--wb-faint)" }}>{t.credit}</span>
                  <Button type="button" variant="secondary" size="xs">
                    Kích hoạt
                  </Button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
