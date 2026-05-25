// AICopilot — ActionHub right panel
// This is a temporary stub; full ActionHub with Claude streaming is built separately
import { Bot, X, Send } from "lucide-react";
import { useState } from "react";

interface AICopilotProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AICopilot({ isOpen, onToggle }: AICopilotProps) {
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  return (
    <aside style={{
      width: 360,
      flexShrink: 0,
      background: "#ffffff",
      borderLeft: "1px solid rgba(8,73,172,0.1)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        height: 52,
        borderBottom: "1px solid rgba(8,73,172,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
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
            <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.2 }}>BeeAI</p>
            <p style={{ fontSize: "0.625rem", color: "#0ea5a0", fontWeight: 500 }}>● Online</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#99a1af" }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* Welcome message */}
        <div style={{
          background: "#f5f8ff",
          border: "1px solid rgba(8,73,172,0.08)",
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 12,
        }}>
          <p style={{ fontSize: "0.8125rem", color: "#1a1a2e", lineHeight: 1.6 }}>
            Xin chào! Tôi là BeeAI, trợ lý thông minh của Wealbee. 🐝
          </p>
          <p style={{ fontSize: "0.75rem", color: "#6a7282", marginTop: 6, lineHeight: 1.5 }}>
            Tôi có thể giúp bạn phân tích thị trường, tra cứu thông tin cổ phiếu, và tóm tắt tin tức tài chính.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            "VN-Index hôm nay?",
            "Phân tích VCB",
            "Tin tức VN30",
            "Danh mục của tôi",
          ].map((q) => (
            <button key={q}
              onClick={() => setMessage(q)}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: "0.6875rem", fontWeight: 500,
                border: "1px solid rgba(8,73,172,0.15)", background: "transparent", color: "#0849ac", cursor: "pointer",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{
        padding: "12px 14px",
        borderTop: "1px solid rgba(8,73,172,0.08)",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 8,
          background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.15)",
          borderRadius: 12, padding: "8px 12px",
        }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Hỏi về thị trường chứng khoán..."
            rows={1}
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              resize: "none", fontSize: "0.8125rem", color: "#1a1a2e", lineHeight: 1.5,
              fontFamily: "inherit",
            }}
          />
          <button
            style={{
              width: 28, height: 28, borderRadius: 8, border: "none", flexShrink: 0,
              background: message.trim() ? "#0849ac" : "#d1d5db",
              cursor: message.trim() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Send style={{ width: 13, height: 13, color: "#fff" }} />
          </button>
        </div>
        <p style={{ fontSize: "0.5625rem", color: "#99a1af", marginTop: 6, textAlign: "center" }}>
          BeeAI không đưa ra khuyến nghị mua/bán chứng khoán.
        </p>
      </div>
    </aside>
  );
}
