import { ChevronRight } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "../ui/drawer";
import { lightTheme, type Theme } from "../../lib/theme-context";
import { studioNavItems, accountNavItems } from "../../lib/nav-items";

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPage: string;
  onNavigate: (page: string) => void;
  planLabel?: string;
  beenyBalance?: number | null;
  beenyPct?: number;
  beenyBonus?: number;
  isDark?: boolean;
  theme?: Theme;
}

const FONT = "'Montserrat', system-ui, sans-serif";

export function MoreSheet({
  open,
  onOpenChange,
  currentPage,
  onNavigate,
  planLabel = "Free",
  beenyBalance = null,
  beenyPct = 0,
  beenyBonus = 0,
  isDark = false,
  theme = lightTheme,
}: MoreSheetProps) {
  const inactiveText = isDark ? "rgba(240,242,255,0.82)" : "rgba(26,26,46,0.82)";
  const subtleText = isDark ? "rgba(240,242,255,0.5)" : "rgba(26,26,46,0.5)";
  const cardBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.045)";
  const activeBg = isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.08)";
  const sheetBg = isDark ? "#141a29" : "#fff";

  const beenyStr = beenyBalance == null ? "…"
    : (() => { const r = Math.round(Math.max(0, beenyBalance) * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); })();

  const go = (page: string) => {
    onOpenChange(false);
    onNavigate(page);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        style={{
          background: sheetBg,
          borderTop: "0.5px solid " + (isDark ? "rgba(255,255,255,0.1)" : "rgba(26,26,46,0.08)"),
          fontFamily: FONT,
        }}
      >
        <DrawerTitle style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
          Menu thêm
        </DrawerTitle>

        <div style={{ padding: "12px 16px calc(20px + env(safe-area-inset-bottom))", overflowY: "auto" }}>
          {/* Gói + số dư Beeny — tap mở trang số dư */}
          <button
            onClick={() => go("settings-usage")}
            style={{
              display: "flex", flexDirection: "column", gap: 8, width: "100%",
              padding: "12px 14px", borderRadius: 12, marginBottom: 16,
              border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.12)"),
              background: cardBg, cursor: "pointer", fontFamily: FONT, textAlign: "left",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <span style={{
                fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                padding: "3px 10px", borderRadius: 99,
                background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.08)", color: theme.brand,
              }}>
                {planLabel}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: inactiveText }}>Số dư:</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: isDark ? "#F5C518" : "#B8860B" }}>{beenyStr}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: inactiveText }}>Beeny</span>
              </span>
            </div>
            <div style={{ width: "100%", height: 5, borderRadius: 99, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)", overflow: "hidden" }}>
              <div style={{ width: `${Math.round(beenyPct * 100)}%`, height: "100%", borderRadius: 99, background: beenyPct >= 0.9 ? "#e0524d" : theme.brand }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: subtleText }}>Đã dùng {Math.round(beenyPct * 100)}% hôm nay</span>
              {beenyBonus > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: isDark ? "#F5C518" : "#B8860B" }}>+{Math.round(beenyBonus)} bonus</span>}
            </div>
          </button>

          {/* AGENT STUDIO — quick-action cards */}
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase",
            color: isDark ? "rgba(240,242,255,0.28)" : "rgba(26,26,46,0.32)", marginBottom: 8,
          }}>
            Agent Studio
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {studioNavItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 8, padding: "16px 6px", borderRadius: 14, border: "none",
                    background: isActive ? activeBg : cardBg, cursor: "pointer", fontFamily: FONT,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Icon size={24} strokeWidth={1.8} color={theme.brand} />
                  <span style={{
                    fontSize: 11.5, fontWeight: 600, textAlign: "center", lineHeight: 1.3,
                    color: isActive ? theme.brand : inactiveText,
                  }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tài khoản — list rows */}
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase",
            color: isDark ? "rgba(240,242,255,0.28)" : "rgba(26,26,46,0.32)", marginBottom: 4,
          }}>
            Tài khoản
          </div>
          {accountNavItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  minHeight: 48, padding: "0 4px", border: "none",
                  background: "transparent", cursor: "pointer", fontFamily: FONT,
                  borderRadius: 10, WebkitTapHighlightColor: "transparent",
                }}
              >
                <Icon size={19} strokeWidth={1.7} color={isActive ? theme.brand : inactiveText} />
                <span style={{
                  flex: 1, textAlign: "left", fontSize: 15, fontWeight: isActive ? 600 : 500,
                  color: isActive ? theme.brand : inactiveText,
                }}>
                  {item.label}
                </span>
                <ChevronRight size={17} strokeWidth={1.7} color={subtleText} />
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
