import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Bell, Shield, CreditCard, User, Moon, Globe, ChevronRight, Check, RefreshCw, Save, X, Link2, Unlink, Eye, EyeOff, Wallet, Sparkles, Zap, Crown, MessageCircle, Copy } from "lucide-react";
import { useTheme } from "../../lib/theme-context";
import { supabase } from "../../lib/supabase/client";
import { getPlanAndBeeny, fmtBeeny, PLAN_LIMITS } from "../../lib/plan-limits";
import { startCheckout, startPackCheckout } from "../../lib/payment";
import { logout, deleteAccount } from "../../lib/account";
import { getTrialAvailable, activateTrial } from "../../lib/trial";
import { getZaloLink, genZaloCode, setZaloNotify, unlinkZalo, sendZaloTest, ZALO_BOT_LINK, ZALO_BOT_QR, type ZaloLink } from "../../lib/zalo";
import { TrialGrantedModal } from "../../components/TrialGrantedModal";
import { useBrokerConfig, type BrokerConfig } from "../../lib/hooks/useBrokerConfig";
import { discoverAccounts } from "../../lib/services/dnse";

type SettingsSection = "profile" | "notifications" | "appearance" | "privacy" | "usage" | "billing" | "api";

const sidebarItems = [
  { id: "profile"       as SettingsSection, label: "Hồ sơ",              icon: User       },
  { id: "notifications" as SettingsSection, label: "Thông báo",          icon: Bell       },
  { id: "appearance"    as SettingsSection, label: "Giao diện",          icon: Moon       },
  { id: "privacy"       as SettingsSection, label: "Quyền riêng tư",     icon: Shield     },
  { id: "usage"         as SettingsSection, label: "Số dư & tiêu dùng",  icon: Wallet     },
  { id: "billing"       as SettingsSection, label: "Gói dịch vụ",        icon: Sparkles   },
  { id: "api"           as SettingsSection, label: "Kết nối API",         icon: Link2      },
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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [section,  setSection]  = useState<SettingsSection>(
    (["profile","notifications","appearance","privacy","usage","billing","api"].includes(initialTab ?? "") ? initialTab : "profile") as SettingsSection);
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

  // ── Ví Beeny (real from Supabase) ─────────────────────────────────────────
  interface UsageRow { day: string; beeny: number; }
  interface UsageLog { created_at: string; beeny: number; label: string }
  const [usageChart,   setUsageChart]   = useState<UsageRow[]>([]);
  const [usageLog,     setUsageLog]     = useState<UsageLog[]>([]);
  const [totalBeeny,   setTotalBeeny]   = useState(0);
  const [balance,      setBalance]      = useState<number | null>(null);
  const [plan,         setPlan]         = useState("free");
  const [daysLeft,     setDaysLeft]     = useState<number | null>(null);
  const [upgrading,    setUpgrading]    = useState<string | null>(null);
  const [billingYear,  setBillingYear]  = useState(false);  // false=tháng, true=năm
  const [bonus,        setBonus]        = useState(0);       // Beeny mua thêm (hết hạn 24h)
  const [bonusExp,     setBonusExp]     = useState<string | null>(null);
  const [buyingPack,   setBuyingPack]   = useState<string | null>(null);
  const [, setNowTick] = useState(0);  // ép re-render mỗi 30s để đếm ngược bonus
  useEffect(() => { const t = setInterval(() => setNowTick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [trialAvail,   setTrialAvail]   = useState(false);   // còn lượt kích hoạt Pro trial
  const [activating,   setActivating]   = useState(false);
  const [trialModal,   setTrialModal]   = useState<number | null>(null);  // hiện modal chúc mừng sau kích hoạt

  const handleActivateTrial = async () => {
    setActivating(true);
    try {
      const r = await activateTrial();
      if (r.activated) {
        setTrialAvail(false);
        setTrialModal(r.days ?? 7);
        await loadBeenyUsage();  // làm mới gói → Pro + đếm ngược
      } else {
        alert(r.reason === "has_plan" ? "Bạn đang có gói trả phí — không cần dùng thử." : "Bạn đã dùng lượt dùng thử rồi.");
        setTrialAvail(false);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setActivating(false);
    }
  };

  const doDeleteAccount = async () => {
    setDeleting(true);
    try { await deleteAccount(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); setDeleting(false); }
  };

  // ── Kết nối Zalo ──
  const [zaloLink,   setZaloLink]   = useState<ZaloLink | null>(null);
  const [zaloCode,   setZaloCode]   = useState<string | null>(null);
  const [zaloBusy,   setZaloBusy]   = useState(false);
  const [zaloCopied, setZaloCopied] = useState(false);
  const [zaloTest,   setZaloTest]   = useState<string | null>(null);

  const loadZalo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setZaloLink(await getZaloLink(user.id));
  };
  useEffect(() => { loadZalo(); }, []);

  const handleGenZaloCode = async () => {
    setZaloBusy(true); setZaloTest(null);
    try { setZaloCode(await genZaloCode()); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setZaloBusy(false); }
  };
  const handleUnlinkZalo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setZaloBusy(true);
    try { await unlinkZalo(user.id); setZaloLink(null); setZaloCode(null); setZaloTest(null); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setZaloBusy(false); }
  };
  const handleZaloNotify = async (patch: Partial<{ notify_digest: boolean; notify_alert: boolean }>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !zaloLink) return;
    setZaloLink({ ...zaloLink, notifyDigest: patch.notify_digest ?? zaloLink.notifyDigest, notifyAlert: patch.notify_alert ?? zaloLink.notifyAlert });
    try { await setZaloNotify(user.id, patch); } catch (e) { alert(e instanceof Error ? e.message : String(e)); loadZalo(); }
  };
  const handleZaloTest = async () => {
    setZaloBusy(true); setZaloTest(null);
    const r = await sendZaloTest();
    setZaloTest(r.ok ? "✅ Đã gửi! Kiểm tra Zalo của bạn." : "❌ " + (r.error ?? "Lỗi"));
    setZaloBusy(false);
  };

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
      await startCheckout(pl, billingYear ? "year" : "month");  // chuyển hướng SePay đúng kỳ hạn
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setUpgrading(null);
    }
  };

  const handleBuyPack = async (packId: string) => {
    setBuyingPack(packId);
    try {
      await startPackCheckout(packId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBuyingPack(null);
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

      // Số dư + gói hiện tại + ngày còn lại + bonus
      const { plan: p, balance: bal, bonus: bn, bonusExpiresAt: be, daysLeft: dl } = await getPlanAndBeeny(user.id);
      setPlan(p); setBalance(bal); setDaysLeft(dl); setBonus(bn); setBonusExp(be);
      setTrialAvail(await getTrialAvailable(user.id));

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

  const cardBg       = isDark ? "#131824" : "#fff";
  const cardShadow   = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08)";
  const headingColor = theme.fg;
  const labelColor   = theme.fgMuted;
  const subtleColor  = theme.fgSubtle;
  const borderColor  = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";
  const inputBg      = isDark ? "rgba(255,255,255,0.06)" : "#F5F5F7";
  const inputBorder  = isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.20)";
  const FONT         = "'Montserrat', system-ui, sans-serif";

  // Giá năm = 10 tháng (tặng 2 tháng ~ tiết kiệm 17%)
  const plans = [
    { id: "free",    name: "Free",    priceM: "0đ",       priceY: "0đ",         features: ["Tối đa 2 Agent", "10 Beeny/ngày", "Báo cáo cơ bản", "Hỗ trợ cộng đồng"] },
    { id: "pro",     name: "Pro",     priceM: "199.000đ", priceY: "1.990.000đ", features: ["Tối đa 5 Agent", "100 Beeny/ngày", "Tất cả tính năng Free", "Deep Research", "Email digest", "Hỗ trợ ưu tiên"], popular: true },
    { id: "premium", name: "Premium", priceM: "499.000đ", priceY: "4.990.000đ", features: ["Tối đa 15 Agent", "250 Beeny/ngày", "Tất cả tính năng Pro", "Ưu tiên xử lý tức thì", "Truy cập sớm tính năng mới"] },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", fontFamily: FONT }}>
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
                    Email <span style={{ fontSize: 11, color: theme.fgDisabled, fontWeight: 500 }}>(không thể thay đổi)</span>
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

              {/* ── Kết nối Zalo ── */}
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid " + borderColor }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "#0068FF", flexShrink: 0 }}>
                    <MessageCircle size={18} color="#fff" strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: headingColor }}>Kết nối Zalo</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: subtleColor }}>Nhận digest &amp; cảnh báo ngay trên Zalo</div>
                  </div>
                </div>

                {zaloLink ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: isDark ? "rgba(0,104,255,0.10)" : "rgba(0,104,255,0.06)", border: "1px solid rgba(0,104,255,0.25)", borderRadius: 10, padding: "10px 14px" }}>
                      <Check size={16} color="#0068FF" strokeWidth={2.5} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: headingColor }}>
                        Đã kết nối{zaloLink.displayName ? " · " + zaloLink.displayName : ""}
                      </span>
                    </div>
                    {[
                      { k: "notify_digest" as const, on: zaloLink.notifyDigest, label: "Digest hằng ngày", desc: "Tóm tắt thị trường & agent mỗi ngày" },
                      { k: "notify_alert"  as const, on: zaloLink.notifyAlert,  label: "Cảnh báo",        desc: "Biến động giá, tin quan trọng" },
                    ].map(t => (
                      <div key={t.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "0.5px solid " + borderColor }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: headingColor }}>{t.label}</div>
                          <div style={{ fontSize: 12.5, color: subtleColor }}>{t.desc}</div>
                        </div>
                        <Toggle checked={t.on} onChange={v => handleZaloNotify({ [t.k]: v })} />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                      <button onClick={handleZaloTest} disabled={zaloBusy}
                        style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid " + borderColor, background: "transparent", color: headingColor, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                        Gửi tin thử
                      </button>
                      <button onClick={handleUnlinkZalo} disabled={zaloBusy}
                        style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "transparent", color: "#c0392b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
                        <Unlink size={14} /> Huỷ kết nối
                      </button>
                      {zaloTest && <span style={{ fontSize: 12.5, fontWeight: 600, color: subtleColor }}>{zaloTest}</span>}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    {!zaloCode ? (
                      <button onClick={handleGenZaloCode} disabled={zaloBusy}
                        style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#0068FF", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, boxShadow: "0 4px 14px rgba(0,104,255,0.28)" }}>
                        {zaloBusy ? "Đang tạo mã…" : "Kết nối Zalo"}
                      </button>
                    ) : (
                      <div style={{ background: isDark ? "rgba(0,104,255,0.08)" : "rgba(0,104,255,0.05)", border: "1px solid rgba(0,104,255,0.25)", borderRadius: 12, padding: 16, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                        {/* Trái: hướng dẫn + mã */}
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: headingColor, marginBottom: 8 }}>
                            Bước 1 — Mở Bot Wealbee trên Zalo
                          </div>
                          <a href={ZALO_BOT_LINK} target="_blank" rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, background: "#0068FF", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FONT, boxShadow: "0 4px 12px rgba(0,104,255,0.25)" }}>
                            <MessageCircle size={15} /> Mở Bot Wealbee
                          </a>
                          <div style={{ fontSize: 12, color: subtleColor, marginTop: 5 }}>Trên máy tính: quét QR bên phải bằng điện thoại →</div>

                          <div style={{ fontSize: 13, fontWeight: 700, color: headingColor, margin: "14px 0 8px" }}>
                            Bước 2 — Gửi mã này cho bot <span style={{ fontWeight: 600, color: subtleColor }}>(hết hạn 15 phút)</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, fontFamily: "monospace", fontSize: 26, fontWeight: 800, letterSpacing: "0.18em", color: "#0068FF", textAlign: "center", background: cardBg, borderRadius: 10, padding: "10px 0", border: "1px dashed rgba(0,104,255,0.4)" }}>
                              {zaloCode}
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(zaloCode); setZaloCopied(true); setTimeout(() => setZaloCopied(false), 1500); }}
                              title="Sao chép"
                              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 10, border: "1px solid " + borderColor, background: "transparent", cursor: "pointer", color: headingColor }}>
                              {zaloCopied ? <Check size={18} color="#1a7a3a" /> : <Copy size={18} />}
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center" }}>
                            <button onClick={loadZalo}
                              style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid " + borderColor, background: "transparent", color: headingColor, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
                              <RefreshCw size={14} /> Đã gửi, kiểm tra
                            </button>
                            <button onClick={handleGenZaloCode} disabled={zaloBusy}
                              style={{ padding: "8px 6px", border: "none", background: "transparent", color: subtleColor, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                              Tạo mã mới
                            </button>
                          </div>
                        </div>
                        {/* Phải: QR */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <div style={{ background: "#fff", borderRadius: 10, padding: 8, border: "1px solid " + borderColor }}>
                            <img src={ZALO_BOT_QR} alt="QR Bot Wealbee" width={140} height={140} style={{ display: "block" }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: subtleColor, textAlign: "center", maxWidth: 150 }}>Quét bằng camera Zalo để mở bot</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
                <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: headingColor }}>Quyền riêng tư & Tuân thủ</h2>
                <div style={{ background: isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.04)", borderRadius: 10, padding: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: labelColor, lineHeight: 1.7 }}>
                    Wealbee hoạt động theo khung pháp lý: <strong>Luật Chứng khoán 2019</strong>, <strong>NĐ 155/2020/NĐ-CP</strong>, <strong>NĐ 13/2023/NĐ-CP</strong> về bảo vệ dữ liệu cá nhân.
                  </p>
                </div>
              </div>

              {/* Tài khoản: đăng xuất + xóa */}
              <div style={{ background: cardBg, borderRadius: 14, padding: 24, boxShadow: cardShadow }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: headingColor }}>Tài khoản</h2>
                <p style={{ margin: "0 0 18px", fontSize: 13, color: subtleColor }}>Quản lý phiên đăng nhập và tài khoản của bạn.</p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: "0.5px solid " + borderColor }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: headingColor }}>Đăng xuất</div>
                    <div style={{ fontSize: 13, color: subtleColor }}>Thoát khỏi tài khoản trên thiết bị này</div>
                  </div>
                  <button onClick={() => logout()} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid " + borderColor, background: "transparent", color: headingColor, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    Đăng xuất
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: "0.5px solid " + borderColor }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#c0392b" }}>Xóa tài khoản</div>
                    <div style={{ fontSize: 13, color: subtleColor }}>Xóa vĩnh viễn tài khoản và toàn bộ dữ liệu. Không thể hoàn tác.</div>
                  </div>
                  <button onClick={() => setConfirmDelete(true)} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid rgba(192,57,43,0.4)", background: "transparent", color: "#c0392b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>
                    Xóa tài khoản
                  </button>
                </div>
              </div>
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
                  Số tài khoản <span style={{ fontWeight: 500, color: theme.fgDisabled }}>(tự động phát hiện nếu để trống)</span>
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
          {section === "usage" && (
            <div>
              {/* ── Token usage widget ── */}
              <div style={{ background: cardBg, borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: cardShadow, border: "0.5px solid " + borderColor }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CreditCard size={16} color={theme.brand} strokeWidth={1.8} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: headingColor, fontFamily: FONT }}>Số dư & tiêu dùng Beeny</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.09)", color: theme.brand, fontFamily: FONT }}>{PLAN_LIMITS[plan]?.label ?? "Free"}</span>
                    {daysLeft != null && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: isDark ? "rgba(52,199,89,0.14)" : "rgba(52,199,89,0.10)", color: "#1a7f37", fontFamily: FONT }}>
                        còn {daysLeft} ngày{daysLeft <= 7 ? " dùng thử" : ""}
                      </span>
                    )}
                  </div>
                  <button onClick={loadBeenyUsage} title="Làm mới" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "0.5px solid " + borderColor, background: "transparent", cursor: "pointer" }}>
                    <RefreshCw size={14} color={subtleColor} strokeWidth={1.8} />
                  </button>
                </div>

                {/* Banner Beeny mua thêm — đếm ngược tới lúc hết hạn/biến mất */}
                {bonus > 0 && bonusExp && (() => {
                  const ms = Date.parse(bonusExp) - Date.now();
                  const hh = Math.max(0, Math.floor(ms / 3600000));
                  const mm = Math.max(0, Math.floor((ms % 3600000) / 60000));
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", marginBottom: 16, borderRadius: 10,
                      background: isDark ? "rgba(245,197,24,0.10)" : "rgba(184,134,11,0.08)", border: "0.5px solid " + (isDark ? "rgba(245,197,24,0.25)" : "rgba(184,134,11,0.22)") }}>
                      <span style={{ fontSize: 18 }}>⏳</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#F5C518" : "#8a6100", fontFamily: FONT }}>
                          Bạn có +{fmtBeeny(bonus)} Beeny mua thêm
                        </div>
                        <div style={{ fontSize: 12, color: subtleColor, fontFamily: FONT, marginTop: 1 }}>
                          Sẽ biến mất sau <b style={{ color: headingColor }}>{hh > 0 ? `${hh} giờ ` : ""}{mm} phút</b> (dùng phần này trước quota ngày)
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {loadingUsage ? (
                  <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <RefreshCw size={20} color={subtleColor} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
                  </div>
                ) : (
                  <>
                    {/* Số dư + tiêu dùng — nền neutral, chỉ số dư nhấn màu brand */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                      {[
                        { label: "Số dư hiện tại", value: balance == null ? "…" : fmtBeeny(balance),
                          sub: bonus > 0 ? `gồm +${fmtBeeny(bonus)} mua thêm (còn ${bonusExp ? Math.max(0, Math.ceil((Date.parse(bonusExp) - Date.now()) / 3600000)) : 0}h)` : `Beeny · reset ${PLAN_LIMITS[plan]?.daily ?? 10}/ngày`, accent: true },
                        { label: "Đã tiêu 30 ngày", value: fmtBeeny(totalBeeny), sub: "Beeny" },
                        { label: "Trung bình / ngày", value: fmtBeeny(totalBeeny / 30), sub: "Beeny/ngày" },
                        { label: "Số lần chạy", value: String(usageLog.length), sub: "lần (30 ngày)" },
                      ].map((c, i) => (
                        <div key={i} style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(8,73,172,0.025)", border: "0.5px solid " + borderColor }}>
                          <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT, marginBottom: 4 }}>{c.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: c.accent ? theme.brand : headingColor, fontFamily: FONT }}>{c.value}</div>
                          <div style={{ fontSize: 11, color: subtleColor, fontFamily: FONT }}>{c.sub}</div>
                        </div>
                      ))}
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
            </div>
          )}

          {section === "billing" && (
            <div>
              {/* ── Tiêu đề + Toggle Tháng / Năm ── */}
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: headingColor, fontFamily: FONT }}>Chọn gói phù hợp với bạn</h2>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: subtleColor, fontFamily: FONT }}>Nâng cấp bất cứ lúc nào · huỷ bất cứ lúc nào</p>
                <div style={{ display: "inline-flex", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.05)", borderRadius: 10, padding: 3, gap: 2 }}>
                  {[{ k: false, l: "Hàng tháng" }, { k: true, l: "Hàng năm" }].map(o => (
                    <button key={String(o.k)} onClick={() => setBillingYear(o.k)}
                      style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 700,
                        background: billingYear === o.k ? cardBg : "transparent", color: billingYear === o.k ? headingColor : subtleColor,
                        boxShadow: billingYear === o.k ? cardShadow : "none" }}>
                      {o.l}{o.k && <span style={{ fontSize: 10, marginLeft: 6, color: "#1a7a3a", fontWeight: 700 }}>−17%</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Kích hoạt Pro dùng thử 7 ngày (mỗi TK 1 lần) ── */}
              {trialAvail && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                  background: isDark ? "linear-gradient(135deg,rgba(8,73,172,0.22),rgba(77,143,232,0.12))" : "linear-gradient(135deg,#EAF2FF,#F3F8FF)",
                  border: "1.5px solid " + theme.brand, borderRadius: 16, padding: "18px 22px", marginBottom: 18,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 12, background: "linear-gradient(135deg,#0849AC,#4D8FE8)", flexShrink: 0 }}>
                    <Zap size={24} color="#fff" strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: headingColor, fontFamily: FONT }}>Dùng thử Pro miễn phí 7 ngày</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: subtleColor, fontFamily: FONT, marginTop: 3 }}>
                      100 Beeny/ngày · 5 agent · mở khoá gói Beeny theo ngày. Bấm kích hoạt để bắt đầu đếm ngược 7 ngày — mỗi tài khoản chỉ 1 lần.
                    </div>
                  </div>
                  <button
                    onClick={handleActivateTrial}
                    disabled={activating}
                    style={{
                      padding: "11px 26px", borderRadius: 10, border: "none",
                      background: activating ? "rgba(8,73,172,0.5)" : "linear-gradient(135deg,#0849AC,#4D8FE8)",
                      color: "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 800, cursor: activating ? "default" : "pointer",
                      boxShadow: "0 6px 18px rgba(8,73,172,0.30)", flexShrink: 0,
                    }}>
                    {activating ? "Đang kích hoạt…" : "Kích hoạt ngay"}
                  </button>
                </div>
              )}

              {/* ── Plan cards — bắt mắt: icon gradient, viền/nền nổi cho gói phổ biến ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignItems: "stretch", paddingTop: 12 }}>
                {plans.map(pl => {
                  const isCurrent = pl.id === plan;
                  const price = billingYear ? pl.priceY : pl.priceM;
                  const meta = {
                    free:    { Icon: Sparkles, grad: "linear-gradient(135deg,#94a3b8,#64748b)", solo: "#64748b" },
                    pro:     { Icon: Zap,      grad: "linear-gradient(135deg,#0849AC,#4D8FE8)", solo: theme.brand },
                    premium: { Icon: Crown,    grad: "linear-gradient(135deg,#B8860B,#E0A93B)", solo: "#B8860B" },
                  }[pl.id] ?? { Icon: Sparkles, grad: "", solo: theme.brand };
                  const highlight = pl.popular; // gói nổi bật
                  return (
                  <div key={pl.id}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 12px 32px rgba(0,0,0,0.5)" : "0 12px 32px rgba(8,73,172,0.16)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = highlight ? (isDark ? "0 8px 28px rgba(8,73,172,0.35)" : "0 8px 28px rgba(8,73,172,0.14)") : cardShadow; }}
                    style={{
                      background: cardBg, borderRadius: 16, padding: "26px 22px 22px", position: "relative", overflow: "hidden",
                      display: "flex", flexDirection: "column", minWidth: 0,
                      border: (isCurrent || highlight) ? "1.5px solid " + theme.brand : "1px solid " + borderColor,
                      boxShadow: highlight ? (isDark ? "0 8px 28px rgba(8,73,172,0.35)" : "0 8px 28px rgba(8,73,172,0.14)") : cardShadow,
                      transition: "transform 180ms ease, box-shadow 180ms ease",
                    }}>
                    {/* Thanh gradient trên đỉnh */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: meta.grad }} />
                    {/* Badge */}
                    {(highlight || isCurrent) && (
                      <span style={{ position: "absolute", top: 14, right: 14, whiteSpace: "nowrap",
                        background: isCurrent ? (isDark ? "rgba(52,199,89,0.16)" : "rgba(52,199,89,0.12)") : (isDark ? "rgba(77,143,232,0.16)" : "rgba(8,73,172,0.09)"),
                        color: isCurrent ? "#1a7f37" : theme.brand, fontSize: 10, fontWeight: 800, letterSpacing: "0.03em",
                        padding: "4px 10px", borderRadius: 99, fontFamily: FONT }}>
                        {isCurrent ? "ĐANG DÙNG" : "PHỔ BIẾN"}
                      </span>
                    )}

                    {/* Icon + tên */}
                    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: meta.grad, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 12px ${meta.solo}44` }}>
                        <meta.Icon size={19} color="#fff" strokeWidth={2} />
                      </div>
                      <span style={{ fontSize: 18, fontWeight: 800, color: headingColor, fontFamily: FONT }}>{pl.name}</span>
                    </div>

                    {/* Giá */}
                    <div style={{ marginBottom: 18, display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 27, fontWeight: 800, color: headingColor, fontFamily: FONT, letterSpacing: "-0.5px" }}>{price}</span>
                      {pl.id !== "free" && <span style={{ fontSize: 13, fontWeight: 600, color: subtleColor }}>/{billingYear ? "năm" : "tháng"}</span>}
                    </div>

                    <div style={{ height: "0.5px", background: borderColor, marginBottom: 16 }} />

                    {/* Tính năng */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 22, flex: 1 }}>
                      {pl.features.map(f => (
                        <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${meta.solo}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            <Check size={12} color={meta.solo} strokeWidth={3} />
                          </div>
                          <span style={{ fontSize: 13, color: labelColor, fontFamily: FONT, lineHeight: 1.4 }}>{f}</span>
                        </div>
                      ))}
                    </div>

                    <button disabled={isCurrent || pl.id === "free" || upgrading === pl.id}
                      onClick={() => handleUpgrade(pl.id)}
                      style={{ width: "100%", padding: "12px 0", borderRadius: 11, fontSize: 13.5, fontWeight: 700, fontFamily: FONT, marginTop: "auto",
                        cursor: (isCurrent || pl.id === "free") ? "default" : "pointer", opacity: upgrading === pl.id ? 0.6 : 1,
                        border: highlight && !isCurrent ? "none" : "1px solid " + (isCurrent ? borderColor : meta.solo + "66"),
                        background: highlight && !isCurrent ? meta.grad : "transparent",
                        color: highlight && !isCurrent ? "#fff" : isCurrent ? subtleColor : meta.solo }}>
                      {isCurrent ? "Đang dùng" : pl.id === "free" ? "Miễn phí" : upgrading === pl.id ? "Đang chuyển…" : `Nâng cấp ${pl.name}`}
                    </button>
                  </div>
                  );
                })}
              </div>

              {/* ── Gói Beeny theo ngày (chỉ Pro/Premium) ── */}
              {(plan === "pro" || plan === "premium") && (
                <div style={{ marginTop: 30 }}>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: headingColor, fontFamily: FONT }}>Mua thêm Beeny cho hôm nay</h3>
                    <p style={{ margin: 0, fontSize: 12.5, color: subtleColor, fontFamily: FONT }}>Cần thêm dung lượng? Nạp nhanh · <b style={{ color: headingColor }}>hết hạn sau 24 giờ</b> · mỗi loại 1 lần/ngày</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
                    {[
                      { id: "pack_5k",  beeny: 120, price: "5.000đ",  raw: 5000 },
                      { id: "pack_10k", beeny: 250, price: "10.000đ", raw: 10000, best: true },
                      { id: "pack_20k", beeny: 500, price: "20.000đ", raw: 20000 },
                    ].map(pk => (
                      <div key={pk.id} style={{
                        background: cardBg, borderRadius: 14, padding: "18px 16px", position: "relative", textAlign: "center",
                        border: pk.best ? "1.5px solid " + theme.brand : "1px solid " + borderColor, boxShadow: cardShadow,
                      }}>
                        {pk.best && <span style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", background: theme.brand, color: "#fff", fontSize: 9.5, fontWeight: 800, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>ĐÁNG MUA</span>}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 24, fontWeight: 800, color: isDark ? "#F5C518" : "#B8860B", fontFamily: FONT }}>+{pk.beeny}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: subtleColor, fontFamily: FONT }}>Beeny</span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: headingColor, fontFamily: FONT, marginBottom: 14 }}>{pk.price}</div>
                        <button onClick={() => handleBuyPack(pk.id)} disabled={buyingPack === pk.id}
                          style={{ width: "100%", padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: buyingPack === pk.id ? 0.6 : 1,
                            border: pk.best ? "none" : "1px solid " + borderColor, background: pk.best ? theme.brand : "transparent", color: pk.best ? "#fff" : headingColor }}>
                          {buyingPack === pk.id ? "Đang chuyển…" : "Mua ngay"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {trialModal != null && (
        <TrialGrantedModal days={trialModal} isDark={isDark} onClose={() => setTrialModal(null)} />
      )}

      {confirmDelete && (
        <div onClick={() => !deleting && setConfirmDelete(false)} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, width: "100%", maxWidth: 380, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#c0392b", margin: "0 0 8px" }}>Xóa tài khoản?</h3>
            <p style={{ fontSize: 14, color: labelColor, lineHeight: 1.6, margin: "0 0 20px" }}>
              Toàn bộ agent, danh mục, lịch sử và số dư Beeny sẽ bị <b>xóa vĩnh viễn</b>. Hành động này <b>không thể hoàn tác</b>.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid " + borderColor, background: "transparent", color: headingColor, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Hủy</button>
              <button onClick={doDeleteAccount} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#c0392b", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, opacity: deleting ? 0.6 : 1 }}>{deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
