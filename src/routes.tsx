import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/layout";
import { ProtectedRoute } from "./components/protected-route";

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

// App pages
import { UserDashboard } from "./pages/user-dashboard";
import { IntelligenceFeed } from "./pages/intelligence-feed";
import { ResearchDesk } from "./pages/research-desk";
import { AdminDailyReview } from "./pages/admin-daily-review";

// New platform pages
import { InboxPage } from "./pages/app/inbox";
import { AgentsPage } from "./pages/app/agents";
import { AgentStudioPage } from "./pages/app/agent-studio";
import { TemplatesPage } from "./pages/app/templates";
import { ToolsPage } from "./pages/app/tools";
import { KnowledgePage } from "./pages/app/knowledge";
import { PortfolioPage } from "./pages/app/portfolio";
import { SettingsPage } from "./pages/app/settings";

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

  // ── Protected app routes (with layout) ────────────────────────────────────
  {
    path: "/app",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      // Dashboard (index)
      { index: true,                   Component: UserDashboard    },

      // Core platform
      { path: "feed",                  Component: IntelligenceFeed },
      { path: "inbox",                 Component: InboxPage        },
      { path: "agents",                Component: AgentsPage       },
      { path: "agent-studio",          Component: AgentStudioPage  },
      { path: "templates",             Component: TemplatesPage    },
      { path: "tools",                 Component: ToolsPage        },
      { path: "knowledge",             Component: KnowledgePage    },
      { path: "portfolio",             Component: PortfolioPage    },
      { path: "settings",              Component: SettingsPage     },

      // Legacy / admin
      { path: "research",              Component: ResearchDesk     },
      { path: "admin/daily-review",    Component: AdminDailyReview },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  { path: "*", Component: NotFound },
]);
