import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ArrowUpRight, RefreshCw, X, GripVertical, Link2, AlertCircle, CheckCircle2, Sparkles, EllipsisVertical } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "../../components/ui/drawer";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "../../lib/supabase/client";
import { useCurrentUser } from "../../lib/hooks/useCurrentUser";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { useBrokerConfig } from "../../lib/hooks/useBrokerConfig";
import { fetchPositions, fetchCashBalance, type DnsePosition, type DnseCashBalance } from "../../lib/services/dnse";
import { useIsMobile } from "../../components/ui/use-mobile";

interface TickerOption { symbol: string; name: string; }

interface Holding {
  id?: string;          // portfolio_holdings.id
  symbol: string;
  name: string;
  sector: string;
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
  const muted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const mutedText = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
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

// ── DragHint overlay ──────────────────────────────────────────────────────────
function DragHint({ isDark }: { isDark: boolean }) {
  // Mobile không có drag — ẩn hẳn để tap không làm hint kẹt hiển thị
  const isMobile = useIsMobile();
  const accent = isDark ? "rgba(77,143,232,0.80)" : "rgba(8,73,172,0.65)";
  if (isMobile) return null;
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

// ── Donut phân bổ (theo cổ phiếu / theo ngành) — cùng 1 component, khác data ───────────
function AllocDonutCard({
  title, data, isDark, hoveredKey, onHover, defaultCenter, onLegendClick, showLegendSublabel = true,
}: {
  title: string;
  data: AllocItem[];
  isDark: boolean;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  defaultCenter: { top: string; big: string; bottom: string };
  onLegendClick?: (symbol: string) => void;
  showLegendSublabel?: boolean;
}) {
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const hovered = data.find((d) => d.symbol === hoveredKey);

  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: fgDisabled, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 18 }}>
        {title}
      </div>

