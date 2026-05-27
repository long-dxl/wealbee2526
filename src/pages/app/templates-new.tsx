import { useState } from "react";
import { Clock, Zap, TrendingUp, PieChart, BarChart2, Search, FileText, Globe, Plus, ArrowRight } from "lucide-react";

interface Template {
  id: string;
  name: string;
  category: string;
  triggerLabel: string;
  triggerType: "cron" | "event" | "manual";
  description: string;
  popular?: boolean;
}

const templates: Template[] = [
  {
    id: "1", name: "Daily Market Digest", category: "Thị trường",
    triggerLabel: "Hàng ngày 08:00", triggerType: "cron",
    description: "Tổng hợp thị trường buổi sáng: VN-Index, top movers, macro news trong 60 giây.",
    popular: true,
  },
  {
    id: "2", name: "Portfolio Health", category: "Danh mục",
    triggerLabel: "Khi giá vượt ngưỡng", triggerType: "event",
    description: "Theo dõi danh mục và alert tự động khi giá vượt ngưỡng cài đặt.",
    popular: true,
  },
  {
    id: "3", name: "Earnings Analyst", category: "Phân tích",
    triggerLabel: "T-24h trước ĐHCĐ", triggerType: "event",
    description: "Phân tích KQKD và ĐHCĐ tự động trước và sau sự kiện doanh nghiệp.",
  },
  {
    id: "4", name: "Insider Tracker", category: "Insider",
    triggerLabel: "HOSE filing mới", triggerType: "event",
    description: "Phát hiện giao dịch nội bộ đáng chú ý từ HOSE theo thời gian thực.",
    popular: true,
  },
  {
    id: "5", name: "Macro Watch", category: "Macro",
    triggerLabel: "Thứ Hai hàng tuần", triggerType: "cron",
    description: "Tóm tắt vĩ mô tuần: CPI, lãi suất NHNN, tỷ giá USD/VND và tin Fed.",
  },
  {
    id: "6", name: "Deep Research", category: "Nghiên cứu",
    triggerLabel: "Theo yêu cầu", triggerType: "manual",
    description: "Nghiên cứu chuyên sâu đa chiều về một công ty hoặc ngành theo yêu cầu.",
  },
];

const CATEGORIES = ["Tất cả", "Thị trường", "Danh mục", "Phân tích", "Insider", "Macro", "Nghiên cứu"];

const CAT: Record<string, { bg: string; text: string; dBg: string; dText: string }> = {
  "Thị trường": { bg: "rgba(8,73,172,0.08)",   text: "#0849AC", dBg: "rgba(77,143,232,0.14)",  dText: "#7ab3f0" },
  "Danh mục":   { bg: "rgba(99,102,241,0.09)",  text: "#5254d4", dBg: "rgba(99,102,241,0.16)", dText: "#a5b4fc" },
  "Phân tích":  { bg: "rgba(234,130,0,0.09)",   text: "#c46d00", dBg: "rgba(255,149,0,0.16)",  dText: "#ffb84d" },
  "Insider":    { bg: "rgba(109,40,217,0.09)",  text: "#6d28d9", dBg: "rgba(139,92,246,0.16)", dText: "#c4b5fd" },
  "Macro":      { bg: "rgba(22,163,74,0.09)",   text: "#15803d", dBg: "rgba(52,199,89,0.16)",  dText: "#6ee7a0" },
  "Nghiên cứu": { bg: "rgba(220,38,38,0.08)",   text: "#b91c1c", dBg: "rgba(255,59,48,0.14)",  dText: "#ff7b75" },
};

function CatIcon({ cat, color }: { cat: string; color: string }) {
  const p = { size: 18, color, strokeWidth: 1.5 };
  if (cat === "Thị trường") return <TrendingUp {...p} />;
  if (cat === "Danh mục")   return <PieChart {...p} />;
  if (cat === "Phân tích")  return <BarChart2 {...p} />;
  if (cat === "Insider")    return <Search {...p} />;
  if (cat === "Macro")      return <Globe {...p} />;
  return <FileText {...p} />;
}

