/**
 * Route wrapper components that connect new UI pages to the NewLayout outlet context.
 * Each wrapper calls useOutletContext() to get navigation and theme props.
 */
import { useOutletContext, useNavigate, useSearchParams } from "react-router";
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
import { Tickers } from "./tickers";

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
  const navigate = useNavigate();
  return (
    <Dashboard
      onNavigate={onNavigate}
      onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)}
      isDark={isDark}
    />
  );
}

export function InboxRoute() {
  const { isDark } = useApp();
  const navigate = useNavigate();
  return <Inbox isDark={isDark} onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)} />;
}

export function AgentStudioRoute() {
  const { onNavigate, isDark } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get("agent_id") ?? undefined;
  void onNavigate;
  return <AgentStudio onBack={() => navigate("/app/agents")} agentId={agentId} isDark={isDark} />;
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
  const navigate = useNavigate();
  return (
    <Portfolio
      onNavigate={onNavigate}
      onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)}
      onAddContextCard={addContextCard}
      isDark={isDark}
    />
  );
}

export function SettingsRoute() {
  return <Settings />;
}

export function TickersRoute() {
  const { isDark } = useApp();
  const navigate = useNavigate();
  return <Tickers onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)} isDark={isDark} />;
}

export function MarketPulseRoute() {
  const { onNavigate, isDark } = useApp();
  const navigate = useNavigate();
  return (
    <MarketPulse
      onNavigate={onNavigate}
      onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)}
      isDark={isDark}
    />
  );
}
