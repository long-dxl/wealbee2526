import { Save, Play, Plus, Trash2, ChevronDown, Zap, Database, Mail, Bell, Search, BarChart3 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

const AVAILABLE_TOOLS = [
  { id: "price_feed",   label: "Price Feed",    icon: BarChart3, color: "#0849ac" },
  { id: "news_feed",    label: "News Feed",     icon: Search,    color: "#0ea5a0" },
  { id: "financials",   label: "Financials",    icon: Database,  color: "#8b5cf6" },
  { id: "alert_send",   label: "Alert Sender",  icon: Bell,      color: "#ef4444" },
  { id: "email_send",   label: "Email Sender",  icon: Mail,      color: "#6366f1" },
  { id: "kb_search",    label: "KB Search",     icon: Search,    color: "#f59e0b" },
];

interface ToolCard { id: string; toolId: string; params: Record<string, string>; }

export function AgentStudioPage() {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("Agent mới");
  const [agentDesc, setAgentDesc] = useState("");
  const [schedule, setSchedule] = useState("manual");
  const [tools, setTools] = useState<ToolCard[]>([]);
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState(false);

  const addTool = (toolId: string) => {
    setTools(prev => [...prev, { id: crypto.randomUUID(), toolId, params: {} }]);
  };

  const removeTool = (id: string) => setTools(prev => prev.filter(t => t.id !== id));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate("/app/agents"); }, 1500);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Agent Studio</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", color: "#0849ac", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
              <Play style={{ width: 13, height: 13 }} />Test chạy
            </button>
            <button onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "none", background: saved ? "#0ea5a0" : "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit", transition: "background 0.2s" }}>
              <Save style={{ width: 13, height: 13 }} />{saved ? "Đã lưu ✓" : "Lưu agent"}
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 6 }}>Tên agent</label>
            <input value={agentName} onChange={e => setAgentName(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "#f5f8ff", outline: "none", fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 6 }}>Lịch chạy</label>
            <div style={{ position: "relative" }}>
              <select value={schedule} onChange={e => setSchedule(e.target.value)} style={{ width: "100%", padding: "9px 32px 9px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "#f5f8ff", outline: "none", fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
                <option value="manual">Thủ công</option>
                <option value="daily_7am">Hàng ngày 7:00 AM</option>
                <option value="daily_8pm">Hàng ngày 8:00 PM</option>
                <option value="weekday_noon">Thứ 2–6, 11:45 AM</option>
                <option value="weekly_mon">Thứ 2 hàng tuần</option>
              </select>
              <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#99a1af", pointerEvents: "none" }} />
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 6 }}>Mô tả</label>
          <input value={agentDesc} onChange={e => setAgentDesc(e.target.value)} placeholder="Agent này làm gì?" style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "#f5f8ff", outline: "none", fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 6 }}>System Prompt</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Mô tả chi tiết agent cần làm gì, tone giọng, định dạng output..." rows={6} style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "#f5f8ff", outline: "none", fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282" }}>Tools ({tools.length})</label>
          </div>
          {tools.length === 0 ? (
            <div style={{ border: "2px dashed rgba(8,73,172,0.1)", borderRadius: 12, padding: "24px", textAlign: "center" }}>
              <Zap style={{ width: 24, height: 24, color: "#d1d5db", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "0.8125rem", color: "#99a1af" }}>Kéo tool từ bảng bên phải vào đây</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tools.map((tool, idx) => {
                const t = AVAILABLE_TOOLS.find(t => t.id === tool.toolId);
                if (!t) return null;
                const Icon = t.icon;
                return (
                  <div key={tool.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 10 }}>
                    <span style={{ fontSize: "0.6875rem", color: "#c4c9d4", fontFamily: "'IBM Plex Mono', monospace", width: 16 }}>{idx + 1}</span>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: `${t.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon style={{ width: 13, height: 13, color: t.color }} />
                    </div>
                    <span style={{ flex: 1, fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e" }}>{t.label}</span>
                    <button onClick={() => removeTool(tool.id)} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#c4c9d4" }}>
                      <Trash2 style={{ width: 11, height: 11 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div style={{ width: 240, flexShrink: 0, borderLeft: "1px solid rgba(8,73,172,0.08)", padding: "20px 12px", overflowY: "auto" }}>
        <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#99a1af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12, padding: "0 4px" }}>TOOLS</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {AVAILABLE_TOOLS.map(t => {
            const Icon = t.icon;
            const inUse = tools.some(tool => tool.toolId === t.id);
            return (
              <button key={t.id} onClick={() => addTool(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, border: `1px solid ${inUse ? "rgba(8,73,172,0.15)" : "rgba(8,73,172,0.08)"}`, background: inUse ? "rgba(8,73,172,0.04)" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: `${t.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 13, height: 13, color: t.color }} />
                </div>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e" }}>{t.label}</span>
                <Plus style={{ width: 11, height: 11, color: "#0849ac", marginLeft: "auto" }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