function TriggerIcon({ type, color }: { type: string; color: string }) {
  const p = { size: 11, color, strokeWidth: 1.5 };
  if (type === "cron")   return <Clock {...p} />;
  if (type === "event")  return <Zap {...p} />;
  return <ArrowRight {...p} />;
}

export function Templates({ onNavigate, isDark = false }: { onNavigate: (page: string) => void; isDark?: boolean }) {
  const [active, setActive] = useState("Tất cả");

  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted  = isDark ? "rgba(240,242,255,0.52)" : "rgba(26,26,46,0.58)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.32)" : "rgba(26,26,46,0.38)";
  const cardBg   = isDark ? "#131824" : "#ffffff";
  const cardShadow = isDark
    ? "0 1px 3px rgba(0,0,0,0.50)"
    : "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(8,73,172,0.05)";
  const brand    = isDark ? "#4D8FE8" : "#0849AC";
  const divider  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const list = active === "Tất cả" ? templates : templates.filter((t) => t.category === active);

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em" }}>Templates</h1>
          <p style={{ margin: 0, fontSize: 13, color: fgSubtle }}>Chọn và chạy ngay trong 2 phút</p>
        </div>
        <button
          onClick={() => onNavigate("create-agent")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 22, border: "none",
            background: brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Montserrat', system-ui, sans-serif",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Tạo mới
        </button>
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 28 }}>
        {CATEGORIES.map((cat) => {
          const on = cat === active;
          return (
            <button key={cat} onClick={() => setActive(cat)} style={{
              padding: "7px 16px", borderRadius: 22, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: on ? 700 : 400,
              color: on ? brand : fgMuted,
              background: on ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)") : "transparent",
              fontFamily: "'Montserrat', system-ui, sans-serif",
              transition: "all 120ms",
            }}>
              {cat}
            </button>
          );
        })}
      </div>

      {/* ── Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {list.map((t) => {
          const c = CAT[t.category] || CAT["Thị trường"];
          const catBg   = isDark ? c.dBg   : c.bg;
          const catText = isDark ? c.dText : c.text;

          return (
            <div
              key={t.id}
              style={{
                background: cardBg,
                borderRadius: 16,
                border: `1px solid ${divider}`,
                boxShadow: cardShadow,
                display: "flex", flexDirection: "column",
                padding: "22px 22px 18px",
                gap: 14,
                transition: "transform 180ms ease, box-shadow 180ms ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-3px)";
                el.style.boxShadow = isDark
                  ? "0 10px 30px rgba(0,0,0,0.5)"
                  : "0 10px 30px rgba(8,73,172,0.11), 0 2px 8px rgba(0,0,0,0.06)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "none";
                el.style.boxShadow = cardShadow;
              }}
            >
              {/* Icon row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: catBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CatIcon cat={t.category} color={catText} />
                </div>
                {t.popular && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                    padding: "3px 8px", borderRadius: 20,
                    background: isDark ? "rgba(255,214,10,0.12)" : "rgba(255,214,10,0.16)",
                    color: isDark ? "#c8a000" : "#8a6800",
                    border: `0.5px solid ${isDark ? "rgba(255,214,10,0.25)" : "rgba(255,214,10,0.40)"}`,
                  }}>
                    ★ PHỔ BIẾN
                  </span>
                )}
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: fg, letterSpacing: "-0.015em" }}>{t.name}</span>
                </div>
                <p style={{
                  margin: 0, fontSize: 13, color: fgMuted,
                  lineHeight: 1.65,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>
                  {t.description}
                </p>
              </div>

              {/* Footer */}
              <div style={{ borderTop: `1px solid ${divider}`, paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {/* Trigger */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <TriggerIcon type={t.triggerType} color={fgSubtle} />
                  <span style={{ fontSize: 11.5, color: fgSubtle }}>{t.triggerLabel}</span>
                </div>

                {/* CTA */}
                <button
                  onClick={() => onNavigate("create-agent")}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "6px 13px", borderRadius: 20, border: "none",
                    background: catBg, color: catText,
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    transition: "opacity 120ms",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.70"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                >
                  Dùng <ArrowRight size={11} strokeWidth={2} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
