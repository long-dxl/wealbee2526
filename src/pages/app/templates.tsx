import { Mail, BarChart3, Search, TrendingUp, Zap, Globe, Play, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

const TEMPLATES = [
  { id: "daily_digest", icon: Mail, color: "#0849ac", bg: "rgba(8,73,172,0.1)", name: "Daily Market Digest", description: "Bản tin thị trường hàng ngày: VN-Index, top movers VN30, tin tức tóm tắt. Gửi email + lưu vào Inbox.", schedule: "Hàng ngày 7:00 AM", tools: ["market_data", "news_feed", "email_send"] },
  { id: "portfolio_health", icon: BarChart3, color: "#0ea5a0", bg: "rgba(14,165,160,0.1)", name: "Portfolio Health", description: "Theo dõi danh mục: cảnh báo khi CP biến động mạnh, tóm tắt P&L hàng tuần.", schedule: "Thứ 2–6, 11:45 AM", tools: ["portfolio_read", "price_alert", "pnl_calc"] },
  { id: "deep_research", icon: Search, color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", name: "Deep Research", description: "Phân tích chuyên sâu một mã CP: BCTC 5 năm, cổ tức, insider trades, tin tức.", schedule: "Thủ công", tools: ["financials", "dividends", "insider", "news_feed", "ai_analysis"] },
  { id: "earnings", icon: TrendingUp, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", name: "Earnings Analyst", description: "Theo dõi mùa BCTC: tóm tắt kết quả kinh doanh của các CP trong watchlist.", schedule: "Theo lịch BCTC", tools: ["financials", "earnings_calendar", "ai_analysis"] },
  { id: "insider_tracker", icon: Zap, color: "#ef4444", bg: "rgba(239,68,68,0.1)", name: "Insider Tracker", description: "Cảnh báo khi cổ đông nội bộ mua/bán CP đáng kể. Tổng hợp giao dịch insider tuần.", schedule: "Hàng ngày 8:00 PM", tools: ["insider_data", "alert_send"] },
  { id: "macro_watch", icon: Globe, color: "#10b981", bg: "rgba(16,185,129,0.1)", name: "Macro Watch", description: "Theo dõi chỉ số kinh tế vĩ mô: lạm phát, lãi suất, tỷ giá và tác động lên TTCK Việt Nam.", schedule: "Thứ 2 hàng tuần", tools: ["macro_data", "forex", "ai_analysis"] },
];

export function TemplatesPage() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Templates</h1>
        <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>6 template được tối ưu cho thị trường chứng khoán Việt Nam</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
        {TEMPLATES.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.id} style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "20px 20px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 20, height: 20, color: t.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e" }}>{t.name}</h3>
                  <p style={{ fontSize: "0.75rem", color: "#6a7282", marginTop: 5, lineHeight: 1.5 }}>{t.description}</p>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                {t.tools.map(tool => (
                  <span key={tool} style={{ padding: "3px 8px", borderRadius: 5, background: "rgba(8,73,172,0.06)", color: "#0849ac", fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{tool.replace(/_/g, " ")}</span>
                ))}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#99a1af", marginBottom: 16 }}>📅 {t.schedule}</div>
              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <button onClick={() => navigate("/app/agent-studio")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 9, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
                  <Play style={{ width: 13, height: 13 }} />Dùng template
                </button>
                <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", color: "#6a7282", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                  Xem <ChevronRight style={{ width: 11, height: 11 }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
