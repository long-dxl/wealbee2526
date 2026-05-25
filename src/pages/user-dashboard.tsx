import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw,
  Bot, Inbox, BarChart3, ArrowRight, Zap, Clock,
} from "lucide-react";
import { pipelineSupabase } from "../lib/supabase/pipeline-client";
import { useAppStore } from "../store/appStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketNews {
  id: string;
  title: string;
  content_summary: string | null;
  article_url: string;
  label: string;
  impact_score: number | null;
  affected_symbols: string[] | null;
  source: string;
  published_at: string;
  news_type: string | null;
}

// ─── VN30 demo movers (replace with real prices_daily query once table exists) ─

const VN30_MOVERS = {
  gainers: [
    { ticker: "FPT",  name: "FPT Corp",     price: 125600, change: 2100,  pct: 1.70,  sector: "Tech" },
    { ticker: "VCB",  name: "Vietcombank",   price: 95800,  change: 800,   pct: 0.84,  sector: "Bank" },
    { ticker: "MBB",  name: "MB Bank",       price: 28900,  change: 300,   pct: 1.05,  sector: "Bank" },
    { ticker: "TCB",  name: "Techcombank",   price: 22400,  change: 200,   pct: 0.90,  sector: "Bank" },
    { ticker: "ACB",  name: "ACB",           price: 23100,  change: 150,   pct: 0.65,  sector: "Bank" },
  ],
  losers: [
    { ticker: "HPG",  name: "Hòa Phát",      price: 27950,  change: -350,  pct: -1.24, sector: "Steel" },
    { ticker: "VHM",  name: "Vinhomes",       price: 38700,  change: -820,  pct: -2.08, sector: "RE" },
    { ticker: "MSN",  name: "Masan",          price: 67800,  change: -600,  pct: -0.88, sector: "Consumer" },
    { ticker: "VIC",  name: "Vingroup",       price: 42100,  change: -400,  pct: -0.94, sector: "RE" },
    { ticker: "GAS",  name: "PV Gas",         price: 98400,  change: -800,  pct: -0.81, sector: "Energy" },
  ],
};

const MARKET_INDICES = [
  { label: "VN-Index", value: "1,247.68", change: "+10.11", pct: "+0.82%", up: true },
  { label: "VN30",     value: "1,319.44", change: "+9.84",  pct: "+0.75%", up: true },
  { label: "HNX",      value: "251.91",   change: "−0.86",  pct: "−0.34%", up: false },
  { label: "UPCOM",    value: "95.32",    change: "+0.24",  pct: "+0.25%", up: true  },
];

const SOURCE_LABEL: Record<string, string> = {
  vietstock: "Vietstock", cafef: "CafeF", baodautu: "Báo Đầu tư",
  nhadautu: "Nhà đầu tư", tinnhanhchungkhoan: "Tin nhanh CK", stockbiz: "Stockbiz",
  kinhtechungkhoan: "KT Chứng khoán", markettimes: "Markettimes",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function impactColor(score: number | null) {
  if (!score) return "#99a1af";
  if (score >= 5)  return "#0ea5a0";
  if (score <= -5) return "#ef4444";
  if (score > 0)   return "#0849ac";
  return "#f59e0b";
}

function sentimentColor(label: string) {
  if (label.includes("positive")) return "#0ea5a0";
  if (label.includes("negative")) return "#ef4444";
  return "#f59e0b";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}p trước`;
  if (h < 24) return `${h}h trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function IndexCard({ idx }: { idx: typeof MARKET_INDICES[0] }) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {idx.up
          ? <TrendingUp style={{ width: 13, height: 13, color: "#0ea5a0" }} />
          : <TrendingDown style={{ width: 13, height: 13, color: "#ef4444" }} />
        }
        <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#99a1af", letterSpacing: "0.05em" }}>{idx.label}</span>
      </div>
      <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
        {idx.value}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: "0.75rem", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: idx.up ? "#0ea5a0" : "#ef4444" }}>
          {idx.change}
        </span>
        <span style={{ fontSize: "0.6875rem", padding: "2px 6px", borderRadius: 5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", background: idx.up ? "rgba(14,165,160,0.1)" : "rgba(239,68,68,0.1)", color: idx.up ? "#0ea5a0" : "#ef4444" }}>
          {idx.pct}
        </span>
      </div>
    </div>
  );
}

// ─── UserDashboard ─────────────────────────────────────────────────────────────

