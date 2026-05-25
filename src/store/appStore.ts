import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Nav ──────────────────────────────────────────────────────────────────────

export type NavSection =
  | "dashboard"
  | "inbox"
  | "agents"
  | "agent-studio"
  | "templates"
  | "tools"
  | "knowledge"
  | "portfolio"
  | "settings"
  // Legacy
  | "feed"
  | "research";

// ─── ActionHub ────────────────────────────────────────────────────────────────

export type ActionHubTab = "chat" | "agent" | "run-log";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ─── App Store ────────────────────────────────────────────────────────────────

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;

  // ActionHub
  actionHubOpen: boolean;
  actionHubTab: ActionHubTab;
  setActionHubOpen: (v: boolean) => void;
  setActionHubTab: (tab: ActionHubTab) => void;
  toggleActionHub: () => void;

  // Chat messages per session
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  // Current ticker context (for ActionHub contextual responses)
  contextTicker: string | null;
  setContextTicker: (ticker: string | null) => void;

  // Theme
  theme: "light" | "dark" | "midnight";
  setTheme: (t: "light" | "dark" | "midnight") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      // ActionHub
      actionHubOpen: true,
      actionHubTab: "chat",
      setActionHubOpen: (v) => set({ actionHubOpen: v }),
      setActionHubTab: (tab) => set({ actionHubTab: tab }),
      toggleActionHub: () => set((s) => ({ actionHubOpen: !s.actionHubOpen })),

      // Chat
      chatMessages: [],
      addChatMessage: (msg) =>
        set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
      clearChat: () => set({ chatMessages: [] }),

      // Context
      contextTicker: null,
      setContextTicker: (ticker) => set({ contextTicker: ticker }),

      // Theme
      theme: "light",
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: "wealbee-app",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        actionHubOpen: s.actionHubOpen,
        theme: s.theme,
      }),
    }
  )
);
