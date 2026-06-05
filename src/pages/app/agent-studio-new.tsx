import { useState, useRef, useEffect } from "react";
import {
  ChevronLeft, Bot, Save, Play, Sparkles, ChevronDown, ChevronUp,
  Check, X, Plus, FileText, Wrench, BookOpen, TrendingUp,
  Zap, Clock, CheckCircle2, AlertTriangle, Eye,
  Lightbulb, Mail, Inbox, Info, Settings,
} from "lucide-react";
import { BriefRenderer, type BriefOutput } from "../../components/BriefRenderer";
import { MdContent } from "../../components/MdContent";
import { supabase } from "../../lib/supabase/client";
import { projectId } from "../../utils/supabase/info";

interface StudioProps {
  onBack: () => void;
  agentId?: string;
  isDark?: boolean;
}

// ── Models ─────────────────────────────────────────────────────────────────
const MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", badge: "Nhanh", badgeColor: "#34C759", desc: "Phản hồi nhanh, chi phí thấp" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", badge: "Mạnh", badgeColor: "#0849AC", desc: "Phân tích sâu, đa phương thức" },
  { id: "claude-sonnet", name: "Claude Sonnet 4", provider: "Anthropic", badge: "Cân bằng", badgeColor: "#7c3aed", desc: "Lý luận tốt, ngữ cảnh dài" },
  { id: "claude-opus", name: "Claude Opus 4", provider: "Anthropic", badge: "Nâng cao", badgeColor: "#FF9500", desc: "Phân tích phức tạp nhất" },
  { id: "gemini-pro", name: "Gemini 1.5 Pro", provider: "Google", badge: "Ngữ cảnh dài", badgeColor: "#6366F1", desc: "Context 1M tokens" },
  { id: "gemini-flash", name: "Gemini 2.0 Flash", provider: "Google", badge: "Nhanh", badgeColor: "#34C759", desc: "Tốc độ cao, chi phí thấp" },
];

// ── Knowledge base mock ─────────────────────────────────────────────────────
const KB_FILES = [
  { id: "kb1", name: "BCTC Q1 2026 - HPG.pdf", type: "pdf", size: "2.3 MB" },
  { id: "kb2", name: "Phân tích ngành thép VN 2026.md", type: "md", size: "45 KB" },
  { id: "kb3", name: "UBCK - Thông tư 96 hướng dẫn.pdf", type: "pdf", size: "1.1 MB" },
  { id: "kb4", name: "Portfolio strategy Q2 2026.txt", type: "txt", size: "12 KB" },
];

// ── Tools ───────────────────────────────────────────────────────────────────
const TOOLS = [
  { id: "price", name: "Giá realtime", icon: TrendingUp },
  { id: "index", name: "Chỉ số", icon: TrendingUp },
  { id: "movers", name: "Top tăng/giảm", icon: Zap },
  { id: "insider", name: "Giao dịch nội bộ", icon: Eye },
  { id: "financials", name: "BCTC", icon: FileText },
  { id: "pe", name: "P/E & P/B", icon: Wrench },
  { id: "news", name: "Tin tức", icon: BookOpen },
  { id: "macro", name: "Vĩ mô", icon: TrendingUp },
  { id: "rsi", name: "RSI", icon: TrendingUp },
  { id: "macd", name: "MACD", icon: TrendingUp },
];

// ── Default prompt — đồng bộ với DEFAULT_USER_PROMPT trong generate-brief.ts ──
const DEFAULT_PROMPT = `Tôi muốn xem bản tin hàng ngày về danh mục của tôi theo thứ tự sau:

1. Đầu tiên cho tôi biết danh mục hôm nay: mã nào có tin tức, mã nào không có tin gì cả.

2. Nếu có bài báo ảnh hưởng đến từ 2 mã trở lên trong danh mục của tôi, hãy gom lại thành nhóm riêng. Đặt tiêu đề nhóm là "Tin ảnh hưởng nhiều cổ phiếu", rồi mỗi bài một card tin tức. Trong card đó nhớ hiển thị các mã cổ phiếu liên quan.

3. Sau đó, với từng mã có tin, tạo một tiêu đề là tên mã (ví dụ "VHM"), rồi liệt kê các tin của mã đó, mỗi tin một card. Những tin đã hiển thị ở nhóm trên thì không cần hiển thị lại.

4. Cuối cùng thêm dòng disclaimer pháp lý theo quy định.`;

