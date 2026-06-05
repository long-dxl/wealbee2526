import { useState } from "react";
import {
  House, Inbox, Bot, Plus, LayoutTemplate, Wrench,
  BookOpen, Wallet, Settings, TrendingUp, List,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { WealbeeLogo } from "./WealbeeIcon";
import { lightTheme, type Theme } from "../lib/theme-context";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  inboxCount?: number;
  hasAgentRunning?: boolean;
  tokenUsed?: number;
  tokenLimit?: number;
  isDark?: boolean;
  theme?: Theme;
}

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  section?: string;
}

const navItems: NavItem[] = [
  { id: "dashboard", icon: House,      label: "Tổng quan" },
  { id: "feed",      icon: TrendingUp, label: "Thị trường" },
  // { id: "tickers",   icon: List,       label: "Cổ phiếu" },
  { id: "inbox",     icon: Inbox,      label: "Hộp thư" },
  { id: "agents",    icon: Bot,        label: "Agent của tôi" },
  { id: "portfolio", icon: Wallet,     label: "Danh mục" },
  { id: "divider-studio", section: "AGENT STUDIO", icon: Plus, label: "" },
  { id: "create-agent", icon: Plus, label: "Tạo Agent" },
  { id: "templates", icon: LayoutTemplate, label: "Mẫu Agent" },
  { id: "tools", icon: Wrench, label: "Thư viện công cụ" },
  { id: "knowledge", icon: BookOpen, label: "Kho kiến thức" },
];

export function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  inboxCount = 0,
  hasAgentRunning = false,
  tokenUsed = 47000,
  tokenLimit = 500000,
  isDark = false,
  theme = lightTheme,
}: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const tokenPct = Math.round((tokenUsed / tokenLimit) * 100);

  const FONT = "'Montserrat', system-ui, sans-serif";
  const inactiveText = isDark ? "rgba(240,242,255,0.82)" : "rgba(26,26,46,0.82)";
  const inactiveIcon = isDark ? "rgba(240,242,255,0.60)" : "rgba(26,26,46,0.55)";
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(26,26,46,0.05)";
  const activeBg = isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.08)";

  return (
    <aside
      style={{
        width: collapsed ? 56 : 232,
        minWidth: collapsed ? 56 : 232,
        transition: "width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1)",
        background: theme.sidebarBg,
        borderRight: "1px solid " + (isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.07)"),
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? 0 : "0 16px",
        flexShrink: 0,
      }}>
        <WealbeeLogo collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 8px" }}>
        {navItems.map((item) => {
          if (item.section && item.label === "") {
            if (collapsed) return null;
            return (
              <div key={item.section} style={{
                padding: "16px 8px 4px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: isDark ? "rgba(240,242,255,0.28)" : "rgba(26,26,46,0.32)",
                whiteSpace: "nowrap",
                fontFamily: FONT,
              }}>
                {item.section}
              </div>
            );
          }

          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isHovered = hoveredItem === item.id;

          return (
            <div key={item.id} style={{ position: "relative", marginBottom: 1 }}>
              {/* Collapsed tooltip */}
              {collapsed && isHovered && (
                <div style={{
                  position: "absolute",
                  left: "calc(100% + 10px)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: isDark ? "#1e2535" : "#1A1A2E",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "5px 10px",
                  borderRadius: 7,
                  whiteSpace: "nowrap",
                  zIndex: 100,
                  pointerEvents: "none",
                  fontFamily: FONT,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.20)",
                }}>
                  {item.label}
                  <div style={{
                    position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)",
                    width: 8, height: 8,
                    background: isDark ? "#1e2535" : "#1A1A2E",
                    clipPath: "polygon(100% 0, 100% 100%, 0 50%)",
                  }} />
                </div>
              )}

              <button
                onClick={() => onNavigate(item.id)}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  width: "100%",
                  height: 36,
                  padding: collapsed ? "0" : "0 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  transition: "background 100ms ease",
                  background: isActive ? activeBg : isHovered ? hoverBg : "transparent",
                  fontFamily: FONT,
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? theme.brand : inactiveText,
                  position: "relative",
                }}
              >
                <div style={{ position: "relative", flexShrink: 0, display: "flex" }}>
                  <Icon size={16} strokeWidth={isActive ? 2 : 1.6}
                    color={isActive ? theme.brand : inactiveIcon} />
                  {item.id === "inbox" && inboxCount > 0 && collapsed && (
                    <div style={{ position: "absolute", top: -3, right: -3, background: "#E8453C", borderRadius: "50%", width: 7, height: 7 }} />
                  )}
                  {item.id === "agents" && hasAgentRunning && collapsed && (
                    <div style={{ position: "absolute", bottom: -1, right: -1, background: theme.brand, borderRadius: "50%", width: 5, height: 5 }} />
                  )}
                </div>

                {!collapsed && (
                  <>
                    <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: item.id === "create-agent" ? theme.brand : undefined }}>
                      {item.label}
                    </span>
                    {item.id === "inbox" && inboxCount > 0 && (
                      <span style={{
                        background: "#E8453C",
                        color: "#fff",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "0px 7px",
                        minWidth: 20,
                        height: 20,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: FONT,
                        letterSpacing: "-0.01em",
                        flexShrink: 0,
                      }}>
                        {inboxCount}
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Token quota */}
      {!collapsed && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid " + (isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.07)") }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: inactiveText, fontFamily: FONT }}>
              {(tokenUsed / 1000).toFixed(0)}k / {(tokenLimit / 1000).toFixed(0)}k tokens
            </span>
            <span style={{ fontSize: 11, color: inactiveText, fontFamily: FONT }}>{tokenPct}%</span>
          </div>
          <div style={{ background: isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.08)", borderRadius: 99, height: 4, overflow: "hidden" }}>
            <div style={{ width: `${tokenPct}%`, background: theme.brand, height: "100%", borderRadius: 99, transition: "width 500ms ease" }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: collapsed ? "8px 8px" : "8px",
        borderTop: "1px solid " + (isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.07)"),
        display: "flex",
        flexDirection: collapsed ? "column" : "row",
        alignItems: "center",
        gap: 2,
      }}>
        <button
          onClick={() => onNavigate("settings")}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = currentPage === "settings" ? activeBg : "transparent"; }}
          style={{
            display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
            gap: 9, width: "100%", height: 36,
            padding: collapsed ? "0" : "0 10px",
            borderRadius: 7, border: "none",
            background: currentPage === "settings" ? activeBg : "transparent",
            color: currentPage === "settings" ? theme.brand : inactiveText,
            cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: currentPage === "settings" ? 600 : 500,
            transition: "background 100ms ease",
          }}
        >
          <Settings size={16} strokeWidth={currentPage === "settings" ? 2 : 1.6}
            color={currentPage === "settings" ? theme.brand : inactiveIcon} />
          {!collapsed && <span>Cài đặt</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Mở rộng" : "Thu gọn"}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          style={{
            display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
            gap: 9, width: "100%", height: 36,
            padding: collapsed ? "0" : "0 10px",
            borderRadius: 7, border: "none", background: "transparent",
            color: inactiveText, cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 500,
            transition: "background 100ms ease",
          }}
        >
          {collapsed
            ? <ChevronsRight size={16} strokeWidth={1.6} color={inactiveIcon} />
            : <><ChevronsLeft size={16} strokeWidth={1.6} color={inactiveIcon} /><span>Thu gọn</span></>
          }
        </button>
      </div>
    </aside>
  );
}
