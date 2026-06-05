import { Wrench, TrendingUp, Newspaper, BarChart3, Mail, Globe, Calculator, Database, Bell, FileText, Search, Zap, LineChart, Users, Calendar, PieChart, MessageSquare, Rss } from "lucide-react";

const TOOLS = [
  // ── Hoạt động ──────────────────────────────────────────────────────────────
  { id: "price_feed",      icon: TrendingUp,    color: "#0849ac", name: "Price Feed",        category: "Market Data",  desc: "Giá realtime & lịch sử OHLCV từ Yahoo Finance",  available: true  },
  { id: "news_feed",       icon: Newspaper,     color: "#0ea5a0", name: "News Feed",         category: "Market Data",  desc: "Tin tức tài chính từ 10+ nguồn VN (48h gần nhất)", available: true },
  { id: "market_indices",  icon: LineChart,     color: "#0849ac", name: "Market Indices",    category: "Market Data",  desc: "VN-Index, HNX từ DB (part of Price Feed)",       available: true  },
  { id: "financials",      icon: BarChart3,     color: "#8b5cf6", name: "Financials",        category: "Fundamental",  desc: "BCTC 5 năm: doanh thu, lợi nhuận, ROE, D/E",     available: true  },
  { id: "dividends",       icon: PieChart,      color: "#f59e0b", name: "Dividends",         category: "Fundamental",  desc: "Lịch sử cổ tức (bundled trong Financials)",       available: true  },
  { id: "insider_trades",  icon: Users,         color: "#ef4444", name: "Insider Trades",    category: "Fundamental",  desc: "Giao dịch nội bộ từ VCI (bundled trong Financials)", available: true },
  { id: "portfolio_read",  icon: Database,      color: "#0ea5a0", name: "Portfolio Reader",  category: "User Data",    desc: "Đọc holdings & P&L từ portfolio_holdings",        available: true  },
  { id: "email_send",      icon: Mail,          color: "#6366f1", name: "Email Sender",      category: "Notification", desc: "Gửi digest qua Resend (bật trong Settings agent)", available: true },
  { id: "kb_search",       icon: Search,        color: "#8b5cf6", name: "KB Search",         category: "Knowledge",    desc: "RAG semantic search trong Knowledge Base (pgvector)", available: true },
  // ── Chưa implement ─────────────────────────────────────────────────────────
  { id: "macro_data",      icon: Globe,         color: "#10b981", name: "Macro Data",        category: "Macro",        desc: "CPI, lãi suất, tỷ giá, GDP Việt Nam",             available: false },
  { id: "earnings_cal",    icon: Calendar,      color: "#f59e0b", name: "Earnings Calendar", category: "Fundamental",  desc: "Lịch công bố BCTC, ĐHCĐ sắp tới",                available: false },
  { id: "alert_send",      icon: Bell,          color: "#ef4444", name: "Alert Sender",      category: "Notification", desc: "Gửi cảnh báo realtime vào Inbox",                 available: false },
  { id: "calculator",      icon: Calculator,    color: "#0849ac", name: "Calculator",        category: "Analysis",     desc: "Tính PE, PB, EV/EBITDA, CAGR...",                 available: false },
  { id: "report_gen",      icon: FileText,      color: "#10b981", name: "Report Generator",  category: "Analysis",     desc: "Tạo báo cáo PDF từ dữ liệu phân tích",            available: false },
  { id: "web_search",      icon: Zap,           color: "#f59e0b", name: "Web Search",        category: "External",     desc: "Tìm kiếm thông tin trên web (Tavily)",             available: false },
  { id: "rss_reader",      icon: Rss,           color: "#ef4444", name: "RSS Reader",        category: "Market Data",  desc: "Đọc RSS feed từ CafeF, VnEconomy...",             available: false },
  { id: "sentiment_api",   icon: MessageSquare, color: "#0ea5a0", name: "Sentiment API",     category: "Analysis",     desc: "Phân tích sentiment tin tức với LLM",             available: false },
  { id: "pnl_calc",        icon: TrendingUp,    color: "#10b981", name: "P&L Calculator",    category: "User Data",    desc: "Tính lãi/lỗ, % return theo thời gian",            available: false },
];

const CATEGORIES = [...new Set(TOOLS.map(t => t.category))];

export function ToolsPage() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Tool Library</h1>
        <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>{TOOLS.length} công cụ có thể dùng trong Agent Studio</p>
      </div>
      {CATEGORIES.map(cat => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#99a1af", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>{cat}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {TOOLS.filter(t => t.category === cat).map(tool => {
              const Icon = tool.icon;
              const unavail = tool.available === false;
              return (
                <div key={tool.id} style={{
                  background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12,
                  padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
                  opacity: unavail ? 0.45 : 1, filter: unavail ? "grayscale(0.5)" : "none",
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${tool.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 15, height: 15, color: tool.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e" }}>{tool.name}</p>
                      {unavail
                        ? <span style={{ fontSize: "0.625rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,0.06)", color: "#99a1af" }}>Sắp ra mắt</span>
                        : <span style={{ fontSize: "0.625rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(52,199,89,0.12)", color: "#15803d" }}>Active</span>
                      }
                    </div>
                    <p style={{ margin: 0, fontSize: "0.6875rem", color: "#6a7282", lineHeight: 1.4 }}>{tool.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