export function UserDashboard() {
  const [news, setNews] = useState<MarketNews[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { setContextTicker, setActionHubOpen } = useAppStore();

  const loadNews = async () => {
    try {
      const cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      const { data } = await pipelineSupabase
        .from("market_news")
        .select("id, title, content_summary, article_url, label, impact_score, affected_symbols, source, published_at, news_type")
        .gte("published_at", cutoff)
        .order("impact_score", { ascending: false, nullsFirst: false })
        .limit(20);
      setNews(data || []);
    } catch {
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => { loadNews(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNews();
    setRefreshing(false);
  };

  const handleTickerClick = (ticker: string) => {
    setContextTicker(ticker);
    setActionHubOpen(true);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>
            Dashboard
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 3 }}>
            {new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={handleRefresh} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6a7282" }}>
          <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
        </button>
      </div>

      {/* ── Market indices ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {MARKET_INDICES.map(idx => <IndexCard key={idx.label} idx={idx} />)}
      </div>

      {/* ── Quick actions ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { icon: Bot,     color: "#0849ac", bg: "rgba(8,73,172,0.08)",    label: "Hỏi BeeAI",       desc: "Phân tích thị trường ngay", action: () => { setActionHubOpen(true); } },
          { icon: Inbox,   color: "#0ea5a0", bg: "rgba(14,165,160,0.08)", label: "Xem Inbox",       desc: "2 tin chưa đọc",            href: "/app/inbox" },
          { icon: BarChart3,color: "#8b5cf6",bg: "rgba(139,92,246,0.08)", label: "Danh mục",        desc: "Cập nhật P&L",              href: "/app/portfolio" },
        ].map(item => (
          <div
            key={item.label}
            onClick={() => { if (item.action) item.action(); }}
            style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(8,73,172,0.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <item.icon style={{ width: 16, height: 16, color: item.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e" }}>{item.label}</p>
              <p style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{item.desc}</p>
            </div>
            {item.href
              ? <Link to={item.href}><ArrowRight style={{ width: 14, height: 14, color: "#c4c9d4" }} /></Link>
              : <ArrowRight style={{ width: 14, height: 14, color: "#c4c9d4" }} />
            }
          </div>
        ))}
      </div>

      {/* ── Two-column: VN30 movers + News ── */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>

        {/* VN30 movers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Gainers */}
          <div style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", borderBottom: "1px solid rgba(8,73,172,0.06)" }}>
              <TrendingUp style={{ width: 14, height: 14, color: "#0ea5a0" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a1a2e" }}>Top tăng VN30</span>
            </div>
            {VN30_MOVERS.gainers.map((s) => (
              <div key={s.ticker} onClick={() => handleTickerClick(s.ticker)} style={{ display: "flex", alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid rgba(8,73,172,0.03)", transition: "background 0.1s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(14,165,160,0.04)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={{ width: 44, fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>{s.ticker}</span>
                <span style={{ flex: 1, fontSize: "0.6875rem", color: "#99a1af" }}>{s.name}</span>
                <span style={{ fontSize: "0.8125rem", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#1a1a2e", marginRight: 10 }}>{s.price.toLocaleString()}</span>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#0ea5a0", fontFamily: "'IBM Plex Mono', monospace", minWidth: 48, textAlign: "right" }}>+{s.pct}%</span>
              </div>
            ))}
          </div>

          {/* Losers */}
          <div style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", borderBottom: "1px solid rgba(8,73,172,0.06)" }}>
              <TrendingDown style={{ width: 14, height: 14, color: "#ef4444" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a1a2e" }}>Top giảm VN30</span>
            </div>
            {VN30_MOVERS.losers.map((s) => (
              <div key={s.ticker} onClick={() => handleTickerClick(s.ticker)} style={{ display: "flex", alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid rgba(8,73,172,0.03)", transition: "background 0.1s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(239,68,68,0.04)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={{ width: 44, fontSize: "0.8125rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>{s.ticker}</span>
                <span style={{ flex: 1, fontSize: "0.6875rem", color: "#99a1af" }}>{s.name}</span>
                <span style={{ fontSize: "0.8125rem", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#1a1a2e", marginRight: 10 }}>{s.price.toLocaleString()}</span>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#ef4444", fontFamily: "'IBM Plex Mono', monospace", minWidth: 48, textAlign: "right" }}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* News feed */}
        <div style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(8,73,172,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Zap style={{ width: 14, height: 14, color: "#0849ac" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a1a2e" }}>Tin nổi bật hôm nay</span>
            </div>
            <Link to="/app/feed" style={{ fontSize: "0.6875rem", color: "#0849ac", fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
              Xem tất cả <ArrowRight style={{ width: 11, height: 11 }} />
            </Link>
          </div>

          {newsLoading ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #0849ac", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 8 }}>Đang tải tin tức...</p>
            </div>
          ) : news.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <p style={{ fontSize: "0.8125rem", color: "#99a1af" }}>Chưa có tin tức hôm nay</p>
            </div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {news.slice(0, 12).map((article) => (
                <a
                  key={article.id}
                  href={article.article_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(8,73,172,0.04)", textDecoration: "none", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#fafbff"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
                >
                  {/* Impact bar */}
                  <div style={{ width: 3, borderRadius: 2, background: impactColor(article.impact_score), flexShrink: 0, alignSelf: "stretch" }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e", lineHeight: 1.4, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {article.title}
                    </p>
                    {article.content_summary && (
                      <p style={{ fontSize: "0.6875rem", color: "#6a7282", lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {article.content_summary}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.5625rem", color: "#c4c9d4", display: "flex", alignItems: "center", gap: 3 }}>
                        <Clock style={{ width: 9, height: 9 }} />
                        {timeAgo(article.published_at)}
                      </span>
                      <span style={{ fontSize: "0.5625rem", color: "#99a1af", fontWeight: 600 }}>
                        {SOURCE_LABEL[article.source] || article.source}
                      </span>
                      {article.impact_score !== null && (
                        <span style={{ fontSize: "0.5625rem", fontWeight: 700, color: impactColor(article.impact_score), fontFamily: "'IBM Plex Mono', monospace" }}>
                          {article.impact_score > 0 ? "+" : ""}{article.impact_score}
                        </span>
                      )}
                      {article.affected_symbols?.slice(0, 3).map(sym => (
                        <span key={sym} onClick={e => { e.preventDefault(); handleTickerClick(sym); }} style={{ padding: "1px 5px", borderRadius: 4, background: "rgba(8,73,172,0.08)", color: "#0849ac", fontSize: "0.5625rem", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer" }}>
                          {sym}
                        </span>
                      ))}
                      <ExternalLink style={{ width: 9, height: 9, color: "#c4c9d4", marginLeft: "auto" }} />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
