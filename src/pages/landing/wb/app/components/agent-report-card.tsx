import { Sparkles, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { Ticker, Citation } from "./primitives";

/* Animated mini line chart drawn with SVG path + motion */
export function MiniChart({ color = "var(--wb-up)", height = 56 }: { color?: string; height?: number }) {
  const points = [4, 9, 7, 13, 11, 18, 16, 24, 28, 26, 34];
  const w = 240;
  const max = Math.max(...points);
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(height - (p / max) * (height - 6) - 3).toFixed(1)}`)
    .join(" ");

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${d} L ${w} ${height} L 0 ${height} Z`}
        fill="url(#mc-fill)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.6 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
      />
    </svg>
  );
}

export function AgentReportCard({ floating = false }: { floating?: boolean }) {
  return (
    <div
      className="w-full overflow-hidden rounded-[14px] border"
      style={{ background: "var(--wb-card)", borderColor: "var(--wb-border)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--wb-border)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-7 items-center justify-center rounded-lg"
            style={{ background: "color-mix(in srgb, var(--wb-primary) 18%, transparent)" }}
          >
            <TrendingUp size={15} style={{ color: "var(--wb-bright)" }} />
          </div>
          <div className="leading-tight">
            <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 13, color: "var(--wb-text)" }}>
              VCB Watch Agent
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--wb-faint)" }}>
              08:00 · 01/06/2026
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            color: "var(--wb-up)",
            background: "color-mix(in srgb, var(--wb-up) 14%, transparent)",
          }}
        >
          ● LIVE
        </span>
      </div>

      {/* body */}
      <div className="space-y-3 px-4 py-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
        <ul className="space-y-2" style={{ fontSize: 13, color: "var(--wb-muted)", lineHeight: 1.55 }}>
          <li className="flex gap-2">
            <span style={{ color: "var(--wb-bright)" }}>•</span>
            <span>
              Tín dụng quý mở rộng, lợi nhuận trước thuế{" "}
              <strong style={{ color: "var(--wb-up)" }}>tăng 18%</strong> so với cùng kỳ{" "}
              <Citation source="cafef" date="29/04/26" />
            </span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: "var(--wb-bright)" }}>•</span>
            <span>
              <Ticker symbol="VCB" /> dẫn dắt nhóm ngân hàng, NIM cải thiện nhẹ{" "}
              <Citation source="vietstock" date="30/05/26" />
            </span>
          </li>
        </ul>

        <div
          className="rounded-[10px] px-3 py-2.5"
          style={{ background: "color-mix(in srgb, var(--wb-up) 10%, transparent)" }}
        >
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--wb-faint)" }}>
            Tác động danh mục của bạn
          </div>
          <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 18, color: "var(--wb-up)" }}>
            +2.250.000 VND <span style={{ fontSize: 12, fontWeight: 500 }}>(VCB +0,8%)</span>
          </div>
        </div>

        <MiniChart />

        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border py-2 transition-colors hover:border-[var(--wb-primary)]"
          style={{ borderColor: "var(--wb-border)", color: "var(--wb-bright)" }}
        >
          <Sparkles size={13} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>Xem quá trình phân tích · 8s</span>
        </button>
      </div>

      {floating ? null : null}
    </div>
  );
}
