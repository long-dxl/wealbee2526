import { NavLink, Outlet } from "react-router";
import { Toaster } from "sonner";
import {
  LayoutDashboard,
  Inbox,
  Bot,
  BookTemplate,
  Wrench,
  BookOpen,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  TrendingUp,
  TrendingDown,
  LogOut,
  Newspaper,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { WealbeeIcon } from "./WealbeeIcon";
import { ActionHub } from "./ActionHub";
import { useAppStore } from "../store/appStore";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_MAIN = [
  { to: "/app",              icon: LayoutDashboard, label: "Dashboard"      },
  { to: "/app/feed",         icon: Newspaper,       label: "Tin tức"        },
  { to: "/app/inbox",        icon: Inbox,           label: "Inbox"          },
  { to: "/app/agents",       icon: Bot,             label: "Agents"         },
  { to: "/app/templates",    icon: BookTemplate,    label: "Templates"      },
  { to: "/app/tools",        icon: Wrench,          label: "Công cụ"        },
  { to: "/app/knowledge",    icon: BookOpen,        label: "Knowledge Base" },
];

const NAV_BOTTOM = [
  { to: "/app/portfolio",    icon: BarChart3,       label: "Portfolio"      },
  { to: "/app/settings",     icon: Settings,        label: "Cài đặt"        },
];

const ACTIVE_STYLE: React.CSSProperties = {
  background: "rgba(8,73,172,0.08)",
  color: "#0849ac",
};

// ─── MarketTicker ─────────────────────────────────────────────────────────────

interface Ticker {
  label: string;
  value: string;
  change: string;
  up: boolean;
}

function MarketTicker({ ticker }: { ticker: Ticker }) {
  const Icon = ticker.up ? TrendingUp : TrendingDown;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, padding: "5px 11px",
      borderRadius: 8, background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)",
      fontSize: "0.75rem",
    }}>
      <Icon style={{ width: 12, height: 12, color: ticker.up ? "#0ea5a0" : "#ef4444" }} />
      <span style={{ color: "#6a7282", fontSize: "0.6875rem" }}>{ticker.label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1a1a2e", fontWeight: 600 }}>{ticker.value}</span>
      <span style={{ color: ticker.up ? "#0ea5a0" : "#ef4444", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{ticker.change}</span>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout() {
  const { user, logout } = useAuth();
  const { sidebarCollapsed, toggleSidebar, actionHubOpen, toggleActionHub } = useAppStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const userInitials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "WB";

  const SIDEBAR_W = sidebarCollapsed ? 56 : 240;

  return (
    <div
      style={{
        display: "flex", height: "100vh", width: "100vw", overflow: "hidden",
        fontFamily: "'Inter', sans-serif", background: "#f5f8ff",
      }}
    >
      {/* ── Sidebar ── */}
      <aside style={{
        width: SIDEBAR_W, flexShrink: 0,
        background: "#ffffff",
        borderRight: "1px solid rgba(8,73,172,0.08)",
        display: "flex", flexDirection: "column",
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{
          height: 60, flexShrink: 0,
          borderBottom: "1px solid rgba(8,73,172,0.06)",
          display: "flex", alignItems: "center", gap: 10,
          padding: sidebarCollapsed ? "0 11px" : "0 16px",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #032d6b, #0849ac)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <WealbeeIcon size={18} color="#fff" />
          </div>
          {!sidebarCollapsed && (
            <span style={{
              fontFamily: "'Montserrat', sans-serif", fontSize: "0.9375rem",
              fontWeight: 700, color: "#1a1a2e", whiteSpace: "nowrap",
            }}>
              Wealbee
            </span>
          )}
        </div>

        {/* Main nav */}
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV_MAIN.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              title={sidebarCollapsed ? item.label : undefined}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10,
                padding: sidebarCollapsed ? "10px 0" : "9px 10px",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                borderRadius: 9, textDecoration: "none",
                fontSize: "0.8125rem", fontWeight: 500,
                transition: "all 0.15s",
                ...(isActive ? ACTIVE_STYLE : { color: "#6a7282", background: "transparent" }),
              })}
            >
              <item.icon style={{ width: 17, height: 17, flexShrink: 0 }} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom nav */}
        <nav style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid rgba(8,73,172,0.06)" }}>
          {NAV_BOTTOM.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              title={sidebarCollapsed ? item.label : undefined}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10,
                padding: sidebarCollapsed ? "10px 0" : "9px 10px",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                borderRadius: 9, textDecoration: "none",
                fontSize: "0.8125rem", fontWeight: 500,
                transition: "all 0.15s",
                marginTop: 2,
                ...(isActive ? ACTIVE_STYLE : { color: "#6a7282", background: "transparent" }),
              })}
            >
              <item.icon style={{ width: 17, height: 17, flexShrink: 0 }} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}

          {/* Collapse toggle */}
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            style={{
              marginTop: 4, padding: sidebarCollapsed ? "10px 0" : "8px 10px",
              display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-end",
              gap: 6, borderRadius: 9, border: "none", background: "transparent",
              color: "#c4c9d4", cursor: "pointer", fontSize: "0.75rem",
              transition: "all 0.15s",
            }}
          >
            {sidebarCollapsed
              ? <ChevronRight style={{ width: 15, height: 15 }} />
              : <><span>Thu gọn</span><ChevronLeft style={{ width: 15, height: 15 }} /></>
            }
          </button>
        </nav>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* ── Topbar ── */}
        <header style={{
          height: 60, flexShrink: 0,
          background: "#ffffff",
          borderBottom: "1px solid rgba(8,73,172,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", gap: 16,
        }}>
          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.1)",
            borderRadius: 9, padding: "7px 12px", flex: "0 1 320px",
          }}>
            <Search style={{ width: 14, height: 14, color: "#99a1af", flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              placeholder="Tìm mã CP: VCB, FPT..."
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: "0.8125rem", color: "#1a1a2e", width: "100%",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
          </div>

          {/* Market tickers */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, justifyContent: "center" }}>
            <MarketTicker ticker={{ label: "VN-Index", value: "1,247.68", change: "+0.82%", up: true }} />
            <MarketTicker ticker={{ label: "HNX",      value: "251.91",   change: "−0.34%",  up: false }} />
            <MarketTicker ticker={{ label: "USD/VND",  value: "26,341",   change: "+0.11%",  up: true }} />
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Notification bell */}
            <button style={{
              position: "relative", width: 34, height: 34, borderRadius: 9,
              border: "1px solid rgba(8,73,172,0.1)", background: "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6a7282",
            }}>
              <Bell style={{ width: 15, height: 15 }} />
              <span style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, borderRadius: "50%", background: "#0849ac" }} />
            </button>

            {/* ActionHub toggle */}
            <button
              onClick={toggleActionHub}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 9,
                border: actionHubOpen ? "1px solid rgba(8,73,172,0.25)" : "1px solid rgba(8,73,172,0.1)",
                background: actionHubOpen ? "rgba(8,73,172,0.06)" : "transparent",
                color: actionHubOpen ? "#0849ac" : "#6a7282",
                cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              <Bot style={{ width: 14, height: 14 }} />
              <span>BeeAI</span>
              {actionHubOpen && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0ea5a0" }} />}
            </button>

            {/* User avatar */}
            <div ref={userMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={{
                  width: 33, height: 33, borderRadius: "50%",
                  background: "linear-gradient(135deg, #032d6b, #0849ac)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "#fff", fontFamily: "'Montserrat', sans-serif" }}>
                  {userInitials}
                </span>
              </button>

              {showUserMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 200,
                  background: "#ffffff", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 10,
                  boxShadow: "0 8px 32px rgba(8,73,172,0.15)", zIndex: 200, overflow: "hidden",
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(8,73,172,0.06)" }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e" }}>
                      {user?.email?.split("@")[0] || "Người dùng"}
                    </p>
                    <p style={{ fontSize: "0.6875rem", color: "#99a1af", marginTop: 2 }}>
                      {user?.email || ""}
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                      border: "none", background: "transparent", cursor: "pointer",
                      fontSize: "0.8125rem", color: "#ef4444", fontFamily: "inherit",
                    }}
                  >
                    <LogOut style={{ width: 14, height: 14 }} />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content row ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Page content */}
          <main style={{ flex: 1, overflowY: "auto" }}>
            <Outlet />
          </main>

          {/* ActionHub */}
          <ActionHub />
        </div>
      </div>

      <Toaster theme="light" position="bottom-right" richColors />
    </div>
  );
}
