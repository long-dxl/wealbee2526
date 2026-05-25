import { Bot, X, Send, RotateCcw, Activity, FileText } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, type ChatMessage } from "../store/appStore";
import { sendChatMessage } from "../lib/supabase/bee-ai";

// ─── Compliance disclaimer ─────────────────────────────────────────────────
const DISCLAIMER = "BeeAI cung cấp thông tin thị trường, không đưa ra khuyến nghị mua/bán.";

// ─── Suggested questions ──────────────────────────────────────────────────
const SUGGESTIONS = [
  "VN-Index hôm nay thế nào?",
  "Tin tức VN30 mới nhất",
  "Phân tích cổ phiếu VCB",
  "Danh mục tôi có gì nổi bật?",
];

// ─── Tab button ──────────────────────────────────────────────────────────────
function TabBtn({
  active, onClick, icon: Icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
        borderRadius: 7, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
        fontFamily: "inherit",
        background: active ? "rgba(8,73,172,0.08)" : "transparent",
        color: active ? "#0849ac" : "#99a1af",
        transition: "all 0.15s",
      }}
    >
      <Icon style={{ width: 13, height: 13 }} />
      {label}
    </button>
  );
}

// ─── Chat bubble ─────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 12,
    }}>
      <div style={{
        maxWidth: "85%",
        background: isUser ? "#0849ac" : "#f5f8ff",
        color: isUser ? "#fff" : "#1a1a2e",
        border: isUser ? "none" : "1px solid rgba(8,73,172,0.08)",
        borderRadius: isUser ? "12px 12px 4px 12px" : "4px 12px 12px 12px",
        padding: "9px 13px",
        fontSize: "0.8125rem",
        lineHeight: 1.55,
      }}>
        {msg.content}
        <div style={{ fontSize: "0.5625rem", opacity: 0.6, marginTop: 4, textAlign: "right" }}>
          {new Date(msg.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </div>
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

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const cancelRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, loading]);

  if (!actionHubOpen) return null;

  // Clear chat + reset session
  const handleClearChat = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setStreamingText("");
    setLoading(false);
    setSessionId(undefined);
    clearChat();
  }, [clearChat]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    addChatMessage(userMsg);
    setInput("");
    setLoading(true);
    setStreamingText("");

    try {
      const cancel = await sendChatMessage(
        text,
        sessionId,
        contextTicker,
        {
          onChunk: (chunk) => {
            setStreamingText((prev) => prev + chunk);
          },
          onDone: ({ sessionId: newSessionId }) => {
            // Flush streaming text → persistent message
            setStreamingText((prev) => {
              if (prev) {
                addChatMessage({
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: prev,
                  timestamp: new Date().toISOString(),
                });
              }
              return "";
            });
            setSessionId(newSessionId);
            setLoading(false);
            cancelRef.current = null;
          },
          onError: (err) => {
            setStreamingText("");
            addChatMessage({
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠️ ${err}`,
              timestamp: new Date().toISOString(),
            });
            setLoading(false);
            cancelRef.current = null;
          },
        }
      );
      cancelRef.current = cancel;
    } catch (err) {
      setStreamingText("");
      addChatMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ Không thể kết nối BeeAI: ${String(err)}`,
        timestamp: new Date().toISOString(),
      });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <aside style={{
      width: 360,
      flexShrink: 0,
      background: "#ffffff",
      borderLeft: "1px solid rgba(8,73,172,0.08)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        height: 52, flexShrink: 0,
        borderBottom: "1px solid rgba(8,73,172,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #032d6b, #0849ac)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bot style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <div>
            <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.1 }}>BeeAI</p>
            <p style={{ fontSize: "0.5625rem", color: "#0ea5a0", fontWeight: 600 }}>● Trực tuyến</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {chatMessages.length > 0 && (
            <button
              onClick={handleClearChat}
              title="Xóa cuộc hội thoại"
              style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#99a1af" }}
            >
              <RotateCcw style={{ width: 13, height: 13 }} />
            </button>
          )}
          <button
            onClick={toggleActionHub}
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#99a1af" }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: "flex", gap: 2, padding: "8px 12px",
        borderBottom: "1px solid rgba(8,73,172,0.06)", flexShrink: 0,
      }}>
        <TabBtn active={actionHubTab === "chat"}    onClick={() => setActionHubTab("chat")}    icon={Bot}      label="Chat"      />
        <TabBtn active={actionHubTab === "agent"}   onClick={() => setActionHubTab("agent")}   icon={Activity} label="Agent"     />
        <TabBtn active={actionHubTab === "run-log"} onClick={() => setActionHubTab("run-log")} icon={FileText} label="Run Log"   />
      </div>

      {/* ── Chat panel ── */}
      {actionHubTab === "chat" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {chatMessages.length === 0 ? (
              <>
                {/* Welcome */}
                <div style={{
                  background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)",
                  borderRadius: 12, padding: "12px 14px", marginBottom: 14,
                }}>
                  <p style={{ fontSize: "0.8125rem", color: "#1a1a2e", fontWeight: 600, marginBottom: 6 }}>
                    Xin chào! 🐝
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "#6a7282", lineHeight: 1.6 }}>
                    Tôi là BeeAI — trợ lý phân tích thị trường chứng khoán của bạn. Hỏi tôi về VN-Index, cổ phiếu VN30, hay tóm tắt tin tức hôm nay nhé!
                  </p>
                </div>
                {/* Suggestions */}
                <p style={{ fontSize: "0.6875rem", color: "#99a1af", fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>
                  GỢI Ý
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s}
                      onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      style={{
                        textAlign: "left", padding: "9px 12px", borderRadius: 9,
                        border: "1px solid rgba(8,73,172,0.1)", background: "transparent",
                        color: "#1a1a2e", cursor: "pointer", fontSize: "0.8125rem",
                        fontFamily: "inherit", lineHeight: 1.4,
                        transition: "all 0.15s",
                      }}
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
                {chatMessages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)}
                {loading && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                    <div style={{
                      background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)",
                      borderRadius: "4px 12px 12px 12px", padding: "9px 13px",
                      maxWidth: "85%",
                    }}>
                      {streamingText ? (
                        <p style={{ fontSize: "0.8125rem", color: "#1a1a2e", lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>
                          {streamingText}
                          <span style={{
                            display: "inline-block", width: 2, height: "1em",
                            background: "#0849ac", marginLeft: 1, verticalAlign: "text-bottom",
                            animation: "blink 0.8s step-end infinite",
                          }} />
                        </p>
                      ) : (
                        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
                          {[0, 1, 2].map((i) => (
                            <span key={i} style={{
                              width: 6, height: 6, borderRadius: "50%", background: "#0849ac",
                              display: "inline-block", opacity: 0.6,
                              animation: `pulse 1.2s ${i * 0.2}s infinite`,
                            }} />
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

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(8,73,172,0.06)", flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "flex-end", gap: 8,
              background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.12)",
              borderRadius: 12, padding: "8px 12px",
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hỏi về thị trường... (Enter để gửi)"
                rows={1}
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  resize: "none", fontSize: "0.8125rem", color: "#1a1a2e", lineHeight: 1.5,
                  fontFamily: "inherit", maxHeight: 80, overflow: "auto",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "none", flexShrink: 0,
                  background: input.trim() && !loading ? "#0849ac" : "#e5e7eb",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}
              >
                <Send style={{ width: 13, height: 13, color: input.trim() && !loading ? "#fff" : "#9ca3af" }} />
              </button>
            </div>
            <p style={{ fontSize: "0.5625rem", color: "#c4c9d4", marginTop: 5, textAlign: "center" }}>
              {DISCLAIMER}
            </p>
          </div>
        </>
      )}

      {/* ── Agent panel ── */}
      {actionHubTab === "agent" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ textAlign: "center" }}>
            <Activity style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Không có agent đang chạy</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 6, lineHeight: 1.5 }}>
              Chạy một agent từ trang Agents để xem tiến trình ở đây.
            </p>
          </div>
        </div>
      )}

      {/* ── Run Log panel ── */}
      {actionHubTab === "run-log" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ textAlign: "center" }}>
            <FileText style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Chưa có lịch sử chạy</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 6, lineHeight: 1.5 }}>
              Logs của các agent run sẽ hiển thị ở đây.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
