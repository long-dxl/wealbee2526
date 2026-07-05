/** Card thông báo user vừa nhận Pro trial 7 ngày miễn phí. */
import { Sparkles, Check, X } from "lucide-react";

const FONT = "'Montserrat', system-ui, sans-serif";

export function TrialGrantedModal({ days = 7, isDark, onClose }: { days?: number; isDark: boolean; onClose: () => void }) {
  const cardBg = isDark ? "#131824" : "#fff";
  const fg = isDark ? "rgba(240,242,255,0.94)" : "#1A1A2E";
  const sub = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.6)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";

  const perks = ["5 Agent · 100 Beeny/ngày", "Deep Research + báo cáo đầy đủ", "Gửi email theo lịch riêng", "Ưu tiên xử lý"];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.58)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: cardBg, borderRadius: 20, width: "100%", maxWidth: 400, padding: 28,
        boxShadow: "0 24px 70px rgba(0,0,0,0.4)", position: "relative", textAlign: "center",
      }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: sub, padding: 4 }}>
          <X size={20} />
        </button>

        <div style={{
          width: 68, height: 68, borderRadius: "50%", margin: "6px auto 16px",
          background: "linear-gradient(135deg, #0a2a6e 0%, #1a56c8 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Sparkles size={32} color="#fff" strokeWidth={1.6} />
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", color: brand, marginBottom: 6 }}>QUÀ TẶNG TỪ WEALBEE</div>
        <h3 style={{ fontSize: 22, fontWeight: 800, color: fg, margin: "0 0 8px", lineHeight: 1.3 }}>
          Bạn nhận được <span style={{ color: brand }}>Pro</span> miễn phí {days} ngày!
        </h3>
        <p style={{ fontSize: 14, color: sub, margin: "0 0 18px" }}>
          Trải nghiệm toàn bộ sức mạnh của Wealbee. Đã kích hoạt sẵn — dùng ngay không cần thẻ.
        </p>

        <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 9, marginBottom: 22, padding: "0 6px" }}>
          {perks.map(p => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Check size={16} color="#34C759" strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, color: fg }}>{p}</span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
          background: brand, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}>
          Bắt đầu khám phá
        </button>
      </div>
    </div>
  );
}
