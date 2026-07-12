import {
  Bot, Play, Pause, Clock, Zap,
  BarChart3, Mail, TrendingUp, Search, Globe, Plus,
  RefreshCw, AlertCircle, Inbox, Settings2, ArrowLeft,
  CheckCircle, Loader2, Database, Bell, ExternalLink, Trash2, AlertTriangle, X, // icons
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router";
import { supabase } from "../../lib/supabase/client";
import { BriefRenderer, type BriefOutput } from "../../components/BriefRenderer";
import { MdContent } from "../../components/MdContent";
import { activateAgentTemplate, READY_TEMPLATE_IDS, type UserAgent } from "../../lib/services/agent-templates";
import { NeedPortfolioModal } from "../../components/NeedPortfolioModal";
import { canCreateAgent } from "../../lib/plan-limits";
import { notifyWalletChanged } from "../../lib/wallet-events";
import { useIsMobile } from "../../components/ui/use-mobile";
import type { Theme } from "../../lib/theme-context";
import type { AppOutletContext } from "./page-wrappers";

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

// Một màu brand duy nhất cho mọi loại agent — nhận diện đến từ icon + tên, không phải
// một "cầu vồng" màu tùy tiện theo template (đồng bộ với bảng màu Wealbee dùng khắp app).
const TEMPLATE_COLOR = { bg: "rgba(8,73,172,0.08)", color: "#0849AC" };

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

const EVENT_LABEL: Record<string, string> = {
  volume_spike: "Khối lượng đột biến",
  insider_buy: "Nội bộ/lãnh đạo MUA",
  high_impact_news: "Tin tác động mạnh",
};
// Hiển thị điều kiện kích hoạt: ưu tiên trigger_type (event/scheduled) rồi mới tới schedule.
function formatTrigger(agent: UserAgent): string {
  if (agent.trigger_type === "event") {
    return `Sự kiện · ${EVENT_LABEL[agent.trigger_config?.event_type ?? ""] ?? "Theo sự kiện"}`;
  }
  if (agent.trigger_type === "scheduled") return formatSchedule(agent.schedule);
  return formatSchedule(agent.schedule); // agent cũ / thủ công
}

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

function StatusBadge({ status, theme: t, isDark }: { status: UserAgent["status"]; theme: Theme; isDark: boolean }) {
  const cfg = {
    active: { label: "Đang bật", color: "#34C759", bg: isDark ? "rgba(52,199,89,0.16)" : "rgba(52,199,89,0.12)" },
    paused: { label: "Tạm dừng", color: t.fgSubtle, bg: t.bgAccent },
    draft:  { label: "Bản nháp", color: t.fgSubtle, bg: t.bgAccent },
  };
  const c = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: "0.625rem", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, background: c.bg, color: c.color }}>
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

