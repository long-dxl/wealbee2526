import { Bot, X, Send, RotateCcw, Activity, FileText, ChevronLeft, Plus, Clock } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, type ChatMessage } from "../store/appStore";
import { sendChatMessage } from "../lib/supabase/bee-ai";
import { supabase } from "../lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Compliance disclaimer ────────────────────────────────────────────────────
const DISCLAIMER = "BeeAI cung cấp thông tin thị trường, không khuyến nghị mua/bán.";

// ─── Suggested questions ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  "VN-Index hôm nay thế nào?",
  "Tin tức VN30 mới nhất",
  "Phân tích cổ phiếu VCB",
  "Top tăng/giảm hôm nay?",
];

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
      borderRadius: 7, border: "none", cursor: "pointer",
      fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit",
      background: active ? "rgba(8,73,172,0.08)" : "transparent",
      color: active ? "#0849ac" : "#99a1af", transition: "all 0.15s",
    }}>
      <Icon style={{ width: 13, height: 13 }} />
      {label}
    </button>
  );
}

// ─── Markdown-lite renderer ───────────────────────────────────────────────────
// Renders **bold**, bullet lists, and line breaks without heavy deps

function MdText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, li) => {
    const trimmed = line.trim();

    // Bullet point
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      elements.push(
        <div key={li} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
          <span style={{ flexShrink: 0, marginTop: 2, color: "#0849ac", fontSize: "0.5rem" }}>●</span>
          <span>{renderInline(trimmed.slice(2))}</span>
        </div>
      );
    }
    // Numbered list
    else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={li} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
            <span style={{ flexShrink: 0, fontWeight: 700, color: "#0849ac", minWidth: 16, fontSize: "0.75rem" }}>{match[1]}.</span>
            <span>{renderInline(match[2])}</span>
          </div>
        );
      }
    }
    // ### Heading
    else if (trimmed.startsWith("### ")) {
      elements.push(
        <p key={li} style={{ fontWeight: 700, color: "#1a1a2e", fontSize: "0.8125rem", marginTop: 8, marginBottom: 4 }}>
          {renderInline(trimmed.slice(4))}
        </p>
      );
    }
    // ## Heading
    else if (trimmed.startsWith("## ")) {
      elements.push(
        <p key={li} style={{ fontWeight: 700, color: "#0849ac", fontSize: "0.8125rem", marginTop: 10, marginBottom: 4 }}>
          {renderInline(trimmed.slice(3))}
        </p>
      );
    }
    // Empty line → spacer
    else if (trimmed === "") {
      elements.push(<div key={li} style={{ height: 6 }} />);
    }
    // Normal text
    else {
      elements.push(
        <p key={li} style={{ marginBottom: 3 }}>
          {renderInline(trimmed)}
        </p>
      );
    }
  });

  return <div style={{ lineHeight: 1.6 }}>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 700, color: "inherit" }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <div style={{
        maxWidth: "88%",
        background: isUser ? "#0849ac" : "#f5f8ff",
        color: isUser ? "#fff" : "#1a1a2e",
        border: isUser ? "none" : "1px solid rgba(8,73,172,0.08)",
        borderRadius: isUser ? "12px 12px 4px 12px" : "4px 12px 12px 12px",
        padding: "9px 13px",
        fontSize: "0.8125rem",
      }}>
        {isUser ? (
          <p style={{ lineHeight: 1.55 }}>{msg.content}</p>
        ) : (
          <MdText text={msg.content} />
        )}
        <div style={{ fontSize: "0.5625rem", opacity: 0.55, marginTop: 4, textAlign: "right" }}>
          {new Date(msg.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─── Session list panel ───────────────────────────────────────────────────────
function SessionPanel({
  sessions, onSelect, onNew, onClose,
}: {
  sessions: ChatSession[];
  onSelect: (s: ChatSession) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid rgba(8,73,172,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#99a1af", display: "flex" }}>
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </button>
          <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e" }}>Lịch sử chat</span>
        </div>
        <button onClick={onNew} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, color: "#0849ac", fontFamily: "inherit" }}>
          <Plus style={{ width: 12, height: 12 }} /> Mới
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {sessions.length === 0 ? (
          <p style={{ textAlign: "center", color: "#c4c9d4", fontSize: "0.75rem", padding: 24 }}>Chưa có cuộc hội thoại</p>
        ) : sessions.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} style={{
            width: "100%", padding: "10px 14px", border: "none", background: "transparent",
            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
            borderBottom: "1px solid rgba(8,73,172,0.04)", transition: "background 0.1s",
          }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(8,73,172,0.04)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <p style={{ fontSize: "0.8125rem", color: "#1a1a2e", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.title || "Cuộc hội thoại mới"}
            </p>
            <p style={{ fontSize: "0.625rem", color: "#99a1af", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
              <Clock style={{ width: 9, height: 9 }} />
              {new Date(s.updated_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ActionHub ────────────────────────────────────────────────────────────────
export function ActionHub() {
  const {
    actionHubOpen, toggleActionHub,
    actionHubTab, setActionHubTab,
    chatMessages, addChatMessage, clearChat,
    contextTicker,
  } = useAppStore();

  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sessionId, setSessionId]   = useState<string | undefined>(undefined);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions]     = useState<ChatSession[]>([]);
  const [modelLabel, setModelLabel] = useState("gpt-4.1-mini");
  const cancelRef    = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, streamingText]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    setSessions(data ?? []);
  }, []);

  useEffect(() => {
    if (actionHubOpen) loadSessions();
  }, [actionHubOpen, loadSessions]);

  if (!actionHubOpen) return null;

  // ── Clear chat ──
  const handleClearChat = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setStreamingText("");
    setLoading(false);
    setSessionId(undefined);
    clearChat();
  }, [clearChat]);

  // ── Load session history ──
  const loadSession = async (s: ChatSession) => {
    handleClearChat();
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", s.id)
      .order("created_at", { ascending: true });

    if (msgs) {
      for (const m of msgs) {
        addChatMessage({ id: m.id, role: m.role, content: m.content, timestamp: m.created_at });
      }
    }
    setSessionId(s.id);
    setShowSessions(false);
  };

  // ── Send message ──
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    addChatMessage({ id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date().toISOString() });
    setInput("");
    setLoading(true);
    setStreamingText("");

    try {
      const cancel = await sendChatMessage(text, sessionId, contextTicker, {
        onChunk: (chunk) => {
          setStreamingText(prev => prev + chunk);
        },
        onDone: ({ sessionId: newId, model }) => {
          setStreamingText(prev => {
            if (prev) {
              addChatMessage({ id: crypto.randomUUID(), role: "assistant", content: prev, timestamp: new Date().toISOString() });
            }
            return "";
          });
          setSessionId(newId);
          if (model) setModelLabel(model);
          setLoading(false);
          cancelRef.current = null;
          loadSessions(); // refresh session list
        },
        onError: (err) => {
          setStreamingText("");
          addChatMessage({ id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${err}`, timestamp: new Date().toISOString() });
          setLoading(false);
          cancelRef.current = null;
        },
      });
      cancelRef.current = cancel;
    } catch (err) {
      setStreamingText("");
      addChatMessage({ id: crypto.randomUUID(), role: "assistant", content: `⚠️ Không thể kết nối BeeAI: ${String(err)}`, timestamp: new Date().toISOString() });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <aside style={{ width: 360, flexShrink: 0, background: "#ffffff", borderLeft: "1px solid rgba(8,73,172,0.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ height: 52, flexShrink: 0, borderBottom: "1px solid rgba(8,73,172,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #032d6b, #0849ac)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <div>
            <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.1 }}>BeeAI</p>
            <p style={{ fontSize: "0.5625rem", color: "#0ea5a0", fontWeight: 600 }}>● {modelLabel}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Session history button */}
          <button
            onClick={() => setShowSessions(!showSessions)}
            title="Lịch sử chat"
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: showSessions ? "rgba(8,73,172,0.06)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: showSessions ? "#0849ac" : "#99a1af" }}
          >
            <Clock style={{ width: 13, height: 13 }} />
          </button>
          {/* New chat */}
          {chatMessages.length > 0 && (
            <button onClick={handleClearChat} title="Xóa cuộc hội thoại" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#99a1af" }}>
              <RotateCcw style={{ width: 13, height: 13 }} />
            </button>
          )}
          {/* Close */}
          <button onClick={toggleActionHub} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#99a1af" }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      {!showSessions && (
        <div style={{ display: "flex", gap: 2, padding: "8px 12px", borderBottom: "1px solid rgba(8,73,172,0.06)", flexShrink: 0 }}>
          <TabBtn active={actionHubTab === "chat"}    onClick={() => setActionHubTab("chat")}    icon={Bot}      label="Chat"    />
          <TabBtn active={actionHubTab === "agent"}   onClick={() => setActionHubTab("agent")}   icon={Activity} label="Agent"   />
          <TabBtn active={actionHubTab === "run-log"} onClick={() => setActionHubTab("run-log")} icon={FileText} label="Run Log" />
        </div>
      )}

      {/* ── Session list ── */}
      {showSessions && (
        <SessionPanel
          sessions={sessions}
          onSelect={loadSession}
          onNew={() => { handleClearChat(); setShowSessions(false); }}
          onClose={() => setShowSessions(false)}
        />
      )}

      {/* ── Chat panel ── */}
      {!showSessions && actionHubTab === "chat" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {chatMessages.length === 0 ? (
              <>
                {/* Welcome card */}
                <div style={{ background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <p style={{ fontSize: "0.8125rem", color: "#1a1a2e", fontWeight: 600, marginBottom: 6 }}>Xin chào! 🐝</p>
                  <p style={{ fontSize: "0.75rem", color: "#6a7282", lineHeight: 1.6 }}>
                    Tôi là BeeAI — trợ lý phân tích thị trường chứng khoán. Tôi có dữ liệu giá VN30 và tin tức thật để hỗ trợ bạn.
                  </p>
                </div>
                {contextTicker && (
                  <div style={{ background: "rgba(8,73,172,0.04)", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 9, padding: "7px 11px", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: "0.6875rem", color: "#0849ac", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{contextTicker}</span>
                    <span style={{ fontSize: "0.6875rem", color: "#6a7282" }}>đang được xem — BeeAI sẽ ưu tiên phân tích mã này</span>
                  </div>
                )}
                {/* Suggestions */}
                <p style={{ fontSize: "0.6875rem", color: "#99a1af", fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>GỢI Ý</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s}
                      onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      style={{ textAlign: "left", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", color: "#1a1a2e", cursor: "pointer", fontSize: "0.8125rem", fontFamily: "inherit", lineHeight: 1.4, transition: "all 0.15s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(8,73,172,0.04)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {chatMessages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
                {/* Streaming bubble */}
                {loading && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                    <div style={{ background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: "4px 12px 12px 12px", padding: "9px 13px", maxWidth: "88%" }}>
                      {streamingText ? (
                        <div style={{ fontSize: "0.8125rem", color: "#1a1a2e" }}>
                          <MdText text={streamingText} />
                          <span style={{ display: "inline-block", width: 2, height: "1em", background: "#0849ac", marginLeft: 1, verticalAlign: "text-bottom", animation: "blink 0.8s step-end infinite" }} />
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
                          {[0, 1, 2].map(i => (
                            <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#0849ac", display: "inline-block", opacity: 0.6, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(8,73,172,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.12)", borderRadius: 12, padding: "8px 12px" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hỏi về thị trường... (Enter gửi)"
                rows={1}
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", resize: "none", fontSize: "0.8125rem", color: "#1a1a2e", lineHeight: 1.5, fontFamily: "inherit", maxHeight: 80, overflow: "auto" }}
              />
              <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ width: 30, height: 30, borderRadius: 8, border: "none", flexShrink: 0, background: input.trim() && !loading ? "#0849ac" : "#e5e7eb", cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
                <Send style={{ width: 13, height: 13, color: input.trim() && !loading ? "#fff" : "#9ca3af" }} />
              </button>
            </div>
            <p style={{ fontSize: "0.5625rem", color: "#c4c9d4", marginTop: 5, textAlign: "center" }}>{DISCLAIMER}</p>
          </div>
        </>
      )}

      {/* ── Agent panel ── */}
      {!showSessions && actionHubTab === "agent" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ textAlign: "center" }}>
            <Activity style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Không có agent đang chạy</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 6, lineHeight: 1.5 }}>Chạy agent từ trang Agents để xem tiến trình.</p>
          </div>
        </div>
      )}

      {/* ── Run log panel ── */}
      {!showSessions && actionHubTab === "run-log" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ textAlign: "center" }}>
            <FileText style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Chưa có lịch sử chạy</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 6, lineHeight: 1.5 }}>Logs của các agent run sẽ hiển thị ở đây.</p>
          </div>
        </div>
      )}
    </aside>
  );
}
