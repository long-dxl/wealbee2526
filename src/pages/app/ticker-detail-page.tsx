/**
 * TickerDetailPage — Trang chi tiết mã cổ phiếu
 * Route: /app/ticker/:symbol
 *
 * Dữ liệu thật từ Supabase:
 *  - stocks            → tên, sàn, ngành, beta, mô tả DN
 *  - prices_daily      → giá OHLCV 90 ngày (chart)
 *  - financials_annual → P/E, P/B, ROE, ROA, EPS, Doanh thu, LNST
 *  - dividends         → lịch sử cổ tức
 *  - insider_transactions → giao dịch nội bộ
 *  - market_news       → tin tức liên quan
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft, TrendingUp, TrendingDown, Building2, Globe,
  BarChart3, Coins, Users, Newspaper, ChevronRight,
  RefreshCw, AlertCircle, Info,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import { supabase } from "../../lib/supabase/client";
import { useTheme } from "../../lib/theme-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
  sector_name: string;
  beta: number | null;
  company_context: string | null;
}

interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FinancialRow {
  year: number;
  revenue: number | null;
  net_profit: number | null;
  eps: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
}

interface DividendRow {
  id: number;
  ex_date: string;
  payment_date: string | null;
  dividend_type: string;
  amount: number;
}

interface InsiderRow {
  id: number;
  trade_date: string;
  insider_name: string;
  trade_type: string;
  volume: number | null;
}

interface NewsRow {
  title: string;
  published_at: string;
  impact_score: number | null;
  label: string | null;
  article_url: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, digits = 0) =>
  n != null ? n.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";

const fmtPct = (n: number | null | undefined, digits = 1) =>
  n != null ? `${(n * 100).toFixed(digits)}%` : "—";

const fmtB = (n: number | null | undefined) => {
  if (n == null) return "—";
  const b = n / 1e9;
  return b >= 1000 ? `${(b / 1000).toFixed(1)}K tỷ` : `${b.toFixed(0)} tỷ`;
};

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
};

const fmtShortDate = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 6,
      background: color ? `${color}18` : "rgba(8,73,172,0.08)",
      color: color ?? "#0849AC",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
    }}>
      {label}
    </span>
  );
}

function MetricCard({
  label, value, sub, color, bg,
}: {
  label: string; value: string; sub?: string; color?: string; bg?: string;
}) {
  const { theme } = useTheme();
  return (
    <div style={{
      background: bg ?? theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: 12, padding: "14px 16px",
    }}>
      <p style={{ margin: 0, fontSize: 11, color: theme.fgSubtle, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: color ?? theme.fg, letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: theme.fgMuted }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={15} style={{ color: theme.brand }} />
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: theme.fg }}>{title}</h2>
    </div>
  );
}

// Custom tooltip for price chart
function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { theme } = useTheme();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: 10, padding: "10px 14px", fontSize: 12,
      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    }}>
      <p style={{ margin: "0 0 6px", fontWeight: 700, color: theme.fg }}>{fmtDate(d.date)}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
        {[["Đóng cửa", d.close], ["Mở cửa", d.open], ["Cao nhất", d.high], ["Thấp nhất", d.low]].map(([k, v]) => (
          <div key={k as string} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: theme.fgMuted }}>{k}</span>
            <span style={{ fontWeight: 600, color: theme.fg, fontFamily: "'IBM Plex Mono', monospace" }}>
              {(v as number).toLocaleString("vi-VN")}
            </span>
          </div>
        ))}
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          <span style={{ color: theme.fgMuted }}>KLGD</span>
          <span style={{ fontWeight: 600, color: theme.fg }}>{(d.volume / 1e6).toFixed(2)}M</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TickerDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { theme, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stock, setStock] = useState<StockInfo | null>(null);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [financials, setFinancials] = useState<FinancialRow[]>([]);
  const [dividends, setDividends] = useState<DividendRow[]>([]);
  const [insiders, setInsiders] = useState<InsiderRow[]>([]);
  const [news, setNews] = useState<NewsRow[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "financials" | "dividends" | "insiders" | "news">("overview");
  const [showFullDesc, setShowFullDesc] = useState(false);

  const sym = symbol?.toUpperCase() ?? "";

  useEffect(() => {
    if (!sym) return;
    loadAll(sym);
  }, [sym]);

  const loadAll = async (s: string) => {
    setLoading(true);
    setError(null);

    try {
      const [
        { data: stockData },
        { data: priceData },
        { data: finData },
        { data: divData },
        { data: insiderData },
        { data: newsData },
      ] = await Promise.all([
        // Stock info
        supabase.from("stocks").select("symbol,name,exchange,sector_name,beta,company_context").eq("symbol", s).single(),

        // Price history — last 120 sessions (≈ 6 months)
        supabase.from("prices_daily")
          .select("date,open,high,low,close,volume")
          .eq("symbol", s)
          .order("date", { ascending: true })
          .limit(120),

        // Financials — 5 most recent years
        supabase.from("financials_annual")
          .select("year,revenue,net_profit,eps,pe_ratio,pb_ratio,roe,roa,debt_to_equity")
          .eq("symbol", s)
          .order("year", { ascending: false })
          .limit(5),

        // Dividends — last 8 records
        supabase.from("dividends")
          .select("id,ex_date,payment_date,dividend_type,amount")
          .eq("symbol", s)
          .order("ex_date", { ascending: false })
          .limit(8),

        // Insider transactions — last 10
        supabase.from("insider_transactions")
          .select("id,trade_date,insider_name,trade_type,volume")
          .eq("symbol", s)
          .order("trade_date", { ascending: false })
          .limit(10),

        // News mentioning this symbol — last 10
        supabase.from("market_news")
          .select("title,published_at,impact_score,label,article_url")
          .contains("affected_symbols", [s])
          .order("published_at", { ascending: false })
          .limit(10),
      ]);

      if (!stockData) {
        setError(`Không tìm thấy mã "${s}" trong hệ thống.`);
        setLoading(false);
        return;
      }

      setStock(stockData as StockInfo);
      setPrices((priceData ?? []) as PriceRow[]);
      setFinancials((finData ?? []) as FinancialRow[]);
      setDividends((divData ?? []) as DividendRow[]);
      setInsiders((insiderData ?? []) as InsiderRow[]);
      setNews((newsData ?? []) as NewsRow[]);
    } catch (e) {
      setError("Lỗi kết nối dữ liệu. Vui lòng thử lại.");
    }

    setLoading(false);
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const latestPrice = prices.length > 0 ? prices[prices.length - 1] : null;
  const prevPrice = prices.length > 1 ? prices[prices.length - 2] : null;
  const priceChange = latestPrice && prevPrice
    ? ((latestPrice.close - prevPrice.close) / prevPrice.close) * 100 : null;
  const priceChangeAbs = latestPrice && prevPrice
    ? latestPrice.close - prevPrice.close : null;
  const isUp = priceChange != null ? priceChange >= 0 : null;

  const latestFin = financials[0] ?? null;

  // Price chart data (use every 2nd point if > 60 to reduce density)
  const chartData = prices.map(p => ({ ...p, dateLabel: fmtShortDate(p.date) }));
  const priceMin = chartData.length > 0
    ? Math.floor(Math.min(...chartData.map(p => p.low)) * 0.98 / 1000) * 1000 : 0;
  const priceMax = chartData.length > 0
    ? Math.ceil(Math.max(...chartData.map(p => p.high)) * 1.02 / 1000) * 1000 : 0;

  // Financial chart data (revenue + net_profit by year, ascending)
  const finChartData = [...financials]
    .filter(f => f.revenue != null || f.net_profit != null)
    .sort((a, b) => a.year - b.year)
    .map(f => ({
      year: String(f.year),
      "Doanh thu": f.revenue != null ? +(f.revenue / 1e9).toFixed(0) : null,
      "LNST": f.net_profit != null ? +(f.net_profit / 1e9).toFixed(0) : null,
    }));

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, flexDirection: "column", gap: 12 }}>
        <RefreshCw size={22} style={{ color: theme.brand, animation: "spin 1s linear infinite" }} />
        <p style={{ color: theme.fgMuted, fontSize: 14 }}>Đang tải dữ liệu {sym}…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
        <AlertCircle size={40} style={{ color: "#FF3B30", marginBottom: 12 }} />
        <p style={{ fontSize: 16, fontWeight: 700, color: theme.fg }}>{error ?? "Không tìm thấy mã cổ phiếu"}</p>
        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 16, padding: "9px 20px", borderRadius: 9,
            border: `1px solid ${theme.border}`, background: "transparent",
            color: theme.fgMuted, cursor: "pointer", fontSize: 13,
          }}
        >
          ← Quay lại
        </button>
      </div>
    );
  }

  // ── Full page ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh", padding: "0 0 60px",
      fontFamily: "'Montserrat', system-ui, sans-serif",
      background: theme.bg, color: theme.fg,
    }}>

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div style={{
        background: isDark
          ? "linear-gradient(135deg, #0D1117 0%, #131824 100%)"
          : "linear-gradient(135deg, #032D6B 0%, #0849AC 100%)",
        padding: "20px 32px 28px",
        borderBottom: `1px solid ${theme.border}`,
      }}>
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 12,
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={13} />
          Quay lại
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          {/* Symbol + name */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                fontSize: 28, fontWeight: 900, color: "#fff",
                letterSpacing: "-0.02em", fontFamily: "'IBM Plex Mono', monospace",
              }}>
                {stock.symbol}
              </span>
              <span style={{
                padding: "3px 8px", borderRadius: 6,
                background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)",
                fontSize: 11, fontWeight: 700,
              }}>
                {stock.exchange}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
              {stock.name}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {stock.sector_name && <Chip label={stock.sector_name} color="#fff" />}
              {stock.beta != null && (
                <Chip label={`Beta ${stock.beta.toFixed(2)}`} color="rgba(255,255,255,0.6)" />
              )}
            </div>
          </div>

          {/* Price + change */}
          {latestPrice ? (
            <div style={{ textAlign: "right" }}>
              <p style={{
                margin: 0, fontSize: 32, fontWeight: 900, color: "#fff",
                fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "-0.02em",
              }}>
                {fmt(latestPrice.close)}
                <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.65)", marginLeft: 6 }}>đ</span>
              </p>
              {priceChange != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                  {isUp
                    ? <TrendingUp size={16} style={{ color: "#34C759" }} />
                    : <TrendingDown size={16} style={{ color: "#FF3B30" }} />
                  }
                  <span style={{
                    fontSize: 15, fontWeight: 700,
                    color: isUp ? "#34C759" : "#FF3B30",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {isUp ? "+" : ""}{fmt(priceChangeAbs)} ({isUp ? "+" : ""}{priceChange.toFixed(2)}%)
                  </span>
                </div>
              )}
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Phiên {fmtDate(latestPrice.date)} · KLGD {(latestPrice.volume / 1e6).toFixed(2)}M cp
              </p>
            </div>
          ) : (
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                Chưa có dữ liệu giá
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${theme.border}`,
        background: theme.bgCard, paddingLeft: 32, overflowX: "auto",
      }}>
        {(["overview", "financials", "dividends", "insiders", "news"] as const).map(tab => {
          const labels: Record<typeof tab, string> = {
            overview: "Tổng quan",
            financials: "Tài chính",
            dividends: "Cổ tức",
            insiders: "Insider",
            news: "Tin tức",
          };
          const counts: Record<typeof tab, number | null> = {
            overview: null,
            financials: financials.length,
            dividends: dividends.length,
            insiders: insiders.length,
            news: news.length,
          };
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 18px", border: "none", background: "transparent", cursor: "pointer",
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? theme.brand : theme.fgMuted,
                borderBottom: active ? `2px solid ${theme.brand}` : "2px solid transparent",
                transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              {labels[tab]}
              {counts[tab] != null && counts[tab]! > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: active ? `${theme.brand}18` : theme.bgMuted,
                  color: active ? theme.brand : theme.fgSubtle,
                  padding: "1px 6px", borderRadius: 99,
                }}>
                  {counts[tab]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }}>

        {/* ══ OVERVIEW ══════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>

            {/* Price chart */}
            {chartData.length > 1 && (
              <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "20px 20px 12px" }}>
                <SectionHeader icon={BarChart3} title={`Biểu đồ giá — ${chartData.length} phiên gần nhất`} />
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isUp === false ? "#FF3B30" : "#0849AC"} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={isUp === false ? "#FF3B30" : "#0849AC"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 10, fill: theme.fgSubtle }}
                      tickLine={false}
                      interval={Math.floor(chartData.length / 6)}
                    />
                    <YAxis
                      domain={[priceMin, priceMax]}
                      tick={{ fontSize: 10, fill: theme.fgSubtle }}
                      tickLine={false}
                      tickFormatter={(v) => (v / 1000).toFixed(0) + "K"}
                      width={44}
                    />
                    <Tooltip content={<PriceTooltip />} />
                    <Area
                      type="monotone" dataKey="close"
                      stroke={isUp === false ? "#FF3B30" : "#0849AC"}
                      strokeWidth={2} fill="url(#priceGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Key metrics */}
            {latestFin && (
              <div>
                <SectionHeader icon={BarChart3} title={`Chỉ số định giá (${latestFin.year})`} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  <MetricCard label="P/E" value={latestFin.pe_ratio?.toFixed(1) ?? "—"} sub="Giá / EPS" />
                  <MetricCard label="P/B" value={latestFin.pb_ratio?.toFixed(2) ?? "—"} sub="Giá / BVPS" />
                  <MetricCard label="ROE" value={fmtPct(latestFin.roe)} sub="LN / VCSH" color={latestFin.roe != null && latestFin.roe > 0.15 ? "#34C759" : undefined} />
                  <MetricCard label="ROA" value={fmtPct(latestFin.roa)} sub="LN / Tổng tài sản" />
                  <MetricCard label="EPS" value={latestFin.eps != null ? `${fmt(latestFin.eps)} đ` : "—"} sub="LN / Cổ phiếu" />
                  <MetricCard label="D/E" value={latestFin.debt_to_equity?.toFixed(2) ?? "—"} sub="Nợ / VCSH" />
                </div>
              </div>
            )}

            {/* Today's price range */}
            {latestPrice && (
              <div>
                <SectionHeader icon={TrendingUp} title="Thống kê phiên gần nhất" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  <MetricCard label="Mở cửa" value={`${fmt(latestPrice.open)} đ`} />
                  <MetricCard label="Cao nhất" value={`${fmt(latestPrice.high)} đ`} color="#34C759" />
                  <MetricCard label="Thấp nhất" value={`${fmt(latestPrice.low)} đ`} color="#FF3B30" />
                  <MetricCard label="KLGD" value={`${(latestPrice.volume / 1e6).toFixed(2)}M`} sub="Cổ phiếu" />
                </div>
              </div>
            )}

            {/* Company description */}
            {stock.company_context && (
              <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20 }}>
                <SectionHeader icon={Building2} title="Giới thiệu doanh nghiệp" />
                <div style={{ fontSize: 13, lineHeight: 1.75, color: theme.fgMuted }}>
                  {formatCompanyContext(stock.company_context, showFullDesc, theme.brand)}
                </div>
                <button
                  onClick={() => setShowFullDesc(v => !v)}
                  style={{
                    marginTop: 12, padding: "5px 12px", borderRadius: 8,
                    border: `1px solid ${theme.border}`, background: "transparent",
                    color: theme.brand, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  {showFullDesc ? "Thu gọn" : "Xem thêm"}
                  <ChevronRight size={12} style={{ transform: showFullDesc ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ FINANCIALS ════════════════════════════════════════════════════ */}
        {activeTab === "financials" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
            {financials.length === 0 ? (
              <EmptyState message={`Chưa có dữ liệu tài chính cho ${sym}`} />
            ) : (
              <>
                {/* Revenue + Net Profit chart */}
                {finChartData.length > 0 && (
                  <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "20px 20px 12px" }}>
                    <SectionHeader icon={BarChart3} title="Doanh thu & Lợi nhuận sau thuế (tỷ VND)" />
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={finChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                        <XAxis dataKey="year" tick={{ fontSize: 11, fill: theme.fgSubtle }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: theme.fgSubtle }} tickLine={false}
                          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} width={48} />
                        <Tooltip
                          contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number) => [`${v.toLocaleString("vi-VN")} tỷ`, ""]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Doanh thu" fill={isDark ? "#4D8FE8" : "#0849AC"} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="LNST" fill={isDark ? "#34C759" : "#16a34a"} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Financials table */}
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px 0" }}>
                    <SectionHeader icon={BarChart3} title="Bảng chỉ số tài chính theo năm" />
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: theme.bgAccentStrong }}>
                          {["Năm", "Doanh thu", "LNST", "EPS (đ)", "P/E", "P/B", "ROE", "ROA", "D/E"].map(h => (
                            <th key={h} style={{
                              padding: "10px 14px", textAlign: h === "Năm" ? "left" : "right",
                              fontSize: 11, fontWeight: 700, color: theme.fgSubtle,
                              letterSpacing: "0.04em", textTransform: "uppercase",
                              borderBottom: `1px solid ${theme.border}`, whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {financials.map((f, i) => (
                          <tr key={f.year} style={{
                            background: i % 2 === 0 ? theme.bgCard : theme.bgMuted,
                            borderBottom: `1px solid ${theme.border}`,
                          }}>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: theme.brand }}>{f.year}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: theme.fg, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtB(f.revenue)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: f.net_profit != null && f.net_profit > 0 ? "#34C759" : "#FF3B30", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{fmtB(f.net_profit)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{f.eps != null ? fmt(f.eps) : "—"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{f.pe_ratio?.toFixed(1) ?? "—"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{f.pb_ratio?.toFixed(2) ?? "—"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", color: f.roe != null && f.roe > 0.15 ? "#34C759" : theme.fg, fontWeight: 600 }}>{fmtPct(f.roe)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtPct(f.roa)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{f.debt_to_equity?.toFixed(2) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ DIVIDENDS ═════════════════════════════════════════════════════ */}
        {activeTab === "dividends" && (
          <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
            {dividends.length === 0 ? (
              <div style={{ padding: 20 }}>
                <EmptyState message={`Chưa có dữ liệu cổ tức cho ${sym}`} />
              </div>
            ) : (
              <>
                <div style={{ padding: "16px 20px 0" }}>
                  <SectionHeader icon={Coins} title="Lịch sử chi trả cổ tức" />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.bgAccentStrong }}>
                        {["Ngày ĐKCC", "Ngày thanh toán", "Loại", "Tỷ lệ / Mệnh giá"].map(h => (
                          <th key={h} style={{
                            padding: "10px 16px", textAlign: "left",
                            fontSize: 11, fontWeight: 700, color: theme.fgSubtle,
                            letterSpacing: "0.04em", textTransform: "uppercase",
                            borderBottom: `1px solid ${theme.border}`,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dividends.map((d, i) => (
                        <tr key={d.id} style={{
                          background: i % 2 === 0 ? theme.bgCard : theme.bgMuted,
                          borderBottom: `1px solid ${theme.border}`,
                        }}>
                          <td style={{ padding: "10px 16px", fontWeight: 600, color: theme.fg }}>{fmtDate(d.ex_date)}</td>
                          <td style={{ padding: "10px 16px", color: theme.fgMuted }}>{d.payment_date ? fmtDate(d.payment_date) : "—"}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                              background: d.dividend_type === "cash" ? "rgba(52,199,89,0.12)" : "rgba(8,73,172,0.1)",
                              color: d.dividend_type === "cash" ? "#16a34a" : "#0849AC",
                            }}>
                              {d.dividend_type === "cash" ? "Tiền mặt" : "Cổ phiếu"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: theme.fg }}>
                            {d.dividend_type === "cash"
                              ? `${fmt(d.amount)} đ/CP`
                              : `${(d.amount * 100).toFixed(0)}% (${d.amount * 10}:1)`
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ INSIDERS ══════════════════════════════════════════════════════ */}
        {activeTab === "insiders" && (
          <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
            {insiders.length === 0 ? (
              <div style={{ padding: 20 }}>
                <EmptyState message={`Chưa có dữ liệu giao dịch nội bộ cho ${sym}`} />
              </div>
            ) : (
              <>
                <div style={{ padding: "16px 20px 0" }}>
                  <SectionHeader icon={Users} title="Giao dịch cổ đông nội bộ gần nhất" />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: theme.bgAccentStrong }}>
                        {["Ngày GD", "Người nội bộ", "Loại GD", "Khối lượng"].map(h => (
                          <th key={h} style={{
                            padding: "10px 16px", textAlign: "left",
                            fontSize: 11, fontWeight: 700, color: theme.fgSubtle,
                            letterSpacing: "0.04em", textTransform: "uppercase",
                            borderBottom: `1px solid ${theme.border}`,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {insiders.map((ins, i) => (
                        <tr key={ins.id} style={{
                          background: i % 2 === 0 ? theme.bgCard : theme.bgMuted,
                          borderBottom: `1px solid ${theme.border}`,
                        }}>
                          <td style={{ padding: "10px 16px", fontWeight: 600, color: theme.fg }}>{fmtDate(ins.trade_date)}</td>
                          <td style={{ padding: "10px 16px", color: theme.fgMuted, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ins.insider_name}
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                              background: ins.trade_type === "buy" ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.1)",
                              color: ins.trade_type === "buy" ? "#16a34a" : "#FF3B30",
                            }}>
                              {ins.trade_type === "buy" ? "▲ MUA" : "▼ BÁN"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: theme.fg }}>
                            {ins.volume != null ? `${ins.volume.toLocaleString("vi-VN")} CP` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "10px 16px", borderTop: `1px solid ${theme.border}` }}>
                  <p style={{ margin: 0, fontSize: 11, color: theme.fgDisabled, display: "flex", alignItems: "center", gap: 4 }}>
                    <Info size={10} />
                    Dữ liệu từ HOSE/HNX · Chỉ mang tính tham khảo, không phải khuyến nghị đầu tư
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ NEWS ══════════════════════════════════════════════════════════ */}
        {activeTab === "news" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {news.length === 0 ? (
              <EmptyState message={`Chưa có tin tức liên quan đến ${sym}`} />
            ) : (
              news.map((n, i) => {
                const labelColor = n.label === "positive" ? { bg: "rgba(52,199,89,0.12)", text: "#16a34a", label: "Tích cực" }
                  : n.label === "negative" ? { bg: "rgba(255,59,48,0.1)", text: "#FF3B30", label: "Tiêu cực" }
                  : { bg: theme.bgMuted, text: theme.fgSubtle, label: "Trung lập" };
                return (
                  <a
                    key={i}
                    href={n.article_url ?? "#"}
                    target={n.article_url ? "_blank" : "_self"}
                    rel="noopener noreferrer"
                    style={{ textDecoration: "none" }}
                  >
                    <div style={{
                      background: theme.bgCard, border: `1px solid ${theme.border}`,
                      borderRadius: 12, padding: "14px 16px",
                      transition: "border-color 0.15s",
                      cursor: n.article_url ? "pointer" : "default",
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = theme.brand; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = theme.border; }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: theme.fg, lineHeight: 1.5 }}>{n.title}</p>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <span style={{
                            padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                            background: labelColor.bg, color: labelColor.text, whiteSpace: "nowrap",
                          }}>{labelColor.label}</span>
                          {n.impact_score != null && (
                            <span style={{ fontSize: 10, color: theme.fgSubtle }}>
                              Tác động: {n.impact_score > 0 ? "+" : ""}{n.impact_score}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: theme.fgSubtle }}>
                        {new Date(n.published_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {n.article_url && <span style={{ marginLeft: 8, color: theme.brand }}>↗ Đọc bài</span>}
                      </p>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* Disclaimer */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
        <p style={{ fontSize: 11, color: theme.fgDisabled, display: "flex", alignItems: "center", gap: 5 }}>
          <Info size={10} />
          Thông tin chỉ mang tính chất tham khảo. Không phải khuyến nghị đầu tư theo Luật Chứng khoán 2019.
        </p>
      </div>

    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <BarChart3 size={32} style={{ color: theme.fgDisabled, marginBottom: 10 }} />
      <p style={{ color: theme.fgMuted, fontSize: 13 }}>{message}</p>
    </div>
  );
}

function formatCompanyContext(raw: string, showFull: boolean, brandColor: string): React.ReactNode {
  // Parse section headers like [Vị thế công ty], [Sản phẩm dịch vụ chính], [Rủi ro kinh doanh]
  const sections = raw.split(/\[([^\]]+)\]/).filter(Boolean);
  if (sections.length <= 1) {
    const text = showFull ? raw : raw.substring(0, 400) + (raw.length > 400 ? "…" : "");
    return <p style={{ margin: 0 }}>{text}</p>;
  }

  const result: React.ReactNode[] = [];
  for (let i = 0; i < sections.length; i += 2) {
    const header = sections[i];
    const body = sections[i + 1];
    if (!body) {
      result.push(<p key={i} style={{ margin: 0 }}>{header}</p>);
      continue;
    }
    result.push(
      <div key={i} style={{ marginBottom: 14 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: brandColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>{header}</p>
        <p style={{ margin: 0, lineHeight: 1.75 }}>
          {showFull ? body.trim() : (i === 0 ? body.trim().substring(0, 350) + (body.trim().length > 350 ? "…" : "") : "")}
        </p>
      </div>
    );
    if (!showFull && i >= 0) break;
  }
  return <>{result}</>;
}
