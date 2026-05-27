import { useState, useRef, useEffect } from "react";
import { Play, Pause, MoreHorizontal, Plus, Pencil, Trash2, Clock, Zap } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  template: string;
  status: "active" | "paused" | "error";
  lastRun: string;
  runsToday: number;
  briefsGenerated: number;
  description: string;
  trigger: string;
}

const mockAgents: Agent[] = [
  {
    id: "1", name: "Daily Market Digest", template: "Template 1",
    status: "active", lastRun: "08:00 hôm nay", runsToday: 1, briefsGenerated: 142,
    description: "Tóm tắt thị trường buổi sáng · VN-Index, top movers, macro news",
    trigger: "Cron 08:00 hàng ngày",
  },
  {
    id: "2", name: "Portfolio Health", template: "Template 2",
    status: "active", lastRun: "07:55 hôm nay", runsToday: 3, briefsGenerated: 287,
    description: "Theo dõi danh mục · alert tự động khi giá vượt ngưỡng",
    trigger: "Event: giá thay đổi > 3%",
  },
  {
    id: "3", name: "Insider Tracker", template: "Template 4",
    status: "active", lastRun: "07:30 hôm nay", runsToday: 2, briefsGenerated: 89,
    description: "Phát hiện giao dịch nội bộ đáng chú ý từ HOSE filing",
    trigger: "Event: HOSE filing mới",
  },
  {
    id: "4", name: "Earnings Analyst", template: "Template 3",
    status: "paused", lastRun: "Chưa chạy", runsToday: 0, briefsGenerated: 23,
    description: "Phân tích KQKD và ĐHCĐ · tự động pre-event và post-event",
    trigger: "Event: T-24h + T+2h sau ĐHCĐ",
  },
  {
    id: "5", name: "Macro Watch", template: "Template 5",
    status: "active", lastRun: "Thứ 2 tuần trước", runsToday: 0, briefsGenerated: 18,
    description: "Tóm tắt vĩ mô tuần · CPI, lãi suất NHNN, tỷ giá USD/VND",
    trigger: "Cron Thứ 2 07:00",
  },
];

// Gradient per index for avatar
const AVATAR_GRAD = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #4D8FE8, #0849AC)",
  "linear-gradient(135deg, #43e97b, #0f9b58)",
  "linear-gradient(135deg, #fa709a, #c0392b)",
  "linear-gradient(135deg, #f7971e, #ffd200)",
];

function initials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StatusDot({ status }: { status: Agent["status"] }) {
  const color = status === "active" ? "#34C759" : status === "error" ? "#FF3B30" : "rgba(26,26,46,0.30)";
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: status === "active" ? `0 0 0 2px rgba(52,199,89,0.20)` : "none",
    }} />
  );
}

