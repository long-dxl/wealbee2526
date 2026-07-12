import { useState } from "react";
import { Outlet } from "react-router";
import { Search, Sparkles, ArrowLeft, Monitor } from "lucide-react";
import { WealbeeLogo } from "../WealbeeIcon";
import { ActionHub } from "../new-action-hub";
import { GlobalSearch } from "../global-search";
import { BottomTabBar, TAB_BAR_HEIGHT } from "./bottom-tab-bar";
import { MoreSheet } from "./more-sheet";
import { studioNavItems, accountNavItems } from "../../lib/nav-items";
import type { Theme } from "../../lib/theme-context";
import type { ContextCard } from "../../types/cards";

interface MobileShellProps {
  theme: Theme;
  isDark: boolean;
  currentPage: string;
  isStudioMode: boolean;
  onNavigate: (page: string) => void;
  onSelectTicker: (symbol: string) => void;
  actionHubOpen: boolean;
  setActionHubOpen: (open: boolean) => void;
  hubWidth: number;
  setHubWidth: (w: number) => void;
  hubContextCards: ContextCard[];
  onAddContextCard: (c: ContextCard) => void;
  onRemoveContextCard: (id: string) => void;
  onClearContextCards: () => void;
  planLabel: string;
  beenyBalance: number | null;
  beenyPct: number;
  beenyBonus: number;
  outletContext: unknown;
}

const FONT = "'Montserrat', system-ui, sans-serif";

// Các trang thuộc menu "Thêm" → highlight nút ≡ trên tab bar
const MORE_PAGE_IDS = new Set([
  ...studioNavItems.map(i => i.id),
  ...accountNavItems.map(i => i.id),
]);

