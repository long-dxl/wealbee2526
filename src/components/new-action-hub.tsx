import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, PanelRightClose, Paperclip, ArrowUp,
  Maximize2, RotateCcw, GripVertical, X, Plus,
} from "lucide-react";
import { ContextCard, CardType, DRAG_CARD_MIME, cardTypeQuestions } from "../types/cards";
import { lightTheme, type Theme } from "../lib/theme-context";

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

const mockResponses: Record<string, string> = {
  "Hôm nay có gì đáng chú ý?": `HPG tăng **+4.1%** là điểm nổi bật nhất. Tin insider bán 500k cp xuất hiện lúc 07:20 — thường là dấu hiệu cần theo dõi cẩn thận.\n\nDanh mục bạn: VCB và FPT ổn định, MWG đang giảm dưới ngưỡng cảnh báo.\n\n⚠ Lưu ý: Thông tin này chỉ mang tính tham khảo, không phải tư vấn đầu tư.`,
  "Danh mục tôi đang ổn không?": `Danh mục 5 mã của bạn đang có tổng P&L **+20.7%** YTD.\n\n• VCB, FPT, HPG: tích cực\n• MWG: dưới ngưỡng cảnh báo (-8.7%)\n• VNM: giảm nhẹ nhưng trong biên bình thường\n\nPortfolio Health agent đã gửi alert về MWG lúc 07:55 sáng.`,
  "Điểm nào quan trọng nhất?": `VN-Index +0.42% nhờ **nhóm thép** (HPG +4.1%, HSG +2.8%). Khối ngoại mua ròng **+124 tỷ** tập trung vào HPG và VCB.\n\nNhóm bất động sản tiếp tục chịu áp lực (DXG -2.9%, PDR kịch sàn).`,
  "Chỉ số này đang trong xu hướng gì?": `Dựa trên context card bạn vừa thêm, chỉ số đang trong **uptrend ngắn hạn** với 5 phiên tăng liên tiếp. Hỗ trợ gần nhất tại 1.275 điểm.\n\nKhối lượng hôm nay **trên trung bình 20 phiên** — xác nhận đà tăng đang có nền tảng dòng tiền.`,
  "Dòng tiền ngoại đang mua hay bán?": `Khối ngoại đang **mua ròng +124 tỷ** phiên hôm nay, tập trung vào HPG (+87 tỷ) và VCB (+41 tỷ).\n\nĐây là phiên mua ròng thứ 3 liên tiếp — tín hiệu tích cực cho nhóm large-cap.`,
  "Danh mục của tôi rủi ro nhất ở đâu?": `Dựa trên context danh mục bạn thêm vào, rủi ro tập trung nhất tại **MWG (-8.7%)** đang tiếp tục test đáy hỗ trợ.\n\nGợi ý: Đặt stop-loss tại 59,500 nếu không muốn cắt lỗ toàn bộ. Các mã còn lại đang trong ngưỡng an toàn.`,
  "Tin này ảnh hưởng đến danh mục tôi ra sao?": `Với context tin tức bạn thêm vào, tác động trực tiếp lên danh mục:\n\n• **HPG**: hưởng lợi tích cực — giá thép HRC phục hồi thường kéo theo +3-5% trong 1-2 tuần\n• **VCB**: trung lập\n• Các mã còn lại: không có tác động trực tiếp\n\nNên theo dõi thêm 1-2 phiên trước khi quyết định.`,
  "Tại sao mã này đang biến động mạnh?": `Dựa trên context mã bạn thêm, biến động hôm nay chủ yếu đến từ **2 catalyst**:\n\n1. Báo cáo kết quả kinh doanh Q1 vượt kỳ vọng (+18% YoY)\n2. Thông tin cổ đông lớn tăng tỷ trọng\n\nKhối lượng giao dịch gấp **3.2 lần** trung bình 20 phiên — đây không phải pump nhỏ lẻ.`,
};

const cardTypeLabel: Record<CardType, string> = {
  index: "Chỉ số",
  portfolio: "Danh mục",
  news: "Tin tức",
  ticker: "Cổ phiếu",
  mover: "Top mover",
  tool: "Công cụ AI",
  report: "Báo cáo",
};

