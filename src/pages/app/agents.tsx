import {
  Bot, Play, Pause, Clock, Zap, ChevronRight,
  BarChart3, Mail, TrendingUp, Search, Globe, Plus,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

interface Agent {
  id: string;
  name: string;
  description: string;
  template_id: string;
  status: "active" | "paused" | "draft";
  schedule: string;
  last_run?: string;
}

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  daily_digest: Mail,
  portfolio_health: BarChart3,
  deep_research: Search,
  earnings: TrendingUp,
  insider_tracker: Zap,
  macro_watch: Globe,
};

const TEMPLATE_COLORS: Record<string, { bg: string; color: string }> = {
  daily_digest:    { bg: "rgba(8,73,172,0.1)",    color: "#0849ac" },
  portfolio_health: { bg: "rgba(14,165,160,0.1)", color: "#0ea5a0" },
  deep_research:   { bg: "rgba(139,92,246,0.1)",  color: "#8b5cf6" },
  earnings:        { bg: "rgba(245,158,11,0.1)",   color: "#f59e0b" },
  insider_tracker: { bg: "rgba(239,68,68,0.1)",    color: "#ef4444" },
  macro_watch:     { bg: "rgba(16,185,129,0.1)",   color: "#10b981" },
};

const DEMO_AGENTS: Agent[] = [
  { id: "a1", name: "Bản tin buổi sáng", description: "Tổng hợp tin tức VN30 và điểm nổi bật thị trường lúc 7:00 AM", template_id: "daily_digest", status: "active", schedule: "Hàng ngày 7:00 AM", last_run: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "a2", name: "Theo dõi danh mục", description: "Cảnh báo khi cổ phiếu trong danh mục biến động >3%", template_id: "portfolio_health", status: "active", schedule: "Thứ 2–6, 11:45 AM & 3:00 PM", last_run: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "a3", name: "Nghiên cứu VCB", description: "Phân tích chuyên sâu Vietcombank theo quý", template_id: "deep_research", status: "draft", schedule: "Thủ công" },
];

function StatusBadge({ status }: { status: Agent["status"] }) {
  const config = {
    active: { label: "Đang chạy", color: "#0ea5a0", bg: "rgba(14,165,160,0.1)" },
    paused: { label: "Tạm dừng",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    draft:  { label: "Bản nháp",  color: "#99a1af", bg: "rgba(153,161,175,0.1)" },
  };
  const c = config[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: "0.625rem", fontWeight: 700, background: c.bg, color: c.color }}>
      {status === "active" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color }} />}
      {c.label}
    </span>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(DEMO_AGENTS);
  const navigate = useNavigate();

  const toggleAgent = (id: string) => {
    setAgents(prev => prev.map(a =>
      a.id === id ? { ...a, status: a.status === "active" ? "paused" as const : a.status === "paused" ? "active" as const : a.status } : a
    ));
  };

  const activeCount = agents.filter(a => a.status === "active").length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Agents</h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>{activeCount} agent đang chạy · {agents.length} tổng cộng</p>
        </div>
        <button onClick={() => navigate("/app/agent-studio")} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
          <Plus style={{ width: 15, height: 15 }} />Tạo agent mới
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
        {agents.map(agent => {
          const Icon = TEMPLATE_ICONS[agent.template_id] || Bot;
          const { bg, color } = TEMPLATE_COLORS[agent.template_id] || { bg: "rgba(8,73,172,0.1)", color: "#0849ac" };
          return (
            <div key={agent.id} style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "18px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 18, height: 18, color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e" }}>{agent.name}</h3>
                    <StatusBadge status={agent.status} />
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "#6a7282", marginTop: 4, lineHeight: 1.4 }}>{agent.description}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <Clock style={{ width: 11, height: 11, color: "#99a1af" }} />
                <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{agent.schedule}</span>
              </div>
              {agent.last_run && <div style={{ fontSize: "0.625rem", color: "#c4c9d4", marginBottom: 14 }}>Chạy lần cuối: {new Date(agent.last_run).toLocaleString("vi-VN")}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                {agent.status !== "draft" && (
                  <button onClick={() => toggleAgent(agent.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: agent.status === "active" ? "#f59e0b" : "#0ea5a0", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>
                    {agent.status === "active" ? <><Pause style={{ width: 11, height: 11 }} />Tạm dừng</> : <><Play style={{ width: 11, height: 11 }} />Tiếp tục</>}
                  </button>
                )}
                {agent.status === "draft" && (
                  <button onClick={() => navigate("/app/agent-studio")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: "#0849ac", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>
                    <Play style={{ width: 11, height: 11 }} />Kích hoạt
                  </button>
                )}
                <button style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.08)", background: "transparent", color: "#6a7282", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                  Chi tiết <ChevronRight style={{ width: 11, height: 11 }} />
                </button>
              </div>
            </div>
          );
        })}
        <div onClick={() => navigate("/app/agent-studio")} style={{ background: "transparent", border: "2px dashed rgba(8,73,172,0.15)", borderRadius: 14, padding: "18px 18px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 180 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(8,73,172,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
              <Plus style={{ width: 18, height: 18, color: "#0849ac" }} />
            </div>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0849ac" }}>Tạo agent mới</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>Từ template hoặc tự tùy chỉnh</p>
          </div>
        </div>
      </div>
    </div>
  );
}
