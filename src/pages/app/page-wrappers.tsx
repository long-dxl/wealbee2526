/**
 * Route wrapper components that connect new UI pages to the NewLayout outlet context.
 * Each wrapper calls useOutletContext() to get navigation and theme props.
 */
import { useOutletContext, useNavigate, useLocation, useSearchParams } from "react-router";
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
import { AnalystReportsPage } from "./analyst-reports";

// Outlet context type shared by NewLayout
export interface AppOutletContext {
  onNavigate: (page: string) => void;
  addContextCard: (card: ContextCard) => void;
  removeContextCard: (id: string) => void;
  isDark: boolean;
  theme: Theme;
  openCreateAgentModal: () => void;
  // Mobile: addContextCard không auto-mở hub (overlay full-screen che trang) —
  // nút ✨ Hỏi AI gọi hàm này để mở chủ động sau khi thêm card.
  openActionHub: () => void;
}

function useApp() {
  return useOutletContext<AppOutletContext>();
}

// ─── Route wrappers ────────────────────────────────────────────────────────────

export function DashboardRoute() {
  const { onNavigate, addContextCard, openActionHub, isDark } = useApp();
  const navigate = useNavigate();
  return (
    <Dashboard
      onNavigate={onNavigate}
      onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)}
      isDark={isDark}
      onAskAI={(card) => { addContextCard(card); openActionHub(); }}
    />
  );
}

export function AnalystReportsRoute() {
  const { addContextCard, openActionHub, isDark } = useApp();
  return <AnalystReportsPage isDark={isDark} addContextCard={(card) => { addContextCard(card); openActionHub(); }} />;
}

export function InboxRoute() {
  const { isDark } = useApp();
  const navigate = useNavigate();
  return <Inbox isDark={isDark} onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)} />;
}

export function AgentStudioRoute() {
  const { onNavigate, isDark } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get("agent_id") ?? undefined;
  // Tên/mô tả đã được nhập ở modal "Tạo Agent mới" (trang Agent của tôi / Mẫu Agent / sidebar)
  // được chuyển qua router state để Studio bỏ qua bước hỏi lại tên.
  // presetToolId: đến từ trang chi tiết công cụ (Thư viện công cụ) khi user bấm
  // "Tạo Agent dùng công cụ này" — Studio sẽ tự bật sẵn tool đó.
  const state = location.state as { agentName?: string; agentDesc?: string; presetToolId?: string } | null;
  void onNavigate;
  return (
    <AgentStudio
      onBack={() => navigate("/app/agents")}
      agentId={agentId}
      initialName={state?.agentName}
      initialDescription={state?.agentDesc}
      initialToolId={state?.presetToolId}
      isDark={isDark}
    />
  );
}

export function TemplatesRoute() {
  const { onNavigate, isDark, openCreateAgentModal } = useApp();
  return <Templates onNavigate={onNavigate} onCreateAgent={openCreateAgentModal} isDark={isDark} />;
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
  const { onNavigate, addContextCard, openActionHub, isDark } = useApp();
  const navigate = useNavigate();
  return (
    <Portfolio
      onNavigate={onNavigate}
      onSelectTicker={(sym) => navigate(`/app/ticker/${sym}`)}
      onAddContextCard={(card) => { addContextCard(card); openActionHub(); }}
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