function SymbolPickerModal({ initialSymbols = [], onConfirm, onCancel, theme: t }: { initialSymbols?: string[]; onConfirm: (symbols: string[]) => void; onCancel: () => void; theme: Theme }) {
  const [input,       setInput]       = useState("");
  const [selected,    setSelected]    = useState<string[]>(initialSymbols.slice(0, 5));
  const [suggestions, setSuggestions] = useState<string[]>(VN30_FALLBACK);
  const [allTickers,  setAllTickers]  = useState<{ symbol: string; name: string }[]>([]);

  // Nạp mã + tên công ty để gợi ý khi gõ
  useEffect(() => {
    supabase.from("tickers").select("symbol,name").eq("is_active", true).order("symbol")
      .then(({ data }) => setAllTickers((data ?? []) as { symbol: string; name: string }[]));
  }, []);

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

  // Gợi ý theo tiền tố mã HOẶC tên công ty; ẩn mã đã chọn.
  // Xếp hạng khớp mã (chính xác/tiền tố) lên trước khớp chỉ theo tên công ty —
  // tránh việc gõ "VIC" bị các mã có tên công ty chứa "VIC" (vd: nhóm VICEM) chen lên trước.
  const symQuery = input.trim().toUpperCase();
  const rankTicker = (t: { symbol: string; name: string }) => {
    if (t.symbol === symQuery) return 0;
    if (t.symbol.startsWith(symQuery)) return 1;
    return 2; // chỉ khớp theo tên công ty
  };
  const tickerSuggestions = symQuery
    ? allTickers
        .filter(t => !selected.includes(t.symbol) &&
          (t.symbol.startsWith(symQuery) || (t.name ?? "").toUpperCase().includes(symQuery)))
        .sort((a, b) => rankTicker(a) - rankTicker(b) || a.symbol.localeCompare(b.symbol))
        .slice(0, 7)
    : [];

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: t.bgCard, boxShadow: "0 24px 80px rgba(0,0,0,0.35), 0 0 0 0.5px " + t.border, fontFamily: FONT }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "18px 22px", borderBottom: "0.5px solid " + t.border }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: t.fg }}>Chọn mã cổ phiếu để phân tích</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: t.fgSubtle }}>
              Chọn tối đa 5 mã · Deep Research sẽ phân tích từng mã một
            </p>
          </div>
          <button onClick={onCancel} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", color: t.fgSubtle, display: "flex", padding: 2, flexShrink: 0 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22 }}>
          {/* Selected chips */}
          {selected.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, padding: "10px 12px", background: t.bgAccent, borderRadius: 10, border: "1px solid " + t.border }}>
              {selected.map(s => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: t.brand, color: t.brandFg, fontSize: "0.8125rem", fontWeight: 700 }}>
                  {s}
                  <button onClick={() => toggle(s)} style={{ background: "none", border: "none", cursor: "pointer", color: t.brandFg, opacity: 0.8, padding: 0, display: "flex", alignItems: "center", fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              ))}
              <span style={{ fontSize: "0.6875rem", color: t.brand, alignSelf: "center", marginLeft: 4 }}>{selected.length}/5 mã</span>
            </div>
          )}

          {/* Input + gợi ý mã/tên công ty */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, position: "relative" }}>
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))}
              onKeyDown={e => {
                if (e.key === "Enter" && (tickerSuggestions[0] || input.trim())) addSymbol(tickerSuggestions[0]?.symbol ?? input);
                if (e.key === "Escape") onCancel();
              }}
              placeholder="Gõ mã hoặc tên công ty…"
              maxLength={20}
              style={{ flex: 1, padding: "9px 14px", borderRadius: 9, border: `1.5px solid ${tickerSuggestions.length ? t.brand : t.border}`, background: t.inputBg, fontSize: "0.875rem", fontWeight: 700, color: t.fg, fontFamily: FONT, outline: "none", letterSpacing: "0.05em" }}
            />
            <button
              onClick={() => addSymbol(tickerSuggestions[0]?.symbol ?? input)}
              disabled={(!tickerSuggestions[0] && !input.trim()) || selected.length >= 5}
              style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: (tickerSuggestions[0] || input.trim()) && selected.length < 5 ? t.brand : t.bgAccent, color: (tickerSuggestions[0] || input.trim()) && selected.length < 5 ? t.brandFg : t.fgDisabled, cursor: "pointer", fontWeight: 700, fontFamily: FONT, fontSize: "0.8125rem" }}
            >
              Thêm
            </button>
            {tickerSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: t.bgCard, border: "1px solid " + t.border, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.20)", overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
                {tickerSuggestions.map(tk => (
                  <div key={tk.symbol} onMouseDown={e => { e.preventDefault(); addSymbol(tk.symbol); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid " + t.border }}
                    onMouseEnter={e => (e.currentTarget.style.background = t.bgAccent)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: t.brand, minWidth: 46, flexShrink: 0 }}>{tk.symbol}</span>
                    <span style={{ fontSize: "0.75rem", color: t.fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick-pick grid */}
          <p style={{ margin: "0 0 8px", fontSize: "0.6875rem", fontWeight: 700, color: t.fgSubtle, textTransform: "uppercase", letterSpacing: "0.06em" }}>Hoặc chọn nhanh:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
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
                    border: sel ? "1.5px solid " + t.brand : "1px solid " + t.border,
                    background: sel ? t.bgAccentStrong : "transparent",
                    color: sel ? t.brand : disabled ? t.fgDisabled : t.brand,
                    fontSize: "0.6875rem", fontWeight: sel ? 700 : 500, fontFamily: FONT,
                    transition: "all 100ms",
                  }}
                >
                  {sel && "✓ "}{s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "0.5px solid " + t.border }}>
          <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid " + t.borderStrong, background: "transparent", color: t.fgSubtle, cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: FONT }}>Hủy</button>
          <button
            onClick={() => selected.length > 0 && onConfirm(selected)}
            disabled={selected.length === 0}
            style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: selected.length > 0 ? t.brand : t.bgAccent, color: selected.length > 0 ? t.brandFg : t.fgDisabled, cursor: selected.length > 0 ? "pointer" : "not-allowed", fontSize: "0.8125rem", fontWeight: 700, fontFamily: FONT }}
          >
            {selected.length === 0 ? "Chọn ít nhất 1 mã" : `Phân tích ${selected.length} mã: ${selected.join(", ")}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Run Panel ────────────────────────────────────────────────────────────────

function RunPanel({ panel, onClose, onInbox, onViewTicker, theme: t, isDark }: {
  panel: RunPanelState;
  onClose: () => void;
  onInbox: () => void;
  onViewTicker?: (sym: string) => void;
  theme: Theme;
  isDark: boolean;
}) {
  const outputRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Auto-scroll output while streaming
  useEffect(() => {
    if (!panel.done && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [panel.output, panel.done]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: t.bgMuted }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: t.bgCard, borderBottom: "1px solid " + t.border, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid " + t.borderStrong, background: "transparent", color: t.fgSubtle, cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
          <ArrowLeft style={{ width: 13, height: 13 }} />Quay lại
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: t.fg }}>{panel.agentName}</span>
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
            <button onClick={onInbox} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: t.brand, color: t.brandFg, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>
              <Inbox style={{ width: 13, height: 13 }} />Xem trong Inbox
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, overflow: "hidden", gap: 0 }}>
        {/* Steps sidebar — mobile: dải ngang phía trên output thay vì cột 240px */}
        <div style={isMobile
          ? { flexShrink: 0, maxHeight: 150, borderBottom: "1px solid " + t.border, background: t.bgCard, padding: "12px 16px", overflowY: "auto" }
          : { width: 240, flexShrink: 0, borderRight: "1px solid " + t.border, background: t.bgCard, padding: "20px 16px", overflowY: "auto" }}>
          <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: t.fgSubtle, letterSpacing: "0.06em", marginBottom: 14 }}>TIẾN TRÌNH</p>
          {panel.steps.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 style={{ width: 14, height: 14, color: t.brand, animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.75rem", color: t.fgSubtle }}>Đang khởi động…</span>
            </div>
          )}
          {panel.steps.map(s => {
            const Icon = STEP_ICONS[s.step] ?? Zap;
            return (
              <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, opacity: s.status === "pending" ? 0.4 : 1 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: s.status === "done" ? "rgba(16,185,129,0.1)" : s.status === "loading" ? t.bgAccent : s.status === "error" ? "rgba(239,68,68,0.1)" : t.bgAccent }}>
                  {s.status === "loading" && <Loader2 style={{ width: 13, height: 13, color: t.brand, animation: "spin 1s linear infinite" }} />}
                  {s.status === "done"    && <CheckCircle style={{ width: 13, height: 13, color: "#10b981" }} />}
                  {s.status === "error"   && <AlertCircle style={{ width: 13, height: 13, color: "#ef4444" }} />}
                  {s.status === "pending" && <Icon style={{ width: 13, height: 13, color: t.fgSubtle }} />}
                </div>
                <span style={{ fontSize: "0.75rem", color: s.status === "done" ? "#10b981" : s.status === "loading" ? t.brand : s.status === "error" ? "#ef4444" : t.fgSubtle, fontWeight: s.status === "loading" ? 700 : 500, lineHeight: 1.3 }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Output area */}
        <div ref={outputRef} style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {panel.error ? (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>Đã xảy ra lỗi</p>
              <p style={{ fontSize: "0.8125rem", color: t.fgMuted, fontFamily: "monospace" }}>{panel.error}</p>
            </div>
          ) : (
            <>
              {/* Daily Market Digest → BriefRenderer */}
              {panel.done && panel.brief && (
                <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <BriefRenderer brief={panel.brief} isDark={isDark} />
                </div>
              )}

              {/* Other agents → streaming markdown */}
              {(!panel.brief) && panel.output && (
                <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "22px 26px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <MdContent text={panel.output} refs={panel.refs} />
                  {!panel.done && (
                    <span style={{ display: "inline-block", width: 2, height: "1em", background: t.brand, animation: "blink 1s step-start infinite", verticalAlign: "text-bottom", marginLeft: 2 }} />
                  )}
                </div>
              )}

              {!panel.brief && !panel.output && !panel.done && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.fgSubtle, padding: "20px 0" }}>
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
  const [symbolPicker, setSymbolPicker] = useState<{ agentId: string; symbols: string[] } | null>(null);
  const [needPortfolio, setNeedPortfolio] = useState(false);
  const [runPanel, setRunPanel] = useState<RunPanelState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserAgent | null>(null);
  const navigate = useNavigate();
  const { openCreateAgentModal, theme: t, isDark } = useOutletContext<AppOutletContext>();

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
    // Giới hạn số agent theo gói (free 2 · pro 5 · premium 15)
    const lim = await canCreateAgent(userId);
    if (!lim.ok) {
      alert(`Gói ${lim.plan.toUpperCase()} chỉ tạo được tối đa ${lim.limit} agent (bạn đang có ${lim.count}). Nâng cấp gói để tạo thêm.`);
      return;
    }
    const result = await activateAgentTemplate(userId, tmpl);
    if (result.status === "needs_portfolio") { setNeedPortfolio(true); return; }
    setAgents(prev => [...prev, result.agent]);
    setShowTemplates(false);
  };

  const toggleAgent = async (agent: UserAgent) => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    await supabase.from("agents").update({ status: newStatus }).eq("id", agent.id);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
  };

  const deleteAgent = async (agentId: string) => {
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

    // ĐỒNG NHẤT mọi agent: không ép chọn mã theo template. Mã lấy từ cấu hình agent
    // ("Mã quan tâm" đã lưu); nếu trống → brain tự xử theo prompt. Khác biệt giữa các
    // agent CHỈ là prompt + tùy biến.
    const syms = targetSymbols?.length ? targetSymbols : savedSymbols.length ? savedSymbols : undefined;
    const displaySym = syms?.join(", ");

    setRunPanel({
      agentId: agent.id, agentName: agent.name, templateId: agent.template_id, steps: [], output: "", done: false,
      targetSymbol: syms?.[0], targetSymbols: syms,
    });

    // Bộ khung tư duy Wealbee (đã tích hợp KG) — edge function run-agent, stream SSE.
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
            notifyWalletChanged();  // Beeny vừa bị trừ → refresh sidebar
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
        theme={t}
        isDark={isDark}
      />
    );
  }

  const activeCount = agents.filter(a => a.status === "active").length;

  if (!userId && !loading) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <Bot style={{ width: 40, height: 40, color: t.fgDisabled, marginBottom: 12 }} />
        <p style={{ fontSize: "0.875rem", color: t.fg, fontWeight: 600 }}>Vui lòng đăng nhập để dùng Agents</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {symbolPicker && (
        <SymbolPickerModal
          initialSymbols={symbolPicker.symbols}
          onConfirm={(symbols) => {
            const agent = agents.find(a => a.id === symbolPicker.agentId);
            setSymbolPicker(null);
            if (agent) runAgent(agent, symbols);
          }}
          onCancel={() => setSymbolPicker(null)}
          theme={t}
        />
      )}

      {needPortfolio && <NeedPortfolioModal onDismiss={() => setNeedPortfolio(false)} />}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: t.bgCard, boxShadow: "0 24px 80px rgba(0,0,0,0.35), 0 0 0 0.5px " + t.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 22px", borderBottom: "0.5px solid " + t.border }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,57,49,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle style={{ width: 16, height: 16, color: "#FF3B30" }} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: t.fg, flex: 1 }}>Xóa agent</span>
              <button onClick={() => setConfirmDelete(null)} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", color: t.fgSubtle, display: "flex", padding: 2 }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div style={{ padding: 22, fontSize: 13.5, color: t.fgMuted, lineHeight: 1.6 }}>
              Xóa agent <strong style={{ color: t.fg }}>{confirmDelete.name}</strong>?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "0.5px solid " + t.border }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid " + t.borderStrong, background: "transparent", color: t.fgSubtle, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Hủy
              </button>
              <button onClick={() => { deleteAgent(confirmDelete.id); setConfirmDelete(null); }}
                style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#FF3B30", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Xóa agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: t.fg }}>Agents</h1>
          <p style={{ fontSize: "0.8125rem", color: t.fgSubtle, marginTop: 4 }}>
            {activeCount} agent đang bật · {agents.length} tổng cộng
          </p>
        </div>
        <button onClick={openCreateAgentModal}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", background: t.brand, color: t.brandFg, cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
          <Plus style={{ width: 15, height: 15 }} />Tạo Agent
        </button>
      </div>

      {/* Template picker */}
      {showTemplates && (
        <div style={{ background: t.bgAccent, border: "1px solid " + t.border, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 700, color: t.fg, marginBottom: 14 }}>Chọn template agent</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {templates.map(tmpl => {
              const Icon = ICON_MAP[tmpl.icon] || Bot;
              const colors = TEMPLATE_COLOR;
              const alreadyAdded = agents.some(a => a.template_id === tmpl.id);
              const isReady = READY_TEMPLATE_IDS.includes(tmpl.id);
              const disabled = alreadyAdded || !isReady;
              return (
                <div key={tmpl.id} style={{
                  background: t.bgCard, borderRadius: 12, padding: "14px 16px",
                  display: "flex", gap: 12, alignItems: "flex-start",
                  border: `1px solid ${isReady ? t.border : t.borderStrong}`,
                  opacity: isReady ? 1 : 0.5,
                  filter: isReady ? "none" : "grayscale(60%)",
                  position: "relative",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color: colors.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: isReady ? t.fg : t.fgSubtle }}>{tmpl.name}</p>
                      {!isReady && (
                        <span style={{ fontSize: "0.5625rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: t.bgAccentStrong, color: t.fgSubtle, letterSpacing: "0.03em" }}>
                          Sắp ra mắt
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "0.6875rem", color: t.fgSubtle, marginTop: 0, lineHeight: 1.4 }}>{tmpl.description}</p>
                    <button
                      onClick={() => !disabled && activateTemplate(tmpl)}
                      disabled={disabled}
                      style={{
                        marginTop: 8, padding: "4px 10px", borderRadius: 7, border: "none",
                        background: alreadyAdded ? t.bgAccentStrong : isReady ? colors.color : t.bgAccentStrong,
                        color: disabled ? t.fgDisabled : "#fff",
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
          <RefreshCw style={{ width: 24, height: 24, color: t.fgSubtle, animation: "spin 1s linear infinite", margin: "0 auto" }} />
          <p style={{ fontSize: "0.8125rem", color: t.fgSubtle, marginTop: 10 }}>Đang tải…</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
          {agents.map(agent => {
            const colors = TEMPLATE_COLOR;
            const tmpl   = templates.find(tp => tp.id === agent.template_id);
            const Icon   = ICON_MAP[tmpl?.icon ?? "bot"] || Bot;
            const firstLine = agent.system_prompt?.split("\n")[0] ?? "";
            const savedSym  = firstLine.startsWith(SYM_PREFIX) ? firstLine.slice(SYM_PREFIX.length).trim() : null;

            return (
              <div key={agent.id} style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "18px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 18, height: 18, color: colors.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h3 style={{ flex: "1 1 auto", minWidth: 0, fontSize: "0.9375rem", fontWeight: 700, color: t.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.name}</h3>
                      <div style={{ flexShrink: 0 }}><StatusBadge status={agent.status} theme={t} isDark={isDark} /></div>
                    </div>
                    <p style={{
                      fontSize: "0.75rem", color: t.fgSubtle, marginTop: 4, lineHeight: 1.4,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{agent.description}</p>
                    {/* Show saved symbols */}
                    {(agent.target_symbols?.length ? agent.target_symbols : savedSym ? [savedSym] : []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {(agent.target_symbols?.length ? agent.target_symbols : [savedSym!]).map(s => (
                          <span key={s} style={{ padding: "2px 8px", borderRadius: 5, background: t.bgAccent, color: t.brand, fontSize: "0.625rem", fontWeight: 700, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 14 }}>
                  <Clock style={{ width: 11, height: 11, color: t.fgSubtle }} />
                  <span style={{ fontSize: "0.6875rem", color: t.fgSubtle }}>{formatTrigger(agent)}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      // CHỈ agent THỦ CÔNG phân tích theo mã (vd Deep Research) mới hỏi/đổi mã trước khi chạy.
                      // Agent theo lịch / theo sự kiện → tự kích hoạt theo mã đã cấu hình, chạy thẳng.
                      const saved = agent.target_symbols?.length ? agent.target_symbols : savedSym ? [savedSym] : [];
                      const isManual = !agent.trigger_type || agent.trigger_type === "manual";
                      const symbolBased = agent.template_id === "deep_research" || saved.length > 0;
                      if (isManual && symbolBased) {
                        setSymbolPicker({ agentId: agent.id, symbols: saved });
                      } else {
                        runAgent(agent);
                      }
                    }}
                    disabled={!!runPanel}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", background: colors.color, color: "#fff", cursor: runPanel ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit", opacity: runPanel ? 0.5 : 1 }}>
                    <Play style={{ width: 11, height: 11 }} />Chạy ngay
                  </button>
                  <button onClick={() => toggleAgent(agent)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid " + t.borderStrong, background: "transparent", color: t.fgSubtle, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>
                    {agent.status === "active" ? <><Pause style={{ width: 11, height: 11 }} />Tạm dừng</> : <><Play style={{ width: 11, height: 11 }} />Bật lại</>}
                  </button>
                  <button onClick={() => navigate(`/app/agent-studio?agent_id=${agent.id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: "1px solid " + t.borderStrong, background: "transparent", color: t.fgSubtle, cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                    <Settings2 style={{ width: 11, height: 11 }} />Sửa
                  </button>
                  <button onClick={() => setConfirmDelete(agent)} aria-label="Xóa agent" title="Xóa agent"
                    style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, padding: 0, borderRadius: 8, border: "1px solid rgba(255,57,49,0.15)", background: "transparent", color: "#FF3B30", cursor: "pointer" }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            );
          })}

          <div onClick={() => navigate("/app/templates")}
            style={{ background: "transparent", border: "2px dashed " + t.borderStrong, borderRadius: 14, padding: "18px 18px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 180 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: t.bgAccent, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                <Plus style={{ width: 18, height: 18, color: t.brand }} />
              </div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: t.brand }}>Thêm Agent mẫu</p>
              <p style={{ fontSize: "0.75rem", color: t.fgSubtle, marginTop: 4 }}>Chọn từ các Agent mẫu có sẵn</p>
            </div>
          </div>
        </div>
      )}

      {agents.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "20px 0 0" }}>
          <p style={{ fontSize: "0.8125rem", color: t.fgSubtle }}>Chưa có agent nào. Nhấn "Thêm Agent mẫu" để chọn template, hoặc "Tạo Agent" để tự thiết lập.</p>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
