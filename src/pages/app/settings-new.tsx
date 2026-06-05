import { useState, useEffect } from "react";
import { Bell, Shield, CreditCard, User, Moon, Globe, ChevronRight, Check, RefreshCw, Save, X, Plus, Link2, Unlink, Eye, EyeOff } from "lucide-react";
import { useTheme } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase/client";
import { useBrokerConfig, type BrokerConfig } from "../../lib/hooks/useBrokerConfig";
import { discoverAccounts } from "../../lib/services/dnse";

type SettingsSection = "profile" | "notifications" | "appearance" | "privacy" | "billing" | "api";

const sidebarItems = [
  { id: "profile"       as SettingsSection, label: "Hồ sơ",          icon: User       },
  { id: "notifications" as SettingsSection, label: "Thông báo",       icon: Bell       },
  { id: "appearance"    as SettingsSection, label: "Giao diện",       icon: Moon       },
  { id: "privacy"       as SettingsSection, label: "Quyền riêng tư",  icon: Shield     },
  { id: "billing"       as SettingsSection, label: "Gói dịch vụ",     icon: CreditCard },
  { id: "api"           as SettingsSection, label: "Kết nối API",      icon: Link2      },
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
  const [section,  setSection]  = useState<SettingsSection>("profile");
  const [language, setLanguage] = useState("vi");

  // ── Broker / API connection ────────────────────────────────────────────────
  const { config: brokerConfig, saveConfig: saveBrokerConfig, clearConfig: clearBrokerConfig } = useBrokerConfig();
  const [apiForm, setApiForm] = useState({ broker: "dnse" as BrokerConfig["broker"], apiKey: "", apiSecret: "", accountNo: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState(false);

  useEffect(() => {
    if (brokerConfig) {
      setApiForm({
        broker: brokerConfig.broker,
        apiKey: brokerConfig.apiKey ?? brokerConfig.token ?? "",
        apiSecret: brokerConfig.apiSecret ?? "",
        accountNo: brokerConfig.accountNo ?? "",
      });
    }
  }, [brokerConfig]);

  const testAndSaveApi = async () => {
    setApiTesting(true);
    setApiError(null);
    setApiSuccess(false);
    try {
      const { apiKey, apiSecret } = apiForm;
      if (!apiKey.trim()) { setApiError("Vui lòng nhập API Key"); return; }
      if (apiForm.broker === "dnse") {
        let accountNo = apiForm.accountNo.trim();
        if (!accountNo) {
          const accounts = await discoverAccounts(apiKey.trim(), apiSecret.trim());
          if (!accounts.length) { setApiError("Không tìm thấy tài khoản nào"); return; }
          accountNo = accounts[0].accountNo;
        }
        saveBrokerConfig({ broker: "dnse", token: apiKey.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), accountNo, connectedAt: new Date().toISOString() });
        setApiForm(prev => ({ ...prev, accountNo }));
      }
      setApiSuccess(true);
      setTimeout(() => setApiSuccess(false), 3000);
    } catch (err: any) {
      setApiError(err?.message ?? "Lỗi kết nối API");
    } finally {
      setApiTesting(false);
    }
  };

  // ── Real user data ─────────────────────────────────────────────────────────
  const [loadingProfile, setLoadingProfile]   = useState(true);
  const [savingProfile,  setSavingProfile]    = useState(false);
  const [profileSaved,   setProfileSaved]     = useState(false);
  const [profileError,   setProfileError]     = useState<string | null>(null);

  const [email,    setEmail]    = useState("");
  const [fullName, setFullName] = useState("");
  const [phone,    setPhone]    = useState("");

  const [notifs, setNotifs] = useState({
    email:        true,
    push:         true,
    weeklyReport: false,
    agentAlert:   true,
  });

  // ── Bản tin hàng ngày — watch symbols ─────────────────────────────────────
  const [watchSymbols,  setWatchSymbols]  = useState<string[]>([]);
  const [symbolInput,   setSymbolInput]   = useState("");
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSaving,  setDigestSaving]  = useState(false);
  const [digestSaved,   setDigestSaved]   = useState(false);

  useEffect(() => { loadProfile(); loadDigestSubscription(); }, []);

  const loadProfile = async () => {
    setLoadingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Email always comes from auth
      setEmail(user.email ?? "");

      // Full name from user_profiles table
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      setFullName(profile?.full_name ?? user.user_metadata?.full_name ?? "");

      // Load notification settings
      const { data: settings } = await supabase
        .from("user_settings")
        .select("email_digest, inbox_alerts")
        .eq("user_id", user.id)
        .single();

      if (settings) {
        setNotifs(prev => ({
          ...prev,
          email:      settings.email_digest ?? true,
          agentAlert: settings.inbox_alerts  ?? true,
        }));
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("user_profiles")
        .update({ full_name: fullName.trim(), updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (error) { setProfileError(error.message); return; }

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const loadDigestSubscription = async () => {
    setDigestLoading(true);
    try {
      const { data } = await supabase
        .from("digest_subscribers")
        .select("watch_symbols")
        .maybeSingle();
      if (data?.watch_symbols) setWatchSymbols(data.watch_symbols);
    } finally {
      setDigestLoading(false);
    }
  };

  const saveDigestSubscription = async (symbols: string[]) => {
    setDigestSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("digest_subscribers").upsert({
        user_id:      user.id,
        email:        user.email ?? "",
        watch_symbols: symbols,
        updated_at:   new Date().toISOString(),
      }, { onConflict: "email" });
      setDigestSaved(true);
      setTimeout(() => setDigestSaved(false), 2000);
    } finally {
      setDigestSaving(false);
    }
  };

  const addWatchSymbol = () => {
    const sym = symbolInput.trim().toUpperCase();
    if (!sym || watchSymbols.includes(sym)) { setSymbolInput(""); return; }
    const updated = [...watchSymbols, sym];
    setWatchSymbols(updated);
    setSymbolInput("");
  };

  const removeWatchSymbol = (sym: string) => {
    setWatchSymbols(prev => prev.filter(s => s !== sym));
  };

  const saveNotifSettings = async (key: string, value: boolean) => {
    setNotifs(prev => ({ ...prev, [key]: value }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const updates: Record<string, boolean> = {};
    if (key === "email")      updates.email_digest  = value;
    if (key === "agentAlert") updates.inbox_alerts  = value;
    if (Object.keys(updates).length > 0) {
      await supabase.from("user_settings").update(updates).eq("user_id", user.id);
    }
  };

  const cardBg       = isDark ? "#131824" : "#fff";
  const cardShadow   = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08)";
  const headingColor = theme.fg;
  const labelColor   = theme.fgMuted;
  const subtleColor  = theme.fgSubtle;
  const borderColor  = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";
  const inputBg      = isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7";
  const inputBorder  = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.20)";
  const FONT         = "'Montserrat', system-ui, sans-serif";

  const plans = [
    { id: "free",    name: "Free",  price: "0đ",       period: "/tháng", features: ["5 agents tối đa", "500k tokens/ngày", "Watchlist 10 mã", "Daily Digest + Portfolio Health"] },
    { id: "pro",     name: "Pro",   price: "199,000đ", period: "/tháng", features: ["20 agents", "5M tokens/ngày", "Watchlist 50 mã", "Tất cả 6 templates", "Deep Research", "Email digest"], popular: true },
    { id: "proplus", name: "Pro+",  price: "499,000đ", period: "/tháng", features: ["Không giới hạn agents", "20M tokens/ngày", "Watchlist 200 mã", "Priority support", "Custom tools", "API access"] },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: FONT }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: headingColor, margin: "0 0 20px" }}>Cài đặt</h1>
      <div style={{ display: "flex", gap: 20 }}>

        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {sidebarItems.map(item => {
            const Icon   = item.icon;
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
                  fontFamily: FONT, marginBottom: 2, textAlign: "left",
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

          {/* ── Profile ─────────────────────────────────────────────────────── */}
          {section === "profile" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: headingColor }}>Hồ sơ</h2>
                {loadingProfile && <RefreshCw size={14} style={{ color: theme.brand, animation: "spin 1s linear infinite" }} />}
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Full name */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>Tên</label>
                  <input
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder={loadingProfile ? "Đang tải…" : "Nhập tên của bạn"}
                    disabled={loadingProfile}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "0.5px solid " + inputBorder, background: inputBg, fontSize: 14, color: headingColor, outline: "none", boxSizing: "border-box", fontFamily: FONT }}
                  />
                </div>

                {/* Email — readonly, from auth */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>
                    Email <span style={{ fontSize: 11, color: theme.fgDisabled, fontWeight: 400 }}>(không thể thay đổi)</span>
                  </label>
                  <input
                    value={email}
                    readOnly
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "0.5px solid " + inputBorder, background: isDark ? "rgba(255,255,255,0.03)" : "#F0F0F2", fontSize: 14, color: subtleColor, outline: "none", boxSizing: "border-box", fontFamily: FONT, cursor: "not-allowed" }}
                  />
                </div>

                {/* Phone — local state only */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>Số điện thoại</label>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+84 9xx xxx xxx"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "0.5px solid " + inputBorder, background: inputBg, fontSize: 14, color: headingColor, outline: "none", boxSizing: "border-box", fontFamily: FONT }}
                  />
                </div>

                {profileError && (
                  <p style={{ margin: 0, fontSize: 12, color: "#FF3B30", padding: "8px 12px", background: "rgba(255,59,48,0.06)", borderRadius: 8 }}>
                    ⚠ {profileError}
                  </p>
                )}

                <button
                  onClick={saveProfile}
                  disabled={savingProfile || loadingProfile}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "10px 20px", borderRadius: 10, border: "none",
                    background: profileSaved ? "#34C759" : theme.brand,
                    color: "#fff", fontSize: 14, fontWeight: 600, cursor: savingProfile ? "not-allowed" : "pointer",
                    alignSelf: "flex-start", fontFamily: FONT, transition: "background 200ms",
                    opacity: savingProfile || loadingProfile ? 0.7 : 1,
                  }}
                >
                  {savingProfile
                    ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Đang lưu…</>
                    : profileSaved
                    ? <><Check size={14} /> Đã lưu</>
                    : <><Save size={14} /> Lưu thay đổi</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* ── Notifications ────────────────────────────────────────────────── */}
          {section === "notifications" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: headingColor }}>Thông báo</h2>

              {/* Email address info */}
              {email && (
                <div style={{ background: isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.04)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: subtleColor }}>
                    Email thông báo sẽ gửi tới: <strong style={{ color: headingColor }}>{email}</strong>
                  </p>
                </div>
              )}

              {[
                { key: "email"       as const, label: "Email digest",        desc: "Nhận tóm tắt từ agent qua email sau mỗi lần chạy" },
                { key: "push"        as const, label: "Push notification",   desc: "Thông báo trên thiết bị" },
                { key: "agentAlert"  as const, label: "Agent alerts",        desc: "Nhận alert khi agent hoàn thành — lưu vào Inbox" },
                { key: "weeklyReport"as const, label: "Báo cáo tuần",        desc: "Email tổng kết mỗi thứ 2" },
              ].map(item => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "0.5px solid " + borderColor }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: headingColor, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: subtleColor }}>{item.desc}</div>
                  </div>
                  <Toggle
                    checked={notifs[item.key]}
                    onChange={v => saveNotifSettings(item.key, v)}
                  />
                </div>
              ))}

              {/* ── Bản tin hàng ngày ─────────────────────────────────────── */}
              <div style={{ paddingTop: 20, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: headingColor }}>Bản tin hàng ngày</div>
                  {digestLoading && <RefreshCw size={13} style={{ color: theme.brand, animation: "spin 1s linear infinite" }} />}
                </div>
                <div style={{ fontSize: 13, color: subtleColor, marginBottom: 14 }}>
                  Chọn mã cổ phiếu muốn nhận tin tức mỗi sáng qua email
                </div>

                {/* Chip list */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, minHeight: 32 }}>
                  {watchSymbols.length === 0 && !digestLoading && (
                    <span style={{ fontSize: 13, color: subtleColor, fontStyle: "italic" }}>Chưa có mã nào</span>
                  )}
                  {watchSymbols.map(sym => (
                    <span key={sym} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.08)",
                      color: theme.brand, fontSize: 12, fontWeight: 700,
                      padding: "4px 10px", borderRadius: 20,
                    }}>
                      {sym}
                      <button
                        onClick={() => removeWatchSymbol(sym)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: theme.brand, opacity: 0.6 }}
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add + Save */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={symbolInput}
                    onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && addWatchSymbol()}
                    placeholder="Nhập mã (VD: VCB)"
                    maxLength={10}
                    style={{
                      width: 140, padding: "8px 12px", borderRadius: 10,
                      border: "0.5px solid " + inputBorder, background: inputBg,
                      fontSize: 13, color: headingColor, outline: "none", fontFamily: FONT,
                    }}
                  />
                  <button
                    onClick={addWatchSymbol}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.07)",
                      color: theme.brand, fontSize: 13, fontWeight: 600, fontFamily: FONT,
                    }}
                  >
                    <Plus size={13} strokeWidth={2.5} /> Thêm
                  </button>
                  <button
                    onClick={() => saveDigestSubscription(watchSymbols)}
                    disabled={digestSaving}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "8px 16px", borderRadius: 10, border: "none", cursor: digestSaving ? "not-allowed" : "pointer",
                      background: digestSaved ? "#34C759" : theme.brand,
                      color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: FONT,
                      transition: "background 200ms", opacity: digestSaving ? 0.7 : 1,
                    }}
                  >
                    {digestSaving
                      ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Đang lưu…</>
                      : digestSaved
                      ? <><Check size={13} /> Đã lưu</>
                      : <><Save size={13} /> Lưu</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Appearance ───────────────────────────────────────────────────── */}
          {section === "appearance" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: headingColor }}>Giao diện</h2>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "0.5px solid " + borderColor }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: headingColor }}>Dark Mode</div>
                  <div style={{ fontSize: 13, color: subtleColor }}>Chế độ tối</div>
                </div>
                <Toggle checked={isDark} onChange={setDark} />
              </div>
              <div style={{ padding: "14px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: headingColor, marginBottom: 10 }}>Ngôn ngữ</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ id: "vi", label: "🇻🇳 Tiếng Việt" }, { id: "en", label: "🇺🇸 English" }].map(lang => (
                    <button
                      key={lang.id}
                      onClick={() => setLanguage(lang.id)}
                      style={{
                        padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontFamily: FONT,
                        border: language === lang.id ? "1.5px solid " + theme.brand : "0.5px solid " + inputBorder,
                        background: language === lang.id ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.06)") : cardBg,
                        color: language === lang.id ? theme.brand : labelColor,
                        fontSize: 13, fontWeight: 600,
                      }}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Privacy ──────────────────────────────────────────────────────── */}
          {section === "privacy" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: headingColor }}>Quyền riêng tư & Tuân thủ</h2>
              <div style={{ background: isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.04)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: labelColor, lineHeight: 1.7 }}>
                  Wealbee hoạt động theo khung pháp lý: <strong>Luật Chứng khoán 2019</strong>, <strong>NĐ 155/2020/NĐ-CP</strong>, <strong>NĐ 13/2023/NĐ-CP</strong> về bảo vệ dữ liệu cá nhân.
                </p>
              </div>
              {[
                { label: "Xem dữ liệu của tôi",      desc: "Tải xuống toàn bộ dữ liệu theo NĐ 13/2023" },
                { label: "Xóa tài khoản",             desc: "Xóa vĩnh viễn tài khoản và dữ liệu",         danger: true },
                { label: "Lịch sử hoạt động AI",      desc: "Xem log phân tích AI trong 30 ngày" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "0.5px solid " + borderColor, cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: (item as any).danger ? "#FF3B30" : headingColor }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: subtleColor }}>{item.desc}</div>
                  </div>
                  <ChevronRight size={18} color={theme.fgDisabled} strokeWidth={1.5} />
                </div>
              ))}
            </div>
          )}

          {/* ── API Connection ───────────────────────────────────────────────── */}
          {section === "api" && (
            <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: headingColor }}>Kết nối API Môi giới</h2>
                  <p style={{ margin: 0, fontSize: 13, color: subtleColor }}>Liên kết tài khoản môi giới để xem danh mục thực tế</p>
                </div>
                {brokerConfig && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "#34C759", background: "rgba(52,199,89,0.10)", padding: "5px 12px", borderRadius: 99 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34C759", display: "inline-block" }} />
                    Đã kết nối
                  </span>
                )}
              </div>

              {/* Broker selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 8 }}>Môi giới</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["dnse", "ssi", "vps", "vcsc", "vnd"] as BrokerConfig["broker"][]).map(b => (
                    <button
                      key={b}
                      onClick={() => setApiForm(prev => ({ ...prev, broker: b }))}
                      disabled={b !== "dnse"}
                      style={{
                        padding: "8px 16px", borderRadius: 10, cursor: b === "dnse" ? "pointer" : "not-allowed",
                        border: apiForm.broker === b ? "1.5px solid " + theme.brand : "0.5px solid " + inputBorder,
                        background: apiForm.broker === b ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.06)") : cardBg,
                        color: apiForm.broker === b ? theme.brand : b !== "dnse" ? subtleColor : labelColor,
                        fontSize: 13, fontWeight: 600, fontFamily: FONT, opacity: b !== "dnse" ? 0.45 : 1,
                      }}
                    >
                      {b.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: subtleColor, fontStyle: "italic" }}>Hiện tại hỗ trợ DNSE OpenAPI. Các môi giới khác sẽ ra mắt sớm.</p>
              </div>

              {/* API Key */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>API Key (X-API-Key)</label>
                <input
                  value={apiForm.apiKey}
                  onChange={e => setApiForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="Nhập API Key từ DNSE"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "0.5px solid " + inputBorder, background: inputBg, fontSize: 14, color: headingColor, outline: "none", boxSizing: "border-box", fontFamily: FONT }}
                />
              </div>

              {/* API Secret */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>API Secret (HMAC key)</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showSecret ? "text" : "password"}
                    value={apiForm.apiSecret}
                    onChange={e => setApiForm(prev => ({ ...prev, apiSecret: e.target.value }))}
                    placeholder="Nhập API Secret"
                    style={{ width: "100%", padding: "10px 40px 10px 14px", borderRadius: 10, border: "0.5px solid " + inputBorder, background: inputBg, fontSize: 14, color: headingColor, outline: "none", boxSizing: "border-box", fontFamily: FONT }}
                  />
                  <button
                    onClick={() => setShowSecret(v => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", color: subtleColor, padding: 4 }}
                  >
                    {showSecret ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Account No */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: subtleColor, marginBottom: 6 }}>
                  Số tài khoản <span style={{ fontWeight: 400, color: theme.fgDisabled }}>(tự động phát hiện nếu để trống)</span>
                </label>
                <input
                  value={apiForm.accountNo}
                  onChange={e => setApiForm(prev => ({ ...prev, accountNo: e.target.value }))}
                  placeholder="VD: 0001179019"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "0.5px solid " + inputBorder, background: inputBg, fontSize: 14, color: headingColor, outline: "none", boxSizing: "border-box", fontFamily: FONT }}
                />
              </div>

              {apiError && (
                <p style={{ margin: "0 0 14px", fontSize: 12, color: "#FF3B30", padding: "8px 12px", background: "rgba(255,59,48,0.06)", borderRadius: 8 }}>
                  ⚠ {apiError}
                </p>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={testAndSaveApi}
                  disabled={apiTesting}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "10px 20px",
                    borderRadius: 10, border: "none", cursor: apiTesting ? "not-allowed" : "pointer",
                    background: apiSuccess ? "#34C759" : theme.brand, color: "#fff",
                    fontSize: 14, fontWeight: 600, fontFamily: FONT, transition: "background 200ms",
                    opacity: apiTesting ? 0.7 : 1,
                  }}
                >
                  {apiTesting
                    ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Đang kiểm tra…</>
                    : apiSuccess
                    ? <><Check size={14} /> Đã kết nối</>
                    : <><Link2 size={14} /> Kết nối & Lưu</>
                  }
                </button>

                {brokerConfig && (
                  <button
                    onClick={() => { clearBrokerConfig(); setApiForm({ broker: "dnse", apiKey: "", apiSecret: "", accountNo: "" }); setApiError(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
                      borderRadius: 10, border: "0.5px solid rgba(255,59,48,0.30)", cursor: "pointer",
                      background: "rgba(255,59,48,0.06)", color: "#FF3B30",
                      fontSize: 13, fontWeight: 600, fontFamily: FONT,
                    }}
                  >
                    <Unlink size={14} /> Ngắt kết nối
                  </button>
                )}
              </div>

              {brokerConfig && (
                <div style={{ marginTop: 20, padding: 14, background: isDark ? "rgba(52,199,89,0.06)" : "rgba(52,199,89,0.05)", borderRadius: 10, border: "0.5px solid rgba(52,199,89,0.20)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#34C759", marginBottom: 6 }}>Thông tin kết nối</div>
                  <div style={{ fontSize: 13, color: labelColor }}>Môi giới: <strong>{brokerConfig.broker.toUpperCase()}</strong></div>
                  {brokerConfig.accountNo && <div style={{ fontSize: 13, color: labelColor, marginTop: 3 }}>Tài khoản: <strong>{brokerConfig.accountNo}</strong></div>}
                  {brokerConfig.connectedAt && <div style={{ fontSize: 12, color: subtleColor, marginTop: 3 }}>Kết nối lúc: {new Date(brokerConfig.connectedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>}
                </div>
              )}

              <div style={{ marginTop: 20, padding: 14, background: isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.04)", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: headingColor, marginBottom: 6 }}>Hướng dẫn lấy API Key DNSE</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: labelColor, lineHeight: 1.8 }}>
                  <li>Đăng nhập vào <strong>app.dnse.com.vn</strong></li>
                  <li>Vào <strong>Cài đặt → Bảo mật → OpenAPI</strong></li>
                  <li>Tạo API Key mới, sao chép cả Key và Secret</li>
                  <li>Dán vào form bên trên và nhấn <strong>Kết nối & Lưu</strong></li>
                </ol>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: subtleColor, fontStyle: "italic" }}>Credentials được lưu cục bộ trên trình duyệt, không gửi lên server.</p>
              </div>
            </div>
          )}

          {/* ── Billing ──────────────────────────────────────────────────────── */}
          {section === "billing" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {plans.map(plan => (
                <div
                  key={plan.id}
                  style={{
                    background: cardBg, borderRadius: 14, padding: 20, position: "relative",
                    border: plan.popular ? "1.5px solid " + theme.brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"),
                    boxShadow: cardShadow,
                  }}
                >
                  {plan.popular && (
                    <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: theme.brand, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99 }}>
                      PHỔ BIẾN NHẤT
                    </span>
                  )}
                  <div style={{ fontSize: 18, fontWeight: 700, color: headingColor, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: theme.brand }}>{plan.price}</span>
                    <span style={{ fontSize: 13, color: subtleColor }}>{plan.period}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <Check size={14} color="#34C759" strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: labelColor }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: plan.id === "free" ? theme.bgAccent : plan.popular ? theme.brand : theme.bgAccent, color: plan.id === "free" ? subtleColor : plan.popular ? "#fff" : theme.brand, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    {plan.id === "free" ? "Gói hiện tại" : `Nâng cấp ${plan.name}`}
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