const cardTypeBg: Record<CardType, { bg: string; text: string; border: string }> = {
  index: { bg: "rgba(8,73,172,0.08)", text: "#0849AC", border: "rgba(8,73,172,0.20)" },
  portfolio: { bg: "rgba(52,199,89,0.10)", text: "#1a7a3a", border: "rgba(52,199,89,0.25)" },
  news: { bg: "rgba(99,102,241,0.10)", text: "#6366F1", border: "rgba(99,102,241,0.20)" },
  ticker: { bg: "rgba(109,40,217,0.08)", text: "#7c3aed", border: "rgba(109,40,217,0.20)" },
  mover: { bg: "rgba(255,149,0,0.10)", text: "#FF9500", border: "rgba(255,149,0,0.25)" },
  tool: { bg: "rgba(255,59,48,0.08)", text: "#c41a1a", border: "rgba(255,59,48,0.20)" },
  report: { bg: "rgba(79,142,255,0.10)", text: "#1a4fa0", border: "rgba(79,142,255,0.25)" },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  contextSnapshot?: string[];
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
  contextCards, onAddContextCard, onRemoveContextCard,
  isDark = false, theme = lightTheme,
}: ActionHubProps) {
  const t = theme;
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

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

  /* ── Chat ── */
  const fireQuestion = (question: string) => {
    const snapshot = contextCards.map((c) => c.label);
    setMessages((prev) => [...prev, { role: "user", content: question, time: "vừa xong", contextSnapshot: snapshot }]);
    setIsTyping(true);
    setTimeout(() => {
      const response =
        mockResponses[question] ||
        `Tôi đang phân tích "${question}"${snapshot.length ? ` với context: ${snapshot.join(", ")}` : ""}.\n\nĐây là thông tin tham khảo, không phải tư vấn đầu tư theo Luật Chứng khoán 2019.`;
      setMessages((prev) => [...prev, { role: "assistant", content: response, time: "vừa xong" }]);
      setIsTyping(false);
    }, 1200);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    fireQuestion(inputValue);
    setInputValue("");
  };

  return (
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

          {!isAtDefault && (
            <button
              onClick={() => onWidthChange(DEFAULT_WIDTH)}
              title={`Reset về ${DEFAULT_WIDTH}px`}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                borderRadius: 6, border: "0.5px solid " + t.borderStrong,
                background: t.bgAccent, cursor: "pointer",
                color: t.brand, fontSize: 11, fontWeight: 700,
                fontFamily: "'Montserrat', system-ui, sans-serif", flexShrink: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = t.bgAccentActive; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = t.bgAccent; }}
            >
              <RotateCcw size={11} strokeWidth={2} /> Reset
            </button>
          )}

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

        {/* Context chips — shown when cards have been dropped */}
        {contextCards.length > 0 && (
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: "0.5px solid " + t.border,
            background: isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.025)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Sparkles size={12} color={t.brand} strokeWidth={1.5} />
              <span style={{ fontSize: 12, fontWeight: 600, color: t.brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                Context
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: t.brand,
                background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)",
                borderRadius: 99, padding: "1px 6px",
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}>
                {contextCards.length}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {contextCards.map((card) => {
                const style = cardTypeBg[card.type];
                return (
                  <div
                    key={card.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "4px 8px 4px 10px", borderRadius: 99,
                      background: style.bg, border: `0.5px solid ${style.border}`,
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: style.text, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {cardTypeLabel[card.type]}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: style.text }}>
                      {card.label}
                    </span>
                    {card.badge && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: style.text, opacity: 0.75 }}>
                        {card.badge}
                      </span>
                    )}
                    <button
                      onClick={() => onRemoveContextCard(card.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        marginLeft: 2, display: "flex", alignItems: "center",
                        color: style.text, opacity: 0.6,
                      }}
                      title="Xóa khỏi context"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Drop hint while no drag active */}
            <p style={{ margin: "8px 0 0", fontSize: 11, color: t.brand, fontFamily: "'Montserrat', system-ui, sans-serif", opacity: 0.55 }}>
              Kéo thêm card vào đây để AI phân tích chính xác hơn
            </p>
          </div>
        )}

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
                    fontSize: 13, fontWeight: 500, color: t.fg,
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
                  <div style={{
                    background: t.bgMuted, border: "0.5px solid " + t.border,
                    borderRadius: "4px 14px 14px 14px", padding: "12px 14px",
                    fontSize: 14, color: t.fg,
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    lineHeight: 1.6, whiteSpace: "pre-line",
                  }}>
                    {msg.content.split("**").map((part, idx) =>
                      idx % 2 === 1 ? <strong key={idx}>{part}</strong> : part
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Sparkles size={14} color={t.brand} strokeWidth={1.5} />
                <span style={{ fontSize: 12, color: t.fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                  Wealbee đang phân tích...
                </span>
              </div>
              <div style={{
                background: t.bgMuted, border: "0.5px solid " + t.border,
                borderRadius: "4px 14px 14px 14px", padding: "12px 14px",
                display: "flex", gap: 4, alignItems: "center",
              }}>
                {[0, 1, 2].map((j) => (
                  <div key={j} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: t.brand, opacity: 0.6,
                    animation: `pulse 1.2s ease-in-out ${j * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{
          padding: "14px 16px 12px",
          borderTop: "0.5px solid " + t.border,
          flexShrink: 0,
          background: t.hubBg,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: t.inputBg,
            borderRadius: 20,
            border: contextCards.length > 0
              ? "1px solid " + t.brand
              : "1px solid " + t.inputBorder,
            padding: "10px 10px 10px 16px",
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
  );
}
