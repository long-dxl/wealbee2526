import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Clock, Zap, TrendingUp, PieChart, BarChart2, Search,
  FileText, Globe, Plus, ArrowRight, Mail, RefreshCw, Bot,
} from "lucide-react";
import { supabase } from "../../lib/supabase/client";

// Các template đã hoàn thiện — đồng bộ với agents.tsx
const READY_TEMPLATES = ["deep_research", "daily_digest", "insider_buy", "volume_spike"];

// DB schedule → label hiển thị
const SCHEDULE_LABEL: Record<string, { label: string; type: "cron" | "event" | "manual" }> = {
  daily_7am:    { label: "Hàng ngày 07:00", type: "cron"   },
  daily_8pm:    { label: "Hàng ngày 20:00", type: "cron"   },
  weekday_noon: { label: "Thứ 2–6, 11:45",  type: "cron"   },
  weekly_mon:   { label: "Thứ 2 hàng tuần", type: "cron"   },
  manual:       { label: "Theo yêu cầu",    type: "manual" },
};

// DB category → label tiếng Việt + màu
const CAT_META: Record<string, { label: string; bg: string; text: string; dBg: string; dText: string }> = {
  market:      { label: "Thị trường", bg: "rgba(8,73,172,0.08)",  text: "#0849AC", dBg: "rgba(77,143,232,0.14)",  dText: "#7ab3f0" },
  portfolio:   { label: "Danh mục",   bg: "rgba(14,165,160,0.09)",text: "#0ea5a0", dBg: "rgba(14,165,160,0.18)",  dText: "#5eead4" },
  fundamental: { label: "Phân tích",  bg: "rgba(245,158,11,0.09)",text: "#b36200", dBg: "rgba(255,149,0,0.16)",   dText: "#ffb84d" },
  macro:       { label: "Vĩ mô",      bg: "rgba(16,185,129,0.09)",text: "#059669", dBg: "rgba(52,199,89,0.16)",   dText: "#6ee7a0" },
};

// DB icon string → React component
function TemplateIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const p = { size, color, strokeWidth: 1.5 };
  const n = icon?.toLowerCase();
  if (n === "mail")        return <Mail {...p} />;
  if (n === "bar-chart")   return <BarChart2 {...p} />;
  if (n === "search")      return <Search {...p} />;
  if (n === "trending-up") return <TrendingUp {...p} />;
  if (n === "globe")       return <Globe {...p} />;
  if (n === "file-text")   return <FileText {...p} />;
  if (n === "pie-chart")   return <PieChart {...p} />;
  return <Bot {...p} />;
}

function TriggerIcon({ type, color }: { type: string; color: string }) {
  const p = { size: 11, color, strokeWidth: 1.5 };
  if (type === "cron")  return <Clock {...p} />;
  if (type === "event") return <Zap {...p} />;
  return <ArrowRight {...p} />;
}

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  sort_order: number;
  default_schedule: string;
}

