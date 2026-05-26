import {
  Save, Trash2, ChevronDown, Database, Mail, Bell,
  Search, BarChart3, CheckCircle, AlertCircle, ArrowLeft,
  Cpu, SlidersHorizontal, Calendar, Tag,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "../../lib/supabase/client";

// ─── Dữ liệu ──────────────────────────────────────────────────────────────────

const AVAILABLE_TOOLS = [
  { id: "price_feed",   label: "Dữ liệu giá",     icon: BarChart3, color: "#0849ac" },
  { id: "news_feed",    label: "Tin tức",           icon: Search,    color: "#0ea5a0" },
  { id: "financials",   label: "Tài chính DN",      icon: Database,  color: "#8b5cf6" },
  { id: "alert_send",   label: "Cảnh báo",          icon: Bell,      color: "#ef4444" },
  { id: "email_send",   label: "Gửi email",         icon: Mail,      color: "#6366f1" },
  { id: "kb_search",    label: "Tìm kiếm KB",       icon: Search,    color: "#f59e0b" },
];

const RECOMMENDED_TOOLS: Record<string, string[]> = {
  deep_research:    ["price_feed", "news_feed", "financials"],
  daily_digest:     ["price_feed", "news_feed"],
  portfolio_health: ["price_feed"],
  market_scanner:   ["price_feed", "news_feed"],
  earnings_watch:   ["financials", "news_feed"],
  macro_watch:      ["price_feed", "news_feed"],
};

const SCHEDULE_OPTIONS = [
  { value: "manual",        label: "Thủ công" },
  { value: "daily_7am",     label: "Hàng ngày 7:00 SA" },
  { value: "daily_8pm",     label: "Hàng ngày 8:00 CH" },
  { value: "weekday_noon",  label: "Thứ 2–6, 11:45 SA" },
  { value: "weekly_mon",    label: "Thứ 2 hàng tuần" },
];

const TEMPLATE_PROMPTS: Record<string, string> = {
  deep_research: `Bạn là chuyên gia phân tích chứng khoán Việt Nam.
Khi được yêu cầu phân tích một mã CP, hãy trình bày đầy đủ:
1. Tóm tắt hoạt động kinh doanh
2. Kết quả tài chính gần nhất (doanh thu, lợi nhuận, biên lợi nhuận)
3. Chính sách cổ tức
4. Giao dịch của cổ đông nội bộ
5. Tin tức tác động gần đây
6. Đánh giá rủi ro

Ngôn ngữ: tiếng Việt, súc tích, dùng số liệu cụ thể từ dữ liệu được cung cấp.
KHÔNG đưa ra khuyến nghị mua/bán.`,
  daily_digest: `Bạn là biên tập viên bản tin tài chính Việt Nam.
Tổng hợp thị trường hàng ngày gồm:
1. Diễn biến VN-Index và HNX
2. Top 5 cổ phiếu tăng/giảm mạnh nhất VN30
3. Tin tức thị trường nổi bật trong ngày
4. Nhận định ngắn về xu hướng

Viết ngắn gọn, dễ đọc, phù hợp gửi email buổi sáng.`,
  portfolio_health: `Bạn là cố vấn quản lý danh mục đầu tư.
Phân tích danh mục của người dùng:
1. Tổng quan P&L và hiệu suất
2. Cổ phiếu đang lãi/lỗ nhiều nhất
3. Cảnh báo nếu có CP biến động bất thường
4. So sánh với VN-Index cùng kỳ

Dùng số liệu thực từ dữ liệu được cung cấp. KHÔNG tự bịa số.`,
};

// Lưu target_symbol vào đầu system_prompt dưới dạng marker
const SYM_PREFIX = "__TARGET_SYMBOL__: ";

function extractSymbol(prompt: string): { symbol: string; cleanPrompt: string } {
  const lines = prompt.split("\n");
  if (lines[0]?.startsWith(SYM_PREFIX)) {
    const symbol = lines[0].slice(SYM_PREFIX.length).trim();
    const rest   = lines.slice(lines[1] === "" ? 2 : 1).join("\n");
    return { symbol, cleanPrompt: rest };
  }
  return { symbol: "", cleanPrompt: prompt };
}

function buildPrompt(symbol: string, prompt: string): string {
  const sym = symbol.trim().toUpperCase();
  return sym ? `${SYM_PREFIX}${sym}\n\n${prompt}` : prompt;
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, color, title, children }: {
  icon: React.ElementType; color: string; title: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.09)", borderRadius: 16, overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 4px rgba(8,73,172,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid rgba(8,73,172,0.07)", background: "rgba(8,73,172,0.02)" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon style={{ width: 15, height: 15, color }} />
        </div>
        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "'Montserrat',sans-serif" }}>{title}</span>
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#6a7282", marginBottom: 6, letterSpacing: "0.02em" }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: "0.6875rem", color: "#c4c9d4", marginTop: 5 }}>{hint}</p>}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid rgba(8,73,172,0.15)", background: "#f8faff",
  outline: "none", fontSize: "0.875rem", color: "#1a1a2e",
  fontFamily: "'Inter','Montserrat',sans-serif", boxSizing: "border-box",
  transition: "border-color 0.15s",
};

