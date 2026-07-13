import { useState, useEffect } from "react";
import { Search, Star, SlidersHorizontal } from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { fmtStockPrice } from "../../lib/format-price";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickerRow {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  in_vn30: boolean;
}

interface PriceRow {
  symbol: string;
  open: number;
  close: number;
  volume: number;
}

interface DisplayTicker {
  symbol: string;
  name: string;
  price: number;
  change: number;   // % change (close vs open, intraday)
  volume: string;
  sector: string;
  exchange: string;
  in_vn30: boolean;
}

// ─── PctBadge ─────────────────────────────────────────────────────────────────

function PctBadge({ value }: { value: number }) {
  const isUp   = value > 0;
  const isDown = value < 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      width: "fit-content",
      background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)",
      color: isUp ? "#34C759" : isDown ? "#FF3B30" : "#3D3D52",
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function SkeletonRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 90px 100px 40px", padding: "12px 16px", borderBottom: "0.5px solid rgba(8,73,172,0.08)", alignItems: "center", gap: 8 }}>
      {[80, 180, 70, 60, 50, 60, 20].map((w, i) => (
        <div key={i} style={{ height: 12, width: w, borderRadius: 6, background: "rgba(8,73,172,0.07)", animation: "pulse 1.4s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

const TABS = ["Tất cả", "VN30", "Watchlist"];
const SORT_OPTIONS = ["Thay đổi", "Thanh khoản", "Ngành"];

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

// ─── Main component ───────────────────────────────────────────────────────────

export function Tickers({
  onSelectTicker,
  isDark = false,
}: {
  onNavigate?: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  isDark?: boolean;
}) {
  const cardBg     = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg         = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted    = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle   = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const divider    = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand      = isDark ? "#4D8FE8" : "#0849AC";
  const bgMuted    = isDark ? "#0f1220" : "#F5F5F7";
  const hoverBg    = isDark ? "#1a2438" : "#E8F0FE";
  const FONT       = "'Montserrat', system-ui, sans-serif";

  const [tickers,   setTickers]   = useState<DisplayTicker[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [activeTab, setActiveTab] = useState("Tất cả");
  const [sortBy,    setSortBy]    = useState("Thay đổi");
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // ── Load real data ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadTickers();
    loadWatchlist();
  }, []);

  const loadTickers = async () => {
    setLoading(true);
    try {
      // 1. Get all tickers
      const { data: tickerRows } = await supabase
        .from("tickers")
        .select("symbol, name, sector, exchange, in_vn30")
        .order("symbol");

      if (!tickerRows?.length) { setLoading(false); return; }

      // 2. Get latest date's prices
      const { data: latestRow } = await supabase
        .from("prices_daily")
        .select("date")
        .order("date", { ascending: false })
        .limit(1)
        .single();

      const priceMap: Record<string, PriceRow> = {};
      if (latestRow) {
        const syms = tickerRows.map((t: TickerRow) => t.symbol);
        const { data: prices } = await supabase
          .from("prices_daily")
          .select("symbol, open, close, volume")
          .eq("date", latestRow.date)
          .in("symbol", syms);

        prices?.forEach((p: PriceRow) => { priceMap[p.symbol] = p; });
      }

      const display: DisplayTicker[] = tickerRows.map((t: TickerRow) => {
        const p = priceMap[t.symbol];
        const close  = p ? Number(p.close)  : 0;
        const open   = p ? Number(p.open)   : 0;
        const change = open > 0 ? ((close - open) / open) * 100 : 0;
        return {
          symbol:   t.symbol,
          name:     t.name,
          price:    close,
          change,
          volume:   p ? fmtVol(Number(p.volume)) : "—",
          sector:   t.sector || "—",
          exchange: t.exchange || "HOSE",
          in_vn30:  t.in_vn30 ?? false,
        };
      });

      setTickers(display);
    } finally {
      setLoading(false);
    }
  };

  const loadWatchlist = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: wl } = await supabase
      .from("watchlists")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single();
    if (!wl) return;
    const { data: items } = await supabase
      .from("watchlist_items")
      .select("symbol")
      .eq("watchlist_id", wl.id);
    if (items) setWatchlist(new Set(items.map((i: any) => i.symbol)));
  };

  const toggleWatchlist = async (symbol: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get or create default watchlist
    let { data: wl } = await supabase
      .from("watchlists").select("id").eq("user_id", user.id).eq("is_default", true).single();
    if (!wl) {
      const { data: newWl } = await supabase
        .from("watchlists").insert({ user_id: user.id, name: "Watchlist chính", is_default: true }).select("id").single();
      wl = newWl;
    }
    if (!wl) return;

    const next = new Set(watchlist);
    if (next.has(symbol)) {
      next.delete(symbol);
      await supabase.from("watchlist_items").delete().eq("watchlist_id", wl.id).eq("symbol", symbol);
    } else {
      next.add(symbol);
      await supabase.from("watchlist_items").upsert({ watchlist_id: wl.id, symbol }, { onConflict: "watchlist_id,symbol" });
    }
    setWatchlist(next);
  };

  // ── Filter + sort ───────────────────────────────────────────────────────────
  let filtered = tickers.filter(t => {
    const q = search.toLowerCase();
    return t.symbol.toLowerCase().includes(q)
      || t.name.toLowerCase().includes(q)
      || t.sector.toLowerCase().includes(q);
  });

  if (activeTab === "VN30")     filtered = filtered.filter(t => t.in_vn30);
  if (activeTab === "Watchlist") filtered = filtered.filter(t => watchlist.has(t.symbol));

  if (sortBy === "Thay đổi")   filtered = [...filtered].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  if (sortBy === "Thanh khoản") filtered = [...filtered].sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));
  if (sortBy === "Ngành")       filtered = [...filtered].sort((a, b) => a.sector.localeCompare(b.sector));

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", fontFamily: FONT }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: "0 0 4px" }}>Tickers</h1>
        <span style={{ fontSize: 13, color: fgSubtle }}>
          {loading ? "Đang tải…" : `${tickers.length} mã · dữ liệu từ Supabase`}
        </span>
      </div>

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: cardBg, border: "0.5px solid " + divider,
        borderRadius: 10, padding: "0 16px", height: 48, marginBottom: 12,
        boxShadow: isDark ? "0 1px 3px rgba(0,0,0,0.30)" : "0 1px 3px rgba(8,73,172,0.06)",
      }}>
        <Search size={18} strokeWidth={1.5} color={fgSubtle} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm mã cổ phiếu (VD: HPG, FPT, Ngân hàng...)"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: fg, fontFamily: FONT }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: fgSubtle, padding: 4, fontSize: 16 }}>×</button>
        )}
      </div>

      {/* Tabs + Sort */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: activeTab === tab ? brand : "transparent",
              color: activeTab === tab ? "#fff" : fgMuted,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "all 150ms ease", fontFamily: FONT,
            }}>
              {tab}
              {tab === "Watchlist" && watchlist.size > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 11,
                  background: activeTab === tab ? "rgba(255,255,255,0.25)" : isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.12)",
                  color: activeTab === tab ? "#fff" : brand,
                  borderRadius: 99, padding: "0px 5px",
                }}>
                  {watchlist.size}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SlidersHorizontal size={14} color={fgSubtle} strokeWidth={1.5} />
          {SORT_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setSortBy(opt)} style={{
              padding: "4px 10px", borderRadius: 6, border: "none",
              background: sortBy === opt ? (isDark ? "rgba(77,143,232,0.18)" : "rgba(8,73,172,0.08)") : "transparent",
              color: sortBy === opt ? brand : fgSubtle,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            }}>{opt}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: cardBg, borderRadius: 14, boxShadow: cardShadow, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{
          display: "grid", gridTemplateColumns: "80px 1fr 110px 100px 90px 100px 40px",
          padding: "10px 16px", borderBottom: "0.5px solid " + divider, background: bgMuted,
        }}>
          {["Mã", "Tên công ty", "Giá", "Thay đổi", "KL", "Ngành", ""].map(col => (
            <div key={col} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>{col}</div>
          ))}
        </div>

        {/* Loading skeletons */}
        {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: "center" }}>
            {activeTab === "Watchlist" ? (
              <>
                <Star size={32} color={fgSubtle} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                <p style={{ fontSize: 15, color: fgSubtle, margin: "0 0 8px" }}>Watchlist của bạn trống</p>
                <p style={{ fontSize: 13, color: fgSubtle, margin: 0 }}>Nhấn ★ trên bất kỳ mã nào để thêm</p>
              </>
            ) : (
              <p style={{ fontSize: 15, color: fgSubtle, margin: 0 }}>
                {search ? `Không tìm thấy mã "${search}"` : "Chưa có dữ liệu"}
              </p>
            )}
          </div>
        )}

        {/* Rows */}
        {!loading && filtered.map((ticker, i) => {
          const card: ContextCard = {
            id: `ticker-${ticker.symbol}`,
            type: "ticker",
            label: ticker.symbol,
            badge: `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(2)}%`,
            summary: `${ticker.name} · ${fmtStockPrice(ticker.price)} · KL: ${ticker.volume}`,
          };
          return (
            <div
              key={ticker.symbol}
              {...makeDragHandlers(card)}
              onClick={() => onSelectTicker?.(ticker.symbol)}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 110px 100px 90px 100px 40px",
                padding: "11px 16px",
                borderBottom: i < filtered.length - 1 ? "0.5px solid " + divider : "none",
                cursor: "pointer", transition: "background 80ms ease",
                alignItems: "center",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ fontWeight: 700, fontSize: 14, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{ticker.symbol}</span>
              <span style={{ fontSize: 13, color: fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticker.name}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                {ticker.price > 0 ? fmtStockPrice(ticker.price) : "—"}
              </span>
              <PctBadge value={ticker.change} />
              <span style={{ fontSize: 13, color: fgMuted, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{ticker.volume}</span>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 6, width: "fit-content",
                background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.06)",
                color: fgMuted,
              }}>{ticker.sector}</span>
              <button
                onClick={e => { e.stopPropagation(); toggleWatchlist(ticker.symbol); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
                title={watchlist.has(ticker.symbol) ? "Xóa khỏi Watchlist" : "Thêm vào Watchlist"}
              >
                <Star
                  size={16} strokeWidth={1.5}
                  fill={watchlist.has(ticker.symbol) ? "#FFD60A" : "none"}
                  color={watchlist.has(ticker.symbol) ? "#FFD60A" : fgSubtle}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: fgSubtle, textAlign: "center" }}>
        Dữ liệu từ Supabase · Chỉ mang tính tham khảo · Không phải khuyến nghị đầu tư
      </p>
    </div>
  );
}
