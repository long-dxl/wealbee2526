import { useState, useEffect } from "react";
import { Bell, Shield, CreditCard, User, Moon, Globe, ChevronRight, Check, RefreshCw, Save, X, Link2, Unlink, Eye, EyeOff } from "lucide-react";
import { useTheme } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase/client";
import { getPlanAndBeeny, fmtBeeny, PLAN_LIMITS } from "../../lib/plan-limits";
import { startCheckout } from "../../lib/payment";
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

  // ── Ví Beeny (real from Supabase) ─────────────────────────────────────────
  interface UsageRow { day: string; beeny: number; }
  interface UsageLog { created_at: string; beeny: number; label: string }
  const [usageChart,   setUsageChart]   = useState<UsageRow[]>([]);
  const [usageLog,     setUsageLog]     = useState<UsageLog[]>([]);
  const [totalBeeny,   setTotalBeeny]   = useState(0);
  const [balance,      setBalance]      = useState<number | null>(null);
  const [plan,         setPlan]         = useState("free");
  const [upgrading,    setUpgrading]    = useState<string | null>(null);

  // Quay lại từ SePay: ?payment=success → làm mới gói + báo thành công
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const st = q.get("payment");
    if (!st) return;
    if (st === "success") {
      setTimeout(() => loadBeenyUsage(), 1200);  // IPN cần vài giây cập nhật gói
      alert("Thanh toán thành công! Gói của bạn đang được nâng cấp (có thể mất vài giây).");
    } else if (st === "error") {
      alert("Thanh toán thất bại. Vui lòng thử lại.");
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const handleUpgrade = async (pl: string) => {
    if (pl !== "pro" && pl !== "premium") return;
    setUpgrading(pl);
    try {
      await startCheckout(pl);  // chuyển hướng sang SePay
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setUpgrading(null);
    }
  };
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => { loadProfile(); loadBeenyUsage(); }, []);

  const loadBeenyUsage = async () => {
    setLoadingUsage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const since = new Date(Date.now() - 30 * 86400000).toISOString();

      // Số dư + gói hiện tại
      const { plan: p, balance: bal } = await getPlanAndBeeny(user.id);
      setPlan(p); setBalance(bal);

      // Lịch sử tiêu Beeny (mỗi lượt trừ = 1 giao dịch kind='deduct')
      const { data: txs } = await supabase
        .from("credit_transactions")
        .select("created_at, delta, note, kind")
        .eq("user_id", user.id)
        .eq("kind", "deduct")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);

      const dayMap: Record<string, number> = {};
      const logs: UsageLog[] = [];
      for (const t of (txs ?? [])) {
        const spent = Math.abs(Number(t.delta) || 0);
        if (spent <= 0) continue;
        const day = (t.created_at as string).substring(0, 10);
        dayMap[day] = (dayMap[day] ?? 0) + spent;
        logs.push({ created_at: t.created_at, beeny: spent, label: (t.note as string) || "Chạy AI" });
      }

      const chart: UsageRow[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().substring(0, 10);
        chart.push({ day: `${d.getDate()}/${d.getMonth() + 1}`, beeny: Math.round((dayMap[key] ?? 0) * 100) / 100 });
      }

      setUsageChart(chart);
      setUsageLog(logs.slice(0, 20));
      setTotalBeeny(Math.round(Object.values(dayMap).reduce((s, v) => s + v, 0) * 100) / 100);
    } finally {
      setLoadingUsage(false);
    }
  };

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

      // Load notification settings from JSON column
      const { data: settings } = await supabase
        .from("user_settings")
        .select("notifications")
        .eq("user_id", user.id)
        .single();

      if (settings?.notifications && typeof settings.notifications === "object") {
        const n = settings.notifications as Record<string, boolean>;
        setNotifs(prev => ({
          ...prev,
          email:        n.email_digest    ?? prev.email,
          push:         n.push            ?? prev.push,
          agentAlert:   n.inbox_alerts    ?? prev.agentAlert,
          weeklyReport: n.weekly_report   ?? prev.weeklyReport,
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

  const saveNotifSettings = async (key: string, value: boolean) => {
    const newNotifs = { ...notifs, [key]: value };
    setNotifs(newNotifs);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const notifJson: Record<string, boolean> = {
      email_digest:  newNotifs.email,
      push:          newNotifs.push,
      inbox_alerts:  newNotifs.agentAlert,
      weekly_report: newNotifs.weeklyReport,
    };
    await supabase.from("user_settings").update({ notifications: notifJson }).eq("user_id", user.id);
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
    { id: "free",    name: "Free",    price: "0đ",       period: "/tháng", features: ["Tối đa 2 Agent", "10 Beeny/ngày", "Báo cáo cơ bản", "Hỗ trợ cộng đồng"] },
    { id: "pro",     name: "Pro",     price: "199.000đ", period: "/tháng", features: ["Tối đa 5 Agent", "100 Beeny/ngày", "Tất cả tính năng Free", "Deep Research", "Email digest", "Hỗ trợ ưu tiên"], popular: true },
    { id: "premium", name: "Premium", price: "499.000đ", period: "/tháng", features: ["Tối đa 15 Agent", "250 Beeny/ngày", "Tất cả tính năng Pro", "Ưu tiên xử lý tức thì", "Truy cập sớm tính năng mới"] },
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
            <div>
              {/* ── Token usage widget ── */}
              <div style={{ background: cardBg, borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: cardShadow, border: "0.5px solid " + borderColor }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CreditCard size={16} color={theme.brand} strokeWidth={1.8} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: headingColor, fontFamily: FONT }}>Số dư & tiêu dùng Beeny</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.09)", color: theme.brand, fontFamily: FONT }}>{PLAN_LIMITS[plan]?.label ?? "Free"}</span>
                  </div>
                  <button onClick={loadBeenyUsage} title="Làm mới" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "0.5px solid " + borderColor, background: "transparent", cursor: "pointer" }}>
                    <RefreshCw size={14} color={subtleColor} strokeWidth={1.8} />
                  </button>
                </div>

                {loadingUsage ? (
                  <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <RefreshCw size={20} color={subtleColor} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
                  </div>
                ) : (
                  <>
                    {/* Số dư hiện tại + tiêu dùng */}
                    <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
                      <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: isDark ? "rgba(245,197,24,0.09)" : "rgba(184,134,11,0.07)", border: "0.5px solid " + borderColor }}>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT, marginBottom: 4 }}>Số dư hiện tại</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? "#F5C518" : "#B8860B", fontFamily: FONT }}>{balance == null ? "…" : fmtBeeny(balance)}</div>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT }}>Beeny · nạp {PLAN_LIMITS[plan]?.refill ?? 10}/ngày</div>
                      </div>
                      <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: isDark ? "rgba(77,143,232,0.07)" : "rgba(8,73,172,0.05)", border: "0.5px solid " + borderColor }}>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT, marginBottom: 4 }}>Đã tiêu 30 ngày</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: theme.brand, fontFamily: FONT }}>{fmtBeeny(totalBeeny)}</div>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT }}>Beeny</div>
                      </div>
                      <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: isDark ? "rgba(52,199,89,0.07)" : "rgba(52,199,89,0.05)", border: "0.5px solid " + borderColor }}>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT, marginBottom: 4 }}>Trung bình / ngày</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a7a3a", fontFamily: FONT }}>{fmtBeeny(totalBeeny / 30)}</div>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT }}>Beeny/ngày</div>
                      </div>
                      <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: isDark ? "rgba(255,149,0,0.07)" : "rgba(255,149,0,0.05)", border: "0.5px solid " + borderColor }}>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT, marginBottom: 4 }}>Số lần chạy</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#CC7A00", fontFamily: FONT }}>{usageLog.length}</div>
                        <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT }}>lần (30 ngày)</div>
                      </div>
                    </div>

                    {/* Bar chart 30 ngày */}
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: labelColor, fontFamily: FONT }}>Beeny tiêu theo ngày</p>
                      {usageChart.every(d => d.beeny === 0) ? (
                        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px dashed " + borderColor, borderRadius: 8 }}>
                          <span style={{ fontSize: 12, color: subtleColor, fontFamily: FONT }}>Chưa có dữ liệu trong 30 ngày</span>
                        </div>
                      ) : (
                        <div style={{ height: 72, display: "flex", alignItems: "flex-end", gap: 3 }}>
                          {(() => {
                            const max = Math.max(...usageChart.map(d => d.beeny), 1);
                            return usageChart.map((d, i) => (
                              <div key={i} title={`${d.day}: ${fmtBeeny(d.beeny)} Beeny`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "default" }}>
                                <div style={{ width: "100%", height: Math.max(3, Math.round((d.beeny / max) * 60)), borderRadius: "3px 3px 0 0", background: d.beeny > 0 ? theme.brand : (isDark ? "rgba(255,255,255,0.06)" : "rgba(8,73,172,0.06)"), transition: "height 300ms ease", opacity: d.beeny > 0 ? 0.85 : 1 }} />
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: subtleColor, fontFamily: FONT }}>{usageChart[0]?.day}</span>
                        <span style={{ fontSize: 10, color: subtleColor, fontFamily: FONT }}>{usageChart[usageChart.length - 1]?.day}</span>
                      </div>
                    </div>

                    {/* Log gần nhất */}
                    {usageLog.length > 0 && (
                      <div>
                        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: labelColor, fontFamily: FONT }}>Lịch sử sử dụng</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 10, overflow: "hidden", border: "0.5px solid " + borderColor }}>
                          {usageLog.map((row, i) => {
                            const dt = new Date(row.created_at);
                            const dateStr = `${dt.getDate()}/${dt.getMonth() + 1}`;
                            const timeStr = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: i % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.02)" : "rgba(8,73,172,0.015)") }}>
                                <span style={{ fontSize: 10, color: subtleColor, fontFamily: FONT, minWidth: 36 }}>{dateStr}</span>
                                <span style={{ fontSize: 10, color: subtleColor, fontFamily: FONT, minWidth: 36 }}>{timeStr}</span>
                                <span style={{ fontSize: 12, color: labelColor, fontFamily: FONT, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT, color: isDark ? "#F5C518" : "#B8860B", minWidth: 70, textAlign: "right" }}>
                                  −{fmtBeeny(row.beeny)} Beeny
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Plan cards ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {plans.map(pl => {
                  const isCurrent = pl.id === plan;
                  return (
                  <div
                    key={pl.id}
                    style={{
                      background: cardBg, borderRadius: 14, padding: 20, position: "relative",
                      border: isCurrent ? "1.5px solid " + theme.brand : pl.popular ? "1.5px solid " + theme.brand : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"),
                      boxShadow: cardShadow,
                    }}
                  >
                    {pl.popular && !isCurrent && (
                      <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: theme.brand, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99 }}>
                        PHỔ BIẾN NHẤT
                      </span>
                    )}
                    {isCurrent && (
                      <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#1a7a3a", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99 }}>
                        GÓI HIỆN TẠI
                      </span>
                    )}
                    <div style={{ fontSize: 18, fontWeight: 700, color: headingColor, marginBottom: 4 }}>{pl.name}</div>
                    <div style={{ marginBottom: 16 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: theme.brand }}>{pl.price}</span>
                      <span style={{ fontSize: 13, color: subtleColor }}>{pl.period}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                      {pl.features.map(f => (
                        <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <Check size={14} color="#34C759" strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: labelColor }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button disabled={isCurrent || pl.id === "free" || upgrading === pl.id}
                      onClick={() => handleUpgrade(pl.id)}
                      style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: isCurrent ? theme.bgAccent : pl.popular ? theme.brand : theme.bgAccent, color: isCurrent ? subtleColor : pl.popular ? "#fff" : theme.brand, fontSize: 13, fontWeight: 700, cursor: (isCurrent || pl.id === "free") ? "default" : "pointer", fontFamily: FONT, opacity: upgrading === pl.id ? 0.6 : 1 }}>
                      {isCurrent ? "Gói hiện tại" : pl.id === "free" ? "Miễn phí" : upgrading === pl.id ? "Đang chuyển…" : `Nâng cấp ${pl.name}`}
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
