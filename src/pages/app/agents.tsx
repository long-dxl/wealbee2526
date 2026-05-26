import {
  Bot, Play, Pause, Clock, Zap, ChevronRight,
  BarChart3, Mail, TrendingUp, Search, Globe, Plus,
  RefreshCw, CheckCircle, AlertCircle, Inbox,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  sort_order: number;
}

interface UserAgent {
  id: string;
  template_id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "draft";
  schedule: string;
  last_run_at: string | null;
  run_count: number;
}

// ─── Icon + color map ─────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  "mail": Mail, "bar-chart": BarChart3, "search": Search,
  "trending-up": TrendingUp, "globe": Globe, "zap": Zap,
};

const TEMPLATE_COLORS: Record<string, { bg: string; color: string }> = {
  daily_digest:    { bg: "rgba(8,73,172,0.1)",    color: "#0849ac" },
  portfolio_health:{ bg: "rgba(14,165,160,0.1)",  color: "#0ea5a0" },
  market_scanner:  { bg: "rgba(139,92,246,0.1)",  color: "#8b5cf6" },
  earnings_watch:  { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b" },
  macro_watch:     { bg: "rgba(16,185,129,0.1)",  color: "#10b981" },
};

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: UserAgent["status"] }) {
  const cfg = {
    active: { label: "Đang bật", color: "#0ea5a0", bg: "rgba(14,165,160,0.1)" },
    paused: { label: "Tạm dừng", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    draft:  { label: "Bản nháp", color: "#99a1af", bg: "rgba(153,161,175,0.1)" },
  };
  const c = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: "0.625rem", fontWeight: 700, background: c.bg, color: c.color }}>
      {status === "active" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color }} />}
      {c.label}
    </span>
  );
}

