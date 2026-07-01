import { useNavigate } from "react-router";

// Hiện khi user kích hoạt 1 Agent trigger theo lịch/sự kiện nhưng chưa có danh mục
// (Agent cần mã cổ phiếu từ danh mục để biết theo dõi gì).
export function NeedPortfolioModal({ onDismiss }: { onDismiss: () => void }) {
  const navigate = useNavigate();
  const FONT = "'Montserrat',sans-serif";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.40)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "28px 28px 24px", width: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", fontFamily: FONT }}>
        <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 800, color: "#1a1a2e" }}>Bạn chưa có danh mục</h3>
        <p style={{ margin: "8px 0 22px", fontSize: "0.8125rem", color: "#6a7282", lineHeight: 1.5 }}>
          Agent này cần mã cổ phiếu trong danh mục của bạn để biết cần theo dõi những mã nào.
          Hãy thêm danh mục trước khi kích hoạt Agent.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onDismiss}
            style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", color: "#6a7282", cursor: "pointer", fontWeight: 600, fontSize: "0.8125rem", fontFamily: FONT }}>
            Để sau
          </button>
          <button
            onClick={() => { onDismiss(); navigate("/app/portfolio"); }}
            style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.8125rem", fontFamily: FONT }}>
            Đi tới Danh mục
          </button>
        </div>
      </div>
    </div>
  );
}
