import { createBrowserRouter } from "react-router";

// Landing pages
import { Landing } from "./pages/landing";
import { Login } from "./pages/login";
import LandingPage from "./pages/landing/LandingPage";
import OnboardingPage from "./pages/landing/OnboardingPage";
import PricingPage from "./pages/landing/PricingPage";
import FeedbackPage from "./pages/landing/FeedbackPage";
import UnsubscribePage from "./pages/landing/UnsubscribePage";
import BlogListPage from "./pages/landing/blog/BlogListPage";
import BlogPostPage from "./pages/landing/blog/BlogPostPage";
import { NotFound } from "./pages/not-found";

// New layout
import { NewLayout } from "./components/new-layout";

// New platform pages (new UI via route wrappers)
import {
  DashboardRoute,
  InboxRoute,
  AgentStudioRoute,
  TemplatesRoute,
  ToolLibraryRoute,
  KnowledgeBaseRoute,
  PortfolioRoute,
  SettingsRoute,
  TickersRoute,
} from "./pages/app/page-wrappers";

// Agents page (has full run functionality with SSE)
import { AgentsPage } from "./pages/app/agents";

// Ticker detail page (real Supabase data)
import { TickerDetailPage } from "./pages/app/ticker-detail-page";

// Legacy admin page
import { AdminDailyReview } from "./pages/admin-daily-review";

export const router = createBrowserRouter([
  // ── Public routes ──────────────────────────────────────────────────────────
  { path: "/",              Component: LandingPage    },
  { path: "/start",         Component: OnboardingPage },
  { path: "/pricing",       Component: PricingPage    },
  { path: "/feedback",      Component: FeedbackPage   },
  { path: "/unsubscribe",   Component: UnsubscribePage },
  { path: "/blog",          Component: BlogListPage   },
  { path: "/blog/:slug",    Component: BlogPostPage   },
  { path: "/landing-old",   Component: Landing        },
  { path: "/login",         Component: Login          },

  // ── Protected app routes (new layout) ─────────────────────────────────────
  {
    path: "/app",
    Component: NewLayout,
    children: [
      { index: true,             Component: DashboardRoute    },
{ path: "inbox",           Component: InboxRoute        },
      { path: "agents",          Component: AgentsPage        },
      { path: "agent-studio",    Component: AgentStudioRoute  },
      { path: "templates",       Component: TemplatesRoute    },
      { path: "tools",           Component: ToolLibraryRoute  },
      { path: "knowledge",       Component: KnowledgeBaseRoute },
      { path: "portfolio",       Component: PortfolioRoute    },
      { path: "settings",        Component: SettingsRoute     },
      { path: "tickers",         Component: TickersRoute       },
      { path: "ticker/:symbol",  Component: TickerDetailPage  },

      // Legacy admin
      { path: "admin/daily-review", Component: AdminDailyReview },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  { path: "*", Component: NotFound },
]);
