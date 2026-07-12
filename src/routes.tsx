import { createBrowserRouter, Navigate } from "react-router";

// Landing + Login (thiết kế mới — luồng request demo)
import { LandingPage } from "./pages/landing/wb/app/pages/LandingPage";
import { LoginPage } from "./pages/landing/wb/app/pages/LoginPage";
import { DemoResultPage } from "./pages/landing/wb/app/pages/DemoResultPage";
import { RequireAuth } from "./components/require-auth";

// Landing sub-pages (giữ nguyên)
import FeedbackPage from "./pages/landing/FeedbackPage";
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
  AnalystReportsRoute,
} from "./pages/app/page-wrappers";

// Agents page (has full run functionality with SSE)
import { AgentsPage } from "./pages/app/agents";

// Ticker detail page (real Supabase data)
import { TickerDetailPage } from "./pages/app/ticker-detail-page";

// Tool detail page
import { ToolDetailPage } from "./pages/app/tool-detail-page";

// Legacy admin page
import { AdminDailyReview } from "./pages/admin-daily-review";

// Admin panel (framework manager)
import { AdminLogin } from "./pages/admin/admin-login";
import { AdminFrameworks } from "./pages/admin/admin-frameworks";
import { RequireAdmin } from "./components/require-admin";

export const router = createBrowserRouter([
  // ── Public routes ──────────────────────────────────────────────────────────
  { path: "/",              Component: LandingPage    },
  // /start và /unsubscribe thuộc tính năng "bản tin qua digest_subscribers" đã ngừng —
  // chuyển hướng về trang chủ để không hiện link chết.
  { path: "/start",         element: <Navigate to="/" replace /> },
  // Trang pricing cũ (giá 50k lỗi thời) → landing đã có section pricing chuẩn
  { path: "/pricing",       element: <Navigate to="/" replace /> },
  { path: "/feedback",      Component: FeedbackPage   },
  { path: "/unsubscribe",   element: <Navigate to="/" replace /> },
  { path: "/blog",          Component: BlogListPage   },
  { path: "/blog/:slug",    Component: BlogPostPage   },
  { path: "/login",         Component: LoginPage      },
  { path: "/demo-result",   Component: DemoResultPage },

  // ── Protected app routes — chặn bằng RequireAuth ──────────────────────────
  {
    path: "/app",
    Component: RequireAuth,
    children: [
      {
        Component: NewLayout,
        children: [
          { index: true,             Component: DashboardRoute    },
          { path: "inbox",           Component: InboxRoute        },
          { path: "reports",         Component: AnalystReportsRoute },
          { path: "agents",          Component: AgentsPage        },
          { path: "agent-studio",    Component: AgentStudioRoute  },
          { path: "templates",       Component: TemplatesRoute    },
          { path: "tools",           Component: ToolLibraryRoute  },
          { path: "tools/:id",       Component: ToolDetailPage    },
          { path: "knowledge",       Component: KnowledgeBaseRoute },
          { path: "portfolio",       Component: PortfolioRoute    },
          { path: "settings",        Component: SettingsRoute     },
          { path: "tickers",         Component: TickersRoute       },
          { path: "ticker/:symbol",  Component: TickerDetailPage  },

          // Legacy admin
          { path: "admin/daily-review", Component: AdminDailyReview },
        ],
      },
    ],
  },

  // ── Admin panel — route riêng, không dùng NewLayout ──────────────────────
  { path: "/admin/login",      Component: AdminLogin },
  { path: "/admin",            element: <Navigate to="/admin/login" replace /> },
  {
    path: "/admin",
    Component: RequireAdmin,
    children: [
      { path: "frameworks", Component: AdminFrameworks },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  { path: "*", Component: NotFound },
]);
