import { ArrowRight } from "lucide-react";
import { Reveal, Button } from "./primitives";
import { WealbeeLogo } from "./wealbee-logo";

/* ───────────────────────────── Final CTA ───────────────────────────── */
export function FinalCTA({ onOpenDemo }: { onOpenDemo: () => void }) {
  return (
    <section className="px-5 py-24">
      <Reveal>
        <div
          className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[24px] px-6 py-20 text-center"
          style={{ background: "linear-gradient(135deg, var(--wb-deep), var(--wb-primary) 55%, var(--wb-bright))" }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 size-[500px] -translate-x-1/2 rounded-full opacity-40 blur-[120px]" style={{ background: "radial-gradient(circle, #ffffff, transparent 60%)" }} />
          </div>
          <h2 className="relative mx-auto max-w-[720px]" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: "clamp(28px,4vw,46px)", lineHeight: 1.15, color: "#fff" }}>
            Để AI lo việc theo dõi thị trường. Bạn lo việc quyết định.
          </h2>
          <Button type="button" onClick={onOpenDemo} variant="white" size="lg" className="relative mt-9">
            Yêu cầu bản Demo <ArrowRight size={18} />
          </Button>
          <p className="relative mt-5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
            Bắt đầu miễn phí · Tạo Agent đầu tiên trong 5 phút.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────────────────────── Footer ───────────────────────────── */
const COLS = [
  { title: "Sản phẩm", links: ["Tính năng", "Bảng giá", "Template Agents", "Agent Studio"] },
  { title: "Công ty", links: ["Về Wealbee", "Blog", "Tuyển dụng", "Liên hệ B2B"] },
  { title: "Pháp lý", links: ["Điều khoản", "Bảo mật", "Disclaimer đầu tư"] },
];

export function Footer({ theme }: { theme: "dark" | "light" }) {
  return (
    <footer className="border-t pt-16" style={{ borderColor: "var(--wb-border)", background: "var(--wb-elev)" }}>
      <div className="mx-auto max-w-[1200px] px-5">
        <Reveal>
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <WealbeeLogo size={30} />
            <p className="mt-4 max-w-[260px]" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, lineHeight: 1.6, color: "var(--wb-muted)" }}>
              Trí tuệ tài chính chủ động cho nhà đầu tư Việt.
            </p>
            <div className="mt-5 flex gap-2">
              {["in", "X", "f", "▶"].map((s) => (
                <span key={s} className="flex size-9 items-center justify-center rounded-full border" style={{ borderColor: "var(--wb-border)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--wb-muted)" }}>{s}</span>
              ))}
            </div>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 14, color: "var(--wb-text)" }}>{c.title}</div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="transition-colors hover:text-[var(--wb-text)]" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: "var(--wb-muted)" }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        </Reveal>

        <Reveal delay={0.1}>
        <div className="mt-14 border-t py-6" style={{ borderColor: "var(--wb-border)" }}>
          <p className="text-center" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.6, color: "var(--wb-faint)" }}>
            © 2026 Wealbee. Thông tin trên nền tảng chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
          </p>
        </div>
        </Reveal>
      </div>
    </footer>
  );
}
