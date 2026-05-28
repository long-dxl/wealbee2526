import { Outlet, useNavigate, useLocation } from "react-router";
import { Toaster } from "sonner";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Sidebar } from "./new-sidebar";
import { ActionHub } from "./new-action-hub";
import { GlobalSearch } from "./global-search";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { ProtectedRoute } from "./protected-route";
import type { ContextCard } from "../types/cards";

// ─── Route → page-id mapping ──────────────────────────────────────────────────

const ROUTE_PAGE: Record<string, string> = {
  "/app":               "dashboard",
  "/app/feed":          "feed",
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
  feed:            "/app/feed",
  tickers:         "/app/tickers",
  inbox:           "/app/inbox",
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [actionHubOpen, setActionHubOpen] = useState(true);
  const [hubWidth, setHubWidth] = useState(380);
  const [hubContextCards, setHubContextCards] = useState<ContextCard[]>([]);

  // Derive currentPage from URL
  // For /app/ticker/:symbol — no direct sidebar item, highlight nothing special
  const isTickerPage = location.pathname.startsWith("/app/ticker/");
  const currentPage = isTickerPage ? "" : (ROUTE_PAGE[location.pathname] ?? "dashboard");
  const isStudioMode = currentPage === "agent-studio" || currentPage === "create-agent";

  const handleNavigate = (page: string) => {
    const route = PAGE_ROUTE[page];
    if (route) navigate(route);
    if (page === "agent-studio" || page === "create-agent") {
      setSidebarCollapsed(true);
      setActionHubOpen(false);
    }
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
        tokenUsed={0}
        tokenLimit={500000}
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

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24, background: theme.bg }}>
          <Outlet context={{ onNavigate: handleNavigate, addContextCard, isDark, theme }} />
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
