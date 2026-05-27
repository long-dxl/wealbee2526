/**
 * Route wrapper components that connect new UI pages to the NewLayout outlet context.
 * Each wrapper calls useOutletContext() to get navigation and theme props.
 */
import { useOutletContext } from "react-router";
import { useNavigate } from "react-router";
import type { Theme } from "../../lib/theme-context";
import type { ContextCard } from "../../types/cards";

import { Dashboard } from "./dashboard-new";
import { Inbox } from "./inbox-new";
import { AgentStudio } from "./agent-studio-new";
import { Templates } from "./templates-new";
import { ToolLibrary } from "./tools-new";
import { KnowledgeBase } from "./knowledge-new";
import { Portfolio } from "./portfolio-new";
import { Settings } from "./settings-new";
import { MarketPulse } from "./market-pulse";

// Outlet context type shared by NewLayout
export interface AppOutletContext {
  onNavigate: (page: string) => void;
  addContextCard: (card: ContextCard) => void;
  isDark: boolean;
  theme: Theme;
}

function useApp() {
  return useOutletContext<AppOutletContext>();
}

// ─── Route wrappers ────────────────────────────────────────────────────────────

export function DashboardRoute() {
  const { onNavigate, addContextCard, isDark } = useApp();
  return (
    <Dashboard
      onNavigate={onNavigate}
      onSelectTicker={(sym) => onNavigate(`tickers`)}
      isDark={isDark}
    />
  );
}

export function InboxRoute() {
  const { isDark } = useApp();
  return <Inbox isDark={isDark} />;
}

export function AgentStudioRoute() {
  const { onNavigate, isDark } = useApp();
  return <AgentStudio onBack={() => onNavigate("agents")} isDark={isDark} />;
}

export function TemplatesRoute() {
  const { onNavigate, isDark } = useApp();
  return <Templates onNavigate={onNavigate} isDark={isDark} />;
}

export function ToolLibraryRoute() {
  const { isDark } = useApp();
  return <ToolLibrary isDark={isDark} />;
}

export function KnowledgeBaseRoute() {
  const { isDark } = useApp();
  return <KnowledgeBase isDark={isDark} />;
}

export function PortfolioRoute() {
  const { onNavigate, addContextCard, isDark } = useApp();
  return (
    <Portfolio
      onNavigate={onNavigate}
      onSelectTicker={(sym) => onNavigate("tickers")}
      onAddContextCard={addContextCard}
      isDark={isDark}
    />
  );
}

export function SettingsRoute() {
  return <Settings />;
}

export function MarketPulseRoute() {
  const { onNavigate, isDark } = useApp();
  return (
    <MarketPulse
      onNavigate={onNavigate}
      onSelectTicker={(sym) => onNavigate("tickers")}
      isDark={isDark}
    />
  );
}
