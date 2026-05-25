import { Wrench, TrendingUp, Newspaper, BarChart3, Mail, Globe, Calculator, Database, Bell, FileText, Search, Zap, LineChart, Users, Calendar, PieChart, MessageSquare, Rss } from "lucide-react";

const TOOLS = [
  { id: "price_feed",      icon: TrendingUp,   color: "#0849ac",  name: "Price Feed",       category: "Market Data",  desc: "Giá realtime & lịch sử OHLCV từ TCBS/SSI" },
  { id: "news_feed",       icon: Newspaper,    color: "#0ea5a0",  name: "News Feed",        category: "Market Data",  desc: "Tin tức tài chính từ 10+ nguồn VN" },
  { id: "financials",      icon: BarChart3,    color: "#8b5cf6",  name: "Financials",       category: "Fundamental",  desc: "BCTC 5 năm: doanh thu, lợi nhuận, ROE" },
  { id: "dividends",       icon: PieChart,     color: "#f59e0b",  name: "Dividends",        category: "Fundamental",  desc: "Lịch sử và kế hoạch chi trả cổ tức" },
  { id: "insider_trades",  icon: Users,        color: "#ef4444",  name: "Insider Trades",   category: "Fundamental",  desc: "Giao dịch cổ đông nội bộ từ HoSE/HNX" },
  { id: "macro_data",      icon: Globe,        color: "#10b981",  name: "Macro Data",       category: "Macro",        desc: "CPI, lãi suất, tỷ giá, GDP Việt Nam" },
  { id: "market_indices",  icon: LineChart,    color: "#0849ac",  name: "Market Indices",   category: "Market Data",  desc: "VN-Index, VN30, HNX, UPCOM realtime" },
  { id: "earnings_cal",    icon: Calendar,     color: "#f59e0b",  name: "Earnings Calendar",category: "Fundamental",  desc: "Lịch công bố BCTC, ĐHCĐ sắp tới" },
  { id: "portfolio_read",  icon: Database,     color: "#0ea5a0",  name: "Portfolio Reader", category: "User Data",    desc: "Đọc holdings và P&L từ danh mục người dùng" },
  { id: "alert_send",      icon: Bell,         color: "#ef4444",  name: "Alert Sender",     category: "Notification", desc: "Gửi cảnh báo vào Inbox" },
  { id: "email_send",      icon: Mail,         color: "#6366f1",  name: "Email Sender",     category: "Notification", desc: "Gửi digest qua Resend" },
  { id: "kb_search",       icon: Search,       color: "#8b5cf6",  name: "KB Search",        category: "Knowledge",    desc: "Tìm kiếm ngữ nghĩa trong Knowledge Base" },
  { id: "calculator",      icon: Calculator,   color: "#0849ac",  name: "Calculator",       category: "Analysis",     desc: "Tính toán PE, PB, EV/EBITDA, CAGR..." },
  { id: "report_gen",      icon: FileText,     color: "#10b981",  name: "Report Generator", category: "Analysis",     desc: "Tạo báo cáo PDF từ dữ liệu phân tích" },
  { id: "web_search",      icon: Zap,          color: "#f59e0b",  name: "Web Search",       category: "External",     desc: "Tìm kiếm thông tin trên web (Tavily)" },
  { id: "rss_reader",      icon: Rss,          color: "#ef4444",  name: "RSS Reader",       category: "Market Data",  desc: "Đọc RSS feed từ CafeF, VnEconomy, Investing.com" },
  { id: "sentiment_api",   icon: MessageSquare,color: "#0ea5a0",  name: "Sentiment API",    category: "Analysis",     desc: "Phân tích sentiment tin tức với GPT-4.1-mini" },
  { id: "pnl_calc",        icon: TrendingUp,   color: "#10b981",  name: "P&L Calculator",   category: "User Data",    desc: "Tính lãi/lỗ, % return theo thời gian" },
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
              return (
                <div key={tool.id} style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${tool.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon style={{ width: 15, height: 15, color: tool.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e" }}>{tool.name}</p>
                    <p style={{ fontSize: "0.6875rem", color: "#6a7282", marginTop: 3, lineHeight: 1.4 }}>{tool.desc}</p>
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
