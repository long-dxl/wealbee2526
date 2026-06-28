import React, { useRef } from "react";
import { Bot, Cpu, BookOpen, Wrench, Eye, CalendarClock, Save, Play, Check } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/* Anthropic / Claude logomark - coral sunburst on ivory (như icon app Claude) */
function AnthropicMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label="Anthropic">
      {Array.from({ length: 12 }).map((_, i) => (
        <line
          key={i}
          x1="12" y1="11.4" x2="12" y2="2.6"
          stroke="#D97757"
          strokeWidth="2.2"
          strokeLinecap="round"
          transform={`rotate(${i * 30} 12 12)`}
        />
      ))}
    </svg>
  );
}

/* ── The Agent Studio dashboard mock ── */
function StudioMock() {
  return (
    <div
      className="w-full overflow-hidden rounded-[14px]"
      style={{
        background: "var(--wb-mock-window)",
        border: "1px solid var(--wb-mock-border)",
        display: "grid",
        gridTemplateColumns: "236px 1fr 224px",
        height: 420,
        fontFamily: "Montserrat, sans-serif",
        color: "var(--wb-mock-text)",
      }}
    >
      {/* ── Left: Persona & Prompt ── */}
      <aside className="overflow-hidden border-r" style={{ borderColor: "var(--wb-mock-divider)", background: "var(--wb-mock-panel)" }}>
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--wb-mock-divider)" }}>
          <Bot size={13} style={{ color: "#4D8FE8" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--wb-mock-muted)" }}>PERSONA & PROMPT</span>
        </div>
        <div className="space-y-3.5 px-4 py-4">
          {[
            { t: "VAI TRÒ", d: 'Bạn là "Wealbee Daily Digest Agent" - AI phân tích thị trường chứng khoán Việt Nam, súc tích, có dẫn chứng.' },
            { t: "NHIỆM VỤ CHÍNH", d: "Tổng hợp giá & tin tức watchlist mỗi sáng, gắn tác động danh mục người dùng." },
            { t: "PHONG CÁCH", d: "Ngắn gọn, súc tích - không gây nhiễu. Mọi số liệu kèm nguồn." },
            { t: "RÀNG BUỘC", d: "Luôn kèm disclaimer. Không đưa khuyến nghị mua/bán." },
          ].map((b) => (
            <div key={b.t}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, letterSpacing: "0.06em", color: "#4D8FE8", marginBottom: 4 }}>✦ {b.t}</div>
              <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--wb-mock-muted)" }}>{b.d}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Center: Config blocks ── */}
      <main className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--wb-mock-divider)" }}>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--wb-mock-text)" }}>Daily Market Digest</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white" style={{ background: "#0849AC", fontSize: 11 }}>
            <Save size={11} /> Lưu Agent
          </div>
        </div>

        <div className="space-y-2.5 px-5 py-4">
          {/* Model LLM */}
          <ConfigRow icon={Cpu} title="Model LLM" right="✓ active">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "rgba(77,143,232,0.3)", background: "rgba(8,73,172,0.08)" }}>
              <div className="flex size-5 shrink-0 items-center justify-center rounded" style={{ background: "#F0EEE6" }}>
                <AnthropicMark size={13} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--wb-mock-text)" }}>Claude Sonnet 4</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: "var(--wb-mock-dim)" }}>function call · reasoning</div>
              </div>
            </div>
          </ConfigRow>

          <ConfigRow icon={BookOpen} title="Knowledge Base" right="1 file">
            <Pill label="Portfolio strategy Q2 2026" />
          </ConfigRow>

          <ConfigRow icon={Wrench} title="Công cụ phân tích" right="5/10 bật">
            <div className="flex flex-wrap gap-1.5">
              {["Market Data", "News Feed", "P&L", "Sector Intel", "Valuation"].map((t) => (
                <Pill key={t} label={t} on />
              ))}
            </div>
          </ConfigRow>

          <ConfigRow icon={Eye} title="Theo dõi thị trường" right="5 mã">
            <div className="flex flex-wrap gap-1.5">
              {["HPG", "VCB", "VHM", "MWG", "FPT"].map((t) => (
                <span key={t} className="rounded border px-1.5 py-0.5" style={{ borderColor: "var(--wb-mock-line)", background: "rgba(77,143,232,0.1)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: "#4D8FE8" }}>{t}</span>
              ))}
            </div>
          </ConfigRow>

          <ConfigRow icon={CalendarClock} title="Lịch chạy & Thông báo" right="Hằng ngày">
            <div className="flex items-center gap-2" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: "var(--wb-mock-muted)" }}>
              <span className="rounded px-1.5 py-0.5" style={{ background: "var(--wb-mock-inset)" }}>08:00</span>
              <span>·</span>
              <span style={{ color: "#34C759" }}>In-app · Telegram · Email</span>
            </div>
          </ConfigRow>
        </div>
      </main>

      {/* ── Right: Preview & Debug ── */}
      <aside className="flex flex-col border-l" style={{ borderColor: "var(--wb-mock-divider)", background: "var(--wb-mock-panel)" }}>
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--wb-mock-divider)" }}>
          <Play size={12} style={{ color: "#4D8FE8" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--wb-mock-muted)" }}>PREVIEW & DEBUG</span>
        </div>
        <div className="flex-1 space-y-2 px-4 py-4">
          <div className="mb-1 flex items-center gap-2" style={{ fontSize: 10.5, color: "var(--wb-mock-muted)" }}>
            <span className="size-1.5 animate-pulse rounded-full" style={{ background: "#34C759" }} />
            Đang chạy thử...
          </div>
          {["Lấy dữ liệu thị trường", "Kiểm tra danh mục", "Quét tin tức", "Tổng hợp & gắn nguồn"].map((s, i) => (
            <div key={s} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5" style={{ borderColor: "var(--wb-mock-border)", fontSize: 10, color: "var(--wb-mock-muted)" }}>
              <span className="flex size-3.5 items-center justify-center rounded-full" style={{ background: i < 3 ? "rgba(52,199,89,0.2)" : "var(--wb-mock-border)" }}>
                {i < 3 ? <Check size={8} style={{ color: "#34C759" }} /> : null}
              </span>
              {s}
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-1.5 rounded-lg border py-2" style={{ borderColor: "rgba(77,143,232,0.4)", background: "rgba(8,73,172,0.1)", fontSize: 10.5, color: "#4D8FE8" }}>
            <Play size={11} /> Chạy thử trước khi lưu
          </div>
        </div>
      </aside>
    </div>
  );
}

function ConfigRow({ icon: Icon, title, right, children }: { icon: any; title: string; right?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--wb-mock-border)", background: "var(--wb-mock-card)" }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 600, color: "var(--wb-mock-text)" }}>
          <Icon size={12} style={{ color: "#4D8FE8" }} /> {title}
        </span>
        {right && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: "var(--wb-mock-dim)" }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

function Pill({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
      style={{
        borderColor: on ? "rgba(52,199,89,0.35)" : "var(--wb-mock-line)",
        background: on ? "rgba(52,199,89,0.1)" : "var(--wb-mock-inset)",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9,
        color: on ? "#34C759" : "var(--wb-mock-muted)",
      }}
    >
      {on && <Check size={7} />} {label}
    </span>
  );
}

/* ── 3D wrapper: mouse-tilt parallax + idle float ── */
export function AgentStudio3D() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 120, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-11, 11]), { stiffness: 120, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ perspective: 1600, perspectiveOrigin: "50% 30%" }}>
      <motion.div
        initial={{ rotateX: 16, opacity: 0, y: 50 }}
        whileInView={{ rotateX: 10, opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: "preserve-3d", rotateX, rotateY }}
      >
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} style={{ transformStyle: "preserve-3d" }}>
          {/* browser chrome */}
          <div className="overflow-hidden rounded-[16px]" style={{ border: "1px solid var(--wb-mock-line)", boxShadow: "0 50px 120px rgba(8,73,172,0.4), 0 0 0 1px var(--wb-mock-inset)" }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "var(--wb-mock-chrome)", borderBottom: "1px solid var(--wb-mock-divider)" }}>
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: "#FF5F57" }} />
                <span className="size-2.5 rounded-full" style={{ background: "#FEBC2E" }} />
                <span className="size-2.5 rounded-full" style={{ background: "#28C840" }} />
              </div>
              <div className="ml-3 flex-1 rounded-md px-3 py-1" style={{ background: "var(--wb-mock-inset)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--wb-mock-faint)" }}>
                wealbee.com / agent-studio
              </div>
            </div>
            <StudioMock />
          </div>

          {/* floating accent: 60s badge popping in Z */}
          <motion.div
            className="absolute -right-3 -top-3 rounded-xl px-4 py-2.5"
            style={{ background: "linear-gradient(135deg,#0849AC,#4D8FE8)", boxShadow: "0 20px 50px rgba(8,73,172,0.5)", transform: "translateZ(70px)" }}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.7)" }}>Tạo Agent trong</div>
            <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 18, color: "#fff" }}>&lt; 5 phút ⚡</div>
          </motion.div>

          {/* floating tool pill */}
          <motion.div
            className="absolute -bottom-2 -left-2 flex items-center gap-2 rounded-full px-3.5 py-2"
            style={{ background: "var(--wb-mock-window)", border: "1px solid rgba(52,199,89,0.4)", boxShadow: "0 16px 40px rgba(0,0,0,0.4)", transform: "translateZ(85px)" }}
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          >
            <Check size={13} style={{ color: "#34C759" }} />
            <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 12, color: "#34C759" }}>Không cần code</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