function AgentCard({
  agent, index, isDark, onToggle, onEdit, onDelete,
}: {
  agent: Agent; index: number; isDark: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fg      = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.52)" : "rgba(26,26,46,0.56)";
  const fgSubtle= isDark ? "rgba(240,242,255,0.32)" : "rgba(26,26,46,0.38)";
  const cardBg  = isDark ? "#131824" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const menuBg  = isDark ? "#1e2535" : "#ffffff";
  const iconBtn = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 30, height: 30, borderRadius: 8, border: "none",
    background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    cursor: "pointer", color: fgSubtle, transition: "all 120ms",
    flexShrink: 0 as const,
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      style={{
        background: cardBg,
        borderRadius: 16,
        border: `1px solid ${hovered
          ? (isDark ? "rgba(255,255,255,0.14)" : "rgba(8,73,172,0.16)")
          : border}`,
        padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 10,
        position: "relative",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        boxShadow: hovered
          ? (isDark ? "0 8px 24px rgba(0,0,0,0.45)" : "0 8px 24px rgba(8,73,172,0.10), 0 2px 6px rgba(0,0,0,0.05)")
          : (isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(0,0,0,0.06)"),
      }}
    >
      {/* Top row: avatar + name + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: AVATAR_GRAD[index % AVATAR_GRAD.length],
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em",
        }}>
          {initials(agent.name)}
        </div>

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, color: fg,
            letterSpacing: "-0.015em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {agent.name}
          </span>
          <StatusDot status={agent.status} />
          {agent.status === "paused" && (
            <span style={{ fontSize: 11, color: fgSubtle, fontWeight: 500 }}>· Tạm dừng</span>
          )}
        </div>

        {/* Action buttons — always visible, dim when not hovered */}
        <div style={{ display: "flex", gap: 6, opacity: hovered ? 1 : 0.35, transition: "opacity 150ms" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title={agent.status === "active" ? "Tạm dừng" : "Kích hoạt"}
            style={iconBtn}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"; }}
          >
            {agent.status === "active"
              ? <Pause size={13} strokeWidth={1.8} />
              : <Play size={13} strokeWidth={1.8} />}
          </button>

          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              style={iconBtn}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"; }}
            >
              <MoreHorizontal size={15} strokeWidth={1.8} />
            </button>

            {menuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                background: menuBg,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)"}`,
                borderRadius: 12, padding: "5px",
                boxShadow: isDark ? "0 12px 32px rgba(0,0,0,0.55)" : "0 8px 24px rgba(0,0,0,0.14)",
                minWidth: 160,
              }}>
                {[
                  { icon: <Pencil size={13} strokeWidth={1.5} />, label: "Chỉnh sửa", action: onEdit, danger: false },
                  { icon: <Trash2 size={13} strokeWidth={1.5} />, label: "Xóa agent", action: onDelete, danger: true },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={(e) => { e.stopPropagation(); item.action(); setMenuOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 9,
                      width: "100%", padding: "8px 12px", border: "none",
                      background: "transparent", cursor: "pointer", borderRadius: 8,
                      fontSize: 13, fontWeight: 500,
                      color: item.danger ? "#FF3B30" : fg,
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                      transition: "background 100ms",
                      textAlign: "left" as const,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{
        margin: 0, fontSize: 13, color: fgMuted, lineHeight: 1.6,
        paddingLeft: 52,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
      }}>
        {agent.description}
      </p>

      {/* Footer: last run + trigger */}
      <div style={{ paddingLeft: 52, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={11} color={fgSubtle} strokeWidth={1.5} />
          <span style={{ fontSize: 11.5, color: fgSubtle }}>{agent.lastRun}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Zap size={11} color={fgSubtle} strokeWidth={1.5} />
          <span style={{ fontSize: 11.5, color: fgSubtle }}>{agent.trigger}</span>
        </div>
        {agent.runsToday > 0 && (
          <span style={{ fontSize: 11.5, color: fgSubtle }}>{agent.runsToday} lần hôm nay</span>
        )}
      </div>
    </div>
  );
}

export function Agents({ onNavigate, isDark = false }: { onNavigate: (page: string) => void; isDark?: boolean }) {
  const [agents, setAgents] = useState(mockAgents);

  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgSubtle = isDark ? "rgba(240,242,255,0.35)" : "rgba(26,26,46,0.40)";
  const brand    = isDark ? "#4D8FE8" : "#0849AC";
  const divider  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const activeCount  = agents.filter((a) => a.status === "active").length;
  const totalBriefs  = agents.reduce((s, a) => s + a.briefsGenerated, 0);
  const todayRuns    = agents.reduce((s, a) => s + a.runsToday, 0);

  const toggleStatus = (id: string) => {
    setAgents((prev) => prev.map((a) =>
      a.id === id ? { ...a, status: a.status === "active" ? "paused" : "active" } : a
    ) as Agent[]);
  };

  const deleteAgent = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em" }}>
          My Agents
        </h1>
        <button
          onClick={() => onNavigate("create-agent")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 22, border: "none",
            background: brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Montserrat', system-ui, sans-serif",
            transition: "opacity 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Tạo Agent
        </button>
      </div>

      {/* Subtitle stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28 }}>
        <span style={{ fontSize: 13, color: fgSubtle }}>{agents.length} agents</span>
        {activeCount > 0 && (
          <>
            <span style={{ color: fgSubtle, opacity: 0.4 }}>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759", display: "inline-block", boxShadow: "0 0 0 2px rgba(52,199,89,0.22)" }} />
              <span style={{ color: "#34C759", fontWeight: 600 }}>{activeCount} đang chạy</span>
            </span>
          </>
        )}
        <span style={{ color: fgSubtle, opacity: 0.4 }}>·</span>
        <span style={{ fontSize: 13, color: fgSubtle }}>{todayRuns} lượt hôm nay</span>
        <span style={{ color: fgSubtle, opacity: 0.4 }}>·</span>
        <span style={{ fontSize: 13, color: fgSubtle }}>{totalBriefs} briefs</span>
      </div>

      {/* Divider */}
      <div style={{ height: "0.5px", background: divider, marginBottom: 16 }} />

      {/* ── Agent list ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {agents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            index={i}
            isDark={isDark}
            onToggle={() => toggleStatus(agent.id)}
            onEdit={() => onNavigate("agent-studio")}
            onDelete={() => deleteAgent(agent.id)}
          />
        ))}
      </div>

      {/* ── Add from templates CTA ── */}
      <button
        onClick={() => onNavigate("templates")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", marginTop: 14, padding: "14px",
          borderRadius: 16, border: `1px dashed ${isDark ? "rgba(255,255,255,0.14)" : "rgba(8,73,172,0.20)"}`,
          background: "transparent", cursor: "pointer",
          color: fgSubtle, fontSize: 13, fontWeight: 500,
          fontFamily: "'Montserrat', system-ui, sans-serif",
          transition: "all 150ms ease",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.04)";
          el.style.borderColor = isDark ? "rgba(77,143,232,0.35)" : "rgba(8,73,172,0.35)";
          el.style.color = brand;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "transparent";
          el.style.borderColor = isDark ? "rgba(255,255,255,0.14)" : "rgba(8,73,172,0.20)";
          el.style.color = fgSubtle;
        }}
      >
        <Plus size={14} strokeWidth={2} />
        Thêm từ Templates
      </button>
    </div>
  );
}