export function MobileShell({
  theme, isDark, currentPage, isStudioMode, onNavigate, onSelectTicker,
  actionHubOpen, setActionHubOpen, hubWidth, setHubWidth,
  hubContextCards, onAddContextCard, onRemoveContextCard, onClearContextCards,
  planLabel, beenyBalance, beenyPct, beenyBonus, outletContext,
}: MobileShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Agent Studio chỉ tối ưu desktop — trên mobile hiện màn thông báo thay vì
  // render studio (chặn cả URL trực tiếp lẫn nút "Sửa" agent điều hướng thẳng).
  const showChrome = true;
  if (isStudioMode) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100dvh", width: "100vw", padding: "32px 24px", boxSizing: "border-box",
        background: theme.bg, fontFamily: FONT, textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, marginBottom: 16,
          background: isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Monitor size={30} color={theme.brand} strokeWidth={1.6} />
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E" }}>
          Agent Studio dành cho máy tính
        </p>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: isDark ? "rgba(240,242,255,0.7)" : "#3D3D52", lineHeight: 1.65, maxWidth: 320 }}>
          Việc tạo và chỉnh sửa Agent cần không gian thao tác rộng.
          Vui lòng mở <b>Wealbee trên trình duyệt máy tính</b> để trải nghiệm tốt nhất.
        </p>
        <button
          onClick={() => onNavigate("agents")}
          style={{
            minHeight: 44, padding: "0 24px", borderRadius: 12, border: "none",
            background: theme.brand, color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: FONT, WebkitTapHighlightColor: "transparent",
          }}
        >
          Về Agent của tôi
        </button>
      </div>
    );
  }
  const bottomPad = showChrome
    ? `calc(${TAB_BAR_HEIGHT + 16}px + env(safe-area-inset-bottom))`
    : "calc(16px + env(safe-area-inset-bottom))";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100dvh", width: "100vw",
      overflow: "hidden", background: theme.bg, fontFamily: FONT,
    }}>
      {/* Top bar: logo + nút search */}
      {showChrome && (
        <div style={{
          height: 48, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 8px 0 14px",
          paddingTop: "env(safe-area-inset-top)",
          boxSizing: "content-box",
          background: theme.topBarBg,
          backdropFilter: isDark ? "blur(12px)" : "none",
          borderBottom: "0.5px solid " + theme.topBarBorder,
          zIndex: 30, position: "relative",
        }}>
          <WealbeeLogo collapsed={false} />
          <button
            onClick={() => setSearchOpen(true)}
            title="Tìm cổ phiếu"
            style={{
              width: 44, height: 44, border: "none", background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", WebkitTapHighlightColor: "transparent",
            }}
          >
            <Search size={20} strokeWidth={1.8} color={isDark ? "rgba(240,242,255,0.85)" : "#3D3D52"} />
          </button>
        </div>
      )}

      {/* Nội dung trang + disclaimer tĩnh cuối trang */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: bottomPad, background: theme.bg }}>
        <Outlet context={outletContext} />
        <p style={{
          // paddingRight 72 để không bị FAB ✨ (fixed góc phải) đè lên khi cuộn hết trang
          margin: 0, padding: "16px 72px 8px 16px", fontSize: 11, lineHeight: 1.5,
          color: theme.fgDisabled, textAlign: "center", fontFamily: FONT,
        }}>
          Wealbee cung cấp thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019, NĐ 155/2020/NĐ-CP
        </p>
      </div>

      {/* Bottom tab bar */}
      {showChrome && (
        <BottomTabBar
          currentPage={currentPage}
          onNavigate={onNavigate}
          onOpenMore={() => setMoreOpen(true)}
          moreActive={MORE_PAGE_IDS.has(currentPage)}
          isDark={isDark}
          theme={theme}
        />
      )}

      {/* FAB mở AI chat */}
      {showChrome && !actionHubOpen && (
        <button
          onClick={() => setActionHubOpen(true)}
          title="Mở BeeAI"
          style={{
            position: "fixed", right: 16,
            bottom: `calc(${TAB_BAR_HEIGHT + 16}px + env(safe-area-inset-bottom))`,
            zIndex: 45,
            width: 48, height: 48, borderRadius: "50%", background: theme.brand,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(8,73,172,0.30)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Sparkles size={20} color="#fff" strokeWidth={1.5} />
        </button>
      )}

      {/* AI chat full-screen overlay */}
      {actionHubOpen && !isStudioMode && (
        <ActionHub
          variant="mobile"
          currentPage={currentPage}
          open={actionHubOpen}
          onClose={() => setActionHubOpen(false)}
          width={hubWidth}
          onWidthChange={setHubWidth}
          contextCards={hubContextCards}
          onAddContextCard={onAddContextCard}
          onRemoveContextCard={onRemoveContextCard}
          onClearContextCards={onClearContextCards}
          isDark={isDark}
          theme={theme}
        />
      )}

      {/* More sheet */}
      <MoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        currentPage={currentPage}
        onNavigate={onNavigate}
        planLabel={planLabel}
        beenyBalance={beenyBalance}
        beenyPct={beenyPct}
        beenyBonus={beenyBonus}
        isDark={isDark}
        theme={theme}
      />

      {/* Search overlay full-screen */}
      {searchOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 55,
          background: theme.bg,
          display: "flex", flexDirection: "column",
          paddingTop: "env(safe-area-inset-top)",
        }}>
          <div style={{
            display: "flex", alignItems: "stretch", gap: 4,
            padding: "8px 12px 0 4px", flex: 1, minHeight: 0,
          }}>
            <button
              onClick={() => setSearchOpen(false)}
              title="Quay lại"
              style={{
                width: 44, height: 44, border: "none", background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, alignSelf: "flex-start",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <ArrowLeft size={20} strokeWidth={1.8} color={isDark ? "rgba(240,242,255,0.85)" : "#3D3D52"} />
            </button>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <GlobalSearch
                variant="mobile"
                onSelectTicker={(sym) => { setSearchOpen(false); onSelectTicker(sym); }}
                onNavigate={(page) => { setSearchOpen(false); onNavigate(page); }}
                isDark={isDark}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
