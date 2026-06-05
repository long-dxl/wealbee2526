import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Pencil, Trash2, ArrowUpRight, RefreshCw, X, Activity, GripVertical, Link2, AlertCircle } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { useBrokerConfig } from "../../lib/hooks/useBrokerConfig";
import { fetchPositions, fetchCashBalance, type DnsePosition, type DnseCashBalance } from "../../lib/services/dnse";

interface Holding {
  id?: string;          // portfolio_holdings.id
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number | null;  // avg_cost
  currentPrice: number;
  purchaseDate: string | null;
}

const GREEN  = "#27C840";
const RED    = "#FF3931";
const VNI_C  = "#5D7FFF";
const HNX_C  = "#8B5CF6";
const FONT   = "'Montserrat', system-ui, sans-serif";

// Color palette for allocation pie slices
const SLICE_COLORS = ["#0849AC", "#FF9500", "#FF3B30", "#34C759", "#8B5CF6", "#00B4FF", "#FF6B6B", "#4ECDC4"];

type AllocItem = { symbol: string; name: string; value: number; pct: number; color: string };

type ChartPeriod = "5D" | "1M" | "3M" | "YTD" | "ALL";
const PERIODS: ChartPeriod[] = ["5D", "1M", "3M", "YTD", "ALL"];

type ChartPoint = { date: string; portfolio: number; vni: number; hnx: number };

const PERIOD_DAYS: Record<ChartPeriod, number | null> = {
  "5D": 5, "1M": 30, "3M": 90, "YTD": null, "ALL": null,
};


function makeDragHandlers(card: ContextCard) {
  return {
    draggable: true as const,
    onDragStart(e: React.DragEvent) {
      e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
      e.dataTransfer.effectAllowed = "copy";
      (e.currentTarget as HTMLElement).style.opacity = "0.7";
    },
    onDragEnd(e: React.DragEvent) {
      (e.currentTarget as HTMLElement).style.opacity = "1";
    },
  };
}

function PerfTooltip({ active, payload, label, isDark }: any) {
  if (!active || !payload?.length) return null;
  const bg = isDark ? "#1A1D30" : "#fff";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(8,73,172,0.15)";
  const muted = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.50)";
  const mutedText = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.55)";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "10px 14px", fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
      <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ fontSize: 12, color: mutedText }}>{p.name}:</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: p.value >= 0 ? GREEN : RED }}>
            {p.value >= 0 ? "+" : ""}{p.value.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function AllocTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.15)", borderRadius: 12, padding: "12px 16px", fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 160 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 4 }}>{d.symbol} <span style={{ fontWeight: 400, color: "rgba(26,26,46,0.55)", fontSize: 12 }}>({d.name})</span></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: payload[0].fill, marginBottom: 2 }}>{d.value.toLocaleString("vi-VN")} đ</div>
      <div style={{ fontSize: 12, color: "rgba(26,26,46,0.55)" }}>{d.pct.toFixed(1)}% danh mục</div>
    </div>
  );
}

