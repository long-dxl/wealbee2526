import { Outlet, useNavigate, useLocation } from "react-router";
import { Toaster } from "sonner";
import { Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { Sidebar } from "./new-sidebar";
import { ActionHub } from "./new-action-hub";
import { GlobalSearch } from "./global-search";
import { CreateAgentModal } from "./CreateAgentModal";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { ProtectedRoute } from "./protected-route";
import { supabase } from "../lib/supabase/client";
import { getPlanAndBeeny, PLAN_LIMITS } from "../lib/plan-limits";
import { WALLET_REFRESH } from "../lib/wallet-events";
import type { ContextCard } from "../types/cards";

// ─── Route → page-id mapping ──────────────────────────────────────────────────

const ROUTE_PAGE: Record<string, string> = {
  "/app":               "dashboard",
"/app/tickers":       "tickers",
  "/app/inbox":         "inbox",
  "/app/agents":        "agents",
  "/app/agent-studio":  "agent-studio",
  "/app/templates":     "templates",
  "/app/tools":         "tools",
  "/app/knowledge":     "knowledge",
  "/app/portfolio":     "portfolio",
  "/app/settings":      "settings",
};

const PAGE_ROUTE: Record<string, string> = {
  dashboard:       "/app",
tickers:         "/app/tickers",
  inbox:           "/app/inbox",
  reports:         "/app/reports",
  "settings-billing": "/app/settings?tab=billing",
  "settings-usage":   "/app/settings?tab=usage",
  agents:          "/app/agents",
  "agent-studio":  "/app/agent-studio",
  "create-agent":  "/app/agent-studio",
  templates:       "/app/templates",
  tools:           "/app/tools",
  knowledge:       "/app/knowledge",
  portfolio:       "/app/portfolio",
  settings:        "/app/settings",
};

// ─── Inner layout (needs theme context) ───────────────────────────────────────

function NewLayoutInner() {
  const { theme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [actionHubOpen, setActionHubOpen] = useState(true);
  const [hubWidth, setHubWidth] = useState(380);
  const [hubContextCards, setHubContextCards] = useState<ContextCard[]>([]);
  const [planLabel, setPlanLabel] = useState("Free");
  const [beenyBalance, setBeenyBalance] = useState<number | null>(null);
  const [beenyPct, setBeenyPct] = useState(0);        // % quota ngày đã dùng (0..1)
  const [beenyBonus, setBeenyBonus] = useState(0);    // Beeny mua thêm (hết hạn 24h)
  const [createAgentOpen, setCreateAgentOpen] = useState(false);

  const fetchWallet = (userId: string) => {
    getPlanAndBeeny(userId).then(({ plan, label, balance, bonus }) => {
      setPlanLabel(label);
      setBeenyBalance(balance);
      setBeenyBonus(bonus ?? 0);
      const daily = PLAN_LIMITS[plan]?.daily ?? 10;
      const dailyBal = Math.max(0, (balance ?? 0) - (bonus ?? 0));
      setBeenyPct(Math.min(1, Math.max(0, (daily - dailyBal) / daily)));
    });
  };

  // Load ngay khi session sẵn sàng (getSession đọc localStorage, không cần network)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchWallet(session.user.id);
    });

    // Lắng nghe auth thay đổi (login/logout) để cập nhật
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) fetchWallet(session.user.id);
      else { setPlanLabel("Free"); setBeenyBalance(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Refresh khi chuyển trang (số dư đổi sau khi chạy agent/ActionHub)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchWallet(session.user.id);
    });
  }, [location.pathname]);

  // Refresh NGAY khi có sự kiện "ví đổi" (sau mỗi lần chạy AI)
  useEffect(() => {
    const h = () => supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchWallet(session.user.id);
    });
    window.addEventListener(WALLET_REFRESH, h);
    return () => window.removeEventListener(WALLET_REFRESH, h);
  }, []);

  // Derive currentPage from URL
  // For /app/ticker/:symbol — no direct sidebar item, highlight nothing special
  const isTickerPage = location.pathname.startsWith("/app/ticker/");
  const currentPage = isTickerPage ? "" : (ROUTE_PAGE[location.pathname] ?? "dashboard");
  const isStudioMode = currentPage === "agent-studio" || currentPage === "create-agent";

  // Trang Cài đặt: thu gọn ActionHub mặc định để giao diện thoáng — chỉ áp dụng
  // lúc VÀO trang (currentPage đổi giá trị), user vẫn tự mở lại được sau đó mà
  // không bị effect này ép đóng lại.
  useEffect(() => {
    if (currentPage === "settings") setActionHubOpen(false);
  }, [currentPage]);

  const handleNavigate = (page: string) => {
    // "Tạo Agent" luôn mở modal đặt tên trước — không điều hướng ngay để user
    // có thể Huỷ/click ra ngoài mà không rời trang đang xem.
    if (page === "create-agent") { setCreateAgentOpen(true); return; }
    const route = PAGE_ROUTE[page];
    if (route) navigate(route);
    if (page === "agent-studio") {
      setSidebarCollapsed(true);
      setActionHubOpen(false);
    }
  };

  const handleCreateAgentContinue = (agentName: string, agentDesc: string) => {
    setCreateAgentOpen(false);
    setSidebarCollapsed(true);
    setActionHubOpen(false);
    navigate("/app/agent-studio", { state: { agentName, agentDesc } });
  };

  const addContextCard = (card: ContextCard) => {
    setHubContextCards(prev => {
      if (prev.find(c => c.id === card.id)) return prev;
      if (!actionHubOpen) setActionHubOpen(true);
      return [...prev, card];
    });
  };

  const removeContextCard = (id: string) => {
    setHubContextCards(prev => prev.filter(c => c.id !== id));
  };

  const clearContextCards = () => setHubContextCards([]);

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw", overflow: "hidden",
      background: theme.bg,
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed || isStudioMode}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        inboxCount={0}
        hasAgentRunning={false}
        planLabel={planLabel}
        beenyBalance={beenyBalance}
        beenyPct={beenyPct}
        beenyBonus={beenyBonus}
        isDark={isDark}
        theme={theme}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Global search bar */}
        {!isStudioMode && (
          <div style={{
            height: 52, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: theme.topBarBg,
            backdropFilter: isDark ? "blur(12px)" : "none",
            borderBottom: "0.5px solid " + theme.topBarBorder,
            zIndex: 20, position: "relative",
          }}>
            <GlobalSearch
              onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)}
              onNavigate={handleNavigate}
              isDark={isDark}
            />
          </div>
        )}

        {/* paddingBottom > chiều cao thanh compliance footer (22px, position:fixed, xem bên dưới) —
            để nội dung cuối trang (card, nút…) không bị thanh footer đè lên khi cuộn hết */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 44, background: theme.bg }}>
          <Outlet context={{ onNavigate: handleNavigate, addContextCard, removeContextCard, isDark, theme, openCreateAgentModal: () => setCreateAgentOpen(true) }} />
        </div>
      </div>

      {/* Action Hub */}
      {!isStudioMode && (
        <>
          <ActionHub
            currentPage={currentPage}
            open={actionHubOpen}
            onClose={() => setActionHubOpen(false)}
            width={hubWidth}
            onWidthChange={setHubWidth}
            contextCards={hubContextCards}
            onAddContextCard={addContextCard}
            onRemoveContextCard={removeContextCard}
            onClearContextCards={clearContextCards}
            isDark={isDark}
            theme={theme}
          />
          {!actionHubOpen && (
            <button
              onClick={() => setActionHubOpen(true)}
              style={{
                position: "fixed", top: 12, right: 12, zIndex: 50,
                width: 40, height: 40, borderRadius: "50%", background: theme.brand,
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 16px rgba(8,73,172,0.30)",
                transition: "transform 150ms ease",
              }}
              title="Mở BeeAI"
            >
              <Sparkles size={18} color="#fff" strokeWidth={1.5} />
            </button>
          )}
        </>
      )}

      {/* Compliance footer */}
      <div style={{
        position: "fixed", bottom: 0, left: sidebarCollapsed || isStudioMode ? 64 : 240,
        right: actionHubOpen && !isStudioMode ? hubWidth : 0,
        height: 22, background: theme.topBarBg,
        backdropFilter: isDark ? "blur(8px)" : "none",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5,
        borderTop: "0.5px solid " + theme.border,
        pointerEvents: "none",
        transition: "right 200ms ease-out, left 200ms ease-out",
      }}>
        <p style={{ margin: 0, fontSize: 11, color: theme.fgDisabled, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          Wealbee cung cấp thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019, NĐ 155/2020/NĐ-CP
        </p>
      </div>

      <CreateAgentModal
        open={createAgentOpen}
        isDark={isDark}
        onCancel={() => setCreateAgentOpen(false)}
        onContinue={handleCreateAgentContinue}
      />

      <Toaster theme={isDark ? "dark" : "light"} position="bottom-right" richColors />
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }
      `}</style>
    </div>
  );
}

// ─── Export: NewLayout wraps with ThemeProvider + ProtectedRoute ──────────────

export function NewLayout() {
  return (
    <ProtectedRoute>
      <ThemeProvider>
        <NewLayoutInner />
      </ThemeProvider>
    </ProtectedRoute>
  );
}
