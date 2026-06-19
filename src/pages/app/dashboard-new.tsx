/**
 * Dashboard — data THẬT từ Supabase:
 *  - market_indices  → IndexCard chỉ số (sparkline 7 ngày)
 *  - prices_daily    → Top Gainers / Losers / Sector Heatmap
 *  - market_news     → TIN TỨC section
 *  - portfolios + holdings + assets → DANH MỤC watchlist
 * Phần "AI Highlights" và "Báo cáo phân tích" vẫn là nội dung mẫu
 * (sẽ thay bằng AI-generated khi có pipeline).
 */
import { useState, useEffect } from "react";
import {
  ArrowUpRight, TrendingUp, TrendingDown,
  RefreshCw, Eye, FileText, Sparkles, ChevronDown,
  AlertTriangle, Lightbulb, ExternalLink, X, BookOpen,
} from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { BriefRenderer, type BriefOutput } from "../../components/BriefRenderer";
import { MdContent } from "../../components/MdContent";

// ── Types ──────────────────────────────────────────────────────────────────
interface MoverRow   { symbol: string; price: number; pct: number; vol: string; isCeil: boolean; isFloor: boolean; }
interface SectorRow  { name: string; pct: number; }
interface NewsItem   { title: string; tag: string; source: string; time: string; url?: string; }
interface WatchRow   { symbol: string; name: string; price: number; change: number; quantity: number; }
interface IndexState { name: string; value: number; change: number; pct: number; sparkline: number[]; vol: string; }

