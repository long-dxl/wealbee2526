import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff, Moon, Sun, CheckCircle2 } from "lucide-react";
import { WealbeeLogo } from "../components/wealbee-logo";
import { useTheme } from "../use-theme";
import { supabase } from "../../../../../lib/supabase/client";

export function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const canvas = "var(--wb-canvas)";
  const card = isDark ? "#0e0e16" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "#ffffff" : "#1a1a2e";
  const muted = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const faint = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.28)";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  // Luồng: đăng nhập → (bắt buộc đổi mật khẩu) → xong
  const [mode, setMode] = useState<"login" | "change" | "done">("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeToken, setChangeToken] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const borderFor = (f: string) => (focused === f ? "#4D8FE8" : border);
  const labelFor = (f: string) => (focused === f ? "#4D8FE8" : muted);

  const inputStyle = (f: string, withIcon = false) => ({
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${borderFor(f)}`,
    outline: "none",
    padding: withIcon ? "6px 32px 10px 0" : "6px 0 10px",
    fontFamily: "Montserrat, sans-serif",
    fontSize: 15,
    color: text,
    transition: "border-color .18s",
  });
  const labelStyle = (f: string) => ({
    display: "block",
    fontFamily: "Montserrat, sans-serif",
    fontSize: 12.5,
    fontWeight: 600,
    color: labelFor(f),
    marginBottom: 8,
    letterSpacing: "0.02em",
    transition: "color .18s",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        throw new Error(
          authError.message === "Invalid login credentials"
            ? "Email hoặc mật khẩu không đúng."
            : authError.message,
        );
      }
      const mustChange = !!data.user?.user_metadata?.must_change_password;
      if (mustChange) {
        setMode("change");
      } else {
        navigate("/app");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (newPass.length < 8) { setError("Mật khẩu mới phải có ít nhất 8 ký tự."); return; }
    if (newPass !== confirmPass) { setError("Mật khẩu xác nhận không khớp."); return; }
    setSubmitting(true);
    try {
      // Sau signInWithPassword đã có session → updateUser đổi mật khẩu + gỡ cờ bắt buộc đổi
      const { error: updErr } = await supabase.auth.updateUser({
        password: newPass,
        data: { must_change_password: false },
      });
      if (updErr) throw new Error(updErr.message);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "change" ? "Đổi mật khẩu." : mode === "done" ? "Thành công." : "Đăng nhập.";
  const subtitle =
    mode === "change"
      ? "Vì lý do bảo mật, hãy đặt mật khẩu mới cho lần đăng nhập đầu."
      : mode === "done"
      ? "Bạn đã đăng nhập vào Wealbee."
      : "Chào mừng trở lại Wealbee.";

  return (
    <div
      className={isDark ? "wb-dark" : "wb-light"}
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: canvas, fontFamily: "Montserrat, sans-serif" }}
    >
      {/* Top bar */}
      <header>
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5">
          <Link to="/" className="flex items-center">
            <WealbeeLogo size={30} />
          </Link>
          <div className="flex items-center gap-4">
            <button type="button" onClick={toggleTheme} aria-label="Chuyển giao diện" className="transition-opacity hover:opacity-60" style={{ color: muted }}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {/* Mobile ẩn — câu này gãy 2 dòng làm header chật, và cuối form đã có
                sẵn "Chưa có tài khoản? Yêu cầu bản Demo →" nên không mất lối vào */}
            <span className="max-sm:hidden" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: muted }}>
              Chưa có tài khoản?{" "}
              <Link to="/" style={{ color: "#4D8FE8", fontWeight: 600, textDecoration: "none" }}>
                Yêu cầu Demo
              </Link>
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="overflow-hidden rounded-2xl" style={{ background: card, border: `1px solid ${border}`, boxShadow: isDark ? "0 24px 80px rgba(0,0,0,0.4)" : "0 24px 80px rgba(0,0,0,0.08)" }}>
            {/* Header */}
            <div className="px-8 pt-8 pb-6" style={{ borderBottom: `1px solid ${border}` }}>
              <h1 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 28, lineHeight: 1.1, color: text, marginBottom: 6 }}>
                {title}
              </h1>
              <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14, color: muted }}>{subtitle}</p>
            </div>

            {/* ── Thành công ── */}
            {mode === "done" && (
              <div className="px-8 py-10 text-center">
                <CheckCircle2 size={52} style={{ color: "#4D8FE8", margin: "0 auto 18px" }} />
                <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 15, color: text, lineHeight: 1.6 }}>
                  Đăng nhập thành công! Chào mừng bạn đến với Wealbee.
                </p>
                <Link to="/" className="mt-7 inline-flex w-full items-center justify-center rounded-xl py-3.5 text-white transition-all hover:opacity-90" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 15, background: "var(--wb-primary)", textDecoration: "none" }}>
                  Vào trang chủ
                </Link>
              </div>
            )}

            {/* ── Đổi mật khẩu lần đầu ── */}
            {mode === "change" && (
              <form className="px-8 py-7" onSubmit={handleChangePassword}>
                <div className="flex flex-col gap-7">
                  <div>
                    <label style={labelStyle("newpass")}>Mật khẩu mới<span style={{ color: "#4D8FE8", marginLeft: 2 }}>*</span></label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"} value={newPass} onChange={(e) => setNewPass(e.target.value)}
                        onFocus={() => setFocused("newpass")} onBlur={() => setFocused(null)}
                        placeholder="Ít nhất 8 ký tự" required autoComplete="new-password" style={inputStyle("newpass", true)}
                      />
                      <button type="button" onClick={() => setShowPass((v) => !v)} tabIndex={-1} aria-label="Toggle password" className="absolute right-0 top-1 transition-opacity hover:opacity-60" style={{ color: muted }}>
                        {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle("confirm")}>Xác nhận mật khẩu<span style={{ color: "#4D8FE8", marginLeft: 2 }}>*</span></label>
                    <input
                      type={showPass ? "text" : "password"} value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                      onFocus={() => setFocused("confirm")} onBlur={() => setFocused(null)}
                      placeholder="Nhập lại mật khẩu mới" required autoComplete="new-password" style={inputStyle("confirm")}
                    />
                  </div>
                </div>

                {error && <p className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, color: "#FF3B30" }}>{error}</p>}

                <button type="submit" disabled={submitting} className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-white transition-all hover:opacity-90 disabled:opacity-60" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 15, background: "var(--wb-primary)" }}>
                  {submitting ? "Đang lưu…" : <>Đặt mật khẩu &amp; vào <ArrowRight size={16} /></>}
                </button>
              </form>
            )}

            {/* ── Đăng nhập ── */}
            {mode === "login" && (
              <form className="px-8 py-7" onSubmit={handleLogin}>
                <div className="flex flex-col gap-7">
                  <div>
                    <label style={labelStyle("email")}>Email<span style={{ color: "#4D8FE8", marginLeft: 2 }}>*</span></label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                      placeholder="ban@email.com" required autoComplete="email" style={inputStyle("email")}
                    />
                  </div>
                  <div>
                    <label style={labelStyle("password")}>Mật khẩu<span style={{ color: "#4D8FE8", marginLeft: 2 }}>*</span></label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                        placeholder="••••••••" required autoComplete="current-password" style={inputStyle("password", true)}
                      />
                      <button type="button" onClick={() => setShowPass((v) => !v)} tabIndex={-1} aria-label="Toggle password" className="absolute right-0 top-1 transition-opacity hover:opacity-60" style={{ color: muted }}>
                        {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                    <div className="mt-2.5 text-right">
                      <button type="button" className="transition-opacity hover:opacity-70" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12.5, color: "#4D8FE8", background: "none", border: "none", cursor: "pointer" }}>
                        Quên mật khẩu?
                      </button>
                    </div>
                  </div>
                </div>

                {error && <p className="mt-4" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, color: "#FF3B30" }}>{error}</p>}

                <button type="submit" disabled={submitting} className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-white transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: 15, background: "var(--wb-primary)" }}>
                  {submitting ? "Đang đăng nhập…" : <>Đăng nhập <ArrowRight size={16} /></>}
                </button>

                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1" style={{ background: border }} />
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 12, color: muted }}>hoặc</span>
                  <div className="h-px flex-1" style={{ background: border }} />
                </div>

                <p className="text-center" style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13.5, color: muted }}>
                  Chưa có tài khoản?{" "}
                  <Link to="/" style={{ color: "#4D8FE8", fontWeight: 600, textDecoration: "none" }}>
                    Yêu cầu bản Demo →
                  </Link>
                </p>

                <p className="mt-5 text-center" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: faint, lineHeight: 1.6 }}>
                  Bằng cách đăng nhập, bạn đồng ý với Điều khoản &amp; Chính sách bảo mật của Wealbee.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
