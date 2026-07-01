import { useState, useEffect } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";

const FONT = "'Montserrat', system-ui, sans-serif";

interface CreateAgentModalProps {
  open: boolean;
  isDark?: boolean;
  onCancel: () => void;
  onContinue: (name: string, description: string) => void;
}

// Modal "Tạo Agent mới" dùng chung cho mọi entry point (sidebar, Agent của tôi, Mẫu Agent).
// Chỉ điều hướng sang trang Agent Studio khi user bấm "Tiếp tục"; Huỷ/X/click ra ngoài
// đều đóng modal tại chỗ, không đổi route — giữ nguyên trang đang xem.
export function CreateAgentModal({ open, isDark = false, onCancel, onContinue }: CreateAgentModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) { setName(""); setDescription(""); }
  }, [open]);

  if (!open) return null;

  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.55)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgPanel = isDark ? "#131824" : "#fff";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)";
  const inputBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.18)";

  const canContinue = name.trim().length > 0;
  const submit = () => canContinue && onContinue(name.trim(), description.trim());

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: bgPanel, boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "0.5px solid " + divider }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: brand + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles style={{ width: 16, height: 16, color: brand }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: fg }}>Tạo Agent mới</span>
          </div>
          <button onClick={onCancel} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", color: fgMuted, display: "flex", padding: 2 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div style={{ padding: 22 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: fg, marginBottom: 8 }}>
            Tên Agent <span style={{ color: "#e0524d" }}>*</span>
          </label>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 40))}
              placeholder="Đặt tên ngắn gọn, dễ nhận biết"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 54px 11px 14px", borderRadius: 10, border: "1px solid " + inputBorder, background: bgMuted, color: fg, fontSize: 14, fontFamily: FONT, outline: "none" }}
            />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: fgSubtle }}>{name.length}/40</span>
          </div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: fg, marginBottom: 8 }}>
            Mô tả chức năng <span style={{ fontSize: 12, fontWeight: 500, color: fgSubtle }}>(tùy chọn)</span>
          </label>
          <div style={{ position: "relative" }}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 800))}
              placeholder="Giới thiệu ngắn về chức năng của agent — hiển thị cho người dùng."
              rows={4}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px 24px", borderRadius: 10, border: "1px solid " + inputBorder, background: bgMuted, color: fg, fontSize: 14, fontFamily: FONT, outline: "none", resize: "vertical", lineHeight: 1.5 }}
            />
            <span style={{ position: "absolute", right: 12, bottom: 12, fontSize: 11, color: fgSubtle }}>{description.length}/800</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "0.5px solid " + divider }}>
          <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid " + inputBorder, background: "transparent", color: fgMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Huỷ</button>
          <button
            onClick={submit}
            disabled={!canContinue}
            style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: canContinue ? brand : (isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb"), color: canContinue ? "#fff" : fgDisabled, fontSize: 13, fontWeight: 700, cursor: canContinue ? "pointer" : "not-allowed", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            Tiếp tục <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
