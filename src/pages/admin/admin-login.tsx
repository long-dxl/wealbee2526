import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase/client";
import { Shield, Eye, EyeOff, AlertCircle, KeyRound, Lock } from "lucide-react";
import wealbeeLogo from "../../assets/Logo.svg";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function AdminLogin() {
  const navigate = useNavigate();
  const [account,  setAccount]  = useState("");
  const [password, setPassword] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [showKey,  setShowKey]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Gọi Edge Function admin-auth — verify Admin Key ở server-side
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account, password, admin_key: adminKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xác thực thất bại.");

      // Edge Function trả session token → set vào Supabase client
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token:  json.access_token,
        refresh_token: json.refresh_token,
      });
      if (sessionErr) throw new Error(sessionErr.message);

      navigate("/admin/frameworks", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0B0D18 0%, #0f1628 50%, #0B0D18 100%)",
      fontFamily: "'Montserrat', 'Inter', sans-serif",
    }}>
      {/* Grid texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.04,
        backgroundImage: "linear-gradient(rgba(77,143,232,1) 1px, transparent 1px), linear-gradient(90deg, rgba(77,143,232,1) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420, padding: "0 24px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, borderRadius: 16,
            background: "rgba(77,143,232,0.10)", border: "1px solid rgba(77,143,232,0.22)",
            marginBottom: 16,
          }}>
            <img src={wealbeeLogo} alt="Wealbee" style={{ width: 36, height: 36 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 8 }}>
            <Shield size={13} color="#4D8FE8" />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 4, color: "#4D8FE8", textTransform: "uppercase" }}>
              Restricted Access
            </span>
          </div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "rgba(240,242,255,0.95)", margin: "0 0 6px" }}>
            Admin Panel
          </h1>
          <p style={{ fontSize: 12.5, color: "rgba(240,242,255,0.38)", margin: 0 }}>
            Wealbee Framework Manager — nội bộ
          </p>
        </div>

        {/* Security notice */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
          borderRadius: 10, marginBottom: 20,
          background: "rgba(77,143,232,0.07)", border: "1px solid rgba(77,143,232,0.18)",
        }}>
          <Lock size={13} color="#4D8FE8" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 11.5, color: "rgba(200,215,255,0.65)", lineHeight: 1.6 }}>
            Đây là cổng xác thực hai lớp. Yêu cầu tài khoản admin <em>và</em> Admin Key riêng biệt.
            Người dùng thông thường không thể đăng nhập tại đây.
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={handleLogin} style={{
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: 28,
          backdropFilter: "blur(12px)",
        }}>
          {/* Account */}
          <InputField
            label="TÀI KHOẢN ADMIN"
            type="text"
            value={account}
            onChange={setAccount}
            placeholder="Wealbee_admin_123"
            icon={<Shield size={14} color="rgba(240,242,255,0.35)" />}
            required
          />

          {/* Password */}
          <InputField
            label="MẬT KHẨU"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder="••••••••••••"
            icon={<Lock size={14} color="rgba(240,242,255,0.35)" />}
            required
            endIcon={
              <button type="button" onClick={() => setShowPw(p => !p)} style={eyeBtn}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 18px" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: 10, color: "rgba(240,242,255,0.25)", letterSpacing: 1, fontWeight: 600 }}>XÁC THỰC HAI LỚP</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          {/* Admin Key */}
          <InputField
            label="ADMIN KEY"
            hint="Mã xác thực riêng — không phải mật khẩu"
            type={showKey ? "text" : "password"}
            value={adminKey}
            onChange={setAdminKey}
            placeholder="••••••••••••"
            icon={<KeyRound size={14} color="#4D8FE8" />}
            required
            highlight
            endIcon={
              <button type="button" onClick={() => setShowKey(p => !p)} style={eyeBtn}>
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />

          {/* Error */}
          {error && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 18,
              background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.22)",
              borderRadius: 10, padding: "10px 14px",
            }}>
              <AlertCircle size={14} color="#FF3B30" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: "#FF6B6B", lineHeight: 1.5 }}>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              background: loading ? "rgba(77,143,232,0.35)" : "#4D8FE8",
              color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
              transition: "background 150ms",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={spinner} />
                Đang xác thực hai lớp…
              </>
            ) : (
              <>
                <Shield size={14} />
                Đăng nhập Admin
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(240,242,255,0.18)", marginTop: 20, lineHeight: 1.6 }}>
          Mọi lượt đăng nhập đều được ghi lại.<br />
          Wealbee Internal · Unauthorized access is prohibited.
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InputField({
  label, hint, type, value, onChange, placeholder, icon, endIcon, required, highlight,
}: {
  label: string; hint?: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  icon?: React.ReactNode; endIcon?: React.ReactNode;
  required?: boolean; highlight?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = focused
    ? (highlight ? "#4D8FE8" : "rgba(120,140,200,0.55)")
    : (highlight ? "rgba(77,143,232,0.25)" : "rgba(255,255,255,0.09)");
  const bgColor = highlight
    ? (focused ? "rgba(77,143,232,0.08)" : "rgba(77,143,232,0.04)")
    : "rgba(255,255,255,0.05)";

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: highlight ? "#4D8FE8" : "rgba(240,242,255,0.50)", marginBottom: 7 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: 6, color: "rgba(240,242,255,0.28)", letterSpacing: 0 }}>{hint}</span>}
      </label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {icon && (
          <span style={{ position: "absolute", left: 12, display: "flex", pointerEvents: "none" }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%", padding: `11px ${endIcon ? "40px" : "12px"} 11px ${icon ? "36px" : "12px"}`,
            borderRadius: 9, fontSize: 13.5, outline: "none", boxSizing: "border-box",
            background: bgColor, border: `1px solid ${borderColor}`,
            color: "rgba(240,242,255,0.92)", transition: "border-color 150ms, background 150ms",
          }}
        />
        {endIcon && (
          <span style={{ position: "absolute", right: 4, display: "flex", color: "rgba(240,242,255,0.40)" }}>
            {endIcon}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Inline style objects ───────────────────────────────────────────────────

const eyeBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: "6px 8px",
  color: "rgba(240,242,255,0.40)", display: "flex",
};

const spinner: React.CSSProperties = {
  display: "inline-block", width: 14, height: 14,
  border: "2px solid rgba(255,255,255,0.35)",
  borderTopColor: "#fff", borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
};
