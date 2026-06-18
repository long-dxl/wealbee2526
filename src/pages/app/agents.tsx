import {
  Bot, Play, Pause, Clock, Zap,
  BarChart3, Mail, TrendingUp, Search, Globe, Plus,
  RefreshCw, AlertCircle, Inbox, Settings2, ArrowLeft,
  CheckCircle, Loader2, Database, Bell, ExternalLink,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { supabase } from "../../lib/supabase/client";
import { BriefRenderer, type BriefOutput } from "../../components/BriefRenderer";

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
  target_symbols?: string[];
}

interface RunStep {
  step: string;
  status: "pending" | "loading" | "done" | "error";
  label: string;
}

interface AgentSource {
  type: "news" | "financial" | "insider" | "dividend" | "exchange";
  title: string;
  url: string | null;
  date?: string;
  source?: string;
}

interface RefEntry { index: number; label: string; url: string; }

interface RunPanelState {
  agentId: string;
  agentName: string;
  templateId?: string;
  steps: RunStep[];
  output: string;
  done: boolean;
  title?: string;
  briefId?: string;
  tokens?: number;
  error?: string;
  targetSymbol?: string;
  targetSymbols?: string[];
  sources?: AgentSource[];
  refs?: RefEntry[];
  brief?: BriefOutput;
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
  kb:          Bell,
  gpt:         Zap,
  save:        Inbox,
  email_send:  Mail,
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SYM_PREFIX   = "__TARGET_SYMBOL__: ";

function formatSchedule(schedule: string): string {
  if (!schedule || schedule === "manual") return "Thủ công";
  if (schedule === "realtime") return "Realtime · khi có tín hiệu";

  // Format: "daily:09:15" (new agent-studio-new)
  const simpleMatch = schedule.match(/^(daily|weekdays|weekly|realtime):(\d{2}:\d{2})$/);
  if (simpleMatch) {
    const freqLabel: Record<string, string> = { daily: "Hàng ngày", weekdays: "Ngày giao dịch", weekly: "Hàng tuần" };
    return `${freqLabel[simpleMatch[1]] ?? simpleMatch[1]} · ${simpleMatch[2]} ICT`;
  }

  // Format: "daily:{...json...}" (old agent-studio)
  const jsonPrefixMatch = schedule.match(/^[^:]+:(\{.+\})$/s);
  const jsonStr = jsonPrefixMatch ? jsonPrefixMatch[1] : schedule;

  try {
    const cfg = JSON.parse(jsonStr);
    if (cfg.mode === "realtime") return "Realtime · khi có tín hiệu";
    const freqLabel: Record<string, string> = {
      daily: "Hàng ngày", weekdays: "Ngày giao dịch", weekly: "Hàng tuần", custom: "Tùy chọn",
    };
    const freq = freqLabel[cfg.frequency] ?? cfg.frequency ?? "Hàng ngày";
    const time = cfg.time ? ` · ${cfg.time} ICT` : "";
    return `${freq}${time}`;
  } catch {
    return "Hàng ngày";
  }
}

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

const VN30_FALLBACK = [
  "VCB","TCB","HPG","VNM","MWG","FPT","VIC","VHM",
  "ACB","BID","CTG","MSN","MBB","SSI","VPB","STB",
];

function SymbolPickerModal({ onConfirm, onCancel }: { onConfirm: (symbols: string[]) => void; onCancel: () => void }) {
  const [input,       setInput]       = useState("");
  const [selected,    setSelected]    = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(VN30_FALLBACK);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("portfolio_holdings")
        .select("symbol")
        .eq("user_id", user.id)
        .limit(24)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setSuggestions(data.map((r: { symbol: string }) => r.symbol));
          }
        });
    });
  }, []);
  const FONT = "'Montserrat',sans-serif";

  const addSymbol = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s || selected.includes(s) || selected.length >= 5) return;
    setSelected(prev => [...prev, s]);
    setInput("");
  };

  const toggle = (sym: string) => {
    setSelected(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : prev.length < 5 ? [...prev, sym] : prev
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.40)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "28px 28px 24px", width: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", fontFamily: FONT }}>

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 800, color: "#1a1a2e" }}>Chọn mã cổ phiếu để phân tích</h3>
          <p style={{ margin: "5px 0 0", fontSize: "0.75rem", color: "#99a1af" }}>
            Chọn tối đa 5 mã · Deep Research sẽ phân tích từng mã một
          </p>
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, padding: "10px 12px", background: "rgba(139,92,246,0.05)", borderRadius: 10, border: "1px solid rgba(139,92,246,0.15)" }}>
            {selected.map(s => (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: "#8b5cf6", color: "#fff", fontSize: "0.8125rem", fontWeight: 700 }}>
                {s}
                <button onClick={() => toggle(s)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", padding: 0, display: "flex", alignItems: "center", fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
            <span style={{ fontSize: "0.6875rem", color: "#8b5cf6", alignSelf: "center", marginLeft: 4 }}>{selected.length}/5 mã</span>
          </div>
        )}

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={e => {
              if (e.key === "Enter" && input.trim()) addSymbol(input);
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Nhập mã và Enter (VD: HPG)"
            maxLength={5}
            style={{ flex: 1, padding: "9px 14px", borderRadius: 9, border: "1.5px solid rgba(8,73,172,0.20)", fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", fontFamily: FONT, outline: "none", letterSpacing: "0.05em" }}
          />
          <button
            onClick={() => addSymbol(input)}
            disabled={!input.trim() || selected.length >= 5}
            style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: input.trim() && selected.length < 5 ? "#8b5cf6" : "#e5e7eb", color: input.trim() && selected.length < 5 ? "#fff" : "#99a1af", cursor: "pointer", fontWeight: 700, fontFamily: FONT, fontSize: "0.8125rem" }}
          >
            Thêm
          </button>
        </div>

        {/* Quick-pick grid */}
        <p style={{ margin: "0 0 8px", fontSize: "0.6875rem", fontWeight: 700, color: "#99a1af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Hoặc chọn nhanh:</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 20 }}>
          {suggestions.map(s => {
            const sel = selected.includes(s);
            const disabled = !sel && selected.length >= 5;
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                disabled={disabled}
                style={{
                  padding: "4px 10px", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer",
                  border: sel ? "1.5px solid #8b5cf6" : "1px solid rgba(8,73,172,0.15)",
                  background: sel ? "rgba(139,92,246,0.12)" : "transparent",
                  color: sel ? "#8b5cf6" : disabled ? "#c4c9d4" : "#0849ac",
                  fontSize: "0.6875rem", fontWeight: sel ? 700 : 500, fontFamily: FONT,
                  transition: "all 100ms",
                }}
              >
                {sel && "✓ "}{s}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", color: "#6a7282", cursor: "pointer", fontSize: "0.8125rem", fontFamily: FONT }}>Hủy</button>
          <button
            onClick={() => selected.length > 0 && onConfirm(selected)}
            disabled={selected.length === 0}
            style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: selected.length > 0 ? "#8b5cf6" : "#e5e7eb", color: selected.length > 0 ? "#fff" : "#99a1af", cursor: selected.length > 0 ? "pointer" : "not-allowed", fontSize: "0.8125rem", fontWeight: 700, fontFamily: FONT }}
          >
            {selected.length === 0 ? "Chọn ít nhất 1 mã" : `Phân tích ${selected.length} mã: ${selected.join(", ")}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string, refs?: RefEntry[]): React.ReactNode[] {
  // Parse: **bold**, `code`, [label](url), [ref:N]
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[ref:\d+\]|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{ fontWeight: 700, color: "#1a1a2e" }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: "0.8em", background: "rgba(8,73,172,0.07)", padding: "1px 5px", borderRadius: 4, color: "#0849ac" }}>{p.slice(1, -1)}</code>;

    // Numbered reference [ref:N] → resolve to real link
    const refMatch = p.match(/^\[ref:(\d+)\]$/);
    if (refMatch && refs) {
      const n = parseInt(refMatch[1]);
      const entry = refs.find(r => r.index === n);
      if (entry) {
        return (
          <a key={i} href={entry.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 6px", borderRadius: 4, marginLeft: 3, fontSize: "0.6875em", fontWeight: 600, color: "#0849ac", background: "rgba(8,73,172,0.08)", border: "1px solid rgba(8,73,172,0.15)", textDecoration: "none", verticalAlign: "middle", lineHeight: 1.6, whiteSpace: "nowrap" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(8,73,172,0.16)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(8,73,172,0.08)"; }}
          >
            {entry.label}<ExternalLink style={{ width: 8, height: 8 }} />
          </a>
        );
      }
      return null; // ref not found, hide it
    }

    // Inline markdown link [label](url)
    const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      return (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 6px", borderRadius: 4, marginLeft: 3, fontSize: "0.6875em", fontWeight: 600, color: "#0849ac", background: "rgba(8,73,172,0.08)", border: "1px solid rgba(8,73,172,0.15)", textDecoration: "none", verticalAlign: "middle", lineHeight: 1.6, whiteSpace: "nowrap" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(8,73,172,0.16)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(8,73,172,0.08)"; }}
        >
          {label}<ExternalLink style={{ width: 8, height: 8 }} />
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function MdTable({ lines, refs }: { lines: string[]; refs?: RefEntry[] }) {
  const dataRows = lines.filter(l => !l.replace(/[\s|:-]/g, "").match(/^-+$/));
  if (!dataRows.length) return null;
  const parseRow = (row: string) => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const [header, ...body] = dataRows;
  return (
    <div style={{ overflowX: "auto", margin: "14px 0", borderRadius: 10, border: "1px solid rgba(8,73,172,0.10)", boxShadow: "0 1px 4px rgba(8,73,172,0.04)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
        <thead><tr>{parseRow(header).map((h, i) => (
          <th key={i} style={{ padding: "9px 14px", background: "rgba(8,73,172,0.06)", color: "#0849ac", fontWeight: 700, textAlign: "left", borderBottom: "2px solid rgba(8,73,172,0.10)", whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
            {renderInline(h, refs)}
          </th>
        ))}</tr></thead>
        <tbody>{body.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "rgba(8,73,172,0.018)" }}>
            {parseRow(row).map((cell, ci) => (
              <td key={ci} style={{ padding: "8px 14px", borderBottom: "1px solid rgba(8,73,172,0.06)", color: "#374151" }}>{renderInline(cell, refs)}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function MdContent({ text, refs }: { text: string; refs?: RefEntry[] }) {
  // Strip outermost code fence if present (LLM wraps output in ```)
  let stripped = text.replace(/^```[^\n]*\n?([\s\S]*?)```\s*$/m, "$1").trim();

  // If output still contains HTML, convert to markdown
  if (stripped.includes("<div") || stripped.includes("<span") || stripped.includes("<a ")) {
    stripped = stripped
      .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
      .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const lines = stripped.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trim = raw.trim();

    // Table
    if (trim.startsWith("|") && trim.endsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) { tbl.push(lines[i].trim()); i++; }
      nodes.push(<MdTable key={`t${i}`} lines={tbl} refs={refs} />); continue;
    }

    // Code block (nested)
    if (trim.startsWith("```")) {
      const fence = trim.slice(3);
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++; // skip closing ```
      nodes.push(
        <pre key={`code${i}`} style={{ background: "#F0F4FF", border: "1px solid rgba(8,73,172,0.10)", borderRadius: 10, padding: "12px 16px", overflowX: "auto", margin: "10px 0", fontSize: "0.8125rem", lineHeight: 1.7, color: "#1a1a2e", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {fence && <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "#0849ac", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{fence}</span>}
          {codeLines.join("\n")}
        </pre>
      );
      continue;
    }

    // HR
    if (/^---+$/.test(trim)) { nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(8,73,172,0.10)", margin: "16px 0" }} />); i++; continue; }

    // Empty line
    if (!trim) { nodes.push(<div key={i} style={{ height: 6 }} />); i++; continue; }

    // H1
    if (trim.startsWith("# ") && !trim.startsWith("## ")) {
      nodes.push(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 10px", paddingBottom: 8, borderBottom: "2px solid rgba(8,73,172,0.12)" }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: "#0849ac", flexShrink: 0 }} />
          <h2 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: "1.0625rem", fontWeight: 800, color: "#1a1a2e" }}>{trim.slice(2)}</h2>
        </div>
      ); i++; continue;
    }

    // H2
    if (trim.startsWith("## ") && !trim.startsWith("### ")) {
      nodes.push(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: "#0849ac", flexShrink: 0 }} />
          <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: "#0849ac" }}>{trim.slice(3)}</h3>
        </div>
      ); i++; continue;
    }

    // H3
    if (trim.startsWith("### ") && !trim.startsWith("#### ")) {
      nodes.push(
        <h4 key={i} style={{ margin: "12px 0 5px", fontSize: "0.875rem", fontWeight: 700, color: "#374151", fontFamily: "'Montserrat',sans-serif", borderLeft: "3px solid rgba(8,73,172,0.18)", paddingLeft: 8 }}>
          {trim.slice(4)}
        </h4>
      ); i++; continue;
    }

    // H4
    if (trim.startsWith("#### ")) {
      nodes.push(<h5 key={i} style={{ margin: "10px 0 4px", fontSize: "0.8125rem", fontWeight: 700, color: "#6a7282", fontFamily: "'Montserrat',sans-serif" }}>{trim.slice(5)}</h5>); i++; continue;
    }

    // Blockquote
    if (trim.startsWith("> ")) {
      nodes.push(
        <blockquote key={i} style={{ margin: "8px 0", padding: "8px 14px", borderLeft: "3px solid #0849ac", background: "rgba(8,73,172,0.04)", borderRadius: "0 8px 8px 0", color: "#374151", fontStyle: "italic" }}>
          {renderInline(trim.slice(2), refs)}
        </blockquote>
      ); i++; continue;
    }

    // Bullet list
    if (trim.startsWith("- ") || trim.startsWith("• ") || trim.startsWith("→ ") || trim.startsWith("· ")) {
      const content = trim.startsWith("→ ") ? trim.slice(2) : trim.slice(2);
      const isArrow = trim.startsWith("→ ");
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
          <span style={{ color: isArrow ? "#FF9500" : "#0849ac", flexShrink: 0, marginTop: 4, fontSize: isArrow ? "0.75rem" : "0.5rem", fontWeight: 700 }}>{isArrow ? "→" : "●"}</span>
          <span style={{ lineHeight: 1.7, color: "#374151", fontSize: "0.875rem" }}>{renderInline(content, refs)}</span>
        </div>
      ); i++; continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trim)) {
      const m = trim.match(/^(\d+)\.\s(.+)/);
      if (m) {
        nodes.push(
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
            <span style={{ color: "#0849ac", flexShrink: 0, fontWeight: 700, minWidth: 22, fontSize: "0.8125rem", lineHeight: 1.7 }}>{m[1]}.</span>
            <span style={{ lineHeight: 1.7, color: "#374151", fontSize: "0.875rem" }}>{renderInline(m[2], refs)}</span>
          </div>
        ); i++; continue;
      }
    }

    // Italic disclaimer (*text*)
    if (trim.startsWith("*") && trim.endsWith("*") && !trim.startsWith("**")) {
      nodes.push(<p key={i} style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "#99a1af", fontStyle: "italic", lineHeight: 1.6 }}>{trim.slice(1, -1)}</p>); i++; continue;
    }

    // Regular paragraph
    nodes.push(<p key={i} style={{ margin: "0 0 8px", lineHeight: 1.75, color: "#374151", fontSize: "0.875rem" }}>{renderInline(trim, refs)}</p>);
    i++;
  }

  return <div style={{ fontFamily: "'Montserrat',system-ui,sans-serif" }}>{nodes}</div>;
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
            {(panel.targetSymbols?.length ?? (panel.targetSymbol ? 1 : 0)) > 0 && onViewTicker && (
              <div style={{ display: "flex", gap: 5 }}>
                {(panel.targetSymbols ?? (panel.targetSymbol ? [panel.targetSymbol] : [])).map(sym => (
                  <button
                    key={sym}
                    onClick={() => onViewTicker(sym)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)", color: "#8b5cf6", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, fontFamily: "inherit" }}
                  >
                    <BarChart3 style={{ width: 12, height: 12 }} />{sym}
                  </button>
                ))}
              </div>
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
              {/* Daily Market Digest → BriefRenderer */}
              {panel.done && panel.brief && (
                <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(8,73,172,0.04)" }}>
                  <BriefRenderer brief={panel.brief} isDark={false} />
                </div>
              )}

              {/* Other agents → streaming markdown */}
              {(!panel.brief) && panel.output && (
                <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "22px 26px", boxShadow: "0 1px 4px rgba(8,73,172,0.04)" }}>
                  <MdContent text={panel.output} refs={panel.refs} />
                  {!panel.done && (
                    <span style={{ display: "inline-block", width: 2, height: "1em", background: "#0849ac", animation: "blink 1s step-start infinite", verticalAlign: "text-bottom", marginLeft: 2 }} />
                  )}
                </div>
              )}

              {!panel.brief && !panel.output && !panel.done && (
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

  const load = async (quiet = false) => {
    if (!userId) return;          // wait until userId is ready
    if (!quiet) setLoading(true); // skeleton only on first load
    const [{ data: tmpl }, { data: ags }] = await Promise.all([
      supabase.from("agent_templates").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("agents").select("*").eq("user_id", userId).order("created_at"),
    ]);
    setTemplates((tmpl ?? []) as AgentTemplate[]);
    setAgents((ags ?? []) as UserAgent[]);
    setLoading(false);
  };

  // Reload when userId becomes available; quiet refresh on subsequent navigations
  useEffect(() => {
    if (userId) load();
  }, [userId]);

  // Refresh agents list silently when navigating back to this page
  const location = useLocation();
  useEffect(() => {
    if (userId && agents.length > 0) load(true);
  }, [location.key]);

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

  const runAgent = async (agent: UserAgent, targetSymbols?: string[]) => {
    if (!authToken || runPanel) return;

    // Resolve symbols: override > saved target_symbols > legacy SYM_PREFIX in prompt
    const firstLine = agent.system_prompt?.split("\n")[0] ?? "";
    const savedSym  = firstLine.startsWith(SYM_PREFIX) ? firstLine.slice(SYM_PREFIX.length).trim() : null;
    const savedSymbols = agent.target_symbols?.length ? agent.target_symbols
                        : savedSym ? [savedSym]
                        : [];

    // If deep_research with no symbols anywhere → show picker
    if (agent.template_id === "deep_research" && (!targetSymbols?.length) && !savedSymbols.length) {
      setSymbolPicker({ agentId: agent.id });
      return;
    }

    const syms = targetSymbols?.length ? targetSymbols : savedSymbols.length ? savedSymbols : undefined;
    const displaySym = syms?.join(", ");

    setRunPanel({
      agentId: agent.id, agentName: agent.name, templateId: agent.template_id, steps: [], output: "", done: false,
      targetSymbol: syms?.[0], targetSymbols: syms,
    });

    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/run-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({ agent_id: agent.id, target_symbols: syms }),
      });
      void displaySym;
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
          } else if (ev.type === "reset_output") {
            // LLM output HTML — server cleaned it, replace entirely
            updatePanel(prev => ({ ...prev, output: ev.output }));
          } else if (ev.type === "ref_registry") {
            updatePanel(prev => ({ ...prev, refs: ev.refs }));
          } else if (ev.type === "sources") {
            updatePanel(prev => ({ ...prev, sources: ev.sources }));
          } else if (ev.type === "done") {
            updatePanel(prev => ({ ...prev, done: true, title: ev.title, briefId: ev.brief_id, tokens: ev.tokens, brief: ev.brief ?? undefined }));
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
          onConfirm={(symbols) => {
            const agent = agents.find(a => a.id === symbolPicker.agentId);
            setSymbolPicker(null);
            if (agent) runAgent(agent, symbols);
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
              const READY_TEMPLATES = ["deep_research", "daily_digest"];
              const isReady = READY_TEMPLATES.includes(tmpl.id);
              const disabled = alreadyAdded || !isReady;
              return (
                <div key={tmpl.id} style={{
                  background: "#fff", borderRadius: 12, padding: "14px 16px",
                  display: "flex", gap: 12, alignItems: "flex-start",
                  border: `1px solid ${isReady ? "rgba(8,73,172,0.1)" : "rgba(0,0,0,0.06)"}`,
                  opacity: isReady ? 1 : 0.5,
                  filter: isReady ? "none" : "grayscale(60%)",
                  position: "relative",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color: colors.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: isReady ? "#1a1a2e" : "#99a1af" }}>{tmpl.name}</p>
                      {!isReady && (
                        <span style={{ fontSize: "0.5625rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(153,161,175,0.15)", color: "#99a1af", letterSpacing: "0.03em" }}>
                          Sắp ra mắt
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "0.6875rem", color: "#6a7282", marginTop: 0, lineHeight: 1.4 }}>{tmpl.description}</p>
                    <button
                      onClick={() => !disabled && activateTemplate(tmpl)}
                      disabled={disabled}
                      style={{
                        marginTop: 8, padding: "4px 10px", borderRadius: 7, border: "none",
                        background: alreadyAdded ? "#e5e7eb" : isReady ? colors.color : "#e5e7eb",
                        color: disabled ? "#99a1af" : "#fff",
                        fontSize: "0.6875rem", fontWeight: 600,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}>
                      {alreadyAdded ? "Đã thêm" : isReady ? "Thêm agent này" : "Chưa sẵn sàng"}
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
                    {/* Show saved symbols */}
                    {(agent.target_symbols?.length ? agent.target_symbols : savedSym ? [savedSym] : []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {(agent.target_symbols?.length ? agent.target_symbols : [savedSym!]).map(s => (
                          <span key={s} style={{ padding: "2px 8px", borderRadius: 5, background: "rgba(99,102,241,0.09)", color: "#6366f1", fontSize: "0.625rem", fontWeight: 700, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <Clock style={{ width: 11, height: 11, color: "#99a1af" }} />
                  <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{formatSchedule(agent.schedule)}</span>
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
