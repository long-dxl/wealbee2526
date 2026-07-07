import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, PanelRightClose, Paperclip, ArrowUp,
  Maximize2, RotateCcw, GripVertical, X, Plus, SquarePen,
} from "lucide-react";
import { ContextCard, CardType, DRAG_CARD_MIME, cardTypeQuestions } from "../types/cards";
import { lightTheme, type Theme } from "../lib/theme-context";
import { sendChatMessage, type ToolStep } from "../lib/supabase/bee-ai";
import { notifyWalletChanged } from "../lib/wallet-events";
import { MdContent } from "./MdContent";

// Render inline markdown + wealbee-platform XML tags
// Handles: **bold**, [text](url), bare URLs, <ticker>, <pos>, <neg>, <cite url="">
function renderInline(text: string, linkColor: string): React.ReactNode[] {
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(\*\*([^*]+)\*\*)|(https?:\/\/\S+)|(<ticker>([^<]+)<\/ticker>)|(<pos>([^<]+)<\/pos>)|(<neg>([^<]+)<\/neg>)|(<cite url="([^"]*)">(.*?)<\/cite>)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0, key = 0, m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      // [text](url)
      nodes.push(<a key={key++} href={m[3]} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, textDecoration: "underline", wordBreak: "break-all" }}>{m[2]}</a>);
    } else if (m[4]) {
      // **bold**
      nodes.push(<strong key={key++}>{m[5]}</strong>);
    } else if (m[6]) {
      // bare URL
      nodes.push(<a key={key++} href={m[6]} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, textDecoration: "underline", fontSize: 12, wordBreak: "break-all" }}>{m[6]}</a>);
    } else if (m[7]) {
      // <ticker>SYM</ticker> → styled chip
      nodes.push(<span key={key++} style={{ display: "inline-block", padding: "1px 6px", borderRadius: 5, background: "rgba(8,73,172,0.09)", color: linkColor, fontSize: "0.88em", fontWeight: 700, margin: "0 1px" }}>{m[8]}</span>);
    } else if (m[9]) {
      // <pos>+X%</pos> → green
      nodes.push(<span key={key++} style={{ color: "#4CAF50", fontWeight: 600 }}>{m[10]}</span>);
    } else if (m[11]) {
      // <neg>-X%</neg> → red
      nodes.push(<span key={key++} style={{ color: "#F44336", fontWeight: 600 }}>{m[12]}</span>);
    } else if (m[13]) {
      // <cite url="...">label</cite> → orange underline link
      nodes.push(<a key={key++} href={m[14]} target="_blank" rel="noopener noreferrer" style={{ color: "#FF6B35", textDecoration: "underline", fontWeight: 600 }}>[{m[15]}]</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}


// Render a full message: handles ### headers, --- dividers, and inline markdown per line
function renderMessage(content: string, linkColor: string, fgSubtle: string): React.ReactNode[] {
  return content.split("\n").map((line, i) => {
    // H3 header
    if (/^###\s+/.test(line)) {
      const text = line.replace(/^###\s+/, "");
      return <div key={i} style={{ fontWeight: 700, fontSize: 13, marginTop: 10, marginBottom: 2, letterSpacing: 0.2 }}>{renderInline(text, linkColor)}</div>;
    }
    // H2 header
    if (/^##\s+/.test(line)) {
      const text = line.replace(/^##\s+/, "");
      return <div key={i} style={{ fontWeight: 700, fontSize: 14, marginTop: 12, marginBottom: 3 }}>{renderInline(text, linkColor)}</div>;
    }
    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      return <hr key={i} style={{ border: "none", borderTop: `1px solid ${fgSubtle}30`, margin: "6px 0" }} />;
    }
    // Warning line (⚠️)
    if (line.startsWith("⚠️") || line.startsWith("- ⚠️")) {
      return <div key={i} style={{ background: "rgba(255,149,0,0.10)", border: "0.5px solid rgba(255,149,0,0.3)", borderRadius: 6, padding: "6px 10px", margin: "4px 0", fontSize: 12, color: "#b45309" }}>{renderInline(line.replace(/^-\s*/, ""), linkColor)}</div>;
    }
    // Empty line → spacer
    if (!line.trim()) {
      return <div key={i} style={{ height: 6 }} />;
    }
    // Normal line (with inline markdown)
    return <div key={i} style={{ lineHeight: 1.65 }}>{renderInline(line, linkColor)}</div>;
  });
}

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 260;
const MAX_WIDTH = 680;

interface ActionHubProps {
  currentPage: string;
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  contextCards: ContextCard[];
  onAddContextCard: (c: ContextCard) => void;
  onRemoveContextCard: (id: string) => void;
  onClearContextCards: () => void;
  isDark?: boolean;
  theme?: Theme;
}

const pageQuickActions: Record<string, string[]> = {
  dashboard: ["Hôm nay có gì đáng chú ý?", "Danh mục tôi đang ổn không?", "Tôi nên làm gì sáng nay?"],
  market: ["Điểm nào quan trọng nhất?", "Ngành nào hưởng lợi hôm nay?", "Mã nào nên theo dõi?"],
  tickers: ["Rủi ro chính của mã này?", "So sánh với ngành tương tự?", "Định giá hiện tại hợp lý không?"],
  inbox: ["Giải thích số liệu này?", "Tôi nên làm gì với thông tin này?", "Brief này có đáng tin không?"],
  agents: ["Agent nào cần chú ý?", "Nên tạo agent mới gì?", "Agent nào hiệu quả nhất?"],
  portfolio: ["Danh mục tôi có cân bằng không?", "Rủi ro nào tôi đang gánh chịu?", "Tôi nên rebalance không?"],
};


const cardTypeLabel: Record<CardType, string> = {
  index: "Chỉ số",
  portfolio: "Danh mục",
  news: "Tin tức",
  ticker: "Cổ phiếu",
  mover: "Top mover",
  tool: "Công cụ AI",
  report: "Báo cáo",
  knowledge: "Knowledge",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  contextSnapshot?: string[];
  streaming?: boolean;
  steps?: ToolStep[];
  cotVisible?: boolean;
  streamingStartMs?: number;
  thinkingDurationMs?: number;
  refs?: { index: number; label: string; url: string }[];
}

const contextLabel: Record<string, string> = {
  dashboard: "Dashboard · Tổng quan ngày",
  market: "Market Pulse · Hôm nay",
  tickers: "Tickers · Danh sách cổ phiếu",
  inbox: "Inbox · Briefs & Alerts",
  agents: "My Agents · Quản lý agent",
  portfolio: "Portfolio · Danh mục của tôi",
  knowledge: "Knowledge Base",
  settings: "Settings",
  templates: "Agent Templates",
  tools: "Tool Library",
};

export function ActionHub({
  currentPage, open, onClose, width, onWidthChange,
  contextCards, onAddContextCard, onRemoveContextCard, onClearContextCards,
  isDark = false, theme = lightTheme,
}: ActionHubProps) {
  const t = theme;
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const cancelRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleCot = (idx: number) => {
    setMessages(prev => prev.map((m, i) =>
      i === idx ? { ...m, cotVisible: !m.cotVisible } : m
    ));
  };

  // Resize drag
  const [isDraggingResize, setIsDraggingResize] = useState(false);
  const [isHandleHovered, setIsHandleHovered] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(DEFAULT_WIDTH);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  // Card drop
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragEnterCounter, setDragEnterCounter] = useState(0);

  const isAtDefault = width === DEFAULT_WIDTH;
  const displayWidth = liveWidth ?? width;

  // Smart suggestions: use last context card if any, otherwise use page defaults
  const quickActions: string[] = (() => {
    if (contextCards.length > 0) {
      const lastType = contextCards[contextCards.length - 1].type;
      return cardTypeQuestions[lastType] || pageQuickActions[currentPage] || pageQuickActions["dashboard"];
    }
    return pageQuickActions[currentPage] || pageQuickActions["dashboard"];
  })();

  /* ── Resize handle ── */
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingResize(true);
    setDragStartX(e.clientX);
    setDragStartWidth(width);
    setLiveWidth(width);
  }, [width]);

  useEffect(() => {
    if (!isDraggingResize) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = dragStartX - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth + delta));
      setLiveWidth(next);
      onWidthChange(next);
    };
    const onMouseUp = () => { setIsDraggingResize(false); setLiveWidth(null); };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDraggingResize, dragStartX, dragStartWidth, onWidthChange]);

  /* ── Card drop handlers ── */
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_CARD_MIME)) return;
    e.preventDefault();
    setDragEnterCounter((n) => n + 1);
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setDragEnterCounter((n) => {
      const next = n - 1;
      if (next <= 0) setIsDragOver(false);
      return Math.max(0, next);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_CARD_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDragEnterCounter(0);
    const raw = e.dataTransfer.getData(DRAG_CARD_MIME);
    if (!raw) return;
    try {
      const card = JSON.parse(raw) as ContextCard;
      onAddContextCard(card);
    } catch {}
  };

  /* ── Auto-scroll ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  /* ── Chat ── */
  const fireQuestion = useCallback(async (question: string) => {
    if (isTyping) return;
    cancelRef.current?.();

    const snapshot = contextCards.map((c) => c.label);
    const contextHint = snapshot.length ? `\n[Context: ${snapshot.join(", ")}]` : "";
    const fullMessage = question + contextHint;

    setMessages((prev) => [...prev, { role: "user", content: question, time: "vừa xong", contextSnapshot: snapshot }]);
    setIsTyping(true);

    // Add empty streaming bubble
    const streamStart = Date.now();
    setMessages((prev) => [...prev, { role: "assistant", content: "", time: "vừa xong", streaming: true, streamingStartMs: streamStart }]);

    try {
      const cardPayloads = contextCards.map(c => ({ id: c.id, type: c.type, label: c.label, badge: c.badge, summary: c.summary }));
      const cancel = await sendChatMessage(fullMessage, sessionId, cardPayloads.length ? cardPayloads : null, {
        onChunk: (chunk) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            }
            return prev;
          });
        },
        onStep: (step) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last?.streaming) return prev;
            const steps = last.steps ?? [];
            const existingIdx = steps.findIndex(s => s.name === step.name);
            const newSteps = existingIdx >= 0
              ? steps.map((s, i) => i === existingIdx ? step : s)
              : [...steps, step];
            return [...prev.slice(0, -1), { ...last, steps: newSteps }];
          });
        },
        onDone: ({ sessionId: newId, refs }) => {
          const elapsed = Date.now() - streamStart;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, streaming: false, thinkingDurationMs: elapsed, refs }];
            }
            return prev;
          });
          if (newId) setSessionId(newId);
          setIsTyping(false);
          cancelRef.current = null;
          notifyWalletChanged();  // Beeny vừa bị trừ → refresh sidebar + badge
          // Context đã dùng xong cho câu hỏi này — dọn để user kéo context mới cho câu tiếp theo
          if (snapshot.length) onClearContextCards();
        },
        onError: (err) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, content: `⚠️ ${err}`, streaming: false }];
            }
            return prev;
          });
          setIsTyping(false);
          cancelRef.current = null;
        },
      });
      cancelRef.current = cancel;
    } catch (err) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, content: `⚠️ Không thể kết nối BeeAI: ${String(err)}`, streaming: false }];
        }
        return prev;
      });
      setIsTyping(false);
    }
  }, [isTyping, contextCards, sessionId, onClearContextCards]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    fireQuestion(inputValue);
    setInputValue("");
  };

  // Đoạn chat mới — như ChatGPT/Claude: huỷ stream đang chạy (nếu có), xoá sạch
  // hội thoại + sessionId (backend nhận biết đây là phiên mới) + context đã kéo.
  const handleNewChat = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setMessages([]);
    setSessionId(undefined);
    setIsTyping(false);
    setInputValue("");
    onClearContextCards();
  };

  return (
    <>
    <style>{`
      @keyframes pulse { 0%,100%{opacity:0.4;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.1)} }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes spin { to{transform:rotate(360deg)} }
    `}</style>
    <aside
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        width: open ? displayWidth : 0,
        minWidth: open ? displayWidth : 0,
        transition: isDraggingResize ? "none" : "width 200ms ease-out, min-width 200ms ease-out",
        overflow: "hidden",
        background: t.hubBg,
        borderLeft: "0.5px solid " + t.border,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* ── Drop overlay ── */}
      {isDragOver && open && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 200,
          background: isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.06)",
          border: `2px dashed ${t.brand}`,
          borderRadius: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, pointerEvents: "none",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: t.brand, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(8,73,172,0.30)",
          }}>
            <Plus size={26} color="#fff" strokeWidth={2} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: t.brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              Thêm vào context AI
            </p>
            <p style={{ margin: 0, fontSize: 13, color: t.fgMuted, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              AI sẽ trả lời thông minh hơn
            </p>
          </div>
        </div>
      )}

      {/* ── Resize handle ── */}
      {open && (
        <div
          onMouseDown={handleResizeMouseDown}
          onDoubleClick={() => onWidthChange(DEFAULT_WIDTH)}
          onMouseEnter={() => setIsHandleHovered(true)}
          onMouseLeave={() => setIsHandleHovered(false)}
          title="Kéo để thay đổi kích thước · Double-click để reset"
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 12,
            cursor: "col-resize", zIndex: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            width: isDraggingResize ? 3 : isHandleHovered ? 2 : 1,
            height: "100%",
            background: isDraggingResize ? t.brand : isHandleHovered ? t.borderStrong : t.border,
            transition: isDraggingResize ? "none" : "all 150ms ease",
            borderRadius: 2,
          }} />
          {(isHandleHovered || isDraggingResize) && (
            <div style={{
              position: "absolute", top: "50%", transform: "translateY(-50%)",
              background: isDraggingResize ? t.brand : t.hubBg,
              borderRadius: 6, padding: "4px 2px",
              boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.40)" : "0 2px 8px rgba(8,73,172,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "0.5px solid " + t.borderStrong,
            }}>
              <GripVertical size={14} strokeWidth={1.5} color={isDraggingResize ? "#fff" : t.brand} />
            </div>
          )}
        </div>
      )}

      {/* ── Width badge during resize ── */}
      {isDraggingResize && (
        <div style={{
          position: "absolute", top: 12, left: 16,
          background: t.brand, color: "#fff", fontSize: 11, fontWeight: 700,
          padding: "3px 8px", borderRadius: 6, zIndex: 30,
          fontFamily: "'Montserrat', system-ui, sans-serif", pointerEvents: "none",
        }}>
          {Math.round(displayWidth)}px
        </div>
      )}

      {/* ── Panel content ── */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          padding: "0 14px 0 18px", height: 52,
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "0.5px solid " + t.border, flexShrink: 0,
        }}>
          <div style={{ width: 3, height: 20, borderRadius: 1.5, background: t.brand, flexShrink: 0 }} />
          <Sparkles size={16} color={t.brand} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={{
            flex: 1, fontFamily: "'Montserrat', system-ui, sans-serif",
            fontWeight: 600, fontSize: 15, color: t.fg,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            Action Hub
          </span>

          <button
            onClick={handleNewChat}
            disabled={messages.length === 0 && contextCards.length === 0}
            title="Đoạn chat mới"
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
              borderRadius: 6, border: "0.5px solid " + t.borderStrong,
              background: t.bgAccent, cursor: messages.length === 0 && contextCards.length === 0 ? "default" : "pointer",
              color: t.brand, fontSize: 11, fontWeight: 700, flexShrink: 0,
              fontFamily: "'Montserrat', system-ui, sans-serif",
              opacity: messages.length === 0 && contextCards.length === 0 ? 0.45 : 1,
            }}
            onMouseEnter={(e) => { if (messages.length || contextCards.length) (e.currentTarget as HTMLElement).style.background = t.bgAccentActive; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = t.bgAccent; }}
          >
            <SquarePen size={12} strokeWidth={2} /> Đoạn chat mới
          </button>

          {/* Reset độ rộng — luôn hiện; mờ đi khi đang ở mặc định */}
          <button
            onClick={() => onWidthChange(DEFAULT_WIDTH)}
            disabled={isAtDefault}
            title={`Reset độ rộng về ${DEFAULT_WIDTH}px`}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
              borderRadius: 6, border: "0.5px solid " + t.borderStrong,
              background: t.bgAccent, cursor: isAtDefault ? "default" : "pointer",
              color: t.brand, fontSize: 11, fontWeight: 700, opacity: isAtDefault ? 0.45 : 1,
              fontFamily: "'Montserrat', system-ui, sans-serif", flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (!isAtDefault) (e.currentTarget as HTMLElement).style.background = t.bgAccentActive; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = t.bgAccent; }}
          >
            <RotateCcw size={11} strokeWidth={2} /> Reset
          </button>

          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.fgSubtle, padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }} title="Đóng">
            <PanelRightClose size={18} strokeWidth={1.5} />
          </button>
          <button style={{ background: "transparent", border: "none", cursor: "pointer", color: t.fgSubtle, padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }} title="Toàn màn hình">
            <Maximize2 size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Context indicator row */}
        <div style={{
          padding: "8px 16px", background: t.bgMuted,
          borderBottom: "0.5px solid " + t.border, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: t.fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif", flex: 1 }}>
            {contextLabel[currentPage] || "Wealbee"}
          </span>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Empty state with quick actions */}
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {contextCards.length === 0 && (
                <div style={{
                  border: `1px dashed ${t.borderStrong}`, borderRadius: 14,
                  padding: "18px 14px", textAlign: "center", marginBottom: 4,
                  background: t.bgAccent,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11,
                    background: isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.09)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <GripVertical size={18} color={t.brand} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: t.brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                      Kéo card vào đây
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: t.fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.55 }}>
                      Thả chỉ số, danh mục, tin tức<br />để AI phân tích có context
                    </p>
                  </div>
                </div>
              )}

              <span style={{ fontSize: 12, color: t.fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 2 }}>
                {contextCards.length > 0 ? "Câu hỏi gợi ý cho context này:" : "Gợi ý câu hỏi:"}
              </span>
              {quickActions.map((label) => (
                <button
                  key={label}
                  onClick={() => fireQuestion(label)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 12px", borderRadius: 10,
                    border: "none",
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)",
                    cursor: "pointer", textAlign: "left",
                    transition: "background 120ms ease",
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    fontSize: 13, fontWeight: 600, color: t.fg,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = t.bgAccentActive; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)"; }}
                >
                  <Sparkles size={12} color={t.brand} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.8 }} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Message history */}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div style={{ display: "flex", justifyContent: "flex-end", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {msg.contextSnapshot && msg.contextSnapshot.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {msg.contextSnapshot.map((label) => (
                        <span key={label} style={{ fontSize: 10, background: t.bgAccentStrong, color: t.brand, padding: "2px 7px", borderRadius: 99, fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 600 }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{
                    background: t.brand, color: "#fff",
                    padding: "10px 14px", borderRadius: "14px 14px 4px 14px",
                    maxWidth: "85%", fontSize: 14,
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                  }}>
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Sparkles size={14} color={t.brand} strokeWidth={1.5} />
                    <span style={{ fontSize: 12, color: t.fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                      Wealbee · {msg.time}
                    </span>
                  </div>
                  {/* Tool step indicators */}
                  {msg.steps && msg.steps.length > 0 && (
                    msg.streaming ? (
                      /* While streaming: show inline live steps */
                      <div style={{
                        marginBottom: 8,
                        display: "flex", flexDirection: "column", gap: 4,
                        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.04)",
                        border: "0.5px solid " + t.border,
                        borderRadius: 8, padding: "8px 10px",
                      }}>
                        <span style={{ fontSize: 10, color: t.fgSubtle, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 2 }}>
                          Đang phân tích
                        </span>
                        {msg.steps.map((step) => (
                          <div key={step.name} style={{
                            display: "flex", alignItems: "center", gap: 7,
                            fontSize: 12, color: step.status === "done" ? t.fgSubtle : t.fg,
                            fontFamily: "'Montserrat', system-ui, sans-serif",
                          }}>
                            {step.status === "loading" ? (
                              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: `2px solid ${t.brand}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: "#34c759", flexShrink: 0 }}>
                                <span style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>✓</span>
                              </span>
                            )}
                            <span style={{ opacity: step.status === "done" ? 0.55 : 1 }}>{step.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* After done: collapsible CoT button like wealbee-platform */
                      <div style={{ marginBottom: 8 }}>
                        <button
                          onClick={() => toggleCot(i)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "5px 10px 5px 8px", borderRadius: 8, width: "100%",
                            border: "0.5px solid " + t.borderStrong,
                            background: msg.cotVisible
                              ? (isDark ? "rgba(8,73,172,0.08)" : "rgba(8,73,172,0.05)")
                              : "transparent",
                            cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif",
                            transition: "background 150ms", textAlign: "left",
                          }}
                        >
                          <span style={{ fontSize: 12, color: t.brand, flexShrink: 0 }}>✦</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.brand, flex: 1 }}>
                            Xem quá trình phân tích&nbsp;
                            {msg.thinkingDurationMs !== undefined
                              ? `${(msg.thinkingDurationMs / 1000).toFixed(1)}s`
                              : `${msg.steps.length} bước`}
                          </span>
                          <span style={{ fontSize: 10, color: t.fgDisabled }}>{msg.cotVisible ? "∧" : "∨"}</span>
                        </button>
                        {msg.cotVisible && (
                          <div style={{
                            marginTop: 5, padding: "10px 12px",
                            borderRadius: "4px 10px 10px 10px",
                            border: "0.5px solid " + t.borderStrong,
                            background: isDark ? "rgba(8,73,172,0.04)" : "rgba(8,73,172,0.02)",
                            display: "flex", flexDirection: "column", gap: 6,
                          }}>
                            {msg.steps.map((step, j) => (
                              <div key={step.name} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                <span style={{ fontSize: 10, color: "#4CAF50", fontWeight: 700, marginTop: 1, flexShrink: 0 }}>✓</span>
                                <span style={{ fontSize: 12, color: t.fgSubtle, lineHeight: 1.45, flex: 1, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{step.label}</span>
                                <span style={{ fontSize: 10, color: t.fgDisabled, flexShrink: 0 }}>+{j}s</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                  <div style={{
                    background: t.bgMuted, border: "0.5px solid " + t.border,
                    borderRadius: "4px 14px 14px 14px", padding: "12px 14px",
                    fontSize: 14, color: t.fg,
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                  }}>
                    {msg.content
                      ? <MdContent text={msg.content} refs={msg.refs} />
                      : (
                        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {[0,1,2].map(j => (
                            <span key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: t.brand, opacity: 0.6, display: "inline-block", animation: `pulse 1.2s ease-in-out ${j*0.2}s infinite` }} />
                          ))}
                        </span>
                      )
                    }
                    {msg.streaming && msg.content && (
                      <span style={{ display: "inline-block", width: 2, height: "1em", background: t.brand, marginLeft: 1, verticalAlign: "text-bottom", animation: "blink 0.8s step-end infinite" }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: "14px 16px 12px",
          borderTop: "0.5px solid " + t.border,
          flexShrink: 0,
          background: t.hubBg,
        }}>
          <div style={{
            display: "flex", flexDirection: "column", gap: contextCards.length > 0 ? 8 : 0,
            background: t.inputBg,
            borderRadius: 18,
            border: contextCards.length > 0
              ? "1px solid " + t.brand
              : "1px solid " + t.inputBorder,
            padding: "10px 12px",
            boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.30)" : "0 4px 20px rgba(8,73,172,0.10), 0 1px 4px rgba(0,0,0,0.05)",
            transition: "border-color 150ms ease, box-shadow 150ms ease",
          }}
            onFocus={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = t.brand;
              (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 20px rgba(0,0,0,0.40)" : "0 4px 20px rgba(8,73,172,0.15), 0 1px 4px rgba(0,0,0,0.06)";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = contextCards.length > 0 ? t.brand : t.inputBorder;
              (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 20px rgba(0,0,0,0.30)" : "0 4px 20px rgba(8,73,172,0.10), 0 1px 4px rgba(0,0,0,0.05)";
            }}
          >
            {/* Context chips — như file đính kèm trong ô chat của Claude/ChatGPT: nằm
                ngay trong composer, một tông xanh brand duy nhất, không phân biệt màu
                theo loại card (chỉ phân biệt bằng nhãn chữ TIN TỨC/BÁO CÁO/...). */}
            {contextCards.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {contextCards.map((card) => (
                  <div
                    key={card.id}
                    title={card.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "4px 7px 4px 9px", borderRadius: 8,
                      background: t.bgAccent, border: "1px solid " + t.border,
                      maxWidth: "100%", minWidth: 0,
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                    }}
                  >
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: t.brand, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {cardTypeLabel[card.type]}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: t.fg,
                      minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {card.label}
                    </span>
                    {card.badge && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: t.fgSubtle }}>
                        {card.badge}
                      </span>
                    )}
                    <button
                      onClick={() => onRemoveContextCard(card.id)}
                      style={{
                        flexShrink: 0,
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        marginLeft: 2, display: "flex", alignItems: "center",
                        color: t.fgSubtle,
                      }}
                      title="Xóa khỏi context"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: t.fgSubtle, padding: 0, display: "flex",
                alignItems: "center", flexShrink: 0,
                transition: "color 150ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = t.brand; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = t.fgSubtle; }}
            >
              <Paperclip size={17} strokeWidth={1.5} />
            </button>
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={contextCards.length > 0 ? `Hỏi về ${contextCards.map(c => c.label).join(", ")}…` : "Hỏi bất cứ điều gì…"}
              style={{
                flex: 1, border: "none", background: "transparent", outline: "none",
                fontSize: 14, fontFamily: "'Montserrat', system-ui, sans-serif",
                color: t.fg, lineHeight: 1.5,
              }}
            />
            <button
              onClick={handleSend}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: inputValue.trim()
                  ? t.brand
                  : t.bgAccent,
                border: "none", cursor: inputValue.trim() ? "pointer" : "default",
                color: inputValue.trim() ? "#fff" : t.fgDisabled,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "all 200ms ease",
                boxShadow: inputValue.trim() ? "0 4px 12px rgba(8,73,172,0.35)" : "none",
                transform: inputValue.trim() ? "scale(1)" : "scale(0.92)",
              }}
              onMouseEnter={(e) => {
                if (inputValue.trim()) {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 18px rgba(8,73,172,0.45)";
                  (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (inputValue.trim()) {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(8,73,172,0.35)";
                  (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                }
              }}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
          </div>
          <p style={{
            fontSize: 10.5, color: t.fgDisabled, marginTop: 8,
            textAlign: "center", fontFamily: "'Montserrat', system-ui, sans-serif",
            letterSpacing: "0.01em",
          }}>
            Wealbee cung cấp thông tin · không phải tư vấn đầu tư theo Luật Chứng khoán 2019
          </p>
        </div>
      </div>

      {/* Drag overlay to prevent text selection during resize */}
      {isDraggingResize && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, cursor: "col-resize" }} />
      )}
    </aside>
    </>
  );
}
