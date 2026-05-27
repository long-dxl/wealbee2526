import {
  Bot, Play, Pause, Clock, Zap,
  BarChart3, Mail, TrendingUp, Search, Globe, Plus,
  RefreshCw, AlertCircle, Inbox, Settings2, ArrowLeft,
  CheckCircle, Loader2, Database, Bell,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  system_prompt?: string;
}

interface RunStep {
  step: string;
  status: "pending" | "loading" | "done" | "error";
  label: string;
}

interface RunPanelState {
  agentId: string;
  agentName: string;
  steps: RunStep[];
  output: string;
  done: boolean;
  title?: string;
  briefId?: string;
  tokens?: number;
  error?: string;
  targetSymbol?: string;
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
  deep_research:   { bg: "rgba(99,102,241,0.1)",  color: "#6366f1" },
};

const STEP_ICONS: Record<string, React.ElementType> = {
  price_feed:  BarChart3,
  news_feed:   Search,
  financials:  Database,
  portfolio:   TrendingUp,
  gpt:         Zap,
  save:        Inbox,
  email_send:  Mail,
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SYM_PREFIX   = "__TARGET_SYMBOL__: ";

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

// ─── Symbol Picker Modal ──────────────────────────────────────────────────────

function SymbolPickerModal({ onConfirm, onCancel }: { onConfirm: (symbol: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const suggestions = ["VCB", "TCB", "HPG", "VNM", "MWG", "FPT", "VIC", "VHM", "ACB", "BID", "CTG", "MSN", "MBB", "SSI", "VPB"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <h3 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "1rem", fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>Chọn mã cổ phiếu</h3>
        <p style={{ fontSize: "0.75rem", color: "#99a1af", marginBottom: 16 }}>Agent sẽ phân tích chuyên sâu mã CP này</p>
        <input
          autoFocus value={value}
          onChange={e => setValue(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter" && value.trim()) onConfirm(value.trim()); if (e.key === "Escape") onCancel(); }}
          placeholder="Nhập mã CP, VD: VCB"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid rgba(8,73,172,0.25)", fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "inherit", outline: "none", boxSizing: "border-box", letterSpacing: "0.05em" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setValue(s)}
              style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(8,73,172,0.15)", background: value === s ? "rgba(8,73,172,0.1)" : "transparent", color: "#0849ac", fontSize: "0.6875rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", color: "#6a7282", cursor: "pointer", fontSize: "0.8125rem", fontFamily: "inherit" }}>Hủy</button>
          <button onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim()}
            style={{ flex: 2, padding: "9px 0", borderRadius: 10, border: "none", background: value.trim() ? "#8b5cf6" : "#e5e7eb", color: value.trim() ? "#fff" : "#99a1af", cursor: value.trim() ? "pointer" : "not-allowed", fontSize: "0.8125rem", fontWeight: 700, fontFamily: "inherit" }}>
            Phân tích {value || "..."}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown renderer (reused from inbox) ────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function MdTable({ lines }: { lines: string[] }) {
  const dataRows = lines.filter(l => !l.replace(/[\s|:-]/g, "").match(/^-+$/));
  if (!dataRows.length) return null;
  const parseRow = (row: string) => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const [header, ...body] = dataRows;
  return (
    <div style={{ overflowX: "auto", margin: "12px 0", borderRadius: 10, border: "1px solid rgba(8,73,172,0.1)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
        <thead><tr>{parseRow(header).map((h, i) => <th key={i} style={{ padding: "8px 12px", background: "rgba(8,73,172,0.07)", color: "#1a1a2e", fontWeight: 700, textAlign: "left", borderBottom: "2px solid rgba(8,73,172,0.12)", whiteSpace: "nowrap" }}>{renderInline(h)}</th>)}</tr></thead>
        <tbody>{body.map((row, ri) => <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "rgba(8,73,172,0.02)" }}>{parseRow(row).map((cell, ci) => <td key={ci} style={{ padding: "7px 12px", borderBottom: "1px solid rgba(8,73,172,0.06)", color: "#374151" }}>{renderInline(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function MdContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]; const trim = raw.trim();
    if (trim.startsWith("|") && trim.endsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) { tbl.push(lines[i].trim()); i++; }
      nodes.push(<MdTable key={`t${i}`} lines={tbl} />); continue;
    }
    if (/^---+$/.test(trim)) { nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(8,73,172,0.1)", margin: "12px 0" }} />); i++; continue; }
    if (!trim) { nodes.push(<div key={i} style={{ height: 5 }} />); i++; continue; }
    if (trim.startsWith("# "))  { nodes.push(<h2 key={i} style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "1.0625rem", fontWeight: 800, color: "#1a1a2e", margin: "16px 0 8px", borderBottom: "2px solid rgba(8,73,172,0.1)", paddingBottom: 5 }}>{trim.slice(2)}</h2>); i++; continue; }
    if (trim.startsWith("## ")) { nodes.push(<h3 key={i} style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: "#0849ac", margin: "14px 0 6px" }}>{trim.slice(3)}</h3>); i++; continue; }
    if (trim.startsWith("### ")){ nodes.push(<h4 key={i} style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", margin: "10px 0 4px" }}>{trim.slice(4)}</h4>); i++; continue; }
    if (trim.startsWith("- ") || trim.startsWith("• ")) {
      nodes.push(<div key={i} style={{ display: "flex", gap: 9, marginBottom: 5, alignItems: "flex-start" }}><span style={{ color: "#0849ac", flexShrink: 0, marginTop: 3, fontSize: "0.625rem" }}>●</span><span style={{ lineHeight: 1.65 }}>{renderInline(trim.slice(2))}</span></div>); i++; continue;
    }
    if (/^\d+\.\s/.test(trim)) {
      const m = trim.match(/^(\d+)\.\s(.+)/);
      if (m) { nodes.push(<div key={i} style={{ display: "flex", gap: 9, marginBottom: 5, alignItems: "flex-start" }}><span style={{ color: "#0849ac", flexShrink: 0, fontWeight: 700, minWidth: 20, fontSize: "0.8125rem" }}>{m[1]}.</span><span style={{ lineHeight: 1.65 }}>{renderInline(m[2])}</span></div>); i++; continue; }
    }
    nodes.push(<p key={i} style={{ margin: "0 0 6px", lineHeight: 1.75, color: "#374151" }}>{renderInline(trim)}</p>); i++;
  }
  return <div style={{ fontSize: "0.875rem", color: "#1a1a2e", lineHeight: 1.75 }}>{nodes}</div>;
}

// ─── Run Panel ────────────────────────────────────────────────────────────────

function RunPanel({ panel, onClose, onInbox, onViewTicker }: {
  panel: RunPanelState;
  onClose: () => void;
  onInbox: () => void;
  onViewTicker?: (sym: string) => void;
}) {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output while streaming
  useEffect(() => {
    if (!panel.done && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [panel.output, panel.done]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f8ff" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "#fff", borderBottom: "1px solid rgba(8,73,172,0.08)", flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: "#6a7282", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
          <ArrowLeft style={{ width: 13, height: 13 }} />Quay lại
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e" }}>{panel.agentName}</span>
          {!panel.done && <span style={{ fontSize: "0.75rem", color: "#0ea5a0", marginLeft: 10, fontWeight: 600 }}>● Đang chạy…</span>}
          {panel.done && !panel.error && <span style={{ fontSize: "0.75rem", color: "#10b981", marginLeft: 10, fontWeight: 600 }}>✓ Hoàn tất</span>}
          {panel.error && <span style={{ fontSize: "0.75rem", color: "#ef4444", marginLeft: 10, fontWeight: 600 }}>✕ Lỗi</span>}
        </div>
        {panel.done && !panel.error && (
          <div style={{ display: "flex", gap: 8 }}>
            {panel.targetSymbol && onViewTicker && (
              <button
                onClick={() => onViewTicker(panel.targetSymbol!)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)", color: "#8b5cf6", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}
              >
                <BarChart3 style={{ width: 13, height: 13 }} />{panel.targetSymbol}
              </button>
            )}
            <button onClick={onInbox} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>
              <Inbox style={{ width: 13, height: 13 }} />Xem trong Inbox
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 0 }}>
        {/* Steps sidebar */}
        <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid rgba(8,73,172,0.08)", background: "#fff", padding: "20px 16px", overflowY: "auto" }}>
          <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#99a1af", letterSpacing: "0.06em", marginBottom: 14 }}>TIẾN TRÌNH</p>
          {panel.steps.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 style={{ width: 14, height: 14, color: "#0849ac", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.75rem", color: "#99a1af" }}>Đang khởi động…</span>
            </div>
          )}
          {panel.steps.map(s => {
            const Icon = STEP_ICONS[s.step] ?? Zap;
            return (
              <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, opacity: s.status === "pending" ? 0.4 : 1 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: s.status === "done" ? "rgba(16,185,129,0.1)" : s.status === "loading" ? "rgba(8,73,172,0.08)" : s.status === "error" ? "rgba(239,68,68,0.1)" : "rgba(153,161,175,0.08)" }}>
                  {s.status === "loading" && <Loader2 style={{ width: 13, height: 13, color: "#0849ac", animation: "spin 1s linear infinite" }} />}
                  {s.status === "done"    && <CheckCircle style={{ width: 13, height: 13, color: "#10b981" }} />}
                  {s.status === "error"   && <AlertCircle style={{ width: 13, height: 13, color: "#ef4444" }} />}
                  {s.status === "pending" && <Icon style={{ width: 13, height: 13, color: "#99a1af" }} />}
                </div>
                <span style={{ fontSize: "0.75rem", color: s.status === "done" ? "#10b981" : s.status === "loading" ? "#0849ac" : s.status === "error" ? "#ef4444" : "#99a1af", fontWeight: s.status === "loading" ? 700 : 500, lineHeight: 1.3 }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Output area */}
        <div ref={outputRef} style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {panel.error ? (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>Đã xảy ra lỗi</p>
              <p style={{ fontSize: "0.8125rem", color: "#374151", fontFamily: "monospace" }}>{panel.error}</p>
            </div>
          ) : (
            <>
              {panel.output && (
                <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "20px 24px", boxShadow: "0 1px 4px rgba(8,73,172,0.04)" }}>
                  {panel.done
                    ? <MdContent text={panel.output} />
                    : (
                      <div>
                        <MdContent text={panel.output} />
                        <span style={{ display: "inline-block", width: 2, height: "1em", background: "#0849ac", animation: "blink 1s step-start infinite", verticalAlign: "text-bottom", marginLeft: 2 }} />
                      </div>
                    )
                  }
                </div>
              )}
              {!panel.output && !panel.done && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#99a1af", padding: "20px 0" }}>
                  <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: "0.875rem" }}>Đang chuẩn bị dữ liệu…</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

// ─── AgentsPage ───────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [symbolPicker, setSymbolPicker] = useState<{ agentId: string } | null>(null);
  const [runPanel, setRunPanel] = useState<RunPanelState | null>(null);
  const navigate = useNavigate();

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

  const activateTemplate = async (tmpl: AgentTemplate) => {
    if (!userId) return;
    // Fetch full template to get tools + system_prompt
    const { data: full } = await supabase
      .from("agent_templates")
      .select("id, tools, system_prompt")
      .eq("id", tmpl.id)
      .single();
    const { data: agent } = await supabase.from("agents").insert({
      user_id: userId, template_id: tmpl.id, name: tmpl.name,
      description: tmpl.description, status: "active", schedule: "manual",
      tools: full?.tools ?? [],
      system_prompt: full?.system_prompt ?? null,
    }).select("*").single();
    if (agent) { setAgents(prev => [...prev, agent as UserAgent]); setShowTemplates(false); }
  };

  const toggleAgent = async (agent: UserAgent) => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    await supabase.from("agents").update({ status: newStatus }).eq("id", agent.id);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
  };

  const deleteAgent = async (agentId: string) => {
    if (!confirm("Xóa agent này?")) return;
    await supabase.from("agents").delete().eq("id", agentId);
    setAgents(prev => prev.filter(a => a.id !== agentId));
  };

  // ── Run agent with SSE streaming ──────────────────────────────────────────

  const runAgent = async (agent: UserAgent, targetSymbol?: string) => {
    if (!authToken || runPanel) return;

    const firstLine = agent.system_prompt?.split("\n")[0] ?? "";
    const savedSym  = firstLine.startsWith(SYM_PREFIX) ? firstLine.slice(SYM_PREFIX.length).trim() : null;

    if (agent.template_id === "deep_research" && !targetSymbol && !savedSym) {
      setSymbolPicker({ agentId: agent.id });
      return;
    }

    const sym = targetSymbol || savedSym || undefined;

    setRunPanel({ agentId: agent.id, agentName: agent.name, steps: [], output: "", done: false, targetSymbol: sym });

    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/run-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({ agent_id: agent.id, target_symbol: sym }),
      });
    } catch (err) {
      setRunPanel(prev => prev ? { ...prev, done: true, error: String(err) } : null);
      return;
    }

    if (!res.body) {
      setRunPanel(prev => prev ? { ...prev, done: true, error: "Không nhận được stream từ server" } : null);
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const updatePanel = (fn: (p: RunPanelState) => RunPanelState) =>
      setRunPanel(prev => prev ? fn(prev) : prev);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const ev = JSON.parse(raw);

          if (ev.type === "step") {
            updatePanel(prev => ({
              ...prev,
              steps: prev.steps.some(s => s.step === ev.step)
                ? prev.steps.map(s => s.step === ev.step ? { ...s, status: ev.status, label: ev.label } : s)
                : [...prev.steps, { step: ev.step, status: ev.status, label: ev.label }],
            }));
          } else if (ev.type === "chunk") {
            updatePanel(prev => ({ ...prev, output: prev.output + ev.text }));
          } else if (ev.type === "done") {
            updatePanel(prev => ({ ...prev, done: true, title: ev.title, briefId: ev.brief_id, tokens: ev.tokens }));
            setAgents(prev => prev.map(a =>
              a.id === agent.id ? { ...a, last_run_at: new Date().toISOString(), run_count: (a.run_count ?? 0) + 1 } : a
            ));
          } else if (ev.type === "error") {
            updatePanel(prev => ({ ...prev, done: true, error: ev.error }));
          }
        } catch { /* ignore parse errors */ }
      }
    }
  };

  // ── If run panel is active, render it full-page ───────────────────────────

  if (runPanel) {
    return (
      <RunPanel
        panel={runPanel}
        onClose={() => setRunPanel(null)}
        onInbox={() => { setRunPanel(null); navigate("/app/inbox"); }}
        onViewTicker={(sym) => { setRunPanel(null); navigate(`/app/ticker/${sym}`); }}
      />
    );
  }

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
      {symbolPicker && (
        <SymbolPickerModal
          onConfirm={(symbol) => {
            const agent = agents.find(a => a.id === symbolPicker.agentId);
            setSymbolPicker(null);
            if (agent) runAgent(agent, symbol);
          }}
          onCancel={() => setSymbolPicker(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Agents</h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>
            {activeCount} agent đang bật · {agents.length} tổng cộng
          </p>
        </div>
        <button onClick={() => setShowTemplates(!showTemplates)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
          <Plus style={{ width: 15, height: 15 }} />Thêm agent
        </button>
      </div>

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
                <div key={tmpl.id} style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", opacity: alreadyAdded ? 0.5 : 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color: colors.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e" }}>{tmpl.name}</p>
                    <p style={{ fontSize: "0.6875rem", color: "#6a7282", marginTop: 3, lineHeight: 1.4 }}>{tmpl.description}</p>
                    <button onClick={() => !alreadyAdded && activateTemplate(tmpl)} disabled={alreadyAdded}
                      style={{ marginTop: 8, padding: "4px 10px", borderRadius: 7, border: "none", background: alreadyAdded ? "#e5e7eb" : colors.color, color: alreadyAdded ? "#99a1af" : "#fff", fontSize: "0.6875rem", fontWeight: 600, cursor: alreadyAdded ? "not-allowed" : "pointer" }}>
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
            const tmpl   = templates.find(t => t.id === agent.template_id);
            const Icon   = ICON_MAP[tmpl?.icon ?? "bot"] || Bot;
            const firstLine = agent.system_prompt?.split("\n")[0] ?? "";
            const savedSym  = firstLine.startsWith(SYM_PREFIX) ? firstLine.slice(SYM_PREFIX.length).trim() : null;

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
                    {savedSym && (
                      <span style={{ display: "inline-block", marginTop: 5, padding: "2px 8px", borderRadius: 6, background: "rgba(99,102,241,0.08)", color: "#6366f1", fontSize: "0.625rem", fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>
                        {savedSym}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <Clock style={{ width: 11, height: 11, color: "#99a1af" }} />
                  <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{agent.schedule}</span>
                  {agent.run_count > 0 && <span style={{ fontSize: "0.6875rem", color: "#c4c9d4" }}>· Đã chạy {agent.run_count} lần</span>}
                </div>
                {agent.last_run_at && <div style={{ fontSize: "0.625rem", color: "#c4c9d4", marginBottom: 14 }}>Lần cuối: {new Date(agent.last_run_at).toLocaleString("vi-VN")}</div>}
                {!agent.last_run_at && <div style={{ marginBottom: 14 }} />}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => runAgent(agent)} disabled={!!runPanel}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", background: colors.color, color: "#fff", cursor: runPanel ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit", opacity: runPanel ? 0.5 : 1 }}>
                    <Play style={{ width: 11, height: 11 }} />Chạy ngay
                  </button>
                  <button onClick={() => toggleAgent(agent)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: agent.status === "active" ? "#f59e0b" : "#0ea5a0", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>
                    {agent.status === "active" ? <><Pause style={{ width: 11, height: 11 }} />Tạm dừng</> : <><Play style={{ width: 11, height: 11 }} />Bật lại</>}
                  </button>
                  <button onClick={() => navigate(`/app/agent-studio?agent_id=${agent.id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: "#6a7282", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                    <Settings2 style={{ width: 11, height: 11 }} />Chỉnh sửa
                  </button>
                  <button onClick={() => deleteAgent(agent.id)}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.12)", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          <div onClick={() => setShowTemplates(true)}
            style={{ background: "transparent", border: "2px dashed rgba(8,73,172,0.15)", borderRadius: 14, padding: "18px 18px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 180 }}>
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
          <p style={{ fontSize: "0.8125rem", color: "#99a1af" }}>Chưa có agent nào. Nhấn "Thêm agent" để chọn template.</p>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