// ── Watchlist suggestions ───────────────────────────────────────────────────
const POPULAR_STOCKS = ["VCB", "HPG", "FPT", "VIC", "TCB", "ACB", "MWG", "VNM", "MSN", "STB"];


// ══════════════════════════════════════════════════════════════════════════════
export function AgentStudio({ onBack, agentId, isDark = false }: StudioProps) {
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.55)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgApp = isDark ? "#0B0D18" : "#F5F5F7";
  const bgPanel = isDark ? "#131824" : "#fff";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const bgFaint = isDark ? "#FAFAFA11" : "#FAFAFA";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)";
  const dividerFaint = isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.08)";
  const inputBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.18)";
  const [agentName, setAgentName] = useState("Bản tin hàng ngày");
  const [templateId, setTemplateId] = useState("daily_digest");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet");
  const [selectedKB, setSelectedKB] = useState<Set<string>>(new Set(["kb1", "kb2"]));
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set(["price", "index", "movers", "news", "rsi"]));
  const [usePortfolio, setUsePortfolio] = useState(true);
  const [watchlist, setWatchlist] = useState<string[]>(["VCB", "HPG", "FPT", "MWG", "VNM"]);
  const [stockInput, setStockInput] = useState("");


  // Collapsible sections (middle)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["model", "tools", "watchlist"]));

  // Test run
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<BriefOutput | null>(null);
  const [runResultText, setRunResultText] = useState<string | null>(null);
  const [runResultRefs, setRunResultRefs] = useState<Array<{ index: number; label: string; url: string }>>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [runTime, setRunTime] = useState<number>(0);
  const [runTokens, setRunTokens] = useState<number>(0);

  // Save
  const [isSaved, setIsSaved] = useState(false);

  // Schedule & notification state
  const [runMode, setRunMode] = useState<"realtime" | "scheduled">("scheduled");
  const [frequency, setFrequency] = useState<"daily" | "weekdays" | "weekly" | "custom">("daily");
  const [scheduleTime, setScheduleTime] = useState("09:15");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4])); // T2–T6
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyZalo, setNotifyZalo] = useState(false);

  const toggleDay = (d: number) => {
    if (frequency === "weekly") {
      setSelectedDays(new Set([d]));
    } else {
      setSelectedDays((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleKB = (id: string) =>
    setSelectedKB((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleTool = (id: string) =>
    setSelectedTools((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addStock = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (s && !watchlist.includes(s)) setWatchlist((p) => [...p, s]);
    setStockInput("");
  };

  const handleRunTest = async () => {
    setIsRunning(true);
    setRunResult(null);
    setRunResultText(null);
    setRunResultRefs([]);
    setRunError(null);
    const start = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token ?? "";
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/agent-dry-run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            templateId,
            systemPrompt: prompt,
            watchSymbols: watchlist.length ? watchlist : undefined,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (templateId === "daily_digest") {
        setRunResult(json.brief as BriefOutput);
      } else {
        setRunResultText(json.output as string);
        if (json.refs) setRunResultRefs(json.refs);
      }
      setRunTokens(json.tokensUsed ?? 0);
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunTime(Math.round((Date.now() - start) / 100) / 10);
      setIsRunning(false);
    }
  };

  // Load agent data on mount if editing existing agent
  useEffect(() => {
    if (!agentId) return;
    supabase.from("agents").select("*").eq("id", agentId).single().then(({ data }) => {
      if (!data) return;
      if (data.name) setAgentName(data.name === "Bản tin buổi sáng" ? "Bản tin hàng ngày" : data.name);
      if (data.template_id) setTemplateId(data.template_id);
      // For deep_research agents, always load the system_prompt as-is
      const isDeepResearch = data.template_id === "deep_research";
      // Reset old daily_digest template-style system prompt
      const isOldSystemPrompt = !isDeepResearch && (data.system_prompt?.startsWith("Bạn là chuyên gia") || data.system_prompt?.startsWith("Bạn là AI"));
      if (data.system_prompt && !isOldSystemPrompt) setPrompt(data.system_prompt);
      if (data.model) setSelectedModel(data.model);
      if (data.tools?.length) setSelectedTools(new Set(data.tools));
      if (data.target_symbols?.length) setWatchlist(data.target_symbols);
      if (data.email_notify != null) setNotifyEmail(data.email_notify);
      if (data.schedule && data.schedule !== "manual") {
        const parts = data.schedule.split(":");
        if (parts[0] === "realtime") { setRunMode("realtime"); }
        else if (parts.length >= 2) { setRunMode("scheduled"); setScheduleTime(parts.slice(1).join(":")); }
      }
    });
  }, [agentId]);

  const handleSave = async () => {
    setIsSaved(true);
    const schedule = runMode === "realtime" ? "realtime" : `daily:${scheduleTime}`;
    const payload = {
      name: agentName,
      system_prompt: prompt,
      model: selectedModel,
      tools: [...selectedTools],
      target_symbols: watchlist,
      email_notify: notifyEmail,
      schedule,
      status: "active",
      updated_at: new Date().toISOString(),
    };
    try {
      if (agentId) {
        await supabase.from("agents").update(payload).eq("id", agentId);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("agents").insert({ ...payload, user_id: user!.id, template_id: "daily_digest" });
      }
    } catch { /* ignore — UI already shows saved */ }
    setTimeout(() => onBack(), 1200);
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Montserrat', system-ui, sans-serif", background: bgApp }}>

      {/* ── Top bar ── */}
      <div style={{ height: 52, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "0.5px solid " + divider, background: bgPanel, flexShrink: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: fgMuted, fontSize: 13, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          <ChevronLeft size={16} strokeWidth={1.5} /> Agents
        </button>
        <span style={{ color: isDark ? "rgba(255,255,255,0.20)" : "rgba(26,26,46,0.20)" }}>/</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={16} color={brand} strokeWidth={1.5} />
        </div>
        <input
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          style={{ border: "none", outline: "none", fontSize: 15, fontWeight: 700, color: fg, background: "transparent", fontFamily: "'Montserrat', system-ui, sans-serif", minWidth: 200 }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: fgDisabled }}>
          {selectedTools.size} tools · {selectedKB.size} KB files · {watchlist.length} mã
        </span>
        <button
          onClick={handleRunTest}
          disabled={isRunning}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)"), background: bgPanel, color: brand, fontSize: 13, fontWeight: 600, cursor: isRunning ? "not-allowed" : "pointer", fontFamily: "'Montserrat', system-ui, sans-serif", opacity: isRunning ? 0.6 : 1 }}>
          <Play size={13} strokeWidth={1.5} /> {isRunning ? "Đang chạy..." : "Chạy thử"}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaved}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: !isSaved ? brand : isDark ? "rgba(77,143,232,0.20)" : "rgba(8,73,172,0.20)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: !isSaved ? "pointer" : "not-allowed", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {isSaved ? <><CheckCircle2 size={13} strokeWidth={2} /> Đã lưu!</> : <><Save size={13} strokeWidth={1.5} /> Lưu Agent</>}
        </button>
      </div>

      {/* ── 3-column body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ════════════════════════════════════════
            LEFT — Prompt Editor
        ════════════════════════════════════════ */}
        <div style={{ width: 320, flexShrink: 0, borderRight: "0.5px solid " + divider, background: bgPanel, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px 10px", borderBottom: "0.5px solid " + divider, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: fg, letterSpacing: "0.04em" }}>USER PROMPT</div>
            <div style={{ fontSize: 11, color: fgDisabled, marginTop: 1 }}>{prompt.length} ký tự · gửi thẳng vào agent-dry-run khi chạy thử</div>
          </div>

          {/* Prompt textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{
              flex: 1, border: "none", outline: "none", resize: "none", padding: "14px 16px",
              fontSize: 12, lineHeight: 1.7, color: fg, background: bgPanel,
              fontFamily: "'Montserrat', system-ui, sans-serif",
            }}
          />

          {/* Prompt format guide */}
          <div style={{ padding: "8px 14px", borderTop: "0.5px solid " + dividerFaint, background: bgFaint, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: fgDisabled, lineHeight: 1.6, display: "flex", alignItems: "center", gap: 5 }}>
              <Lightbulb size={10} strokeWidth={1.5} color={fgDisabled} />
              Cấu trúc tốt: <strong>Vai trò · Nhiệm vụ · Định dạng · Ràng buộc</strong>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            MIDDLE — Configuration
        ════════════════════════════════════════ */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 80px", background: bgApp, minWidth: 0 }}>

          {/* ── Model selection ── */}
          <Section
            id="model" label="Model LLM" icon={<Sparkles size={14} strokeWidth={1.5} color={brand} />}
            open={openSections.has("model")} onToggle={() => toggleSection("model")}
            isDark={isDark}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {MODELS.map((m) => {
                const sel = selectedModel === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    style={{
                      padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      border: sel ? "1.5px solid " + brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.09)" : "rgba(8,73,172,0.12)"),
                      background: sel ? (isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.04)") : bgPanel,
                      transition: "all 120ms ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>{m.name}</span>
                      {sel && <Check size={13} color={brand} strokeWidth={2.5} />}
                    </div>
                    <div style={{ fontSize: 10, color: fgSubtle, marginBottom: 4 }}>{m.provider}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: `${m.badgeColor}18`, color: m.badgeColor }}>{m.badge}</span>
                      <span style={{ fontSize: 10, color: fgDisabled }}>{m.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── Knowledge base ── */}
          <Section
            id="kb" label="Knowledge Base" icon={<BookOpen size={14} strokeWidth={1.5} color={brand} />}
            open={openSections.has("kb")} onToggle={() => toggleSection("kb")}
            badge={selectedKB.size > 0 ? `${selectedKB.size} file` : undefined}
            isDark={isDark}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {KB_FILES.map((f) => {
                const sel = selectedKB.has(f.id);
                const typeColor = f.type === "pdf" ? "#FF3B30" : f.type === "md" ? "#6366F1" : brand;
                return (
                  <div
                    key={f.id}
                    onClick={() => toggleKB(f.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, cursor: "pointer", border: sel ? "1px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.20)") : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)"), background: sel ? (isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.03)") : bgPanel, transition: "all 100ms" }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: sel ? "none" : "1.5px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)"), background: sel ? brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {sel && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: fg, fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: fgDisabled, flexShrink: 0 }}>{f.size}</span>
                  </div>
                );
              })}
              <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "0.5px dashed " + (isDark ? "rgba(77,143,232,0.25)" : "rgba(8,73,172,0.25)"), background: "transparent", color: brand, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                <Plus size={13} strokeWidth={2} /> Upload file mới
              </button>
            </div>
          </Section>

          {/* ── Tools ── */}
          <Section
            id="tools" label="Công cụ phân tích" icon={<Wrench size={14} strokeWidth={1.5} color={brand} />}
            open={openSections.has("tools")} onToggle={() => toggleSection("tools")}
            badge={selectedTools.size > 0 ? `${selectedTools.size}/${TOOLS.length}` : undefined}
            isDark={isDark}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {TOOLS.map((t) => {
                const Icon = t.icon;
                const sel = selectedTools.has(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTool(t.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: sel
                        ? `1px solid ${isDark ? "rgba(77,143,232,0.35)" : "rgba(8,73,172,0.25)"}`
                        : "0.5px solid " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)"),
                      background: sel
                        ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)")
                        : bgPanel,
                      transition: "all 100ms",
                    }}
                  >
                    <Icon size={12} color={sel ? brand : fgDisabled} strokeWidth={1.5} />
                    <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: sel ? brand : fgMuted }}>{t.name}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── Watchlist ── */}
          <Section
            id="watchlist" label="Theo dõi thị trường" icon={<TrendingUp size={14} strokeWidth={1.5} color={brand} />}
            open={openSections.has("watchlist")} onToggle={() => toggleSection("watchlist")}
            badge={`${watchlist.length} mã`}
            isDark={isDark}
          >
            {/* Portfolio toggle */}
            <div
              onClick={() => setUsePortfolio((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, cursor: "pointer", border: usePortfolio ? "1px solid rgba(52,199,89,0.30)" : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)"), background: usePortfolio ? "rgba(52,199,89,0.05)" : bgPanel, marginBottom: 10, transition: "all 120ms" }}
            >
              <div style={{ width: 18, height: 18, borderRadius: 5, border: usePortfolio ? "none" : "1.5px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)"), background: usePortfolio ? "#34C759" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {usePortfolio && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: fg }}>Kết nối danh mục hiện tại</div>
                <div style={{ fontSize: 11, color: fgSubtle }}>VCB · HPG · FPT · MWG · VNM (5 mã)</div>
              </div>
            </div>

            {/* Manual watchlist */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: fgDisabled, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Hoặc thêm mã theo dõi</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  value={stockInput}
                  onChange={(e) => setStockInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && addStock(stockInput)}
                  placeholder="VD: HPG, VCB..."
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "0.5px solid " + inputBorder, background: bgPanel, fontSize: 12, outline: "none", fontFamily: "'Montserrat', system-ui, sans-serif", color: fg }}
                />
                <button
                  onClick={() => addStock(stockInput)}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: brand, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif" }}
                >
                  <Plus size={13} strokeWidth={2.5} />
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {watchlist.map((sym) => (
                  <span key={sym} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 10px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)", fontSize: 12, fontWeight: 700, color: brand }}>
                    {sym}
                    <button onClick={() => setWatchlist((p) => p.filter((s) => s !== sym))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: isDark ? "rgba(77,143,232,0.55)" : "rgba(8,73,172,0.50)" }}>
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
                {POPULAR_STOCKS.filter((s) => !watchlist.includes(s)).slice(0, 5).map((s) => (
                  <span
                    key={s}
                    onClick={() => setWatchlist((p) => [...p, s])}
                    style={{ padding: "3px 8px", borderRadius: 99, border: "0.5px dashed " + (isDark ? "rgba(77,143,232,0.25)" : "rgba(8,73,172,0.25)"), fontSize: 12, color: fgSubtle, cursor: "pointer" }}
                  >
                    + {s}
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Schedule & Notifications ── */}
          <Section
            id="trigger" label="Lịch chạy & Thông báo" icon={<Clock size={14} strokeWidth={1.5} color={brand} />}
            open={openSections.has("trigger")} onToggle={() => toggleSection("trigger")}
            badge={runMode === "realtime" ? "Realtime" : frequency === "daily" ? "Hàng ngày" : frequency === "weekdays" ? "Ngày giao dịch" : frequency === "weekly" ? "Hàng tuần" : `${selectedDays.size} ngày/tuần`}
            isDark={isDark}
          >
            {/* ── Run mode toggle ── */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {([
                { id: "realtime" as const, icon: <Zap size={13} strokeWidth={1.5} />, label: "Realtime", desc: "Chạy ngay khi có tín hiệu" },
                { id: "scheduled" as const, icon: <Clock size={13} strokeWidth={1.5} />, label: "Theo lịch", desc: "Chạy theo giờ định sẵn" },
              ]).map((m) => (
                <div
                  key={m.id}
                  onClick={() => setRunMode(m.id)}
                  style={{
                    flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                    border: runMode === m.id ? "1.5px solid " + brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.09)" : "rgba(8,73,172,0.12)"),
                    background: runMode === m.id ? (isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.05)") : bgPanel,
                    transition: "all 120ms ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: 700, color: runMode === m.id ? brand : fg, marginBottom: 2 }}>
                    <span style={{ color: runMode === m.id ? brand : fgDisabled }}>{m.icon}</span>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 10, color: fgSubtle, lineHeight: 1.4 }}>{m.desc}</div>
                </div>
              ))}
            </div>

            {/* ── Frequency + time (only when scheduled) ── */}
            {runMode === "scheduled" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Tần suất phân tích</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {([
                    { id: "daily", label: "Mỗi ngày" },
                    { id: "weekdays", label: "Ngày GD" },
                    { id: "weekly", label: "Hàng tuần" },
                    { id: "custom", label: "Tùy chọn" },
                  ] as const).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setFrequency(f.id);
                        if (f.id === "weekly") setSelectedDays(new Set([0]));
                        if (f.id === "daily" || f.id === "weekdays") setSelectedDays(new Set([0, 1, 2, 3, 4]));
                      }}
                      style={{
                        flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: frequency === f.id ? brand : isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)",
                        color: frequency === f.id ? "#fff" : fgMuted,
                        fontSize: 11, fontWeight: frequency === f.id ? 700 : 500,
                        fontFamily: "'Montserrat', system-ui, sans-serif",
                        transition: "all 100ms ease",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Day of week picker (weekly / custom) */}
                {(frequency === "weekly" || frequency === "custom") && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Ngày trong tuần</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d, i) => {
                        const isWeekend = i >= 5;
                        const sel = selectedDays.has(i);
                        return (
                          <button
                            key={d}
                            onClick={() => toggleDay(i)}
                            style={{
                              flex: 1, aspectRatio: "1", borderRadius: 8, border: "none", cursor: "pointer",
                              background: sel ? (isWeekend ? "#FF9500" : brand) : isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)",
                              color: sel ? "#fff" : isWeekend ? "#FF9500" : fgMuted,
                              fontSize: 11, fontWeight: sel ? 700 : 500,
                              fontFamily: "'Montserrat', system-ui, sans-serif",
                              transition: "all 100ms ease",
                              padding: "7px 0",
                            }}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: fgDisabled, marginTop: 5 }}>
                      {selectedDays.size === 0
                        ? "Chọn ít nhất 1 ngày"
                        : frequency === "weekly"
                          ? `Gửi vào ${["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][[...selectedDays][0]]} hàng tuần`
                          : `${selectedDays.size} ngày/tuần được chọn`}
                    </div>
                  </div>
                )}

                {/* Time picker */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Giờ gửi</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      style={{
                        flex: 1, padding: "8px 10px", borderRadius: 8,
                        border: "0.5px solid " + inputBorder, background: bgPanel,
                        fontSize: 13, fontWeight: 700, color: fg,
                        outline: "none", fontFamily: "'Montserrat', system-ui, sans-serif",
                        cursor: "pointer",
                      }}
                    />
                    <div style={{ display: "flex", gap: 5 }}>
                      {["09:15", "11:30", "15:15"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setScheduleTime(t)}
                          style={{
                            padding: "7px 8px", borderRadius: 7, border: "none", cursor: "pointer",
                            background: scheduleTime === t ? (isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)") : isDark ? "rgba(255,255,255,0.05)" : "rgba(26,26,46,0.05)",
                            color: scheduleTime === t ? brand : fgMuted,
                            fontSize: 11, fontWeight: scheduleTime === t ? 700 : 400,
                            fontFamily: "'Montserrat', system-ui, sans-serif",
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: fgDisabled, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <Info size={9} strokeWidth={1.5} color={fgDisabled} />
                    09:15 = đầu phiên · 11:30 = giữa phiên sáng · 15:15 = cuối phiên
                  </div>
                </div>
              </div>
            )}

            {runMode === "realtime" && (
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(52,199,89,0.06)", border: "0.5px solid rgba(52,199,89,0.20)", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <Zap size={12} color="#1a7a3a" strokeWidth={1.5} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a7a3a" }}>Chạy ngay khi có tín hiệu</span>
                </div>
                <div style={{ fontSize: 11, color: fgMuted, lineHeight: 1.5 }}>
                  Agent sẽ tự động kích hoạt khi phát hiện: giá vượt ngưỡng, tin tức quan trọng, hoặc insider giao dịch.
                </div>
              </div>
            )}

            {/* ── Notification methods ── */}
            <div style={{ borderTop: "0.5px solid " + dividerFaint, paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Phương thức thông báo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>

                {/* Inbox — always on */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid " + (isDark ? "rgba(77,143,232,0.25)" : "rgba(8,73,172,0.20)"), background: isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Inbox size={16} color={brand} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: brand }}>Inbox Wealbee</div>
                    <div style={{ fontSize: 11, color: fgSubtle }}>Luôn bật — kết quả vào Inbox app</div>
                  </div>
                  <div style={{ width: 36, height: 20, borderRadius: 99, background: brand, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 3px", flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff" }} />
                  </div>
                </div>

                {/* Email */}
                <div
                  onClick={() => setNotifyEmail((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    border: notifyEmail ? "1px solid " + (isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)") : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)"),
                    background: notifyEmail ? (isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.03)") : bgPanel,
                    transition: "all 120ms ease",
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: notifyEmail ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.10)") : isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Mail size={16} color={notifyEmail ? brand : fgDisabled} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: notifyEmail ? 700 : 400, color: fg }}>Email</div>
                    <div style={{ fontSize: 11, color: fgSubtle }}>
                      {notifyEmail ? "an.nguyen@email.com" : "Gửi brief qua email"}
                    </div>
                  </div>
                  {/* Toggle */}
                  <div
                    style={{
                      width: 36, height: 20, borderRadius: 99, flexShrink: 0,
                      background: notifyEmail ? brand : isDark ? "rgba(255,255,255,0.18)" : "rgba(26,26,46,0.18)",
                      display: "flex", alignItems: "center",
                      justifyContent: notifyEmail ? "flex-end" : "flex-start",
                      padding: "0 3px", transition: "all 200ms ease",
                    }}
                  >
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                  </div>
                </div>

                {/* Zalo */}
                <div
                  onClick={() => setNotifyZalo((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    border: notifyZalo ? "1px solid rgba(0,120,255,0.30)" : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)"),
                    background: notifyZalo ? "rgba(0,120,255,0.04)" : bgPanel,
                    transition: "all 120ms ease",
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: notifyZalo ? "rgba(0,120,255,0.12)" : isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {/* Zalo logo approximation */}
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: "linear-gradient(135deg,#0068FF,#00B4FF)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", fontFamily: "system-ui" }}>Za</span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: notifyZalo ? 700 : 400, color: fg, display: "flex", alignItems: "center", gap: 5 }}>
                      Zalo OA
                      {!notifyZalo && <span style={{ fontSize: 10, background: "rgba(0,120,255,0.10)", color: "#0068FF", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>Kết nối</span>}
                    </div>
                    <div style={{ fontSize: 11, color: fgSubtle }}>
                      {notifyZalo ? "Gửi qua Zalo Official Account" : "Nhận brief qua tin nhắn Zalo"}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 36, height: 20, borderRadius: 99, flexShrink: 0,
                      background: notifyZalo ? "#0068FF" : "rgba(26,26,46,0.18)",
                      display: "flex", alignItems: "center",
                      justifyContent: notifyZalo ? "flex-end" : "flex-start",
                      padding: "0 3px", transition: "all 200ms ease",
                    }}
                  >
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                  </div>
                </div>

                {/* Zalo setup hint */}
                {notifyZalo && (
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(0,120,255,0.05)", border: "0.5px solid rgba(0,120,255,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#0068FF", fontWeight: 600, marginBottom: 3 }}>
                      <Settings size={11} strokeWidth={1.5} color="#0068FF" />
                      Cần kết nối Zalo OA
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(26,26,46,0.55)", lineHeight: 1.5 }}>
                      Vào <strong>Settings → Kết nối</strong> để liên kết tài khoản Zalo Official Account của bạn.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>

        {/* ════════════════════════════════════════
            RIGHT — Test & Preview
        ════════════════════════════════════════ */}
        <div style={{ width: 340, flexShrink: 0, borderLeft: "0.5px solid " + divider, background: bgPanel, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px 10px", borderBottom: "0.5px solid " + divider, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: fg, letterSpacing: "0.04em" }}>PREVIEW & DEBUG</div>
            {(runResult || runResultText) && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 10, color: fgDisabled }}>{runTime}s</span>
                <span style={{ fontSize: 10, color: fgDisabled }}>{runTokens.toLocaleString()} tokens</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {!isRunning && !runResult && !runResultText && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12, padding: 24 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Play size={26} color={isDark ? "rgba(77,143,232,0.50)" : "rgba(8,73,172,0.35)"} strokeWidth={1.5} />
                </div>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: fg }}>Chưa có kết quả</p>
                  <p style={{ margin: 0, fontSize: 12, color: fgSubtle, lineHeight: 1.6 }}>
                    Nhấn <strong>Chạy thử</strong> để kiểm tra agent với cấu hình hiện tại trước khi lưu.
                  </p>
                </div>
                <button
                  onClick={handleRunTest}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "none", background: brand, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif" }}
                >
                  <Play size={14} strokeWidth={1.5} /> Chạy thử ngay
                </button>
              </div>
            )}

            {isRunning && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: brand, opacity: 0.6, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: fg }}>Đang chạy thử...</p>
                  <p style={{ margin: 0, fontSize: 11, color: fgSubtle }}>Gọi {selectedTools.size} tools · {selectedKB.size} KB files</p>
                </div>
                <div style={{ width: "100%", background: bgMuted, borderRadius: 8, overflow: "hidden" }}>
                  {["Lấy dữ liệu thị trường", "Kiểm tra danh mục", "Đọc tin tức", "Tổng hợp AI..."].map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: i < 3 ? "0.5px solid " + dividerFaint : "none" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: i < 2 ? "#34C759" : brand, opacity: i < 2 ? 1 : 0.5 }} />
                      <span style={{ fontSize: 11, color: i < 2 ? fg : fgSubtle }}>{step}</span>
                      {i < 2 && <Check size={11} color="#34C759" strokeWidth={2.5} style={{ marginLeft: "auto" }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {runError && !isRunning && (
              <div style={{ padding: "12px 14px", borderRadius: 9, background: "rgba(255,59,48,0.07)", border: "0.5px solid rgba(255,59,48,0.25)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <AlertTriangle size={13} color="#FF3B30" strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#c0392b" }}>Lỗi khi chạy thử</span>
                </div>
                <span style={{ fontSize: 11, color: fgMuted }}>{runError}</span>
              </div>
            )}

            {(runResult || runResultText) && !isRunning && (
              <>
                {/* Success badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "rgba(52,199,89,0.08)", border: "0.5px solid rgba(52,199,89,0.20)", flexShrink: 0 }}>
                  <CheckCircle2 size={14} color="#34C759" strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a7a3a" }}>Chạy thử thành công</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: fgDisabled }}>{runTime}s · {runTokens.toLocaleString()} tok</span>
                </div>

                {/* Output */}
                <div style={{ background: bgMuted, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>OUTPUT MẪU</div>
                  {runResult && <BriefRenderer brief={runResult} isDark={isDark} />}
                  {runResultText && <MdContent text={runResultText} refs={runResultRefs} />}
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flexShrink: 0 }}>
                  {[
                    { label: "Thời gian", value: `${runTime}s` },
                    { label: "Tokens", value: runTokens.toLocaleString() },
                    { label: "Tools gọi", value: `${selectedTools.size}` },
                  ].map((s) => (
                    <div key={s.label} style={{ background: bgMuted, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: brand }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: fgSubtle, marginTop: 1 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

          </div>

          {/* Save button */}
          <div style={{ padding: "12px 14px", borderTop: "0.5px solid " + divider, flexShrink: 0 }}>
            <button
              onClick={handleSave}
              disabled={isSaved}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                background: isSaved ? "#34C759" : brand,
                color: "#fff", fontSize: 14, fontWeight: 700, cursor: !isSaved ? "pointer" : "not-allowed",
                fontFamily: "'Montserrat', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 200ms ease",
              }}
            >
              {isSaved
                ? <><CheckCircle2 size={16} strokeWidth={2} /> Agent đã lưu!</>
                : <><Save size={15} strokeWidth={1.5} /> Lưu Agent</>
              }
            </button>
            {!isSaved && (
              <p style={{ margin: "6px 0 0", fontSize: 10, color: fgDisabled, textAlign: "center", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                Agent sẽ bắt đầu chạy theo lịch sau khi lưu
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4;transform:scale(.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Section accordion component ─────────────────────────────────────────────
function Section({
  id, label, icon, open, onToggle, badge, children, isDark = false,
}: {
  id: string; label: string; icon: React.ReactNode;
  open: boolean; onToggle: () => void;
  badge?: string; children: React.ReactNode;
  isDark?: boolean;
}) {
  void id;
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.40)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";
  return (
    <div style={{ borderBottom: "0.5px solid " + divider }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
          fontFamily: "'Montserrat', system-ui, sans-serif",
        }}
      >
        {icon}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: fg }}>{label}</span>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.10)", color: brand }}>{badge}</span>
        )}
        {open ? <ChevronUp size={14} strokeWidth={1.5} color={fgDisabled} /> : <ChevronDown size={14} strokeWidth={1.5} color={fgDisabled} />}
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}