// ─── AgentStudioPage ──────────────────────────────────────────────────────────

interface ToolCard { id: string; toolId: string; }

export function AgentStudioPage() {
  const navigate     = useNavigate();
  const [params]     = useSearchParams();
  const editAgentId  = params.get("agent_id");

  const [agentName,   setAgentName]   = useState("Agent mới");
  const [agentDesc,   setAgentDesc]   = useState("");
  const [schedule,    setSchedule]    = useState("manual");
  const [tools,       setTools]       = useState<ToolCard[]>([]);
  const [prompt,      setPrompt]      = useState("");
  const [symbol,      setSymbol]      = useState("");
  const [templateId,  setTemplateId]  = useState<string | null>(null);

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [userId,  setUserId]  = useState<string | null>(null);
  const [loading, setLoading] = useState(!!editAgentId);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id ?? null));
  }, []);

  // Tải agent cũ nếu đang edit
  useEffect(() => {
    if (!editAgentId) return;
    setLoading(true);
    supabase.from("agents").select("*").eq("id", editAgentId).single().then(({ data }) => {
      if (data) {
        setAgentName(data.name ?? "");
        setAgentDesc(data.description ?? "");
        setSchedule(data.schedule ?? "manual");
        setTemplateId(data.template_id ?? null);
        const { symbol: sym, cleanPrompt } = extractSymbol(data.system_prompt ?? "");
        setSymbol(sym);
        setPrompt(cleanPrompt);
        // Load tools từ DB (TEXT[])
        const savedTools: string[] = data.tools ?? [];
        setTools(savedTools.map(tid => ({ id: crypto.randomUUID(), toolId: tid })));
      }
      setLoading(false);
    });
  }, [editAgentId]);

  // Gán prompt mặc định khi tạo agent mới
  useEffect(() => {
    if (!editAgentId && templateId && !prompt && TEMPLATE_PROMPTS[templateId]) {
      setPrompt(TEMPLATE_PROMPTS[templateId]);
    }
  }, [templateId, editAgentId]);

  const addTool = (toolId: string) => {
    if (tools.some(t => t.toolId === toolId)) return;
    setTools(prev => [...prev, { id: crypto.randomUUID(), toolId }]);
  };
  const removeTool = (id: string) => setTools(prev => prev.filter(t => t.id !== id));

  const handleSave = async () => {
    if (!userId) { setError("Vui lòng đăng nhập"); return; }
    if (!agentName.trim()) { setError("Tên agent không được để trống"); return; }
    setSaving(true); setError(null);
    try {
      const systemPrompt = buildPrompt(symbol, prompt);
      const toolIds = tools.map(t => t.toolId);
      if (editAgentId) {
        const { error: err } = await supabase.from("agents").update({
          name: agentName.trim(), description: agentDesc.trim(),
          schedule, system_prompt: systemPrompt || null,
          tools: toolIds,
        }).eq("id", editAgentId).eq("user_id", userId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("agents").insert({
          user_id: userId, template_id: templateId,
          name: agentName.trim(), description: agentDesc.trim(),
          status: "active", schedule, system_prompt: systemPrompt || null,
          tools: toolIds,
        });
        if (err) throw err;
      }
      setSaved(true);
      setTimeout(() => navigate("/app/agents"), 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const isDeepResearch = templateId === "deep_research";

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid rgba(8,73,172,0.15)", borderTopColor: "#0849ac", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontSize: "0.8125rem", color: "#99a1af" }}>Đang tải...</p>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "#f5f7fc" }}>
      {/* ── Nội dung chính ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 40px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button
            onClick={() => navigate("/app/agents")}
            style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(8,73,172,0.12)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#6a7282" }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: "1.25rem", fontWeight: 800, color: "#1a1a2e" }}>
              {editAgentId ? "Chỉnh sửa Agent" : "Tạo Agent mới"}
            </h1>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 2 }}>
              {editAgentId ? "Cập nhật cấu hình và prompt" : "Thiết lập agent với prompt tuỳ chỉnh"}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 20px",
              borderRadius: 11, border: "none",
              background: saved ? "#0ea5a0" : saving ? "rgba(8,73,172,0.6)" : "#0849ac",
              color: "#fff", cursor: saving || saved ? "not-allowed" : "pointer",
              fontSize: "0.875rem", fontWeight: 700, fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(8,73,172,0.25)", transition: "background 0.2s",
            }}
          >
            {saved
              ? <><CheckCircle style={{ width: 15, height: 15 }} />Đã lưu!</>
              : saving
                ? "Đang lưu…"
                : <><Save style={{ width: 15, height: 15 }} />Lưu agent</>}
          </button>
        </div>

        {/* Lỗi */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <AlertCircle style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0 }} />
            <p style={{ fontSize: "0.8125rem", color: "#ef4444" }}>{error}</p>
          </div>
        )}

        {/* Thông tin cơ bản */}
        <SectionCard icon={Tag} color="#0849ac" title="Thông tin cơ bản">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Tên agent">
              <input
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                style={INPUT_STYLE}
                placeholder="VD: Phân tích VCB hàng tuần"
              />
            </Field>
            <Field label="Lịch chạy">
              <div style={{ position: "relative" }}>
                <select
                  value={schedule}
                  onChange={e => setSchedule(e.target.value)}
                  style={{ ...INPUT_STYLE, paddingRight: 36, appearance: "none", cursor: "pointer" }}
                >
                  {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#99a1af", pointerEvents: "none" }} />
              </div>
            </Field>
          </div>
          <Field label="Mô tả" hint="Tóm tắt ngắn gọn agent này làm gì">
            <input
              value={agentDesc}
              onChange={e => setAgentDesc(e.target.value)}
              placeholder="VD: Phân tích chuyên sâu cổ phiếu VCB mỗi tuần"
              style={INPUT_STYLE}
            />
          </Field>
        </SectionCard>

        {/* Mã cổ phiếu — chỉ hiện với deep_research */}
        {isDeepResearch && (
          <SectionCard icon={BarChart3} color="#8b5cf6" title="Mã cổ phiếu mục tiêu">
            <Field
              label="Mã CP cần phân tích"
              hint="Agent sẽ luôn phân tích mã này mỗi khi chạy. Bạn vẫn có thể đổi mã khi chạy thủ công."
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  placeholder="VD: VCB, HPG, FPT..."
                  maxLength={10}
                  style={{ ...INPUT_STYLE, width: 180, fontWeight: 700, letterSpacing: "0.05em", fontSize: "0.9375rem" }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["VCB","TCB","HPG","VNM","FPT","VIC","MWG","ACB","BID","SSI"].map(s => (
                    <button
                      key={s}
                      onClick={() => setSymbol(s)}
                      style={{
                        padding: "5px 11px", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${symbol === s ? "#8b5cf6" : "rgba(139,92,246,0.2)"}`,
                        background: symbol === s ? "rgba(139,92,246,0.1)" : "transparent",
                        color: symbol === s ? "#8b5cf6" : "#6a7282",
                        fontSize: "0.75rem", fontWeight: 700, fontFamily: "inherit",
                        transition: "all 0.12s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </SectionCard>
        )}

        {/* System Prompt */}
        <SectionCard icon={Cpu} color="#0ea5a0" title="System Prompt">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: "0.75rem", color: "#99a1af" }}>
              Hướng dẫn chi tiết cho AI — tone giọng, định dạng output, những gì được/không được làm
            </p>
            {templateId && TEMPLATE_PROMPTS[templateId] && (
              <button
                onClick={() => setPrompt(TEMPLATE_PROMPTS[templateId!])}
                style={{ fontSize: "0.6875rem", color: "#0849ac", background: "rgba(8,73,172,0.06)", border: "1px solid rgba(8,73,172,0.12)", borderRadius: 7, cursor: "pointer", padding: "4px 10px", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}
              >
                ↺ Khôi phục mặc định
              </button>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Mô tả chi tiết agent cần làm gì, tone giọng, định dạng output, những điều KHÔNG được làm..."
            rows={11}
            style={{
              ...INPUT_STYLE,
              resize: "vertical", lineHeight: 1.7, fontFamily: "'Inter',sans-serif",
              fontSize: "0.8125rem",
            }}
          />
        </SectionCard>

        {/* Tools */}
        <SectionCard icon={SlidersHorizontal} color="#f59e0b" title={`Công cụ (${tools.length} đã chọn)`}>
          {tools.length === 0 ? (
            <div style={{ border: "2px dashed rgba(8,73,172,0.1)", borderRadius: 12, padding: "24px 16px", textAlign: "center", background: "rgba(8,73,172,0.01)" }}>
              <p style={{ fontSize: "0.8125rem", color: "#99a1af" }}>Chọn công cụ từ danh sách bên phải →</p>
              <p style={{ fontSize: "0.75rem", color: "#c4c9d4", marginTop: 4 }}>Tools xác định nguồn dữ liệu agent có thể sử dụng</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tools.map((tool, idx) => {
                const t = AVAILABLE_TOOLS.find(t => t.id === tool.toolId);
                if (!t) return null;
                const Icon = t.icon;
                return (
                  <div key={tool.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8faff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 10 }}>
                    <span style={{ fontSize: "0.6875rem", color: "#c4c9d4", minWidth: 18, textAlign: "right" }}>{idx + 1}</span>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${t.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon style={{ width: 14, height: 14, color: t.color }} />
                    </div>
                    <span style={{ flex: 1, fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e" }}>{t.label}</span>
                    <button onClick={() => removeTool(tool.id)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(239,68,68,0.15)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Lịch chạy chi tiết */}
        <SectionCard icon={Calendar} color="#6366f1" title="Thông tin lịch chạy">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(99,102,241,0.05)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.12)" }}>
            <Calendar style={{ width: 16, height: 16, color: "#6366f1", flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e" }}>
                {SCHEDULE_OPTIONS.find(o => o.value === schedule)?.label ?? "Thủ công"}
              </p>
              <p style={{ fontSize: "0.6875rem", color: "#99a1af", marginTop: 2 }}>
                {schedule === "manual" ? "Chỉ chạy khi bạn bấm nút thủ công" : "Agent sẽ tự động chạy theo lịch đã đặt"}
              </p>
            </div>
          </div>
        </SectionCard>

      </div>

      {/* ── Sidebar tools ── */}
      <div style={{ width: 220, flexShrink: 0, borderLeft: "1px solid rgba(8,73,172,0.08)", padding: "24px 14px", overflowY: "auto", background: "#fff" }}>
        <p style={{ fontSize: "0.6875rem", fontWeight: 800, color: "#99a1af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14, padding: "0 4px" }}>Công cụ</p>

        {/* Recommended banner */}
        {templateId && RECOMMENDED_TOOLS[templateId] && (
          <div style={{ marginBottom: 12, padding: "10px 11px", background: "rgba(8,73,172,0.04)", borderRadius: 10, border: "1px solid rgba(8,73,172,0.1)" }}>
            <p style={{ fontSize: "0.625rem", fontWeight: 700, color: "#0849ac", marginBottom: 6, letterSpacing: "0.04em" }}>⚡ GỢI Ý CHO TEMPLATE NÀY</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {RECOMMENDED_TOOLS[templateId].map(toolId => {
                const t = AVAILABLE_TOOLS.find(x => x.id === toolId);
                const alreadyOn = tools.some(x => x.toolId === toolId);
                if (!t) return null;
                return (
                  <button key={toolId}
                    onClick={() => !alreadyOn && addTool(toolId)}
                    style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${alreadyOn ? t.color + "40" : t.color + "30"}`, background: alreadyOn ? `${t.color}12` : "transparent", color: alreadyOn ? t.color : "#6a7282", fontSize: "0.625rem", fontWeight: 700, cursor: alreadyOn ? "default" : "pointer", fontFamily: "inherit" }}>
                    {alreadyOn ? "✓ " : "+ "}{t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {AVAILABLE_TOOLS.map(t => {
            const Icon = t.icon;
            const inUse = tools.some(tool => tool.toolId === t.id);
            const isRecommended = templateId ? (RECOMMENDED_TOOLS[templateId] ?? []).includes(t.id) : false;
            return (
              <button
                key={t.id}
                onClick={() => inUse ? removeTool(tools.find(x => x.toolId === t.id)!.id) : addTool(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 11px",
                  borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  border: `1.5px solid ${inUse ? t.color + "40" : isRecommended ? t.color + "25" : "rgba(8,73,172,0.08)"}`,
                  background: inUse ? `${t.color}10` : isRecommended ? `${t.color}06` : "transparent",
                  transition: "all 0.12s",
                  position: "relative",
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${t.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 14, height: 14, color: t.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: inUse ? t.color : "#1a1a2e", display: "block" }}>{t.label}</span>
                  {isRecommended && !inUse && (
                    <span style={{ fontSize: "0.5625rem", color: t.color, fontWeight: 700, letterSpacing: "0.02em" }}>Gợi ý</span>
                  )}
                </div>
                {inUse && <CheckCircle style={{ width: 13, height: 13, color: t.color, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 20, padding: "12px", background: "rgba(8,73,172,0.04)", borderRadius: 12, border: "1px solid rgba(8,73,172,0.08)" }}>
          <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#0849ac", marginBottom: 5 }}>💡 Lưu ý</p>
          <p style={{ fontSize: "0.6875rem", color: "#6a7282", lineHeight: 1.6 }}>
            Mỗi tool chỉ fetch dữ liệu khi được bật. Tool "Gửi email" tự động gửi kết quả sau mỗi lần chạy.
          </p>
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
