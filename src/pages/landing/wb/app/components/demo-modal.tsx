import { useState } from "react";
import { X, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../../../../lib/supabase/client";

interface FormData {
  email: string;
  hoTen: string;
  dienThoai: string;
  congTy: string;
  loaiNhaDauTu: string;
  loinhan: string;
}

function UnderlineInput({
  label,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
  isDark,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  isDark: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const textColor = isDark ? "#ffffff" : "#1a1a2e";
  const borderColor = focused
    ? "#4D8FE8"
    : isDark
    ? "rgba(255,255,255,0.22)"
    : "rgba(0,0,0,0.22)";
  const labelColor = focused
    ? "#4D8FE8"
    : isDark
    ? "rgba(255,255,255,0.5)"
    : "rgba(0,0,0,0.5)";

  return (
    <div className="relative pb-1">
      <label
        style={{
          display: "block",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 12.5,
          fontWeight: 600,
          color: labelColor,
          marginBottom: 8,
          transition: "color .2s",
          letterSpacing: "0.02em",
        }}
      >
        {label}
        {required && <span style={{ color: "#4D8FE8", marginLeft: 2 }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${borderColor}`,
          outline: "none",
          padding: "6px 0 10px",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 15,
          color: textColor,
          transition: "border-color .2s",
        }}
      />
    </div>
  );
}

function UnderlineTextarea({
  label,
  value,
  onChange,
  required,
  isDark,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  isDark: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const textColor = isDark ? "#ffffff" : "#1a1a2e";
  const borderColor = focused
    ? "#4D8FE8"
    : isDark
    ? "rgba(255,255,255,0.22)"
    : "rgba(0,0,0,0.22)";
  const labelColor = focused
    ? "#4D8FE8"
    : isDark
    ? "rgba(255,255,255,0.5)"
    : "rgba(0,0,0,0.5)";

  return (
    <div className="relative pb-1">
      <label
        style={{
          display: "block",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 12.5,
          fontWeight: 600,
          color: labelColor,
          marginBottom: 8,
          transition: "color .2s",
          letterSpacing: "0.02em",
        }}
      >
        {label}
        {required && <span style={{ color: "#4D8FE8", marginLeft: 2 }}>*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        rows={3}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${borderColor}`,
          outline: "none",
          padding: "6px 0 10px",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 15,
          color: textColor,
          resize: "none",
          transition: "border-color .2s",
        }}
      />
    </div>
  );
}

function UnderlineSelect({
  label,
  value,
  onChange,
  options,
  isDark,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  isDark: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const textColor = isDark ? "#ffffff" : "#1a1a2e";
  const borderColor = focused
    ? "#4D8FE8"
    : isDark
    ? "rgba(255,255,255,0.22)"
    : "rgba(0,0,0,0.22)";
  const labelColor = focused
    ? "#4D8FE8"
    : isDark
    ? "rgba(255,255,255,0.5)"
    : "rgba(0,0,0,0.5)";

  return (
    <div className="relative pb-1">
      <label
        style={{
          display: "block",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 12.5,
          fontWeight: 600,
          color: labelColor,
          marginBottom: 8,
          transition: "color .2s",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${borderColor}`,
          outline: "none",
          padding: "6px 0 10px",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 15,
          color: value ? textColor : labelColor,
          appearance: "none",
          cursor: "pointer",
          transition: "border-color .2s",
        }}
      >
        <option value="" disabled style={{ color: "#888" }}>Chọn...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: isDark ? "#0e0e16" : "#fff", color: isDark ? "#fff" : "#1a1a2e" }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ─── Success state ─── */
function SuccessView({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle2 size={52} style={{ color: "#4D8FE8", marginBottom: 20 }} />
      <h3 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 22, color: isDark ? "#fff" : "#1a1a2e", marginBottom: 12 }}>
        Đã nhận yêu cầu!
      </h3>
      <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 15, lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)", maxWidth: 340 }}>
        Đội ngũ Wealbee sẽ liên hệ với bạn trong vòng 24 giờ để sắp xếp buổi demo phù hợp.
      </p>
      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: 28,
          fontFamily: "Montserrat, sans-serif",
          fontWeight: 600,
          fontSize: 14,
          color: "#4D8FE8",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        Đóng
      </button>
    </div>
  );
}

/* ─── Main modal ─── */
export function DemoModal({ open, onClose, theme }: { open: boolean; onClose: () => void; theme: "dark" | "light" }) {
  const isDark = theme === "dark";
  const bg = isDark ? "#0b0b13" : "#ffffff";
  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const [form, setForm] = useState<FormData>({ email: "", hoTen: "", dienThoai: "", congTy: "", loaiNhaDauTu: "", loinhan: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormData) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Email không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }
    // Validate số điện thoại Việt Nam (nếu có nhập)
    const phone = form.dienThoai.replace(/[\s.\-()]/g, "");
    if (phone && !/^(0\d{9}|\+84\d{9})$/.test(phone)) {
      setError("Số điện thoại không hợp lệ (ví dụ: 0912 345 678).");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("demo-request", {
        body: {
          email: form.email,
          ho_ten: form.hoTen,
          dien_thoai: form.dienThoai,
          cong_ty: form.congTy,
          loai_nha_dau_tu: form.loaiNhaDauTu,
          loi_nhan: form.loinhan,
        },
      });
      if (fnError) {
        // Edge Function trả lỗi (vd email không hợp lệ) — đọc message nếu có
        let msg = "Gửi không thành công, vui lòng thử lại.";
        try { msg = (await fnError.context?.json?.())?.error || msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      if (data && (data as any).error) throw new Error((data as any).error);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => { setSubmitted(false); setError(null); setSubmitting(false); setForm({ email: "", hoTen: "", dienThoai: "", congTy: "", loaiNhaDauTu: "", loinhan: "" }); }, 350);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-0 top-16 z-[61] mx-auto my-auto flex max-h-[90vh] max-w-[560px] flex-col overflow-hidden rounded-2xl"
            style={{
              background: bg,
              border: `1px solid ${dividerColor}`,
              boxShadow: isDark
                ? "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)"
                : "0 32px 80px rgba(0,0,0,0.18)",
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-8 pt-8 pb-6" style={{ borderBottom: `1px solid ${dividerColor}` }}>
              <div>
                <h2 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 28, lineHeight: 1.1, color: isDark ? "#ffffff" : "#1a1a2e" }}>
                  Thông tin liên hệ
                </h2>
                <p className="mt-1.5" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)" }}>
                  Chúng tôi sẽ gửi tài khoản demo sớm nhất.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Đóng"
                style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)", marginTop: 4 }}
                className="transition-opacity hover:opacity-70"
              >
                <X size={22} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {submitted ? (
                <SuccessView isDark={isDark} onClose={handleClose} />
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  <UnderlineInput label="Email" type="email" value={form.email} onChange={set("email")} required placeholder="ban@email.com" isDark={isDark} />
                  <UnderlineInput label="Họ và tên" value={form.hoTen} onChange={set("hoTen")} required placeholder="Nguyễn Văn A" isDark={isDark} />
                  <UnderlineInput label="Số điện thoại" type="tel" value={form.dienThoai} onChange={set("dienThoai")} placeholder="0912 345 678" isDark={isDark} />
                  <UnderlineSelect
                    label="Bạn là"
                    value={form.loaiNhaDauTu}
                    onChange={set("loaiNhaDauTu")}
                    isDark={isDark}
                    options={[
                      { value: "ca-nhan", label: "Nhà đầu tư cá nhân" },
                      { value: "moi-gioi", label: "Môi giới / KOL tài chính" },
                      { value: "cong-ty", label: "Công ty chứng khoán" },
                      { value: "khac", label: "Khác" },
                    ]}
                  />
                  {(form.loaiNhaDauTu === "cong-ty" || form.loaiNhaDauTu === "khac") && (
                    <UnderlineInput label="Công ty / Tổ chức" value={form.congTy} onChange={set("congTy")} required placeholder="Tên công ty / tổ chức của bạn" isDark={isDark} />
                  )}
                  <UnderlineTextarea label="Bạn muốn Wealbee giúp gì?" value={form.loinhan} onChange={set("loinhan")} required isDark={isDark} />

                  <div className="pt-2 pb-4">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-white transition-all hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 15, background: "var(--wb-primary)" }}
                    >
                      {submitting ? "Đang gửi…" : <>Gửi yêu cầu <ArrowRight size={16} /></>}
                    </button>
                    {error && (
                      <p className="mt-3" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, color: "#FF3B30" }}>
                        {error}
                      </p>
                    )}
                    <p className="mt-4" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.35)" }}>
                      Thông tin của bạn được bảo mật tuyệt đối. Không spam.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