export function Templates({ onNavigate, isDark = false }: { onNavigate: (page: string) => void; isDark?: boolean }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [active, setActive]       = useState("Tất cả");

  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted  = isDark ? "rgba(240,242,255,0.52)" : "rgba(26,26,46,0.58)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.32)" : "rgba(26,26,46,0.38)";
  const cardBg   = isDark ? "#131824" : "#ffffff";
  const cardShadow = isDark
    ? "0 1px 3px rgba(0,0,0,0.50)"
    : "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(8,73,172,0.05)";
  const brand   = isDark ? "#4D8FE8" : "#0849AC";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  useEffect(() => {
    supabase
      .from("agent_templates")
      .select("id,name,description,category,icon,color,sort_order,default_schedule")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        setTemplates((data ?? []) as AgentTemplate[]);
        setLoading(false);
      });
  }, []);

  // Tập hợp categories từ DB data
  const allLabels = [...new Set(
    templates.map(t => CAT_META[t.category]?.label ?? t.category)
  )];
  const CATS = ["Tất cả", ...allLabels];

  const base = active === "Tất cả"
    ? templates
    : templates.filter(t => (CAT_META[t.category]?.label ?? t.category) === active);
  // Agent đã sẵn sàng luôn lên đầu (giữ nguyên thứ tự sort_order trong từng nhóm)
  const list = [...base].sort((a, b) =>
    (READY_TEMPLATES.includes(b.id) ? 1 : 0) - (READY_TEMPLATES.includes(a.id) ? 1 : 0));

  const handleUse = (tmpl: AgentTemplate) => {
    // Điều hướng sang Agents để user kích hoạt template từ đó
    onNavigate("agents");
    void tmpl;
  };

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em" }}>Templates</h1>
          <p style={{ margin: 0, fontSize: 13, color: fgSubtle }}>
            {loading ? "Đang tải…" : `${templates.length} template · ${READY_TEMPLATES.filter(id => templates.some(t => t.id === id)).length} sẵn sàng`}
          </p>
        </div>
        <button
          onClick={() => navigate("/app/agents")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 22, border: "none",
            background: brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Montserrat', system-ui, sans-serif",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Tạo agent
        </button>
      </div>

      {/* Filter tabs */}
      {!loading && (
        <div style={{ display: "flex", gap: 2, marginBottom: 28, flexWrap: "wrap" }}>
          {CATS.map(cat => {
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
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <RefreshCw style={{ width: 24, height: 24, color: "#99a1af", animation: "spin 1s linear infinite", margin: "0 auto" }} />
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 10 }}>Đang tải…</p>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {list.map(t => {
            const isReady    = READY_TEMPLATES.includes(t.id);
            const meta       = CAT_META[t.category];
            const catBg      = isReady ? (isDark ? meta?.dBg : meta?.bg)   ?? "rgba(8,73,172,0.08)"  : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)");
            const catText    = isReady ? (isDark ? meta?.dText : meta?.text) ?? brand                 : (isDark ? "rgba(255,255,255,0.25)" : "rgba(26,26,46,0.30)");
            const catLabel   = meta?.label ?? t.category;
            const sched      = SCHEDULE_LABEL[t.default_schedule] ?? { label: "Theo yêu cầu", type: "manual" as const };

            return (
              <div
                key={t.id}
                style={{
                  background: cardBg, borderRadius: 16,
                  border: `1px solid ${divider}`,
                  boxShadow: cardShadow,
                  display: "flex", flexDirection: "column",
                  padding: "22px 22px 18px", gap: 14,
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  opacity: isReady ? 1 : 0.55,
                  filter: isReady ? "none" : "grayscale(0.6)",
                  cursor: "default",
                }}
                onMouseEnter={e => {
                  if (!isReady) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-3px)";
                  el.style.boxShadow = isDark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(8,73,172,0.11), 0 2px 8px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={e => {
                  if (!isReady) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "none";
                  el.style.boxShadow = cardShadow;
                }}
              >
                {/* Icon row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: catBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <TemplateIcon icon={t.icon} color={catText} />
                  </div>
                  {!isReady ? (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                      padding: "3px 8px", borderRadius: 20,
                      background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                      color: fgSubtle, border: `0.5px solid ${divider}`,
                    }}>
                      Sắp ra mắt
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                      padding: "3px 8px", borderRadius: 20,
                      background: isDark ? "rgba(255,214,10,0.12)" : "rgba(255,214,10,0.16)",
                      color: isDark ? "#c8a000" : "#8a6800",
                      border: `0.5px solid ${isDark ? "rgba(255,214,10,0.25)" : "rgba(255,214,10,0.40)"}`,
                    }}>
                      ★ SẴN SÀNG
                    </span>
                  )}
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: catBg, color: catText, letterSpacing: "0.02em" }}>
                      {catLabel}
                    </span>
                  </div>
                  <div style={{ marginBottom: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: isReady ? fg : fgSubtle, letterSpacing: "-0.015em" }}>
                      {t.name}
                    </span>
                  </div>
                  <p style={{
                    margin: 0, fontSize: 13, color: fgMuted, lineHeight: 1.65,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }}>
                    {t.description}
                  </p>
                </div>

                {/* Footer */}
                <div style={{ borderTop: `1px solid ${divider}`, paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <TriggerIcon type={sched.type} color={fgSubtle} />
                    <span style={{ fontSize: 11.5, color: fgSubtle }}>{sched.label}</span>
                  </div>

                  {!isReady ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: fgSubtle, padding: "6px 13px", borderRadius: 20, border: `0.5px solid ${divider}` }}>
                      Chưa khả dụng
                    </span>
                  ) : (
                    <button
                      onClick={() => handleUse(t)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "6px 13px", borderRadius: 20, border: "none",
                        background: catBg, color: catText,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'Montserrat', system-ui, sans-serif",
                        transition: "opacity 120ms",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.70"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                    >
                      Dùng <ArrowRight size={11} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && list.length === 0 && (
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 15, color: fgSubtle, margin: 0 }}>Không có template nào</p>
        </div>
      )}
    </div>
  );
}
