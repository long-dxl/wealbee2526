import { useState } from "react";
import { Bell, Shield, CreditCard, User, Moon, Globe, ChevronRight, Check } from "lucide-react";
import { useTheme } from "../../lib/theme-context";

type SettingsSection = "profile" | "notifications" | "privacy" | "billing" | "appearance";

const sidebarItems = [
  { id: "profile" as SettingsSection, label: "Hồ sơ", icon: User },
  { id: "notifications" as SettingsSection, label: "Thông báo", icon: Bell },
  { id: "appearance" as SettingsSection, label: "Giao diện", icon: Moon },
  { id: "privacy" as SettingsSection, label: "Quyền riêng tư", icon: Shield },
  { id: "billing" as SettingsSection, label: "Gói dịch vụ", icon: CreditCard },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 99, cursor: "pointer", flexShrink: 0,
        background: checked ? "#0849AC" : "rgba(26,26,46,0.20)",
        position: "relative", transition: "background 200ms ease",
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: checked ? "calc(100% - 22px)" : 2,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transition: "left 200ms ease", boxShadow: "0 1px 4px rgba(0,0,0,0.20)",
      }} />
    </div>
  );
}

export function Settings() {
  const { isDark, setDark, theme } = useTheme();
  const [section, setSection] = useState<SettingsSection>("profile");
  const [notifs, setNotifs] = useState({ email: true, push: true, weeklyReport: false, agentAlert: true });
  const [language, setLanguage] = useState("vi");

  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08)";
  const headingColor = theme.fg;
  const labelColor = theme.fgMuted;
  const subtleColor = theme.fgSubtle;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7";
  const inputBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.20)";

  const plans = [
    { id: "free", name: "Free", price: "0đ", period: "/tháng", features: ["5 agents tối đa", "500k tokens/ngày", "Watchlist 10 mã", "Daily Digest + Portfolio Health"] },
    { id: "pro", name: "Pro", price: "199,000đ", period: "/tháng", features: ["20 agents", "5M tokens/ngày", "Watchlist 50 mã", "Tất cả 6 templates", "Deep Research", "Email digest"], popular: true },
    { id: "proplus", name: "Pro+", price: "499,000đ", period: "/tháng", features: ["Không giới hạn agents", "20M tokens/ngày", "Watchlist 200 mã", "Priority support", "Custom tools", "API access"] },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: headingColor, margin: "0 0 20px" }}>Settings</h1>
      <div style={{ display: "flex", gap: 20 }}>
        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: active ? (isDark ? "rgba(77,143,232,0.18)" : "rgba(8,73,172,0.08)") : "transparent",
                  color: active ? theme.brand : labelColor,
                  fontSize: 14, fontWeight: active ? 700 : 400,
                  fontFamily: "'Montserrat', system-ui, sans-serif",
                  marginBottom: 2, textAlign: "left",
                  transition: "all 120ms ease",
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {section === "profile" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: headingColor }}>Hồ sơ</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { label: "Tên", value: "Nguyễn Văn An" },
                  { label: "Email", value: "an.nguyen@email.com" },
                  { label: "Số điện thoại", value: "+84 901 234 567" },
                ].map((field) => (
                  <div key={field.label}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>{field.label}</label>
                    <input
                      defaultValue={field.value}
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: 10,
                        border: "0.5px solid " + inputBorder, background: inputBg,
                        fontSize: 14, color: headingColor, outline: "none", boxSizing: "border-box",
                        fontFamily: "'Montserrat', system-ui, sans-serif",
                      }}
                    />
                  </div>
                ))}
                <button style={{
                  padding: "10px 20px", borderRadius: 10, border: "none", background: theme.brand,
                  color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start",
                  fontFamily: "'Montserrat', system-ui, sans-serif",
                }}>
                  Lưu thay đổi
                </button>
              </div>
            </div>
          )}

          {section === "notifications" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: headingColor }}>Thông báo</h2>
              {[
                { key: "email" as const, label: "Email digest", desc: "Nhận tóm tắt qua email" },
                { key: "push" as const, label: "Push notification", desc: "Thông báo trên thiết bị" },
                { key: "agentAlert" as const, label: "Agent alerts", desc: "Nhận alert khi agent chạy" },
                { key: "weeklyReport" as const, label: "Báo cáo tuần", desc: "Email tổng kết mỗi thứ 2" },
              ].map((item) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "0.5px solid " + borderColor }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: headingColor, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: subtleColor }}>{item.desc}</div>
                  </div>
                  <Toggle checked={notifs[item.key]} onChange={(v) => setNotifs((p) => ({ ...p, [item.key]: v }))} />
                </div>
              ))}
            </div>
          )}

          {section === "appearance" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: headingColor }}>Giao diện</h2>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "0.5px solid " + borderColor }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: headingColor }}>Dark Mode</div>
                  <div style={{ fontSize: 13, color: subtleColor }}>Chế độ tối (theo hệ thống hoặc thủ công)</div>
                </div>
                <Toggle checked={isDark} onChange={setDark} />
              </div>
              <div style={{ padding: "14px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: headingColor, marginBottom: 10 }}>Ngôn ngữ</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ id: "vi", label: "🇻🇳 Tiếng Việt" }, { id: "en", label: "🇺🇸 English" }].map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => setLanguage(lang.id)}
                      style={{
                        padding: "8px 16px", borderRadius: 10,
                        border: language === lang.id ? "1.5px solid " + theme.brand : "0.5px solid " + inputBorder,
                        background: language === lang.id ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.06)") : cardBg,
                        color: language === lang.id ? theme.brand : labelColor,
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                        fontFamily: "'Montserrat', system-ui, sans-serif",
                      }}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === "privacy" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: headingColor }}>Quyền riêng tư & Tuân thủ</h2>
              <div style={{ background: isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.04)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: labelColor, lineHeight: 1.7 }}>
                  Wealbee hoạt động theo khung pháp lý: <strong>Luật Chứng khoán 2019</strong>, <strong>NĐ 155/2020/NĐ-CP</strong>, <strong>NĐ 13/2023/NĐ-CP</strong> về bảo vệ dữ liệu cá nhân.
                </p>
              </div>
              {[
                { label: "Xem dữ liệu của tôi", desc: "Tải xuống toàn bộ dữ liệu theo NĐ 13/2023" },
                { label: "Xóa tài khoản", desc: "Xóa vĩnh viễn tài khoản và dữ liệu" },
                { label: "Lịch sử hoạt động AI", desc: "Xem log phân tích AI trong 30 ngày" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "0.5px solid " + borderColor, cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: i === 1 ? "#FF3B30" : headingColor }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: subtleColor }}>{item.desc}</div>
                  </div>
                  <ChevronRight size={18} color={theme.fgDisabled} strokeWidth={1.5} />
                </div>
              ))}
            </div>
          )}

          {section === "billing" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      background: cardBg, borderRadius: 14, padding: 20,
                      border: plan.popular ? "1.5px solid " + theme.brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"),
                      boxShadow: plan.popular ? cardShadow : cardShadow,
                      position: "relative",
                    }}
                  >
                    {plan.popular && (
                      <span style={{
                        position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                        background: theme.brand, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                      }}>
                        PHỔ BIẾN NHẤT
                      </span>
                    )}
                    <div style={{ fontSize: 18, fontWeight: 700, color: headingColor, marginBottom: 4 }}>{plan.name}</div>
                    <div style={{ marginBottom: 16 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: theme.brand }}>{plan.price}</span>
                      <span style={{ fontSize: 13, color: subtleColor }}>{plan.period}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                      {plan.features.map((f) => (
                        <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <Check size={14} color="#34C759" strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: labelColor }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button style={{
                      width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
                      background: plan.id === "free" ? theme.bgAccent : plan.popular ? theme.brand : theme.bgAccent,
                      color: plan.id === "free" ? subtleColor : plan.popular ? "#fff" : theme.brand,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                    }}>
                      {plan.id === "free" ? "Gói hiện tại" : `Nâng cấp ${plan.name}`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