// ─── AgentsPage ───────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ agentId: string; title: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const navigate = useNavigate();

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
      setAuthToken(session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
      setAuthToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load templates + user agents
  const load = async () => {
    setLoading(true);
    const [{ data: tmpl }, { data: ags }] = await Promise.all([
      supabase.from("agent_templates").select("*").eq("is_active", true).order("sort_order"),
      userId
        ? supabase.from("agents").select("*").eq("user_id", userId).order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
    setTemplates((tmpl ?? []) as AgentTemplate[]);
    setAgents((ags ?? []) as UserAgent[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  // Activate template → create user agent
  const activateTemplate = async (tmpl: AgentTemplate) => {
    if (!userId) return;
    const { data: agent } = await supabase.from("agents").insert({
      user_id: userId,
      template_id: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      status: "active",
      schedule: "manual",
    }).select("*").single();
    if (agent) {
      setAgents(prev => [...prev, agent as UserAgent]);
      setShowTemplates(false);
    }
  };

  // Toggle active/paused
  const toggleAgent = async (agent: UserAgent) => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    await supabase.from("agents").update({ status: newStatus }).eq("id", agent.id);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
  };

  // Delete agent
  const deleteAgent = async (agentId: string) => {
    if (!confirm("Xóa agent này?")) return;
    await supabase.from("agents").delete().eq("id", agentId);
    setAgents(prev => prev.filter(a => a.id !== agentId));
  };

  // Run agent now
  const runAgent = async (agent: UserAgent) => {
    if (!authToken || runningId) return;
    setRunningId(agent.id);
    setRunResult(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/run-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setRunResult({ agentId: agent.id, title: data.title });
        // Update last_run_at in state
        setAgents(prev => prev.map(a =>
          a.id === agent.id ? { ...a, last_run_at: new Date().toISOString(), run_count: (a.run_count ?? 0) + 1 } : a
        ));
      } else {
        alert(`Lỗi: ${data.error}`);
      }
    } catch (err) {
      alert(`Lỗi kết nối: ${err}`);
    } finally {
      setRunningId(null);
    }
  };

  const activeCount = agents.filter(a => a.status === "active").length;

  if (!userId && !loading) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <Bot style={{ width: 40, height: 40, color: "#d1d5db", marginBottom: 12 }} />
        <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Vui lòng đăng nhập để dùng Agents</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Agents</h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>
            {activeCount} agent đang bật · {agents.length} tổng cộng
          </p>
        </div>
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}
        >
          <Plus style={{ width: 15, height: 15 }} />Thêm agent
        </button>
      </div>

      {/* Run result toast */}
      {runResult && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(14,165,160,0.08)", border: "1px solid rgba(14,165,160,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <CheckCircle style={{ width: 16, height: 16, color: "#0ea5a0", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0ea5a0" }}>Agent chạy thành công!</p>
            <p style={{ fontSize: "0.75rem", color: "#6a7282", marginTop: 2 }}>"{runResult.title}"</p>
          </div>
          <button
            onClick={() => navigate("/app/inbox")}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(14,165,160,0.2)", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "#0ea5a0", fontWeight: 600 }}
          >
            <Inbox style={{ width: 12, height: 12 }} />Xem Inbox
          </button>
          <button onClick={() => setRunResult(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#99a1af", fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Template picker */}
      {showTemplates && (
        <div style={{ background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.12)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", marginBottom: 14 }}>Chọn template agent</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {templates.map(tmpl => {
              const Icon = ICON_MAP[tmpl.icon] || Bot;
              const colors = TEMPLATE_COLORS[tmpl.id] || { bg: "rgba(8,73,172,0.1)", color: "#0849ac" };
              const alreadyAdded = agents.some(a => a.template_id === tmpl.id);
              return (
                <div
                  key={tmpl.id}
                  style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", opacity: alreadyAdded ? 0.5 : 1 }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color: colors.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e" }}>{tmpl.name}</p>
                    <p style={{ fontSize: "0.6875rem", color: "#6a7282", marginTop: 3, lineHeight: 1.4 }}>{tmpl.description}</p>
                    <button
                      onClick={() => !alreadyAdded && activateTemplate(tmpl)}
                      disabled={alreadyAdded}
                      style={{ marginTop: 8, padding: "4px 10px", borderRadius: 7, border: "none", background: alreadyAdded ? "#e5e7eb" : colors.color, color: alreadyAdded ? "#99a1af" : "#fff", fontSize: "0.6875rem", fontWeight: 600, cursor: alreadyAdded ? "not-allowed" : "pointer" }}
                    >
                      {alreadyAdded ? "Đã thêm" : "Thêm agent này"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent cards */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <RefreshCw style={{ width: 24, height: 24, color: "#99a1af", animation: "spin 1s linear infinite", margin: "0 auto" }} />
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 10 }}>Đang tải…</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {agents.map(agent => {
            const colors = TEMPLATE_COLORS[agent.template_id] || { bg: "rgba(8,73,172,0.1)", color: "#0849ac" };
            const tmpl = templates.find(t => t.id === agent.template_id);
            const Icon = ICON_MAP[tmpl?.icon ?? "bot"] || Bot;
            const isRunning = runningId === agent.id;

            return (
              <div key={agent.id} style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "18px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 18, height: 18, color: colors.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e" }}>{agent.name}</h3>
                      <StatusBadge status={agent.status} />
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#6a7282", marginTop: 4, lineHeight: 1.4 }}>{agent.description}</p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <Clock style={{ width: 11, height: 11, color: "#99a1af" }} />
                  <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{agent.schedule}</span>
                  {agent.run_count > 0 && (
                    <span style={{ fontSize: "0.6875rem", color: "#c4c9d4" }}>· Đã chạy {agent.run_count} lần</span>
                  )}
                </div>
                {agent.last_run_at && (
                  <div style={{ fontSize: "0.625rem", color: "#c4c9d4", marginBottom: 14 }}>
                    Lần cuối: {new Date(agent.last_run_at).toLocaleString("vi-VN")}
                  </div>
                )}
                {!agent.last_run_at && <div style={{ marginBottom: 14 }} />}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* Run now */}
                  <button
                    onClick={() => runAgent(agent)}
                    disabled={!!runningId}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", background: isRunning ? "rgba(14,165,160,0.1)" : colors.color, color: isRunning ? colors.color : "#fff", cursor: runningId ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit", opacity: runningId && !isRunning ? 0.5 : 1 }}
                  >
                    {isRunning
                      ? <><RefreshCw style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />Đang chạy…</>
                      : <><Play style={{ width: 11, height: 11 }} />Chạy ngay</>}
                  </button>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleAgent(agent)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: agent.status === "active" ? "#f59e0b" : "#0ea5a0", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}
                  >
                    {agent.status === "active"
                      ? <><Pause style={{ width: 11, height: 11 }} />Tạm dừng</>
                      : <><Play style={{ width: 11, height: 11 }} />Bật lại</>}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteAgent(agent.id)}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.12)", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add card */}
          <div
            onClick={() => setShowTemplates(true)}
            style={{ background: "transparent", border: "2px dashed rgba(8,73,172,0.15)", borderRadius: 14, padding: "18px 18px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 180 }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(8,73,172,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                <Plus style={{ width: 18, height: 18, color: "#0849ac" }} />
              </div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0849ac" }}>Thêm agent</p>
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>Chọn từ {templates.length} template</p>
            </div>
          </div>
        </div>
      )}

      {agents.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "20px 0 0" }}>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af" }}>
            Chưa có agent nào. Nhấn "Thêm agent" để chọn template.
          </p>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