interface DashboardProps {
  onNavigate: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  isDark?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function relativeTime(ts: string): string {
  const mins = (Date.now() - new Date(ts).getTime()) / 60000;
  if (mins < 60) return `${Math.round(mins)}p`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)} ngày`;
}

function fmtVol(v: number | null): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return `${v}`;
}

function normLabel(label: string | null): string {
  if (!label) return "Trung lập";
  const l = label.toLowerCase();
  if (l.includes("positive") || l.includes("tích")) return "Tích cực";
  if (l.includes("negative") || l.includes("cảnh") || l.includes("warning")) return "Cảnh báo";
  if (l.includes("event") || l.includes("sự kiện")) return "Sự kiện";
  return label;
}

// ── Sub-components ─────────────────────────────────────────────────────────
function PctBadge({ value }: { value: number }) {
  const isUp = value > 0, isDown = value < 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "rgba(26,26,46,0.45)", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function MoverPctBadge({ value, isCeil, isFloor }: { value: number; isCeil?: boolean; isFloor?: boolean }) {
  if (isCeil) return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(124,58,237,0.12)", color: "#7C3AED", fontFamily: "'Montserrat', system-ui, sans-serif" }}>+{value.toFixed(2)}%</span>;
  if (isFloor) return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{value.toFixed(2)}%</span>;
  const isUp = value > 0, isDown = value < 0;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "rgba(26,26,46,0.45)", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{isUp ? "+" : ""}{value.toFixed(2)}%</span>;
}

function makeDragHandlers(card: ContextCard) {
  return {
    draggable: true as const,
    onDragStart(e: React.DragEvent) {
      e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
      e.dataTransfer.effectAllowed = "copy";
      (e.currentTarget as HTMLElement).style.opacity = "0.7";
    },
    onDragEnd(e: React.DragEvent) { (e.currentTarget as HTMLElement).style.opacity = "1"; },
  };
}

function getSectorColor(pct: number) {
  if (pct >= 2)   return { bg: "rgba(52,199,89,0.25)", text: "#1a7a3a" };
  if (pct >= 0.5) return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (pct >= 0)   return { bg: "rgba(52,199,89,0.06)", text: "#34C759" };
  if (pct >= -0.5)return { bg: "rgba(255,59,48,0.06)", text: "#FF3B30" };
  if (pct >= -2)  return { bg: "rgba(255,59,48,0.12)", text: "#FF3B30" };
  return { bg: "rgba(255,59,48,0.25)", text: "#cc1010" };
}

function DragHint() {
  return (
    <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", display: "flex", alignItems: "center", gap: 4, opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }} className="drag-hint">
      <span style={{ fontSize: 10, fontWeight: 700, color: "#0849AC", fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
    </div>
  );
}

function SkeletonRow() {
  return <div style={{ height: 30, borderRadius: 8, background: "rgba(0,0,0,0.05)", margin: "2px 0" }} />;
}

function IndexCard({ idx, isDark }: { idx: IndexState; isDark: boolean }) {
  const isUp = idx.change >= 0;
  const maxS = Math.max(...idx.sparkline), minS = Math.min(...idx.sparkline);
  const range = maxS - minS || 1;
  const cardBg     = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg         = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgSubtle   = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";

  const handleDragStart = (e: React.DragEvent) => {
    const card: ContextCard = { id: `index-${idx.name}`, type: "index", label: idx.name, badge: `${idx.pct >= 0 ? "+" : ""}${idx.pct.toFixed(2)}%`, summary: `${idx.value.toLocaleString("vi-VN")}` };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div draggable onDragStart={handleDragStart}
      style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, flex: 1, minWidth: 0, cursor: "grab", position: "relative", userSelect: "none" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}
      onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
    >
      <DragHint />
      <div style={{ fontSize: 12, color: fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 4, fontWeight: 600, letterSpacing: "0.04em" }}>{idx.name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 4 }}>{idx.value.toLocaleString("vi-VN")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {isUp ? <TrendingUp size={14} color="#34C759" strokeWidth={1.5} /> : <TrendingDown size={14} color="#FF3B30" strokeWidth={1.5} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? "#34C759" : "#FF3B30", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {isUp ? "+" : ""}{idx.change.toFixed(2)} ({isUp ? "+" : ""}{idx.pct.toFixed(2)}%)
        </span>
      </div>
      {idx.sparkline.length > 1 && (
        <svg width="100%" height={32} viewBox={`0 0 ${idx.sparkline.length * 10} 32`} preserveAspectRatio="none" style={{ marginBottom: 6 }}>
          <polyline
            points={idx.sparkline.map((v, i) => `${i * 10 + 5},${32 - ((v - minS) / range) * 28}`).join(" ")}
            fill="none" stroke={isUp ? "#34C759" : "#FF3B30"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      )}
      <div style={{ fontSize: 12, color: fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif" }}>7 ngày gần nhất</div>
    </div>
  );
}

interface BriefRow { id: string; title: string; summary: string; type: string; tickers: string[] | null; created_at: string; }

interface DrawerBrief {
  id: string; title: string; type: string;
  date: string; time: string;
  parsedBrief: BriefOutput | null;
  rawContent: string;
  refs: Array<{ index: number; label: string; url: string }>;
}

function parseBriefContent(content: string): BriefOutput | null {
  try {
    const parsed = JSON.parse(content);
    const candidate = (parsed.sections || parsed.time) ? parsed
      : Object.values(parsed).find((v) =>
          v !== null && typeof v === "object" && ("sections" in (v as object) || "time" in (v as object))
        ) ?? null;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const brief = candidate as BriefOutput;
    if (!Array.isArray(brief.sections)) return null;
    return brief;
  } catch { return null; }
}
interface Headline { text: string; source_name: string; source_url: string; symbols: string[]; }
interface BriefRef { id: string; title: string; type: string; created_at: string; }
interface HighlightResult {
  headlines: Headline[];
  deep_summary: string | null;
  deep_brief_id: string | null;
  portfolio_impacts: string[];
  watchlist_items: string[];
  brief_refs: BriefRef[];
  from_briefs: boolean;
  from_cache: boolean;
  generated_at: string;
}

const tagColors: Record<string, { bg: string; text: string }> = {
  "Tích cực": { bg: "rgba(52,199,89,0.12)", text: "#34C759" },
  "Sự kiện":  { bg: "rgba(8,73,172,0.10)",  text: "#0849AC" },
  "Trung lập":{ bg: "rgba(26,26,46,0.08)",  text: "rgba(26,26,46,0.60)" },
  "Cảnh báo": { bg: "rgba(255,59,48,0.10)", text: "#FF3B30" },
};

// ── Dashboard component ─────────────────────────────────────────────────────
export function Dashboard({ onNavigate, onSelectTicker, isDark = false }: DashboardProps) {
  const cardBg      = isDark ? "#131824" : "#fff";
  const cardShadow  = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg          = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted     = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.60)";
  const fgSubtle    = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const divider     = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand       = isDark ? "#4D8FE8" : "#0849AC";
  const hoverBg     = isDark ? "#1a2438" : "#E8F0FE";

  const [marketExpanded, setMarketExpanded] = useState(true);
  const [drawerBrief, setDrawerBrief]     = useState<DrawerBrief | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  async function openBriefDrawer(briefId: string) {
    setDrawerLoading(true);
    setDrawerBrief(null);
    const { data } = await supabase
      .from("briefs")
      .select("id, title, type, content, created_at, refs")
      .eq("id", briefId)
      .single();
    if (data) {
      const d = new Date(data.created_at);
      setDrawerBrief({
        id: data.id,
        title: data.title ?? "",
        type: data.type ?? "",
        date: d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
        time: d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        parsedBrief: parseBriefContent(data.content ?? ""),
        rawContent: data.content ?? "",
        refs: Array.isArray(data.refs) ? data.refs : [],
      });
    }
    setDrawerLoading(false);
  }

  // ── Real data state ──────────────────────────────────────────────────────
  const [gainers,       setGainers]       = useState<MoverRow[]>([]);
  const [losers,        setLosers]        = useState<MoverRow[]>([]);
  const [sectors,       setSectors]       = useState<SectorRow[]>([]);
  const [dashNews,      setDashNews]      = useState<NewsItem[]>([]);
  const [watchHoldings, setWatchHoldings] = useState<WatchRow[]>([]);
  const [marketIndices, setMarketIndices] = useState<IndexState[]>([]);
  const [briefs,        setBriefs]        = useState<BriefRow[]>([]);
  const [highlight,     setHighlight]     = useState<HighlightResult | null>(null);
  const [highlightLoading, setHighlightLoading] = useState(true);
  const [moversLoading, setMoversLoading] = useState(true);
  const [newsLoading,   setNewsLoading]   = useState(true);
  const [watchLoading,  setWatchLoading]  = useState(true);
  const [briefsLoading, setBriefsLoading] = useState(true);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });

  // ── Data fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // ── Movers + Indices + Sectors ──────────────────────────────────────────
    async function loadMarketReturn(): Promise<{ gainers: MoverRow[]; losers: MoverRow[]; indices: IndexState[] } | null> {
      return loadMarket();
    }
    async function loadMarket(): Promise<{ gainers: MoverRow[]; losers: MoverRow[]; indices: IndexState[] } | null> {
      setMoversLoading(true);
      try {
        // Get latest date in prices_daily
        const { data: latestRow } = await supabase
          .from("prices_daily").select("date").order("date", { ascending: false }).limit(1).single();
        if (!latestRow || cancelled) return;

        const [pricesRes, stocksRes, indicesRes] = await Promise.all([
          supabase.from("prices_daily").select("symbol,open,close,volume").eq("date", latestRow.date),
          supabase.from("stocks").select("symbol,sector_name"),
          supabase.from("market_indices")
            .select("index_code,close,change_pct,date")
            .in("index_code", ["VNINDEX", "HNX"])
            .order("date", { ascending: false })
            .limit(20),
        ]);

        if (cancelled) return;

        // — Movers & Sectors —
        const prices = pricesRes.data ?? [];
        const sectorMap: Record<string, string> = {};
        stocksRes.data?.forEach((s: any) => { sectorMap[s.symbol] = s.sector_name || "Khác"; });

        const withPct = prices.map((p: any) => ({
          symbol: p.symbol,
          price: p.close,
          pct: p.open > 0 ? ((p.close - p.open) / p.open) * 100 : 0,
          vol: fmtVol(p.volume),
          sector: sectorMap[p.symbol] || "Khác",
        }));

        const sorted = [...withPct].sort((a: any, b: any) => b.pct - a.pct);
        setGainers(sorted.slice(0, 5).map((s: any) => ({
          symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol,
          isCeil: s.pct >= 6.9, isFloor: false,
        })));
        setLosers(sorted.slice(-5).reverse().map((s: any) => ({
          symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol,
          isCeil: false, isFloor: s.pct <= -6.9,
        })));

        const groups: Record<string, number[]> = {};
        withPct.forEach((p: any) => {
          if (!groups[p.sector]) groups[p.sector] = [];
          groups[p.sector].push(p.pct);
        });
        const sRows: SectorRow[] = Object.entries(groups)
          .map(([name, pcts]) => ({ name, pct: pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length }))
          .sort((a, b) => b.pct - a.pct).slice(0, 8);
        setSectors(sRows);

        // — Market Indices —
        const indexGroups: Record<string, { close: number; date: string; change_pct: number | null }[]> = {};
        indicesRes.data?.forEach((row: any) => {
          if (!indexGroups[row.index_code]) indexGroups[row.index_code] = [];
          indexGroups[row.index_code].push(row);
        });

        const idxResult: IndexState[] = [];
        for (const [code, rows] of Object.entries(indexGroups)) {
          const sortedRows = rows.sort((a: any, b: any) => a.date.localeCompare(b.date));
          const latest = sortedRows[sortedRows.length - 1];
          const prev   = sortedRows[sortedRows.length - 2];
          const spark  = sortedRows.slice(-7).map((r: any) => r.close);
          const change = prev ? latest.close - prev.close : 0;
          idxResult.push({
            name: code === "VNINDEX" ? "VN-INDEX" : "HNX-INDEX",
            value: latest.close, change, pct: latest.change_pct ?? 0, sparkline: spark, vol: "—",
          });
        }
        if (!cancelled && idxResult.length > 0) setMarketIndices(idxResult);

        const g = sorted.slice(0, 5).map((s: any) => ({ symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol, isCeil: s.pct >= 6.9, isFloor: false }));
        const l = sorted.slice(-5).reverse().map((s: any) => ({ symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol, isCeil: false, isFloor: s.pct <= -6.9 }));
        return { gainers: g, losers: l, indices: idxResult };
      } finally {
        if (!cancelled) setMoversLoading(false);
      }
      return null;
    }

    // ── News ─────────────────────────────────────────────────────────────────
    async function loadNews() {
      setNewsLoading(true);
      try {
        const { data } = await supabase
          .from("market_news")
          .select("title,published_at,label,article_url")
          .neq("label", "trash")
          .not("label", "is", null)
          .order("published_at", { ascending: false })
          .limit(4);
        if (!data || cancelled) return;
        setDashNews(data.map((n: any) => ({
          title: n.title,
          tag: normLabel(n.label),
          source: (() => { try { return new URL(n.article_url).hostname.replace("www.", ""); } catch { return "Wealbee"; } })(),
          time: relativeTime(n.published_at),
          url: n.article_url,
        })));
      } finally {
        if (!cancelled) setNewsLoading(false);
      }
    }

    // ── Portfolio watchlist — dùng portfolio_holdings ─────────────────────────
    async function loadWatchlist() {
      setWatchLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: rows } = await supabase
          .from("portfolio_holdings")
          .select("symbol, quantity, avg_cost")
          .eq("user_id", user.id)
          .limit(8);
        if (!rows?.length || cancelled) return;

        const symbols = rows.map((r: any) => r.symbol);
        const { data: latestRow } = await supabase
          .from("prices_daily").select("date").order("date", { ascending: false }).limit(1).single();

        const latestPrices: Record<string, number> = {};
        const latestChanges: Record<string, number> = {};
        const tickerNames: Record<string, string> = {};

        if (latestRow) {
          const [pricesRes, tickersRes] = await Promise.all([
            supabase.from("prices_daily").select("symbol,open,close").eq("date", latestRow.date).in("symbol", symbols),
            supabase.from("tickers").select("symbol,name").in("symbol", symbols),
          ]);
          pricesRes.data?.forEach((p: any) => {
            latestPrices[p.symbol] = Number(p.close);
            latestChanges[p.symbol] = p.open > 0 ? ((p.close - p.open) / p.open) * 100 : 0;
          });
          tickersRes.data?.forEach((t: any) => { tickerNames[t.symbol] = t.name; });
        }

        if (!cancelled) {
          setWatchHoldings(rows.map((r: any) => ({
            symbol: r.symbol,
            name: tickerNames[r.symbol] || r.symbol,
            quantity: Number(r.quantity),
            price: latestPrices[r.symbol] ?? 0,
            change: latestChanges[r.symbol] ?? 0,
          })));
        }
      } finally {
        if (!cancelled) setWatchLoading(false);
      }
    }

    // ── Briefs (AI analysis reports) ─────────────────────────────────────────
    async function loadBriefs() {
      setBriefsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from("briefs")
          .select("id,title,summary,type,tickers,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setBriefs((data ?? []) as BriefRow[]);
      } finally {
        if (!cancelled) setBriefsLoading(false);
      }
    }

    // ── AI Highlight card (calls dashboard-highlight edge function) ────────────
    async function loadHighlight(marketData: { gainers: MoverRow[]; losers: MoverRow[]; indices: IndexState[] }) {
      setHighlightLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/dashboard-highlight`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ market: marketData }),
        });
        if (res.ok && !cancelled) {
          const data = await res.json() as HighlightResult;
          // Filter out company profile headlines (server-side filter may miss edge cases)
          if (data.headlines) {
            data.headlines = data.headlines.filter(h =>
              h.text && !/^[-–—]\s/.test(h.text) && !h.text.includes("Hoạt động KD")
            );
          }
          setHighlight(data);
        }
      } catch { /* ignore, fallback to market bullets */ }
      finally { if (!cancelled) setHighlightLoading(false); }
    }

    async function loadAll() {
      // Load market first, then use it for highlight context
      const marketData = await loadMarketReturn();
      if (!cancelled && marketData) {
        loadHighlight(marketData);
      }
      loadNews();
      loadWatchlist();
      loadBriefs();
    }

    loadAll();

    return () => { cancelled = true; };
  }, []);

  // ── Computed portfolio summary ────────────────────────────────────────────
  const portfolioTotal = watchHoldings.reduce((s, h) => s + h.price * h.quantity, 0);

  const handleNewsDragStart = (e: React.DragEvent, item: NewsItem) => {
    const card: ContextCard = { id: `news-${item.title.slice(0, 20)}`, type: "news", label: item.title.length > 32 ? item.title.slice(0, 32) + "…" : item.title, badge: item.tag, summary: `${item.source} · ${item.time} trước` };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleReportDragStart = (e: React.DragEvent, card: ContextCard) => {
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handlePortfolioDragStart = (e: React.DragEvent) => {
    const card: ContextCard = {
      id: "portfolio-main",
      type: "portfolio",
      label: "Danh mục của bạn",
      badge: watchHoldings.length > 0 ? `${watchHoldings.length} mã` : "Chưa có dữ liệu",
      summary: portfolioTotal > 0 ? `Tổng: ${portfolioTotal.toLocaleString("vi-VN")} đ · ${watchHoldings.map(h => h.symbol).join(" ")}` : "Chưa có holdings",
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <>
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>

      {/* Greeting header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: fgSubtle, marginBottom: 2 }}>{dateStr} · {timeStr}</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: fg, margin: 0 }}>Chào buổi sáng.</h1>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: cardBg, cursor: "pointer", fontSize: 13, fontWeight: 600, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}
          onClick={() => window.location.reload()}>
          <RefreshCw size={14} strokeWidth={1.5} /> Làm mới
        </button>
      </div>

      {/* AI Highlights — parsed from real briefs + LLM impacts */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: brand, display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} strokeWidth={1.5} color={brand} /> ĐIỂM NỔI BẬT HÔM NAY
          </div>
          {!highlightLoading && highlight?.brief_refs?.[0] && (
            <button onClick={() => openBriefDrawer(highlight.brief_refs[0].id)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.07)", color: brand }}>
                {highlight.brief_refs[0].type === "daily_digest" ? "Bản tin hàng ngày" : "Deep Research"} · {relativeTime(highlight.brief_refs[0].created_at)}
              </span>
              <ExternalLink size={10} strokeWidth={1.5} color={fgSubtle} />
            </button>
          )}
        </div>

        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />

        {/* Loading skeleton */}
        {highlightLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[100, 90, 85, 70].map((w, i) => (
              <div key={i} style={{ height: 18, borderRadius: 5, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.06)", width: `${w}%` }} />
            ))}
            <div style={{ fontSize: 12, color: fgSubtle, marginTop: 2 }}>AI đang tổng hợp bản tin của bạn…</div>
          </div>
        )}

        {!highlightLoading && !highlight?.from_briefs && (
          <p style={{ margin: 0, fontSize: 14, color: fgSubtle, textAlign: "center", padding: "12px 0" }}>
            Chưa có bản tin nào trong 30 ngày · Đặt lịch chạy agent <strong>Tổng hợp Tin tức</strong> để cập nhật mỗi sáng
          </p>
        )}

        {!highlightLoading && highlight?.from_briefs && (
          <>
            {/* Headlines with inline source citations */}
            {(highlight.headlines ?? []).length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                {highlight.headlines.map((h, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
                    <span style={{ color: brand, marginTop: 2, flexShrink: 0 }}>•</span>
                    <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>
                      {h.text}
                      {h.source_name && (
                        h.source_url
                          ? <a href={h.source_url} target="_blank" rel="noopener noreferrer"
                              style={{ marginLeft: 3, textDecoration: "none" }}
                              title={`Nguồn: ${h.source_name}`}>
                              <sup style={{ fontSize: 10, color: brand, fontWeight: 700, textDecoration: "underline" }}>[{h.source_name}]</sup>
                            </a>
                          : <button onClick={() => onNavigate("inbox")}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 3 }}>
                              <sup style={{ fontSize: 10, color: brand, fontWeight: 700, textDecoration: "underline" }}>[{h.source_name}]</sup>
                            </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: fgSubtle }}>
                {highlight.deep_summary
                  ? null
                  : "Không có tin tức thị trường hôm nay · Xem phân tích chi tiết trong bản tin"}
              </p>
            )}

            {/* Deep Research insight */}
            {highlight.deep_summary && (
              <>
                <div style={{ height: "0.5px", background: divider, margin: "14px 0" }} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(124,58,237,0.10)", color: "#7C3AED", flexShrink: 0, marginTop: 1 }}>
                    Deep Research
                  </span>
                  <button
                    onClick={() => highlight.deep_brief_id ? openBriefDrawer(highlight.deep_brief_id) : onNavigate("inbox")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", flex: 1, minWidth: 0, display: "block", width: "100%" }}>
                    <span style={{ fontSize: 14, color: fgMuted, lineHeight: 1.5, wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "normal", display: "block" }}>{highlight.deep_summary}</span>
                  </button>
                </div>
              </>
            )}

            {/* Ý nghĩa với danh mục */}
            {(highlight.portfolio_impacts ?? []).length > 0 && (
              <>
                <div style={{ height: "0.5px", background: divider, margin: "16px 0" }} />
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366F1", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Lightbulb size={12} strokeWidth={1.5} color="#6366F1" /> Ý NGHĨA VỚI DANH MỤC
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {highlight.portfolio_impacts.map((impact, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
                      <span style={{ color: "#6366F1", marginTop: 2, flexShrink: 0 }}>•</span>
                      <span>{impact}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Cần theo dõi */}
            {(highlight.watchlist_items ?? []).length > 0 && (
              <>
                <div style={{ height: "0.5px", background: divider, margin: "16px 0" }} />
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FF9500", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={12} strokeWidth={1.5} color="#FF9500" /> CẦN THEO DÕI
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {highlight.watchlist_items.map((item, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ color: "#FF9500", marginTop: 2, flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: 15, color: fg, lineHeight: 1.5 }}>
                        {item}{" "}
                        <button
                          onClick={() => highlight?.brief_refs?.[0] ? openBriefDrawer(highlight.brief_refs[0].id) : onNavigate("inbox")}
                          style={{ background: "none", border: "none", color: brand, cursor: "pointer", fontSize: 13, fontFamily: "'Montserrat', system-ui, sans-serif", padding: 0, textDecoration: "underline" }}>
                          → xem brief
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {/* Market section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg }}>CHỈ SỐ THỊ TRƯỜNG</span>
        <button onClick={() => setMarketExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, color: fgSubtle, transition: "background 120ms ease" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>{marketExpanded ? "Ẩn" : "Hiện"}</span>
          <ChevronDown size={14} strokeWidth={2} style={{ transform: marketExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 250ms ease" }} />
        </button>
      </div>

      <div style={{ overflow: "hidden", maxHeight: marketExpanded ? 2000 : 0, opacity: marketExpanded ? 1 : 0, transition: "max-height 350ms ease, opacity 200ms ease" }}>

        {/* Index Cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {moversLoading && marketIndices.length === 0 ? (
            [0, 1].map(i => <div key={i} style={{ flex: 1, background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, height: 130, opacity: 0.5 }} />)
          ) : (
            marketIndices.map(idx => <IndexCard key={idx.name} idx={idx} isDark={isDark} />)
          )}
        </div>

        {/* Top Movers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {/* TĂNG MẠNH */}
          {(() => {
            const gainCard: ContextCard = { id: "top-gainers", type: "mover", label: "Tăng mạnh hôm nay", badge: `${gainers.length} mã`, summary: gainers.map(s => `${s.symbol} +${s.pct.toFixed(2)}%`).join(" · ") };
            return (
              <div {...makeDragHandlers(gainCard)}
                style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
                <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <TrendingUp size={15} color="#34C759" strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>TĂNG MẠNH</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {moversLoading && gainers.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    : gainers.map(s => {
                      const rowCard: ContextCard = { id: `gain-${s.symbol}`, type: "mover", label: s.symbol, badge: `+${s.pct.toFixed(2)}%`, summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}` };
                      return (
                        <div key={s.symbol} {...makeDragHandlers(rowCard)} onClick={() => onSelectTicker?.(s.symbol)}
                          style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                          <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                          <span style={{ marginRight: 8 }}><MoverPctBadge value={s.pct} isCeil={s.isCeil} /></span>
                          <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })()}

          {/* GIẢM MẠNH */}
          {(() => {
            const lossCard: ContextCard = { id: "top-losers", type: "mover", label: "Giảm mạnh hôm nay", badge: `${losers.length} mã`, summary: losers.map(s => `${s.symbol} ${s.pct.toFixed(2)}%`).join(" · ") };
            return (
              <div {...makeDragHandlers(lossCard)}
                style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
                <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <TrendingDown size={15} color="#FF3B30" strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>GIẢM MẠNH</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {moversLoading && losers.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    : losers.map(s => {
                      const rowCard: ContextCard = { id: `loss-${s.symbol}`, type: "mover", label: s.symbol, badge: `${s.pct.toFixed(2)}%`, summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}` };
                      return (
                        <div key={s.symbol} {...makeDragHandlers(rowCard)} onClick={() => onSelectTicker?.(s.symbol)}
                          style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                          <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                          <span style={{ marginRight: 8 }}><MoverPctBadge value={s.pct} isFloor={s.isFloor} /></span>
                          <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Heatmap Ngành */}
        {sectors.length > 0 && (() => {
          const heatmapCard: ContextCard = { id: "heatmap-nganh", type: "index", label: "Heatmap ngành", badge: dateStr, summary: sectors.map(s => `${s.name}: ${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(1)}%`).join(" · ") };
          return (
            <div {...makeDragHandlers(heatmapCard)}
              style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, marginBottom: 16, position: "relative", cursor: "grab", userSelect: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
              <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>HEATMAP NGÀNH</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                {sectors.map(s => {
                  const col = getSectorColor(s.pct);
                  return (
                    <div key={s.name} style={{ padding: "12px 14px", borderRadius: 10, background: col.bg, cursor: "pointer", transition: "opacity 150ms ease" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 4 }}>{s.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: col.text }}>{s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      </div>{/* end market collapsible */}

      {/* Portfolio watchlist */}
      <div draggable onDragStart={handlePortfolioDragStart}
        onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
        style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16, cursor: "grab", position: "relative", userSelect: "none" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
        <DragHint />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg, marginBottom: 4 }}>DANH MỤC CỦA BẠN</div>
            {watchLoading ? (
              <div style={{ fontSize: 22, color: fgSubtle }}>Đang tải…</div>
            ) : watchHoldings.length > 0 ? (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, color: fg }}>{portfolioTotal.toLocaleString("vi-VN")} đ</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: fgSubtle }}>{watchHoldings.length} mã</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: fgSubtle }}>Chưa có holdings — thêm mã trong trang Danh mục</div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onNavigate("portfolio"); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            Xem danh mục <ArrowUpRight size={14} strokeWidth={1.5} />
          </button>
        </div>

        {watchHoldings.length > 0 && (
          <>
            <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {watchHoldings.map(h => (
                <div key={h.symbol} onClick={() => onSelectTicker?.(h.symbol)}
                  style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 60, fontWeight: 700, fontSize: 14, color: fg }}>{h.symbol}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  <span style={{ width: 80, fontSize: 14, fontWeight: 600, color: fg, textAlign: "right" }}>{h.price.toLocaleString("vi-VN")}</span>
                  <div style={{ width: 80, display: "flex", justifyContent: "flex-end" }}><PctBadge value={h.change} /></div>
                  <div style={{ width: 90, display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 12, color: "#34C759" }}>●</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* News */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>TIN TỨC</div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {newsLoading && dashNews.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 90, borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"), background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }} />
            ))
          ) : dashNews.map((item, i) => {
            const tagStyle = tagColors[item.tag] ?? tagColors["Trung lập"];
            return (
              <div key={i} draggable
                onDragStart={e => handleNewsDragStart(e, item)}
                onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                style={{ padding: "12px 14px", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"), borderRadius: 10, cursor: "grab", position: "relative", userSelect: "none", transition: "all 150ms ease" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.transform = "none"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
                <DragHint />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: tagStyle.bg, color: tagStyle.text }}>{item.tag}</span>
                  <span style={{ fontSize: 12, color: fgSubtle }}>{item.source} · {item.time} trước</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: fg, lineHeight: 1.5 }}>{item.title}</p>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, color: brand, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                    Đọc thêm <ArrowUpRight size={13} strokeWidth={1.5} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis Reports — từ briefs DB */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg }}>BÁO CÁO PHÂN TÍCH</div>
          <button onClick={() => onNavigate("inbox")} style={{ fontSize: 12, fontWeight: 600, color: brand, background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            Xem tất cả →
          </button>
        </div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 14 }} />

        {briefsLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 72, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.04)" }} />)}
          </div>
        )}

        {!briefsLoading && briefs.length === 0 && (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <FileText size={28} style={{ color: fgSubtle, marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: fgSubtle, margin: 0 }}>Chưa có báo cáo — chạy Agent để tạo phân tích</p>
            <button onClick={() => onNavigate("agents")} style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: brand, background: "transparent", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              Tới Agents →
            </button>
          </div>
        )}

        {!briefsLoading && briefs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {briefs.map((brief, i) => {
              const card: ContextCard = { id: `brief-${brief.id}`, type: "report", label: brief.title.slice(0, 50), badge: "Wealbee AI", summary: brief.summary?.slice(0, 80) ?? "" };
              return (
                <div key={brief.id} draggable
                  onDragStart={e => handleReportDragStart(e, card)}
                  onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                  style={{ padding: "14px 0", borderBottom: i < briefs.length - 1 ? "0.5px solid " + divider : "none", cursor: "grab", position: "relative", userSelect: "none", transition: "background 100ms" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.025)"; (e.currentTarget as HTMLElement).style.margin = "0 -20px"; (e.currentTarget as HTMLElement).style.padding = "14px 20px"; const h = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.margin = "0"; (e.currentTarget as HTMLElement).style.padding = "14px 0"; const h = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
                  <DragHint />
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, #0a2a6e 0%, #1a56c8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={20} color="rgba(255,255,255,0.90)" strokeWidth={1.5} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: fg, lineHeight: 1.4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{brief.title}</div>
                        <button onClick={e => { e.stopPropagation(); openBriefDrawer(brief.id); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"), background: "transparent", color: brand, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                          <Eye size={12} strokeWidth={1.5} /> Xem
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: brief.summary ? 6 : 0, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: fgSubtle }}>Wealbee AI · {relativeTime(brief.created_at)}</span>
                        {brief.tickers?.slice(0, 4).map(t => (
                          <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", color: brand }}>{t}</span>
                        ))}
                      </div>
                      {brief.summary && <p style={{ margin: 0, fontSize: 13, color: fgMuted, lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{brief.summary}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>

    {/* ── Brief Drawer ────────────────────────────────────────────────────── */}
    {(drawerLoading || drawerBrief) && (
      <>
        {/* Backdrop */}
        <div
          onClick={() => { setDrawerBrief(null); setDrawerLoading(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, backdropFilter: "blur(2px)" }}
        />
        {/* Panel */}
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(740px, 100vw)",
          background: isDark ? "#131824" : "#fff",
          zIndex: 201, display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.25)",
        }}>
          {/* Drawer header */}
          <div style={{
            padding: "14px 20px", borderBottom: `0.5px solid ${divider}`,
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: drawerBrief?.type === "deep_research"
                ? "linear-gradient(135deg,#6366F1,#8B5CF6)"
                : "linear-gradient(135deg,#0849AC,#1a56c8)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <BookOpen size={14} color="white" strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: fgSubtle, marginBottom: 1 }}>
                {drawerBrief?.type === "deep_research" ? "Deep Research" : "Bản tin hàng ngày"}
                {drawerBrief && ` · ${drawerBrief.date} · ${drawerBrief.time}`}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {drawerLoading ? "Đang tải…" : (drawerBrief?.title ?? "")}
              </div>
            </div>
            <button
              onClick={() => { setDrawerBrief(null); setDrawerLoading(false); }}
              style={{ padding: 6, borderRadius: 8, border: `0.5px solid ${divider}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: fgMuted }}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Drawer content */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 48px" }}>
            {drawerLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[100, 75, 90, 65, 80, 55, 88].map((w, i) => (
                  <div key={i} style={{ height: 15, borderRadius: 5, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", width: `${w}%` }} />
                ))}
              </div>
            )}
            {!drawerLoading && drawerBrief && (
              drawerBrief.parsedBrief
                ? <BriefRenderer brief={drawerBrief.parsedBrief} isDark={isDark} />
                : <MdContent text={drawerBrief.rawContent} refs={drawerBrief.refs} />
            )}
          </div>
        </div>
      </>
    )}
    </>
  );
}
