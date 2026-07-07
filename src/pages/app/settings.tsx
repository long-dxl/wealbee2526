import { User, Bell, Shield, Palette, Key } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../../store/appStore";

export function SettingsPage() {
  const { theme, setTheme } = useAppStore();
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifInbox, setNotifInbox] = useState(true);
  const [section, setSection] = useState<"profile" | "notifications" | "appearance" | "security" | "api">("appearance");

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: checked ? "#0849ac" : "#d1d5db", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", width: 18, height: 18, borderRadius: "50%", background: "#fff", top: 3, left: checked ? 22 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
    </button>
  );

  const SECTIONS = [
    { id: "profile",       icon: User,    label: "Hồ sơ" },
    { id: "notifications", icon: Bell,    label: "Thông báo" },
    { id: "appearance",    icon: Palette, label: "Giao diện" },
    { id: "security",      icon: Shield,  label: "Bảo mật" },
    { id: "api",           icon: Key,     label: "API Keys" },
  ] as const;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid rgba(8,73,172,0.08)", padding: "20px 8px" }}>
        <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e", padding: "0 10px", marginBottom: 12 }}>Cài đặt</h2>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setSection(s.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit", background: section === s.id ? "rgba(8,73,172,0.08)" : "transparent", color: section === s.id ? "#0849ac" : "#6a7282", textAlign: "left", marginBottom: 2 }}>
              <Icon style={{ width: 15, height: 15 }} />{s.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {section === "appearance" && (
          <div>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.125rem", fontWeight: 700, color: "#1a1a2e", marginBottom: 20 }}>Giao diện</h2>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e", marginBottom: 12 }}>Theme</p>
              <div style={{ display: "flex", gap: 10 }}>
                {(["light", "dark", "midnight"] as const).map(t => (
                  <button key={t} onClick={() => setTheme(t)} style={{ padding: "10px 20px", borderRadius: 10, border: `2px solid ${theme === t ? "#0849ac" : "rgba(8,73,172,0.1)"}`, background: t === "dark" ? "#1a1a2e" : t === "midnight" ? "#080820" : "#f5f8ff", color: t === "light" ? "#1a1a2e" : "#ffffff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
                    {t === "light" ? "☀️ Light" : t === "dark" ? "🌙 Dark" : "🌌 Midnight"}
                    {theme === t && <span style={{ marginLeft: 6, fontSize: "0.625rem" }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {section === "notifications" && (
          <div>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.125rem", fontWeight: 700, color: "#1a1a2e", marginBottom: 20 }}>Thông báo</h2>
            {[{ label: "Gửi qua Email", desc: "Nhận bản tin hàng ngày qua email", state: notifEmail, set: setNotifEmail }, { label: "Inbox trong app", desc: "Nhận thông báo trong Inbox", state: notifInbox, set: setNotifInbox }].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid rgba(8,73,172,0.06)" }}>
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e" }}>{item.label}</p>
                  <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 2 }}>{item.desc}</p>
                </div>
                <Toggle checked={item.state} onChange={item.set} />
              </div>
            ))}
          </div>
        )}
        {(section === "profile" || section === "security" || section === "api") && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(8,73,172,0.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              {section === "profile" ? <User style={{ width: 22, height: 22, color: "#0849ac" }} /> : section === "security" ? <Shield style={{ width: 22, height: 22, color: "#0849ac" }} /> : <Key style={{ width: 22, height: 22, color: "#0849ac" }} />}
            </div>
            <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1a1a2e" }}>Sắp ra mắt</p>
            <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 6 }}>Tính năng đang được phát triển.</p>
          </div>
        )}
      </div>
    </div>
  );
}