// ── DragHint overlay ──────────────────────────────────────────────────────────
function DragHint({ isDark }: { isDark: boolean }) {
  const accent = isDark ? "rgba(77,143,232,0.80)" : "rgba(8,73,172,0.65)";
  return (
    <div className="card-hint" style={{
      position: "absolute", inset: 0, borderRadius: "inherit",
      border: `1.5px dashed ${isDark ? "rgba(77,143,232,0.28)" : "rgba(8,73,172,0.18)"}`,
      opacity: 0, transition: "opacity 150ms ease",
      pointerEvents: "none", zIndex: 2,
    }}>
      {/* Bottom-center grip dots */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 22, borderBottomLeftRadius: "inherit", borderBottomRightRadius: "inherit",
        background: isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <GripVertical size={14} strokeWidth={1.5} color={accent} />
      </div>
    </div>
  );
}

export function Portfolio({
  onNavigate, onSelectTicker, onAddContextCard, isDark = false,
}: {
  onNavigate: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  onAddContextCard?: (card: ContextCard) => void;
  isDark?: boolean;
}) {
  void onAddContextCard;
  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.60)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const gridStroke = isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.06)";
  const refStroke = isDark ? "rgba(255,255,255,0.12)" : "rgba(8,73,172,0.15)";

  const [holdings,         setHoldings]         = useState<Holding[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [saveError,        setSaveError]        = useState<string | null>(null);
  const [showModal,        setShowModal]        = useState(false);
  const [editingHolding,   setEditingHolding]   = useState<Holding | null>(null);
  const [form, setForm] = useState({ symbol: "", quantity: "", avgPrice: "", purchaseDate: "" });
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [chartDataReal,   setChartDataReal]   = useState<ChartPoint[]>([]);
  const [chartLoading,    setChartLoading]    = useState(false);
  const [lastAgentRun,    setLastAgentRun]    = useState<string | null>(null);

  // ── DNSE live data ────────────────────────────────────────────────────────
  const { config: brokerConfig } = useBrokerConfig();
  const [dnsePositions,  setDnsePositions]  = useState<DnsePosition[]>([]);
  const [dnseCash,       setDnseCash]       = useState<DnseCashBalance | null>(null);
  const [dnseLoading,    setDnseLoading]    = useState(false);
  const [dnseError,      setDnseError]      = useState<string | null>(null);
  const [dnseCountdown,  setDnseCountdown]  = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMarketOpen = (): boolean => {
    const now = new Date();
    const ict = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const day = ict.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    const h = ict.getHours(), m = ict.getMinutes();
    const mins = h * 60 + m;
    return (mins >= 540 && mins < 690) || (mins >= 780 && mins < 885); // 9:00-11:30 or 13:00-14:45
  };

  const loadDnseData = useCallback(async () => {
    if (!brokerConfig?.apiKey || !brokerConfig.accountNo) return;
    setDnseLoading(true);
    setDnseError(null);
    try {
      const [positions, cash] = await Promise.all([
        fetchPositions(brokerConfig.accountNo, brokerConfig.apiKey, brokerConfig.apiSecret ?? ""),
        fetchCashBalance(brokerConfig.accountNo, brokerConfig.apiKey, brokerConfig.apiSecret ?? ""),
      ]);
      setDnsePositions(positions);
      setDnseCash(cash);
    } catch (err: any) {
      setDnseError(err?.message ?? "Lỗi kết nối DNSE");
    } finally {
      setDnseLoading(false);
    }
  }, [brokerConfig]);

  // Auto-refresh every 60s during market hours
  useEffect(() => {
    if (!brokerConfig?.apiKey) return;
    loadDnseData();

    const INTERVAL = 60;
    setDnseCountdown(INTERVAL);
    countdownRef.current = setInterval(() => {
      setDnseCountdown(prev => {
        if (prev <= 1) {
          if (isMarketOpen()) loadDnseData();
          return INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [brokerConfig, loadDnseData]);

  // ── Load portfolio_holdings + enrich with latest prices ─────────────────
  const loadHoldings = async () => {
    setPortfolioLoading(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rows, error } = await supabase
        .from("portfolio_holdings")
        .select("id, symbol, quantity, avg_cost, purchase_date, notes")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) { setSaveError(error.message); return; }
      if (!rows) return;

      const symbols = rows.map((r: any) => r.symbol);
      const latestPrices: Record<string, number> = {};
      const tickerNames: Record<string, string> = {};

      if (symbols.length > 0) {
        // Get latest closing prices
        const { data: latestRow } = await supabase
          .from("prices_daily").select("date").order("date", { ascending: false }).limit(1).single();
        if (latestRow) {
          const { data: prices } = await supabase
            .from("prices_daily").select("symbol,close").eq("date", latestRow.date).in("symbol", symbols);
          prices?.forEach((p: any) => { latestPrices[p.symbol] = Number(p.close); });
        }
        // Get names from tickers
        const { data: tickers } = await supabase
          .from("tickers").select("symbol,name").in("symbol", symbols);
        tickers?.forEach((t: any) => { tickerNames[t.symbol] = t.name; });
      }

      const mapped: Holding[] = rows.map((r: any) => ({
        id: r.id,
        symbol: r.symbol,
        name: tickerNames[r.symbol] || r.symbol,
        quantity: Number(r.quantity),
        avgPrice: r.avg_cost != null ? Number(r.avg_cost) : null,
        currentPrice: latestPrices[r.symbol] ?? 0,
        purchaseDate: r.purchase_date
          ? new Date(r.purchase_date).toLocaleDateString("vi-VN")
          : null,
      }));
      setHoldings(mapped);
      // Load chart after holdings are ready
      loadChartData(mapped, chartPeriod);
    } finally {
      setPortfolioLoading(false);
    }
  };

  useEffect(() => {
    loadHoldings();
    loadAgentStatus();
  }, []);

  const loadAgentStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("agent_runs")
      .select("finished_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(1)
      .single();
    if (data?.finished_at) {
      const d = new Date(data.finished_at);
      setLastAgentRun(d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }));
    }
  };

  const loadChartData = async (currentHoldings: Holding[], period: ChartPeriod) => {
    if (!currentHoldings.length) { setChartDataReal([]); return; }
    setChartLoading(true);
    try {
      // Determine cutoff date
      let cutStr: string;
      const now = new Date();
      if (period === "YTD") {
        cutStr = `${now.getFullYear()}-01-01`;
      } else if (period === "ALL") {
        cutStr = "2000-01-01";
      } else {
        const days = PERIOD_DAYS[period] ?? 30;
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        cutStr = cutoff.toISOString().slice(0, 10);
      }

      const symbols = currentHoldings.map(h => h.symbol);

      const [{ data: priceRows }, { data: indexRows }] = await Promise.all([
        supabase.from("prices_daily").select("symbol,date,close").in("symbol", symbols).gte("date", cutStr).order("date", { ascending: true }),
        supabase.from("market_indices").select("index_code,date,close").in("index_code", ["VNINDEX", "HNX"]).gte("date", cutStr).order("date", { ascending: true }),
      ]);

      // Build daily price maps
      const priceByDate: Record<string, Record<string, number>> = {};
      for (const row of priceRows ?? []) {
        if (!priceByDate[row.date]) priceByDate[row.date] = {};
        priceByDate[row.date][row.symbol] = Number(row.close);
      }

      const vniMap: Record<string, number> = {};
      const hnxMap: Record<string, number> = {};
      for (const row of indexRows ?? []) {
        if (row.index_code === "VNINDEX") vniMap[row.date] = Number(row.close);
        else hnxMap[row.date] = Number(row.close);
      }

      // All trading dates from price data
      const allDates = [...new Set(Object.keys(priceByDate))].sort();
      if (!allDates.length) { setChartDataReal([]); return; }

      // Track last known price per symbol (fallback when no data for a day)
      const lastKnown: Record<string, number> = {};
      currentHoldings.forEach(h => { lastKnown[h.symbol] = h.currentPrice; });

      const points: ChartPoint[] = [];
      let basePortfolio = 0;
      let baseVni = 0;
      let baseHnx = 0;

      allDates.forEach((date, idx) => {
        // Update last known prices
        for (const sym of symbols) {
          if (priceByDate[date]?.[sym] != null) lastKnown[sym] = priceByDate[date][sym];
        }

        const portfolioVal = currentHoldings.reduce((s, h) => s + h.quantity * (lastKnown[h.symbol] ?? 0), 0);

        if (idx === 0) {
          basePortfolio = portfolioVal;
          baseVni = vniMap[date] ?? 0;
          baseHnx = hnxMap[date] ?? 0;
        }

        const portfolioPct = basePortfolio > 0 ? parseFloat(((portfolioVal / basePortfolio - 1) * 100).toFixed(2)) : 0;
        const vniPct = baseVni > 0 && vniMap[date] ? parseFloat(((vniMap[date] / baseVni - 1) * 100).toFixed(2)) : 0;
        const hnxPct = baseHnx > 0 && hnxMap[date] ? parseFloat(((hnxMap[date] / baseHnx - 1) * 100).toFixed(2)) : 0;

        const dt = new Date(date);
        const label = period === "ALL"
          ? `${dt.getMonth() + 1}/${String(dt.getFullYear()).slice(2)}`
          : period === "YTD"
          ? `T${dt.getMonth() + 1}`
          : `${dt.getDate()}/${dt.getMonth() + 1}`;

        points.push({ date: label, portfolio: portfolioPct, vni: vniPct, hnx: hnxPct });
      });

      // For ALL/YTD: reduce to monthly averages to avoid too many points
      if (period === "ALL" || period === "YTD") {
        const byLabel: Record<string, ChartPoint[]> = {};
        points.forEach(p => {
          if (!byLabel[p.date]) byLabel[p.date] = [];
          byLabel[p.date].push(p);
        });
        const reduced = Object.values(byLabel).map(group => ({
          date: group[0].date,
          portfolio: parseFloat((group.reduce((s, p) => s + p.portfolio, 0) / group.length).toFixed(2)),
          vni: parseFloat((group.reduce((s, p) => s + p.vni, 0) / group.length).toFixed(2)),
          hnx: parseFloat((group.reduce((s, p) => s + p.hnx, 0) / group.length).toFixed(2)),
        }));
        setChartDataReal(reduced);
      } else {
        setChartDataReal(points);
      }
    } catch {
      setChartDataReal([]);
    } finally {
      setChartLoading(false);
    }
  };

  // Chart state
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("3M");
  const [showVni, setShowVni] = useState(true);
  const [showHnx, setShowHnx] = useState(true);

  // Reload chart when period changes (holdings already loaded)
  useEffect(() => {
    if (holdings.length > 0) loadChartData(holdings, chartPeriod);
  }, [chartPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalValue = holdings.reduce((sum: number, h: Holding) => sum + h.quantity * h.currentPrice, 0);
  const totalPnl = holdings.reduce((sum: number, h: Holding) => {
    if (!h.avgPrice) return sum;
    return sum + (h.currentPrice - h.avgPrice) * h.quantity;
  }, 0);
  const totalCost = holdings.reduce((sum: number, h: Holding) => sum + (h.avgPrice || h.currentPrice) * h.quantity, 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const chartData = chartDataReal;
  const periodPortfolioPct = chartData.length ? chartData[chartData.length - 1].portfolio : 0;
  const periodVniPct       = chartData.length ? chartData[chartData.length - 1].vni       : 0;
  const periodHnxPct       = chartData.length ? chartData[chartData.length - 1].hnx       : 0;
  const PORTFOLIO_C = periodPortfolioPct >= 0 ? GREEN : RED;

  // Allocation data for donut chart
  const allocData = holdings.map((h: Holding, i: number) => {
    const value = h.quantity * h.currentPrice;
    return {
      symbol: h.symbol,
      name: h.name,
      value,
      pct: (value / totalValue) * 100,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    };
  }).sort((a: AllocItem, b: AllocItem) => b.value - a.value);

  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  const openAdd = () => {
    setEditingHolding(null);
    setSaveError(null);
    setForm({ symbol: "", quantity: "", avgPrice: "", purchaseDate: "" });
    setShowModal(true);
  };

  const openEdit = (h: Holding) => {
    setEditingHolding(h);
    setSaveError(null);
    setForm({
      symbol: h.symbol,
      quantity: String(h.quantity),
      avgPrice: h.avgPrice ? String(h.avgPrice) : "",
      purchaseDate: h.purchaseDate || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.symbol.trim() || !form.quantity.trim()) return;
    const sym  = form.symbol.trim().toUpperCase();
    const qty  = parseFloat(form.quantity) || 0;
    const avgP = form.avgPrice ? parseFloat(form.avgPrice.replace(/[.,]/g, "")) || null : null;
    const purchDate = form.purchaseDate
      ? (() => {
          // Accept dd/mm/yyyy or yyyy-mm-dd
          const parts = form.purchaseDate.split("/");
          if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          return form.purchaseDate;
        })()
      : null;

    setSaveError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaveError("Bạn chưa đăng nhập"); return; }

    if (editingHolding?.id) {
      // UPDATE
      const { error } = await supabase
        .from("portfolio_holdings")
        .update({ quantity: qty, avg_cost: avgP, purchase_date: purchDate })
        .eq("id", editingHolding.id)
        .eq("user_id", user.id);

      if (error) { setSaveError(error.message); return; }
    } else {
      // UPSERT — if symbol already exists for this user, update it
      const { error } = await supabase
        .from("portfolio_holdings")
        .upsert(
          { user_id: user.id, symbol: sym, quantity: qty, avg_cost: avgP, purchase_date: purchDate },
          { onConflict: "user_id,symbol" }
        );

      if (error) { setSaveError(error.message); return; }
    }

    setShowModal(false);
    await loadHoldings();
  };

  const deleteHolding = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setHoldings(prev => prev.filter(h => h.id !== id));
    await supabase.from("portfolio_holdings").delete().eq("id", id).eq("user_id", user.id);
  };

  // Context cards for drag-to-hub
  const perfCard: ContextCard = {
    id: "portfolio-performance",
    type: "portfolio",
    label: "Hiệu suất danh mục",
    badge: fmtPct(periodPortfolioPct) + ` (${chartPeriod})`,
    summary: `Danh mục: ${fmtPct(periodPortfolioPct)} · VN-Index: ${fmtPct(periodVniPct)} · HNX: ${fmtPct(periodHnxPct)}`,
  };

  const allocCard: ContextCard = {
    id: "portfolio-allocation",
    type: "portfolio",
    label: "Phân bổ danh mục",
    badge: `${holdings.length} mã`,
    summary: allocData.map((d: AllocItem) => `${d.symbol}: ${d.pct.toFixed(1)}%`).join(" · "),
  };

  const summaryCard: ContextCard = {
    id: "portfolio-summary",
    type: "portfolio",
    label: "Danh mục của tôi",
    badge: totalPnl >= 0 ? `+${totalPnlPct.toFixed(2)}%` : `${totalPnlPct.toFixed(2)}%`,
    summary: `Tổng giá trị: ${totalValue.toLocaleString("vi-VN")}đ · P&L: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("vi-VN")}đ (${fmtPct(totalPnlPct)})`,
  };

  const hoverStyle = `
    .portfolio-drag-card:hover .card-hint { opacity: 1 !important; }
    .portfolio-drag-card { cursor: grab; }
    .portfolio-drag-card:active { cursor: grabbing; }
    .holding-row:hover .row-drag { opacity: 1 !important; }
  `;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: FONT, background: isDark ? "#0B0D18" : undefined }}>
      <style>{hoverStyle}</style>

      {/* Header summary — draggable */}
      <div
        className="portfolio-drag-card"
        {...makeDragHandlers(summaryCard)}
        style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16, position: "relative", overflow: "hidden" }}
      >
        <DragHint isDark={isDark} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              Danh mục của tôi
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: portfolioLoading ? "rgba(0,0,0,0.08)" : "rgba(99,102,241,0.10)", color: portfolioLoading ? fgSubtle : "#6366F1" }}>
                {portfolioLoading ? "Đang tải…" : `${holdings.length} vị thế`}
              </span>
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, color: fg, marginBottom: 6 }}>
              {portfolioLoading ? "—" : `${totalValue.toLocaleString("vi-VN")} đ`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: totalPnl >= 0 ? GREEN : RED }}>
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString("vi-VN")} ({totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
              </span>
              <span style={{ fontSize: 13, color: fgSubtle }}>tổng P&L</span>
            </div>
          </div>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); loadHoldings(); }}
            disabled={portfolioLoading}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: "transparent",
              cursor: portfolioLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: brand, fontFamily: FONT,
              opacity: portfolioLoading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={14} strokeWidth={1.5} style={{ animation: portfolioLoading ? "spin 1s linear infinite" : "none" }} /> Làm mới
          </button>
        </div>
      </div>

      {/* ── DNSE Live Portfolio ── */}
      {brokerConfig?.apiKey && (
        <div style={{ background: cardBg, borderRadius: 14, padding: "18px 22px", boxShadow: cardShadow, marginBottom: 16, border: `0.5px solid ${isDark ? "rgba(52,199,89,0.20)" : "rgba(52,199,89,0.30)"}` }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34C759", flexShrink: 0, boxShadow: "0 0 0 3px rgba(52,199,89,0.20)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>Danh mục thực tế — {brokerConfig.broker.toUpperCase()}</span>
              <span style={{ fontSize: 11, color: fgSubtle, fontFamily: FONT }}>TK: {brokerConfig.accountNo}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isMarketOpen() && !dnseLoading && (
                <span style={{ fontSize: 11, color: fgSubtle }}>làm mới sau {dnseCountdown}s</span>
              )}
              <button
                onClick={loadDnseData}
                disabled={dnseLoading}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.12)" : "rgba(8,73,172,0.20)"), background: "transparent", cursor: dnseLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, color: brand, fontFamily: FONT, opacity: dnseLoading ? 0.6 : 1 }}
              >
                <RefreshCw size={13} strokeWidth={1.5} style={{ animation: dnseLoading ? "spin 1s linear infinite" : "none" }} /> Làm mới
              </button>
            </div>
          </div>

          {dnseError && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(255,59,48,0.06)", borderRadius: 10, marginBottom: 12 }}>
              <AlertCircle size={14} color="#FF3B30" strokeWidth={1.5} />
              <span style={{ fontSize: 13, color: "#FF3B30" }}>{dnseError}</span>
            </div>
          )}

          {/* Cash balance */}
          {dnseCash && (
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { label: "Số dư tiền", value: dnseCash.cashBalance },
                { label: "Tiền có thể dùng", value: dnseCash.availableCash },
                { label: "Tiền đang giữ", value: dnseCash.holdCash },
              ].map(item => (
                <div key={item.label} style={{ flex: "1 1 140px", background: isDark ? "rgba(255,255,255,0.04)" : "#F5F5F7", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: fgSubtle, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: fg }}>{item.value.toLocaleString("vi-VN")} đ</div>
                </div>
              ))}
            </div>
          )}

          {/* Positions table */}
          {dnsePositions.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "72px 80px 90px 90px 100px 90px", padding: "8px 12px", background: isDark ? "#0f1220" : "#F5F5F7", borderRadius: "8px 8px 0 0" }}>
                {["Mã", "SL CP", "Giá TB", "Giá TT", "Giá trị TT", "P&L"].map(col => (
                  <div key={col} style={{ fontSize: 11, fontWeight: 700, color: fgSubtle, letterSpacing: "0.05em", textTransform: "uppercase" }}>{col}</div>
                ))}
              </div>
              {dnsePositions.map((pos, i) => {
                const pnlColor = (pos.pnl ?? 0) >= 0 ? GREEN : RED;
                return (
                  <div
                    key={pos.symbol}
                    style={{
                      display: "grid", gridTemplateColumns: "72px 80px 90px 90px 100px 90px",
                      padding: "10px 12px", alignItems: "center",
                      borderBottom: i < dnsePositions.length - 1 ? "0.5px solid " + divider : "none",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.07)" : "rgba(8,73,172,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span
                      style={{ fontWeight: 700, fontSize: 13, color: brand, cursor: "pointer" }}
                      onClick={() => onSelectTicker?.(pos.symbol)}
                    >
                      {pos.symbol}
                    </span>
                    <span style={{ fontSize: 13, color: fg }}>{pos.quantity.toLocaleString("vi-VN")}</span>
                    <span style={{ fontSize: 13, color: fgMuted }}>{pos.averagePrice.toLocaleString("vi-VN")}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: fg }}>{pos.marketPrice != null ? pos.marketPrice.toLocaleString("vi-VN") : "—"}</span>
                    <span style={{ fontSize: 13, color: fg }}>{pos.marketValue != null ? (pos.marketValue / 1_000_000).toFixed(1) + "M" : "—"}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: pnlColor }}>
                      {pos.pnl != null ? `${pos.pnl >= 0 ? "+" : ""}${pos.pnl.toLocaleString("vi-VN")}` : "—"}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {!dnseLoading && !dnseError && dnsePositions.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: fgSubtle, fontSize: 13 }}>
              Chưa có vị thế nào trong tài khoản
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 11, color: fgSubtle, fontStyle: "italic" }}>
            Dữ liệu từ {brokerConfig.broker.toUpperCase()} OpenAPI • {isMarketOpen() ? "Thị trường đang mở" : "Thị trường đóng cửa"}
          </div>
        </div>
      )}

      {/* ── Kết nối broker CTA nếu chưa kết nối ── */}
      {!brokerConfig?.apiKey && (
        <div
          onClick={() => onNavigate("settings")}
          style={{
            background: isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)",
            border: `0.5px dashed ${isDark ? "rgba(77,143,232,0.30)" : "rgba(8,73,172,0.25)"}`,
            borderRadius: 14, padding: "16px 22px", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
            transition: "background 120ms",
          }}
        >
          <Link2 size={18} color={brand} strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: brand }}>Kết nối tài khoản môi giới</div>
            <div style={{ fontSize: 12, color: fgSubtle }}>Liên kết DNSE để xem danh mục thực tế theo thời gian thực</div>
          </div>
          <ArrowUpRight size={15} color={brand} strokeWidth={1.5} />
        </div>
      )}

      {/* ── Portfolio performance chart — draggable ── */}
      <div
        className="portfolio-drag-card"
        {...makeDragHandlers(perfCard)}
        style={{ background: cardBg, borderRadius: 14, padding: "20px 22px", boxShadow: cardShadow, marginBottom: 16, position: "relative", overflow: "hidden" }}
      >
        <DragHint isDark={isDark} />

        {/* Chart header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Hiệu suất danh mục
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px", color: PORTFOLIO_C }}>
                {fmtPct(periodPortfolioPct)}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: periodPortfolioPct >= 0 ? GREEN : RED,
                background: periodPortfolioPct >= 0 ? "rgba(39,200,64,0.10)" : "rgba(255,57,49,0.10)",
                padding: "3px 9px", borderRadius: 6,
              }}>
                trong kỳ {chartPeriod}
              </span>
            </div>
          </div>

          {/* Period selector */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{ display: "flex", background: bgMuted, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${divider}` }}
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={(e) => { e.stopPropagation(); setChartPeriod(p); }}
                style={{
                  padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: chartPeriod === p ? (isDark ? "#4D8FE8" : "#0849AC") : "transparent",
                  color: chartPeriod === p ? "#fff" : fgMuted,
                  fontSize: 12, fontWeight: chartPeriod === p ? 700 : 500,
                  fontFamily: FONT, transition: "all 100ms",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: 220, position: "relative" }}>
          {chartLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, background: "transparent" }}>
              <RefreshCw size={16} color={brand} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          {!chartLoading && chartData.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, color: fgSubtle }}>Chưa có dữ liệu giá cho kỳ này</span>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gPortfolio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={PORTFOLIO_C} stopOpacity={isDark ? 0.25 : 0.18} />
                  <stop offset="100%" stopColor={PORTFOLIO_C} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gPVni" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={VNI_C} stopOpacity={0.10} />
                  <stop offset="100%" stopColor={VNI_C} stopOpacity={0.00} />
                </linearGradient>
                <linearGradient id="gPHnx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={HNX_C} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={HNX_C} stopOpacity={0.00} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)", fontSize: 10, fontFamily: FONT }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fill: isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)", fontSize: 10, fontFamily: FONT }}
                axisLine={false} tickLine={false} width={44}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
              />
              <Tooltip content={<PerfTooltip isDark={isDark} />} />
              <ReferenceLine y={0} stroke={refStroke} strokeDasharray="3 3" />
              <Area type="monotone" dataKey="portfolio" stroke={PORTFOLIO_C} strokeWidth={2.5} fill="url(#gPortfolio)" dot={false} name="Danh mục" />
              {showVni && <Area type="monotone" dataKey="vni" stroke={VNI_C} strokeWidth={1.5} fill="url(#gPVni)" dot={false} name="VN-Index" strokeDasharray="5 2" />}
              {showHnx && <Area type="monotone" dataKey="hnx" stroke={HNX_C} strokeWidth={1.5} fill="url(#gPHnx)" dot={false} name="HNX-Index" strokeDasharray="5 2" />}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99,
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.05)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(26,26,46,0.12)"}`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: PORTFOLIO_C, flexShrink: 0, boxShadow: `0 0 0 3px ${PORTFOLIO_C}30` }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: fg }}>Danh mục</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: periodPortfolioPct >= 0 ? GREEN : RED }}>{fmtPct(periodPortfolioPct)}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowVni((v: boolean) => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: FONT, transition: "all 120ms",
              background: showVni ? (isDark ? "rgba(93,127,255,0.12)" : "rgba(93,127,255,0.08)") : "transparent",
              border: showVni ? "1px solid rgba(93,127,255,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}`,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: showVni ? VNI_C : "transparent", border: showVni ? "none" : `2px solid ${VNI_C}` }} />
            <span style={{ fontSize: 12, fontWeight: showVni ? 700 : 400, color: showVni ? fg : fgMuted }}>VN-Index</span>
            {showVni && <span style={{ fontSize: 12, fontWeight: 700, color: periodVniPct >= 0 ? GREEN : RED }}>{fmtPct(periodVniPct)}</span>}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowHnx((v: boolean) => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: FONT, transition: "all 120ms",
              background: showHnx ? (isDark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)") : "transparent",
              border: showHnx ? "1px solid rgba(139,92,246,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}`,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: showHnx ? HNX_C : "transparent", border: showHnx ? "none" : `2px solid ${HNX_C}` }} />
            <span style={{ fontSize: 12, fontWeight: showHnx ? 700 : 400, color: showHnx ? fg : fgMuted }}>HNX-Index</span>
            {showHnx && <span style={{ fontSize: 12, fontWeight: 700, color: periodHnxPct >= 0 ? GREEN : RED }}>{fmtPct(periodHnxPct)}</span>}
          </button>
        </div>
      </div>

      {/* ── Allocation card — draggable ── */}
      <div
        className="portfolio-drag-card"
        {...makeDragHandlers(allocCard)}
        style={{ background: cardBg, borderRadius: 14, padding: "20px 22px", boxShadow: cardShadow, marginBottom: 16, position: "relative", overflow: "hidden" }}
      >
        <DragHint isDark={isDark} />
        <div style={{ fontSize: 12, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 18 }}>
          Phân bổ danh mục
        </div>

        {/* Centered donut chart */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{ position: "relative" }}>
            <PieChart width={240} height={240}>
              <Pie
                data={allocData}
                cx={120} cy={120}
                innerRadius={76}
                outerRadius={108}
                dataKey="value"
                paddingAngle={2}
                onMouseEnter={(_, index) => setHoveredSlice(allocData[index].symbol)}
                onMouseLeave={() => setHoveredSlice(null)}
                strokeWidth={0}
              >
                {allocData.map((entry: AllocItem) => (
                  <Cell
                    key={entry.symbol}
                    fill={entry.color}
                    opacity={hoveredSlice === null || hoveredSlice === entry.symbol ? 1 : 0.30}
                    style={{ transition: "opacity 150ms ease", cursor: "pointer" }}
                  />
                ))}
              </Pie>
              <Tooltip content={<AllocTooltip />} />
            </PieChart>
            {/* Center label */}
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              textAlign: "center", pointerEvents: "none", width: 110,
            }}>
              {hoveredSlice ? (() => {
                const hovered = allocData.find((d: AllocItem) => d.symbol === hoveredSlice);
                return (
                  <>
                    <div style={{ fontSize: 10, color: fgSubtle, marginBottom: 2 }}>{hovered?.name}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: hovered?.color, lineHeight: 1 }}>{hovered?.pct.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: fg, marginTop: 3 }}>{hoveredSlice}</div>
                  </>
                );
              })() : (
                <>
                  <div style={{ fontSize: 11, color: fgSubtle, marginBottom: 4 }}>{holdings.length} vị thế</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: fg }}>
                    {(totalValue / 1_000_000).toFixed(0)}M đ
                  </div>
                  <div style={{ fontSize: 10, color: fgSubtle, marginTop: 2 }}>tổng giá trị</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "0.5px", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)", marginBottom: 14 }} />

        {/* Legend grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "4px 8px" }}>
          {allocData.map((d: AllocItem) => {
            const isHovered = hoveredSlice === d.symbol;
            return (
              <div
                key={d.symbol}
                onMouseEnter={() => setHoveredSlice(d.symbol)}
                onMouseLeave={() => setHoveredSlice(null)}
                onClick={(e) => { e.stopPropagation(); onSelectTicker?.(d.symbol); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                  borderRadius: 8, cursor: "pointer", transition: "background 100ms",
                  background: isHovered ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.04)") : "transparent",
                }}
              >
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isHovered ? d.color : fg, transition: "color 100ms" }}>{d.symbol}</span>
                    <span style={{ fontSize: 10, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: fgMuted, marginTop: 1 }}>
                    {(d.value / 1_000_000).toFixed(1)}M đ
                    <span style={{ marginLeft: 6, color: fgSubtle }}>{d.pct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Holdings table */}
      <div style={{ background: cardBg, borderRadius: 14, boxShadow: cardShadow, overflow: "hidden", marginBottom: 16 }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "72px 1fr 80px 90px 90px 110px 80px 80px",
          padding: "10px 16px",
          borderBottom: "0.5px solid " + divider,
          background: isDark ? "#0f1220" : "#F5F5F7",
        }}>
          {["Mã", "Tên", "SL CP", "Giá TB", "Giá HT", "P&L", "Ngày nhập", ""].map((col) => (
            <div key={col} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>{col}</div>
          ))}
        </div>

        {holdings.map((h: Holding, i: number) => {
          const pnl = h.avgPrice ? (h.currentPrice - h.avgPrice) * h.quantity : null;
          const pnlPct = h.avgPrice ? ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100 : null;
          const isUp = pnl !== null && pnl >= 0;
          const tickerCard: ContextCard = {
            id: `holding-${h.symbol}`,
            type: "ticker",
            label: h.symbol,
            badge: pnlPct !== null ? (pnlPct >= 0 ? `+${pnlPct.toFixed(1)}%` : `${pnlPct.toFixed(1)}%`) : undefined,
            summary: `${h.name} · SL: ${h.quantity.toLocaleString("vi-VN")} · Giá HT: ${h.currentPrice.toLocaleString("vi-VN")}`,
          };

          return (
            <div
              key={h.symbol}
              className="holding-row"
              {...makeDragHandlers(tickerCard)}
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr 80px 90px 90px 110px 80px 80px",
                padding: "12px 16px",
                borderBottom: i < holdings.length - 1 ? "0.5px solid " + divider : "none",
                alignItems: "center",
                transition: "background 80ms ease",
                cursor: "grab",
                position: "relative",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span
                style={{ fontWeight: 700, fontSize: 14, color: fg, cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); onSelectTicker?.(h.symbol); }}
              >
                {h.symbol}
              </span>
              <span style={{ fontSize: 13, color: fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
              <span style={{ fontSize: 13, color: fg }}>{h.quantity.toLocaleString("vi-VN")}</span>
              <span style={{ fontSize: 13, color: fgMuted }}>
                {h.avgPrice ? h.avgPrice.toLocaleString("vi-VN") : <em style={{ color: fgSubtle }}>—</em>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>{h.currentPrice.toLocaleString("vi-VN")}</span>
              <div>
                {pnl !== null ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? GREEN : RED }}>
                      {isUp ? "+" : ""}{pnl.toLocaleString("vi-VN")}
                    </div>
                    <div style={{ fontSize: 11, color: isUp ? GREEN : RED, opacity: 0.8 }}>
                      {isUp ? "+" : ""}{pnlPct!.toFixed(1)}%
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: fgSubtle, fontStyle: "italic" }}>Chưa có giá mua</span>
                )}
              </div>
              <span style={{ fontSize: 12, color: fgSubtle }}>{h.purchaseDate || "—"}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={(e) => { e.stopPropagation(); openEdit(h); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: fgSubtle, display: "flex" }} title="Sửa">
                  <Pencil size={14} strokeWidth={1.5} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); if (h.id) deleteHolding(h.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: fgSubtle, display: "flex" }} title="Xóa">
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onSelectTicker?.(h.symbol); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: fgSubtle, display: "flex" }} title="Xem ticker">
                  <ArrowUpRight size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          onClick={openAdd}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
            borderRadius: 10, border: "none", background: brand,
            color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: FONT, transition: "background 150ms ease",
          }}
        >
          <Plus size={16} strokeWidth={1.5} /> Thêm mã
        </button>
      </div>

      {/* Agent status */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "rgba(8,73,172,0.08)", borderRadius: 10, padding: 10, display: "flex", alignItems: "center" }}>
          <Activity size={20} color="#0849AC" strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>Portfolio Health</span>
            <span style={{ background: "rgba(52,199,89,0.12)", color: "#34C759", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>● Active</span>
          </div>
          <span style={{ fontSize: 13, color: fgSubtle }}>
            Agent đang theo dõi danh mục{lastAgentRun ? ` · lần chạy cuối: ${lastAgentRun}` : ""}
          </span>
        </div>
        <button
          onClick={() => onNavigate("agents")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            borderRadius: 10, border: "0.5px solid rgba(8,73,172,0.20)", background: "transparent",
            color: brand, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
          }}
        >
          Xem agent <ArrowUpRight size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.50)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: 480, boxShadow: "0 20px 60px rgba(8,73,172,0.16), 0 4px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1A1A2E" }}>
                {editingHolding ? "Sửa cổ phiếu" : "Thêm cổ phiếu vào danh mục"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(26,26,46,0.45)", display: "flex" }}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "Mã cổ phiếu", key: "symbol", placeholder: "VD: HPG, VCB, FPT" },
                { label: "Số lượng (cp)", key: "quantity", placeholder: "VD: 1000" },
                { label: "Giá mua TB (đ/cp) – tùy chọn", key: "avgPrice", placeholder: "VD: 22000" },
                { label: "Ngày mua – tùy chọn", key: "purchaseDate", placeholder: "VD: 08/01/2026" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(26,26,46,0.60)", marginBottom: 6, fontFamily: FONT }}>
                    {label}
                  </label>
                  <input
                    value={(form as any)[key]}
                    onChange={(e) => setForm((prev: typeof form) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    disabled={editingHolding !== null && key === "symbol"}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      border: "0.5px solid rgba(8,73,172,0.20)", background: "#F5F5F7",
                      fontSize: 14, color: "#1A1A2E", outline: "none", boxSizing: "border-box",
                      fontFamily: FONT,
                    }}
                  />
                </div>
              ))}
            </div>
            {!form.avgPrice && (
              <p style={{ fontSize: 12, color: "rgba(26,26,46,0.45)", marginTop: 12, fontStyle: "italic" }}>
                Nếu không nhập giá mua: chỉ track % thay đổi, không tính P&L
              </p>
            )}
            {saveError && (
              <p style={{ fontSize: 12, color: "#FF3B30", marginTop: 10, padding: "8px 12px", background: "rgba(255,59,48,0.06)", borderRadius: 8 }}>
                ⚠ {saveError}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "10px 20px", borderRadius: 10, border: "0.5px solid rgba(8,73,172,0.20)", background: "transparent", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "rgba(26,26,46,0.60)", fontFamily: FONT }}>
                Hủy
              </button>
              <button onClick={handleSave} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#0849AC", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
