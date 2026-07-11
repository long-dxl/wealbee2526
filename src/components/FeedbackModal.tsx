import { useEffect, useRef, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, Bug, Lightbulb, Heart, MoreHorizontal,
  Paperclip, Star, Send, Loader2, CheckCircle2,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import {
  submitFeedback, type FeedbackType,
  MAX_FEEDBACK_ATTACHMENTS, MAX_FEEDBACK_ATTACHMENT_BYTES, FEEDBACK_ATTACHMENT_ACCEPT,
} from "../lib/feedback";

const FONT = "'Montserrat', system-ui, sans-serif";
const MESSAGE_MAX = 1000;

interface FeedbackModalProps {
  open: boolean;
  isDark?: boolean;
  onClose: () => void;
}

interface Category {
  id: FeedbackType;
  label: string;
  hint: string;
  icon: React.ElementType;
}

const CATEGORIES: Category[] = [
  { id: "bug", label: "Báo lỗi", hint: "Tính năng hoạt động sai hoặc không như mong đợi", icon: Bug },
  { id: "feature", label: "Đề xuất tính năng mới", hint: "Ý tưởng giúp Wealbee tốt hơn", icon: Lightbulb },
  { id: "experience", label: "Chia sẻ trải nghiệm", hint: "Cảm nhận của bạn khi dùng Wealbee", icon: Heart },
  { id: "other", label: "Khác", hint: "Góp ý không thuộc các mục trên", icon: MoreHorizontal },
];

const STEP_TITLE: Record<1 | 2 | 3, string> = {
  1: "Gửi phản hồi",
  2: "Mô tả chi tiết",
  3: "Mức độ hài lòng",
};

// Modal Feedback dùng chung cho toàn app — mở từ nút trong footer sidebar (ngay trên "Cài đặt").
// Flow tuần tự: (1) chọn loại phản hồi → (2) mô tả + đính kèm ảnh → (3) đánh giá sao,
// bước (3) chỉ xuất hiện khi loại là "Chia sẻ trải nghiệm". Thông tin người gửi lấy thẳng
// từ tài khoản đăng nhập (useAuth), không cho nhập tay.
export function FeedbackModal({ open, isDark = false, onClose }: FeedbackModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1); setType(null); setMessage(""); setImages([]); setRating(null);
      setHoverRating(null); setSubmitting(false); setError(""); setDone(false);
    }
  }, [open]);

  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  if (!open) return null;

  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.80)" : "#3D3D52";
  const fgSubtle = isDark ? "rgba(240,242,255,0.55)" : "#6b7280";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgPanel = isDark ? "#131824" : "#fff";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.10)";
  const inputBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.18)";
  const danger = "#e0524d";
  const success = isDark ? "#4ADE80" : "#16A34A";

  const totalSteps = type === "experience" ? 3 : 2;
  const activeRating = hoverRating ?? rating;

  const close = () => { if (!submitting) onClose(); };

  const pickType = (id: FeedbackType) => { setType(id); setError(""); setStep(2); };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    const room = MAX_FEEDBACK_ATTACHMENTS - images.length;
    if (room <= 0) { setError(`Chỉ được đính kèm tối đa ${MAX_FEEDBACK_ATTACHMENTS} ảnh.`); return; }
    const accepted: File[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!f.type.startsWith("image/")) { setError("Chỉ chấp nhận file ảnh."); continue; }
      if (f.size > MAX_FEEDBACK_ATTACHMENT_BYTES) { setError(`Ảnh "${f.name}" vượt quá 10MB.`); continue; }
      accepted.push(f);
    }
    if (accepted.length) setImages((prev) => [...prev, ...accepted]);
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setSubmitting(true); setError("");
    const result = await submitFeedback({ type: type!, message, rating: type === "experience" ? rating : null, images });
    setSubmitting(false);
    if (!result.success) { setError(result.message || "Có lỗi xảy ra, vui lòng thử lại."); return; }
    setDone(true);
  };

  const goNext = () => {
    if (step === 2) {
      if (!message.trim()) { setError("Vui lòng nhập mô tả chi tiết."); return; }
      if (type === "experience") { setError(""); setStep(3); return; }
      handleSubmit();
      return;
    }
    if (step === 3) handleSubmit();
  };

  const goBack = () => {
    setError("");
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const btnSecondary: React.CSSProperties = {
    padding: "9px 16px", borderRadius: 9, border: "1px solid " + inputBorder, background: "transparent",
    color: fgMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
    display: "flex", alignItems: "center", gap: 6,
  };
  const canPrimary = step === 2 ? message.trim().length > 0 : true;
  const btnPrimary: React.CSSProperties = {
    padding: "9px 20px", borderRadius: 9, border: "none",
    background: canPrimary && !submitting ? brand : (isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb"),
    color: canPrimary && !submitting ? "#fff" : fgDisabled,
    fontSize: 13, fontWeight: 700, cursor: canPrimary && !submitting ? "pointer" : "not-allowed",
    fontFamily: FONT, display: "flex", alignItems: "center", gap: 6,
  };

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "100%", borderRadius: 16, overflow: "hidden", background: bgPanel, boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 0.5px " + divider }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "0.5px solid " + divider }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!done && step > 1 && (
              <button onClick={goBack} aria-label="Quay lại" style={{ background: "none", border: "none", cursor: "pointer", color: fgMuted, display: "flex", padding: 2, marginLeft: -4 }}>
                <ChevronLeft style={{ width: 18, height: 18 }} />
              </button>
            )}
            <span style={{ fontSize: 16, fontWeight: 700, color: fg }}>{done ? "Đã gửi phản hồi" : STEP_TITLE[step]}</span>
          </div>
          <button onClick={close} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", color: fgMuted, display: "flex", padding: 2 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {done ? (
          <div style={{ padding: "36px 24px 30px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <CheckCircle2 style={{ width: 44, height: 44, color: success, marginBottom: 14 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: fg, margin: "0 0 6px" }}>Cảm ơn phản hồi của bạn!</p>
            <p style={{ fontSize: 13, color: fgSubtle, lineHeight: "20px", margin: "0 0 22px", maxWidth: 340 }}>
              Đội ngũ Wealbee đã nhận được ý kiến của bạn và sẽ xem xét sớm nhất.
            </p>
            <button onClick={onClose} style={{ ...btnPrimary, background: brand, color: "#fff" }}>Đóng</button>
          </div>
        ) : (
          <>
            {/* Progress + user info */}
            <div style={{ padding: "12px 20px 0" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i < step ? brand : (isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)"), transition: "background 150ms ease" }} />
                ))}
              </div>
              {user && (
                <p style={{ fontSize: 11, color: fgSubtle, margin: "0 0 8px" }}>
                  Gửi với tài khoản <span style={{ fontWeight: 600, color: fgMuted }}>{user.email}</span>
                </p>
              )}
            </div>

            <div style={{ padding: "6px 20px 20px" }}>
              {/* Step 1: loại phản hồi */}
              {step === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => pickType(cat.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 12px",
                          borderRadius: 12, border: "1px solid " + inputBorder, background: bgMuted,
                          cursor: "pointer", textAlign: "left", fontFamily: FONT,
                        }}
                      >
                        <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: brand + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon style={{ width: 17, height: 17, color: brand }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: fg }}>{cat.label}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: fgSubtle }}>{cat.hint}</p>
                        </div>
                        <ChevronRight style={{ width: 16, height: 16, color: fgDisabled, flexShrink: 0 }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Step 2: mô tả + đính kèm ảnh */}
              {step === 2 && (
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: fg, marginBottom: 8 }}>
                    Mô tả chi tiết <span style={{ color: danger }}>*</span>
                  </label>
                  <div style={{ position: "relative", marginBottom: 18 }}>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                      placeholder="Hãy mô tả chi tiết vấn đề, đề xuất hoặc cảm nhận của bạn..."
                      rows={5}
                      autoFocus
                      style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px 22px", borderRadius: 10, border: "1px solid " + inputBorder, background: bgMuted, color: fg, fontSize: 14, fontFamily: FONT, outline: "none", resize: "vertical", lineHeight: 1.5 }}
                    />
                    <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 11, color: fgSubtle }}>{message.length}/{MESSAGE_MAX}</span>
                  </div>

                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: fg, marginBottom: 8 }}>
                    Ảnh đính kèm <span style={{ fontSize: 12, fontWeight: 600, color: fgSubtle }}>(tuỳ chọn, tối đa {MAX_FEEDBACK_ATTACHMENTS} ảnh, mỗi ảnh ≤10MB)</span>
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {previews.map((src, idx) => (
                      <div key={idx} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: "1px solid " + inputBorder }}>
                        <img src={src} alt={images[idx]?.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <button
                          onClick={() => removeImage(idx)}
                          aria-label="Xoá ảnh"
                          style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                        >
                          <X style={{ width: 11, height: 11 }} />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_FEEDBACK_ATTACHMENTS && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{ width: 72, height: 72, borderRadius: 10, border: "1.5px dashed " + inputBorder, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: fgSubtle }}
                      >
                        <Paperclip style={{ width: 16, height: 16 }} />
                        <span style={{ fontSize: 10, fontWeight: 600 }}>Thêm ảnh</span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={FEEDBACK_ATTACHMENT_ACCEPT}
                      multiple
                      hidden
                      onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: đánh giá (chỉ khi "Chia sẻ trải nghiệm") */}
              {step === 3 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 4px" }}>
                  <p style={{ margin: 0, fontSize: 13, color: fgSubtle, textAlign: "center" }}>Trải nghiệm của bạn với Wealbee thế nào? <span style={{ fontWeight: 600 }}>(không bắt buộc)</span></p>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onMouseEnter={() => setHoverRating(s)}
                        onMouseLeave={() => setHoverRating(null)}
                        onClick={() => setRating(rating === s ? null : s)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" }}
                      >
                        <Star style={{ width: 26, height: 26, color: (activeRating ?? 0) >= s ? "#FBBF24" : (isDark ? "rgba(255,255,255,0.18)" : "#D1D5DB"), fill: (activeRating ?? 0) >= s ? "#FBBF24" : "none" }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p style={{ fontSize: 12, color: danger, marginTop: 12, marginBottom: 0 }}>{error}</p>}
            </div>

            {/* Footer */}
            {step > 1 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "0.5px solid " + divider }}>
                <button onClick={goBack} style={btnSecondary}>Quay lại</button>
                <button onClick={goNext} disabled={!canPrimary || submitting} style={btnPrimary}>
                  {submitting ? (
                    <><Loader2 style={{ width: 14, height: 14, animation: "feedback-spin 0.8s linear infinite" }} /> Đang gửi...</>
                  ) : step === 3 || (step === 2 && type !== "experience") ? (
                    <><Send style={{ width: 13, height: 13 }} /> Gửi phản hồi</>
                  ) : (
                    <>Tiếp tục <ChevronRight style={{ width: 14, height: 14 }} /></>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes feedback-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
