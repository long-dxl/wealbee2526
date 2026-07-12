import { Menu } from "lucide-react";
import { lightTheme, type Theme } from "../../lib/theme-context";
import { primaryNavItems } from "../../lib/nav-items";

interface BottomTabBarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenMore: () => void;
  moreActive?: boolean;   // trang hiện tại thuộc nhóm More (studio/settings) → highlight nút ≡
  inboxCount?: number;
  isDark?: boolean;
  theme?: Theme;
}

const FONT = "'Montserrat', system-ui, sans-serif";
export const TAB_BAR_HEIGHT = 56; // chưa gồm safe-area-inset-bottom

export function BottomTabBar({
  currentPage,
  onNavigate,
  onOpenMore,
  moreActive = false,
  inboxCount = 0,
  isDark = false,
  theme = lightTheme,
}: BottomTabBarProps) {
  const inactiveColor = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.55)";

  const renderSlot = (opts: {
    key: string; icon: React.ElementType; label: string;
    active: boolean; onClick: () => void; badge?: number;
  }) => {
    const Icon = opts.icon;
    const color = opts.active ? theme.brand : inactiveColor;
    return (
      <button
        key={opts.key}
        onClick={opts.onClick}
        style={{
          flex: 1, height: "100%", border: "none", background: "transparent",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 3, cursor: "pointer", padding: 0, fontFamily: FONT,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div style={{ position: "relative", display: "flex" }}>
          <Icon size={22} strokeWidth={opts.active ? 2.1 : 1.7} color={color} />
          {(opts.badge ?? 0) > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -8,
              background: "#E8453C", color: "#fff", borderRadius: 99,
              fontSize: 9, fontWeight: 700, minWidth: 14, height: 14,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px", fontFamily: FONT,
            }}>
              {opts.badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: 9.5, fontWeight: opts.active ? 700 : 500, color, letterSpacing: "-0.01em" }}>
          {opts.label}
        </span>
      </button>
    );
  };

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
      height: TAB_BAR_HEIGHT, paddingBottom: "env(safe-area-inset-bottom)",
      boxSizing: "content-box",
      display: "flex", alignItems: "stretch",
      background: theme.sidebarBg,
      borderTop: "0.5px solid " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.10)"),
      backdropFilter: "blur(12px)",
    }}>
      {primaryNavItems.map(item => renderSlot({
        key: item.id, icon: item.icon,
        // caption ngắn cho tab bar — "Agent của tôi" quá dài
        label: item.id === "agents" ? "Agent" : item.label,
        active: currentPage === item.id,
        onClick: () => onNavigate(item.id),
        badge: item.id === "inbox" ? inboxCount : 0,
      }))}
      {renderSlot({
        key: "more", icon: Menu, label: "Thêm",
        active: moreActive, onClick: onOpenMore,
      })}
    </nav>
  );
}
