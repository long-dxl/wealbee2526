import React, { useRef } from "react";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { DashboardMock } from "./dashboard-mock";
import { Button } from "./primitives";

/* 3D showcase - tilts toward the mouse, floats, glows */
function Showcase3D() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 120, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ perspective: 1600, perspectiveOrigin: "50% 30%" }}>
      <motion.div
        initial={{ rotateX: 18, opacity: 0, y: 60 }}
        animate={{ rotateX: 12, opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: "preserve-3d", rotateX, rotateY }}
      >
        {/* floating idle bob */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* browser chrome */}
          <div
            className="overflow-hidden rounded-[16px]"
            style={{
              border: "1px solid var(--wb-mock-line)",
              boxShadow: "0 50px 120px rgba(8,73,172,0.4), 0 0 0 1px var(--wb-mock-inset)",
              transform: "translateZ(0)",
            }}
          >
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "var(--wb-mock-chrome)", borderBottom: "1px solid var(--wb-mock-divider)" }}>
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: "#FF5F57" }} />
                <span className="size-2.5 rounded-full" style={{ background: "#FEBC2E" }} />
                <span className="size-2.5 rounded-full" style={{ background: "#28C840" }} />
              </div>
              <div className="ml-3 flex-1 rounded-md px-3 py-1" style={{ background: "var(--wb-mock-inset)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--wb-mock-faint)" }}>
                wealbee.com
              </div>
            </div>
            <DashboardMock />
          </div>

          {/* floating accent card popping out in 3D */}
          <motion.div
            className="absolute -right-3 -top-3 rounded-xl px-4 py-3"
            style={{
              background: "linear-gradient(135deg, #0849AC, #4D8FE8)",
              boxShadow: "0 20px 50px rgba(8,73,172,0.5)",
              transform: "translateZ(60px)",
            }}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: "rgba(255,255,255,0.7)" }}>Cảnh báo tức thời</div>
            <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>VHM −2,64% ⚑</div>
          </motion.div>

          {/* floating ticker pill */}
          <motion.div
            className="absolute -bottom-2 -left-2 flex items-center gap-2 rounded-full px-4 py-2"
            style={{
              background: "var(--wb-mock-window)",
              border: "1px solid rgba(52,199,89,0.4)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
              transform: "translateZ(80px)",
            }}
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          >
            <span className="size-2 rounded-full" style={{ background: "#34C759" }} />
            <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 13, color: "#34C759" }}>+2.250.000đ</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--wb-mock-dim)" }}>danh mục</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function Hero({ onOpenDemo }: { onOpenDemo: () => void }) {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-32 lg:pt-36">
      {/* glow mesh */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[2%] size-[760px] -translate-x-1/2 rounded-full opacity-60 blur-[130px]" style={{ background: "radial-gradient(circle, var(--wb-primary), transparent 65%)" }} />
        <div className="absolute right-[6%] top-[30%] size-[420px] rounded-full opacity-40 blur-[120px]" style={{ background: "radial-gradient(circle, var(--wb-bright), transparent 65%)" }} />
      </div>

      <div className="relative mx-auto max-w-[860px] px-5 text-center">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          style={{ borderColor: "var(--wb-border)", background: "var(--wb-card)" }}
        >
          <Sparkles size={13} style={{ color: "var(--wb-highlight)" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--wb-muted)" }}>
            Trí tuệ tài chính chủ động cho nhà đầu tư Việt
          </span>
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="mt-6"
          style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.08, fontSize: "clamp(34px, 5.2vw, 60px)", color: "var(--wb-text)" }}
        >
          Đội ngũ AI phân tích tài chính
          <br />
          làm việc <span style={{ color: "var(--wb-primary)" }}>24/7</span> cho danh mục của bạn
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.16 }}
          className="mx-auto mt-6 max-w-[600px]"
          style={{ fontFamily: "Montserrat, sans-serif", fontSize: 18, lineHeight: 1.6, color: "var(--wb-muted)" }}
        >
          Wealbee chủ động theo dõi thị trường, lọc tin quan trọng và gửi bạn phân tích có dẫn chứng, trước khi bạn kịp hỏi. Không cần biết code.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.24 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button type="button" onClick={onOpenDemo} variant="primary" size="md">
            Yêu cầu bản Demo <ArrowRight size={17} />
          </Button>
          <Button href="#how" variant="secondary" size="md">
            <Play size={15} /> Xem Wealbee hoạt động
          </Button>
        </motion.div>
      </div>

      {/* 3D product showcase */}
      <div className="relative mx-auto mt-20 hidden max-w-[1000px] px-5 md:block">
        <Showcase3D />
      </div>

      {/* mobile fallback (no 3D) */}
      <div className="relative mx-auto mt-14 max-w-[480px] px-5 md:hidden">
        <div className="overflow-hidden rounded-[14px]" style={{ border: "1px solid var(--wb-mock-line)", boxShadow: "0 30px 70px rgba(8,73,172,0.35)" }}>
          <DashboardMock />
        </div>
      </div>
    </section>
  );
}