      {/* Centered donut chart */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <div style={{ position: "relative" }}>
          <PieChart width={240} height={240}>
            <Pie
              data={data}
              cx={120} cy={120}
              innerRadius={76}
              outerRadius={108}
              dataKey="value"
              paddingAngle={2}
              onMouseEnter={(_, index) => onHover(data[index].symbol)}
              onMouseLeave={() => onHover(null)}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.symbol}
                  fill={entry.color}
                  opacity={hoveredKey === null || hoveredKey === entry.symbol ? 1 : 0.30}
                  style={{ transition: "opacity 150ms ease", cursor: "pointer" }}
                />
              ))}
            </Pie>
          </PieChart>
          {/* Center label */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            textAlign: "center", pointerEvents: "none", width: 110,
          }}>
            {hovered ? (
              <>
                <div style={{ fontSize: 10, color: fgSubtle, marginBottom: 2 }}>{hovered.name}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: hovered.color, lineHeight: 1 }}>{hovered.pct.toFixed(1)}%</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: fg, marginTop: 3 }}>{hovered.symbol}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: fgSubtle, marginBottom: 4 }}>{defaultCenter.top}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: fg }}>{defaultCenter.big}</div>
                <div style={{ fontSize: 10, color: fgSubtle, marginTop: 2 }}>{defaultCenter.bottom}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "0.5px", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)", marginBottom: 14 }} />

      {/* Legend grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "4px 8px" }}>
        {data.map((d) => {
          const isHovered = hoveredKey === d.symbol;
          return (
            <div
              key={d.symbol}
              onMouseEnter={() => onHover(d.symbol)}
              onMouseLeave={() => onHover(null)}
              onClick={onLegendClick ? (e) => { e.stopPropagation(); onLegendClick(d.symbol); } : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 8, cursor: onLegendClick ? "pointer" : "default", transition: "background 100ms",
                background: isHovered ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.04)") : "transparent",
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: isHovered ? d.color : fg, transition: "color 100ms",
                    ...(showLegendSublabel
                      ? { flexShrink: 0 }
                      : { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
                  }}>{d.symbol}</span>
                  {showLegendSublabel && (
                    <span style={{ fontSize: 10, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  )}
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
  );
}

// ── Data fetchers (thuần, dùng làm queryFn cho React Query — xem component bên dưới) ────
async function fetchHoldings(userId: string): Promise<Holding[]> {
  const { data: rows, error } = await supabase
    .from("portfolio_holdings")
    .select("id, symbol, quantity, avg_cost, purchase_date, notes")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!rows) return [];

  const symbols = rows.map((r: any) => r.symbol);
  const latestPrices: Record<string, number> = {};
  const tickerNames: Record<string, string> = {};
  const sectorNames: Record<string, string> = {};

  if (symbols.length > 0) {
    // Giá mới nhất + tên mã + ngành: 3 truy vấn độc lập, chạy song song
    const [{ data: prices }, { data: tickers }, { data: stocks }] = await Promise.all([
      supabase.from("prices_daily").select("symbol,date,close")
        .in("symbol", symbols)
        .order("date", { ascending: false })
        .limit(symbols.length * 15),
      supabase.from("tickers").select("symbol,name").in("symbol", symbols),
      supabase.from("stocks").select("symbol,sector_name").in("symbol", symbols),
    ]);
    prices?.forEach((p: any) => {
      if (latestPrices[p.symbol] == null && p.close != null) latestPrices[p.symbol] = Number(p.close);
    });
    tickers?.forEach((t: any) => { tickerNames[t.symbol] = t.name; });
    stocks?.forEach((s: any) => { sectorNames[s.symbol] = s.sector_name; });
  }

  return rows.map((r: any) => ({
    id: r.id,
    symbol: r.symbol,
    name: tickerNames[r.symbol] || r.symbol,
    sector: sectorNames[r.symbol] || "Khác",
    quantity: Number(r.quantity),
    avgPrice: r.avg_cost != null ? Number(r.avg_cost) : null,
    currentPrice: latestPrices[r.symbol] ?? 0,
    purchaseDate: r.purchase_date
      ? new Date(r.purchase_date).toLocaleDateString("vi-VN")
      : null,
  }));
}

async function fetchPortfolioChart(currentHoldings: Holding[], period: ChartPeriod): Promise<ChartPoint[]> {
  if (!currentHoldings.length) return [];
  try {
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

    const allDates = [...new Set(Object.keys(priceByDate))].sort();
    if (!allDates.length) return [];

    const lastKnown: Record<string, number> = {};
    currentHoldings.forEach(h => { lastKnown[h.symbol] = h.currentPrice; });

    const points: ChartPoint[] = [];
    let basePortfolio = 0;
    let baseVni = 0;
    let baseHnx = 0;

    allDates.forEach((date, idx) => {
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

    if (period === "ALL" || period === "YTD") {
      const byLabel: Record<string, ChartPoint[]> = {};
      points.forEach(p => {
        if (!byLabel[p.date]) byLabel[p.date] = [];
        byLabel[p.date].push(p);
      });
      return Object.values(byLabel).map(group => ({
        date: group[0].date,
        portfolio: parseFloat((group.reduce((s, p) => s + p.portfolio, 0) / group.length).toFixed(2)),
        vni: parseFloat((group.reduce((s, p) => s + p.vni, 0) / group.length).toFixed(2)),
        hnx: parseFloat((group.reduce((s, p) => s + p.hnx, 0) / group.length).toFixed(2)),
      }));
    }
    return points;
  } catch {
    return [];
  }
}

export function Portfolio({
  onNavigate, onSelectTicker, onAddContextCard, isDark = false,
}: {
  onNavigate: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  onAddContextCard?: (card: ContextCard) => void;
  isDark?: boolean;
}) {
  const isMobile = useIsMobile();
  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.35)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const gridStroke = isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.06)";
  const refStroke = isDark ? "rgba(255,255,255,0.12)" : "rgba(8,73,172,0.15)";

  const [holdings,         setHoldings]         = useState<Holding[]>([]);
  const [saveError,        setSaveError]        = useState<string | null>(null);
  const [showModal,        setShowModal]        = useState(false);
  const [editingHolding,   setEditingHolding]   = useState<Holding | null>(null);
  // Mobile: sheet hành động cho từng mã (thay 3 nút Sửa/Xóa/Xem nhỏ của bảng desktop)
  const [actionSheetFor,   setActionSheetFor]   = useState<Holding | null>(null);
  const [form, setForm] = useState({ symbol: "", quantity: "", avgPrice: "", purchaseDate: "" });
  const [allTickers,            setAllTickers]            = useState<TickerOption[]>([]);
  const [symbolSuggestions,     setSymbolSuggestions]     = useState<TickerOption[]>([]);
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false);
  const [symbolCursor,          setSymbolCursor]          = useState(-1);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [chartDataReal,   setChartDataReal]   = useState<ChartPoint[]>([]);
  const [highlightSymbol, setHighlightSymbol] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── DNSE live data ────────────────────────────────────────────────────────
  const { config: brokerConfig } = useBrokerConfig();
  const [dnsePositions,  setDnsePositions]  = useState<DnsePosition[]>([]);
  const [dnseCash,       setDnseCash]       = useState<DnseCashBalance | null>(null);
  const [dnseLoading,    setDnseLoading]    = useState(false);
  const [dnseError,      setDnseError]      = useState<string | null>(null);
  const [dnseCountdown,  setDnseCountdown]  = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Nạp danh sách mã cổ phiếu (mã + tên công ty) một lần khi mở modal
  useEffect(() => {
    if (!showModal || allTickers.length > 0) return;
    supabase
      .from("tickers")
      .select("symbol, name")
      .order("symbol")
      .then(({ data }) => {
        if (data?.length) setAllTickers(data as TickerOption[]);
      });
  }, [showModal, allTickers.length]);

  // Gợi ý mã cổ phiếu khi gõ trong modal thêm/sửa
  useEffect(() => {
    const q = form.symbol.trim().toLowerCase();
    if (!showModal || editingHolding || !q) {
      setSymbolSuggestions([]);
      setSymbolCursor(-1);
      return;
    }
    // Xếp hạng theo độ liên quan: khớp mã chính xác/đầu mã được ưu tiên hơn khớp trong tên công ty,
    // tránh việc "vic" bị các mã như BBS ("VICEM Bao bì Bút Sơn") chiếm hết slot trước VIC.
    const rank = (t: TickerOption) => {
      const sym = t.symbol.toLowerCase();
      const name = t.name.toLowerCase();
      if (sym === q) return 0;
      if (sym.startsWith(q)) return 1;
      if (sym.includes(q)) return 2;
      if (name.startsWith(q)) return 3;
      return 4;
    };
    setSymbolSuggestions(
      allTickers
        .filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
        .sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol))
        .slice(0, 6)
    );
    setSymbolCursor(-1);
  }, [form.symbol, showModal, editingHolding, allTickers]);

  const isValidSymbol = form.symbol.trim() !== "" && allTickers.some((t) => t.symbol === form.symbol.trim().toUpperCase());

  const selectSymbol = (sym: string) => {
    setForm((prev) => ({ ...prev, symbol: sym }));
    setShowSymbolSuggestions(false);
    setSymbolCursor(-1);
  };

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

  // Chart state (khai báo trước để queryKey bên dưới dùng được)
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("3M");
  const [showVni, setShowVni] = useState(true);
  const [showHnx, setShowHnx] = useState(true);

  // ── Data fetch, có cache (React Query) ────────────────────────────────────
  // Chuyển trang đi rồi quay lại trong thời gian "stale" sẽ không tải lại từ đầu.
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();
  const userId = userQuery.data?.id;

  const holdingsQuery = useQuery({
    queryKey: ["portfolio", "holdings", userId],
    queryFn: () => fetchHoldings(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const symbolsKey = (holdingsQuery.data ?? []).map(h => h.symbol).sort().join(",");
  const chartQuery = useQuery({
    queryKey: ["portfolio", "chart", userId, symbolsKey, chartPeriod],
    queryFn: () => fetchPortfolioChart(holdingsQuery.data!, chartPeriod),
    enabled: !!holdingsQuery.data && holdingsQuery.data.length > 0,
    staleTime: 30_000,
  });

  // Đồng bộ kết quả query vào state hiện có (JSX phía dưới không cần sửa)
  useEffect(() => {
    if (holdingsQuery.data) setHoldings(holdingsQuery.data);
  }, [holdingsQuery.data]);
  useEffect(() => {
    if (!holdingsQuery.data || holdingsQuery.data.length === 0) { setChartDataReal([]); return; }
    if (chartQuery.data) setChartDataReal(chartQuery.data);
  }, [chartQuery.data, holdingsQuery.data]);
  useEffect(() => {
    if (holdingsQuery.error) setSaveError((holdingsQuery.error as Error).message);
  }, [holdingsQuery.error]);

  const portfolioLoading = userQuery.isLoading || holdingsQuery.isLoading;
  const chartLoading = chartQuery.isLoading || chartQuery.isFetching;

  // Dùng lại sau khi user tự sửa/xoá holding — báo React Query lấy lại dữ liệu mới
  const invalidateHoldings = () => queryClient.invalidateQueries({ queryKey: ["portfolio", "holdings", userId] });

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

  // Allocation data for donut chart (theo cổ phiếu)
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

  // Allocation data theo ngành — gom các mã cùng sector_name (bảng "stocks"), dùng
  // chung shape với allocData (symbol → tên ngành, name → số mã) để tái dùng AllocDonutCard.
  const sectorTotals = new Map<string, { value: number; count: number }>();
  holdings.forEach((h: Holding) => {
    const value = h.quantity * h.currentPrice;
    const key = h.sector || "Khác";
    const cur = sectorTotals.get(key) ?? { value: 0, count: 0 };
    sectorTotals.set(key, { value: cur.value + value, count: cur.count + 1 });
  });
  const sectorAllocData: AllocItem[] = [...sectorTotals.entries()]
    .map(([sector, { value, count }], i) => ({
      symbol: sector,
      name: `${count} mã`,
      value,
      pct: (value / totalValue) * 100,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);

  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  // Scroll the newly-added holding into view and flash-highlight it once it renders
  useEffect(() => {
    if (!highlightSymbol) return;
    const el = rowRefs.current[highlightSymbol];
    if (!el) return; // row not rendered yet — effect re-fires when `holdings` updates
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightSymbol(null), 1600);
    return () => clearTimeout(timer);
  }, [highlightSymbol, holdings]);

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
      setHighlightSymbol(sym);
    }

    setShowModal(false);
    await invalidateHoldings();
  };

  const deleteHolding = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setHoldings(prev => prev.filter(h => h.id !== id));
    await supabase.from("portfolio_holdings").delete().eq("id", id).eq("user_id", user.id);
    invalidateHoldings();
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
    label: "Phân bổ theo cổ phiếu",
    badge: `${holdings.length} mã`,
    summary: allocData.map((d: AllocItem) => `${d.symbol}: ${d.pct.toFixed(1)}%`).join(" · "),
  };

  const sectorAllocCard: ContextCard = {
    id: "portfolio-sector-allocation",
    type: "portfolio",
    label: "Phân bổ theo ngành",
    badge: `${sectorAllocData.length} ngành`,
    summary: sectorAllocData.map((d: AllocItem) => `${d.symbol}: ${d.pct.toFixed(1)}%`).join(" · "),
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
    @keyframes rowHighlightLight { 0% { background: rgba(8,73,172,0.14); } 100% { background: transparent; } }
    @keyframes rowHighlightDark  { 0% { background: rgba(77,143,232,0.22); } 100% { background: transparent; } }
  `;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px" : "24px", fontFamily: FONT, background: isDark ? "#0B0D18" : undefined }}>
      <style>{hoverStyle}</style>

      {/* Header summary — draggable */}
      <div
        className="portfolio-drag-card"
        {...makeDragHandlers(summaryCard)}
        style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16, position: "relative", overflow: "hidden" }}
      >
        <DragHint isDark={isDark} />
        {/* Mobile: hỏi AI về toàn danh mục — thay cho drag card tổng vào hub */}
        {isMobile && onAddContextCard && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddContextCard(summaryCard); }}
            title="Hỏi AI về danh mục"
            style={{
              position: "absolute", top: 14, right: 14, width: 34, height: 34, zIndex: 2,
              borderRadius: "50%", border: "none", cursor: "pointer",
              background: "rgba(8,73,172,0.10)", color: brand,
              display: "flex", alignItems: "center", justifyContent: "center",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Sparkles size={15} strokeWidth={1.7} />
          </button>
        )}
        {/* Mobile: xếp dọc — nút Thêm cổ phiếu full-width dưới số liệu, số tổng nhỏ lại để không xuống dòng lẻ "đ" */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: isMobile ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              Danh mục của tôi
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: portfolioLoading ? "rgba(0,0,0,0.08)" : "rgba(99,102,241,0.10)", color: portfolioLoading ? fgSubtle : "#6366F1" }}>
                {portfolioLoading ? "Đang tải…" : `${holdings.length} vị thế`}
              </span>
            </div>
            <div style={{ fontSize: isMobile ? 28 : 34, fontWeight: 700, color: fg, marginBottom: 6, whiteSpace: "nowrap" }}>
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
            onClick={(e) => { e.stopPropagation(); openAdd(); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: isMobile ? "12px 14px" : "8px 14px",
              borderRadius: 10, border: "none", background: brand,
              cursor: "pointer", fontSize: isMobile ? 14 : 13, fontWeight: 600, color: "#fff", fontFamily: FONT,
              transition: "background 150ms ease",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            <Plus size={14} strokeWidth={1.5} /> Thêm cổ phiếu
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
              <span style={{ fontSize: 13, fontWeight: 700, color: fg }}>Danh mục thực tế ({brokerConfig.broker.toUpperCase()})</span>
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

          {/* Positions — mobile: card-row 2 tầng; desktop: bảng grid */}
          {dnsePositions.length > 0 && isMobile && (
            <div>
              {dnsePositions.map((pos, i) => {
                const pnlColor = (pos.pnl ?? 0) >= 0 ? GREEN : RED;
                return (
                  <div
                    key={pos.symbol}
                    onClick={() => onSelectTicker?.(pos.symbol)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, minHeight: 56,
                      padding: "10px 4px", cursor: "pointer",
                      borderBottom: i < dnsePositions.length - 1 ? "0.5px solid " + divider : "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: brand }}>{pos.symbol}</div>
                      <div style={{ fontSize: 12.5, color: fgSubtle, marginTop: 2 }}>
                        {pos.quantity.toLocaleString("vi-VN")} CP × TB {pos.averagePrice.toLocaleString("vi-VN")}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: fg, fontVariantNumeric: "tabular-nums" }}>
                        {pos.marketPrice != null ? pos.marketPrice.toLocaleString("vi-VN") : "—"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: pnlColor, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                        {pos.pnl != null ? `${pos.pnl >= 0 ? "+" : ""}${pos.pnl.toLocaleString("vi-VN")}` : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Positions table — bọc overflowX cho màn hẹp (tổng cột cứng 522px) */}
          {dnsePositions.length > 0 && !isMobile && (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ minWidth: 546 }}>
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
            </div>
            </div>
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

        {/* Chart header — mobile: pills kỳ hạn xuống hàng riêng, cuộn ngang được */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "space-between", marginBottom: 18, gap: isMobile ? 12 : 0 }}>
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
                whiteSpace: "nowrap",
              }}>
                trong kỳ {chartPeriod}
              </span>
            </div>
          </div>

          {/* Period selector */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{ display: "flex", background: bgMuted, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${divider}`, overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: "touch", alignSelf: isMobile ? "flex-start" : undefined, maxWidth: "100%" }}
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
                  flexShrink: 0,
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
                tick={{ fill: isDark ? "rgba(240,242,255,0.85)" : "#3D3D52", fontSize: 10, fontFamily: FONT }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fill: isDark ? "rgba(240,242,255,0.85)" : "#3D3D52", fontSize: 10, fontFamily: FONT }}
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

      {/* ── Allocation cards — theo cổ phiếu + theo ngành, mỗi card kéo-thả riêng ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <div
          className="portfolio-drag-card"
          {...makeDragHandlers(allocCard)}
          style={{ background: cardBg, borderRadius: 14, padding: "20px 22px", boxShadow: cardShadow, position: "relative", overflow: "hidden", flex: "1 1 320px", minWidth: 0 }}
        >
          <DragHint isDark={isDark} />
          <AllocDonutCard
            title="Phân bổ theo cổ phiếu"
            data={allocData}
            isDark={isDark}
            hoveredKey={hoveredSlice}
            onHover={setHoveredSlice}
            onLegendClick={(symbol) => onSelectTicker?.(symbol)}
            defaultCenter={{
              top: `${holdings.length} vị thế`,
              big: `${(totalValue / 1_000_000).toFixed(0)}M đ`,
              bottom: "tổng giá trị",
            }}
          />
        </div>

        <div
          className="portfolio-drag-card"
          {...makeDragHandlers(sectorAllocCard)}
          style={{ background: cardBg, borderRadius: 14, padding: "20px 22px", boxShadow: cardShadow, position: "relative", overflow: "hidden", flex: "1 1 320px", minWidth: 0 }}
        >
          <DragHint isDark={isDark} />
          <AllocDonutCard
            title="Phân bổ theo ngành"
            data={sectorAllocData}
            isDark={isDark}
            hoveredKey={hoveredSector}
            onHover={setHoveredSector}
            showLegendSublabel={false}
            defaultCenter={{
              top: `${sectorAllocData.length} ngành`,
              big: `${(totalValue / 1_000_000).toFixed(0)}M đ`,
              bottom: "tổng giá trị",
            }}
          />
        </div>
      </div>

      {/* Holdings — mobile: card-row 2 tầng (pattern app CK: Mã+Giá / SL×TB+P&L); desktop: bảng như cũ */}
      {isMobile ? (
        <div style={{ background: cardBg, borderRadius: 14, boxShadow: cardShadow, overflow: "hidden", marginBottom: 16 }}>
          {holdings.map((h: Holding, i: number) => {
            const pnl = h.avgPrice ? (h.currentPrice - h.avgPrice) * h.quantity : null;
            const pnlPct = h.avgPrice ? ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100 : null;
            const isUp = pnl !== null && pnl >= 0;
            const rowCard: ContextCard = {
              id: `holding-${h.symbol}`,
              type: "ticker",
              label: h.symbol,
              badge: pnlPct !== null ? (pnlPct >= 0 ? `+${pnlPct.toFixed(1)}%` : `${pnlPct.toFixed(1)}%`) : undefined,
              summary: `${h.name} · SL: ${h.quantity.toLocaleString("vi-VN")} · Giá HT: ${h.currentPrice.toLocaleString("vi-VN")}`,
            };
            return (
              <div
                key={h.symbol}
                onClick={() => onSelectTicker?.(h.symbol)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 6px 12px 16px", minHeight: 60, cursor: "pointer",
                  borderBottom: i < holdings.length - 1 ? "0.5px solid " + divider : "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: fg, flexShrink: 0 }}>{h.symbol}</span>
                    <span style={{ fontSize: 12, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: fgSubtle, marginTop: 3 }}>
                    {h.quantity.toLocaleString("vi-VN")} CP{h.avgPrice ? ` × TB ${h.avgPrice.toLocaleString("vi-VN")}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: fg, fontVariantNumeric: "tabular-nums" }}>
                    {h.currentPrice.toLocaleString("vi-VN")}
                  </div>
                  {pnl !== null ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? GREEN : RED, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                      {isUp ? "+" : ""}{pnl.toLocaleString("vi-VN")} ({isUp ? "+" : ""}{pnlPct!.toFixed(1)}%)
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: fgSubtle, fontStyle: "italic", marginTop: 2 }}>Chưa có giá mua</div>
                  )}
                </div>
                {/* Hỏi AI trực tiếp 1 tap — không phải qua menu ⋯ */}
                {onAddContextCard && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddContextCard(rowCard); }}
                    title={`Hỏi AI về ${h.symbol}`}
                    style={{
                      width: 34, height: 34, flexShrink: 0, border: "none", borderRadius: "50%",
                      background: "rgba(8,73,172,0.10)", color: brand,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <Sparkles size={15} strokeWidth={1.7} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setActionSheetFor(h); }}
                  title="Thao tác"
                  style={{
                    width: 36, height: 40, flexShrink: 0, border: "none", background: "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: fgSubtle, WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <EllipsisVertical size={17} strokeWidth={1.6} />
                </button>
              </div>
            );
          })}
          {holdings.length === 0 && !portfolioLoading && (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: fgSubtle }}>
              Chưa có mã nào — bấm "Thêm cổ phiếu" để bắt đầu
            </div>
          )}
        </div>
      ) : (
      <div style={{ background: cardBg, borderRadius: 14, boxShadow: cardShadow, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ minWidth: 700 }}>
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
              ref={(el) => { rowRefs.current[h.symbol] = el; }}
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
                animation: h.symbol === highlightSymbol ? `${isDark ? "rowHighlightDark" : "rowHighlightLight"} 1.6s ease-out` : "none",
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
                {/* Mobile: thay drag-to-AI bằng nút sparkle (HTML5 drag không chạy trên touch) */}
                {isMobile && onAddContextCard && (
                  <button onClick={(e) => { e.stopPropagation(); onAddContextCard(tickerCard); }} style={{ background: "rgba(8,73,172,0.10)", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: brand, display: "flex" }} title="Hỏi AI về mã này">
                    <Sparkles size={14} strokeWidth={1.5} />
                  </button>
                )}
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
      </div>
      </div>
      )}

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

      {/* Mobile: action sheet cho từng mã */}
      <Drawer open={actionSheetFor != null} onOpenChange={(o) => { if (!o) setActionSheetFor(null); }}>
        <DrawerContent style={{ background: isDark ? "#141a29" : "#fff", fontFamily: FONT }}>
          <DrawerTitle style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
            Thao tác với mã
          </DrawerTitle>
          {actionSheetFor && (() => {
            const h = actionSheetFor;
            const pnlPct = h.avgPrice ? ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100 : null;
            const sheetCard: ContextCard = {
              id: `holding-${h.symbol}`,
              type: "ticker",
              label: h.symbol,
              badge: pnlPct !== null ? (pnlPct >= 0 ? `+${pnlPct.toFixed(1)}%` : `${pnlPct.toFixed(1)}%`) : undefined,
              summary: `${h.name} · SL: ${h.quantity.toLocaleString("vi-VN")} · Giá HT: ${h.currentPrice.toLocaleString("vi-VN")}`,
            };
            const actions: { icon: React.ElementType; label: string; danger?: boolean; run: () => void }[] = [
              { icon: Sparkles,     label: `Hỏi AI về ${h.symbol}`, run: () => onAddContextCard?.(sheetCard) },
              { icon: ArrowUpRight, label: "Xem chi tiết mã",        run: () => onSelectTicker?.(h.symbol) },
              { icon: Pencil,       label: "Sửa",                    run: () => openEdit(h) },
              { icon: Trash2,       label: "Xóa khỏi danh mục",      danger: true, run: () => { if (h.id) deleteHolding(h.id); } },
            ];
            return (
              <div style={{ padding: "8px 16px calc(20px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 4px 12px" }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: fg }}>{h.symbol}</span>
                  <span style={{ fontSize: 13, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                </div>
                {actions.map(a => (
                  <button
                    key={a.label}
                    onClick={() => { setActionSheetFor(null); a.run(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      minHeight: 50, padding: "0 4px", border: "none", background: "transparent",
                      cursor: "pointer", fontFamily: FONT, borderRadius: 10, textAlign: "left",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <a.icon size={19} strokeWidth={1.7} color={a.danger ? RED : brand} />
                    <span style={{ fontSize: 15, fontWeight: 500, color: a.danger ? RED : fg }}>{a.label}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>

      {/* Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: 480, maxWidth: "100%", boxShadow: "0 20px 60px rgba(8,73,172,0.16), 0 4px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1A1A2E" }}>
                {editingHolding ? "Sửa cổ phiếu" : "Thêm cổ phiếu vào danh mục"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3D3D52", display: "flex" }}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ position: "relative" }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3D3D52", marginBottom: 6, fontFamily: FONT }}>
                  Mã cổ phiếu
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    value={form.symbol}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setForm((prev) => ({ ...prev, symbol: val }));
                      setShowSymbolSuggestions(true);
                    }}
                    onFocus={() => setShowSymbolSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSymbolSuggestions(false), 200)}
                    onKeyDown={(e) => {
                      if (!showSymbolSuggestions || symbolSuggestions.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSymbolCursor((c) => Math.min(c + 1, symbolSuggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSymbolCursor((c) => Math.max(c - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        selectSymbol(symbolSuggestions[symbolCursor >= 0 ? symbolCursor : 0].symbol);
                      } else if (e.key === "Tab") {
                        selectSymbol(symbolSuggestions[symbolCursor >= 0 ? symbolCursor : 0].symbol);
                      } else if (e.key === "Escape") {
                        setShowSymbolSuggestions(false);
                        setSymbolCursor(-1);
                      }
                    }}
                    placeholder="VD: HPG, VCB, FPT"
                    disabled={editingHolding !== null}
                    autoComplete="off"
                    style={{
                      width: "100%", padding: "10px 40px 10px 14px", borderRadius: 10,
                      border: `0.5px solid ${isValidSymbol ? "rgba(16,185,129,0.45)" : "rgba(8,73,172,0.20)"}`,
                      background: "#F5F5F7",
                      fontSize: 14, color: "#1A1A2E", outline: "none", boxSizing: "border-box",
                      fontFamily: FONT,
                    }}
                  />
                  {isValidSymbol && !editingHolding && (
                    <CheckCircle2
                      size={17} strokeWidth={2} color="#10B981"
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                    />
                  )}
                </div>
                {showSymbolSuggestions && form.symbol.trim() && symbolSuggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
                    background: "#fff", border: "0.5px solid rgba(8,73,172,0.20)", borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(8,73,172,0.14)", maxHeight: 220, overflowY: "auto",
                  }}>
                    {symbolSuggestions.map((s, idx) => (
                      <button
                        key={s.symbol}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSymbol(s.symbol);
                        }}
                        onMouseEnter={() => setSymbolCursor(idx)}
                        style={{
                          display: "block", width: "100%", textAlign: "left", padding: "8px 14px",
                          background: idx === symbolCursor ? "rgba(8,73,172,0.06)" : "none",
                          border: "none", borderBottom: "0.5px solid rgba(8,73,172,0.08)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0849AC", fontFamily: FONT }}>{s.symbol}</div>
                        <div style={{ fontSize: 12, color: "#3D3D52", fontFamily: FONT }}>{s.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {[
                { label: "Số lượng (cp)", key: "quantity", placeholder: "VD: 1000" },
                { label: "Giá mua TB (đ/cp) – tùy chọn", key: "avgPrice", placeholder: "VD: 22000" },
                { label: "Ngày mua – tùy chọn", key: "purchaseDate", placeholder: "VD: 08/01/2026" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3D3D52", marginBottom: 6, fontFamily: FONT }}>
                    {label}
                  </label>
                  <input
                    value={(form as any)[key]}
                    onChange={(e) => setForm((prev: typeof form) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
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
              <p style={{ fontSize: 12, color: "#3D3D52", marginTop: 12, fontStyle: "italic" }}>
                Nếu không nhập giá mua: chỉ track % thay đổi, không tính P&L
              </p>
            )}
            {saveError && (
              <p style={{ fontSize: 12, color: "#FF3B30", marginTop: 10, padding: "8px 12px", background: "rgba(255,59,48,0.06)", borderRadius: 8 }}>
                ⚠ {saveError}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "10px 20px", borderRadius: 10, border: "0.5px solid rgba(8,73,172,0.20)", background: "transparent", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#3D3D52", fontFamily: FONT }}>
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
