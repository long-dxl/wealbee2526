import { Monitor, X, Sparkles } from "lucide-react";

const FONT = "'Montserrat', system-ui, sans-serif";

interface DesktopOnlyModalProps {
  open: boolean;
  isDark?: boolean;
  onClose: () => void;
}

// Modal thông báo tính năng chỉ tối ưu trên desktop (Agent Studio) — hiện khi
// user mobile bấm "Tạo Agent". Cùng ngôn ngữ thiết kế với CreateAgentModal.
export function DesktopOnlyModal({ open, isDark = false, onClose }: DesktopOnlyModalProps) {
  if (!open) return null;

  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgPanel = isDark ? "#131824" : "#fff";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: bgPanel, boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "0.5px solid " + divider }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: brand + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles style={{ width: 16, height: 16, color: brand }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: fg }}>Tạo Agent</span>
          </div>
          <button onClick={onClose} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", color: fgMuted, display: "flex", padding: 4, WebkitTapHighlightColor: "transparent" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "26px 22px", textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 14px",
            background: isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Monitor size={26} color={brand} strokeWidth={1.6} />
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: fg }}>
            Trải nghiệm tốt nhất trên máy tính
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: fgMuted, lineHeight: 1.65 }}>
            Agent Studio cần không gian thao tác rộng để cấu hình công cụ và điều kiện kích hoạt.
            Vui lòng mở <b>Wealbee trên trình duyệt máy tính</b> để tạo và chỉnh sửa Agent.
          </p>
        </div>

        <div style={{ padding: "0 22px 22px" }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", minHeight: 44, borderRadius: 12, border: "none",
              background: brand, color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT, WebkitTapHighlightColor: "transparent",
            }}
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
