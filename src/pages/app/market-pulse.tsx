/**
 * MarketPulse — Trang thị trường với data THẬT từ Supabase:
 *  - market_indices  → chỉ số VN-INDEX, HNX (sparkline 7 ngày)
 *  - prices_daily    → top movers (9 symbols hiện có)
 *  - stocks          → sector map cho heatmap
 *  - market_news     → tin thị trường mới nhất
 */
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Clock, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { IndexDetailModal } from "../../components/index-detail-modal";

// ── Types ──────────────────────────────────────────────────────────────────
interface MoverRow { symbol: string; price: number; pct: number; vol: string; isCeil: boolean; isFloor: boolean; }
interface SectorRow { name: string; pct: number; }
interface NewsRow   { title: string; sentiment: string; source: string; time: string; url?: string; }
interface IndexState { name: string; value: number; pt: number; pct: number; spark: number[]; vol: string; }

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

// ── Sub-components ─────────────────────────────────────────────────────────
function PctBadge({ value, ceilingFloor }: { value: number; ceilingFloor?: "ceil" | "floor" }) {
  if (ceilingFloor === "ceil")
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(124,58,237,0.12)", color: "#7C3AED", fontFamily: "'Montserrat', system-ui, sans-serif" }}>+{value.toFixed(2)}%</span>;
  if (ceilingFloor === "floor")
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{value.toFixed(2)}%</span>;
  const isUp = value > 0, isDown = value < 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "#3D3D52", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function getSentimentColor(s: string, isDark: boolean) {
  if (s === "Tích cực" || s === "positive") return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (s === "Cảnh báo" || s === "negative") return { bg: "rgba(255,59,48,0.10)", text: "#FF3B30" };
  return isDark ? { bg: "rgba(255,255,255,0.08)", text: "rgba(240,242,255,0.85)" } : { bg: "rgba(26,26,46,0.08)", text: "#3D3D52" };
}

function getSectorColor(pct: number) {
  if (pct >= 2)    return { bg: "rgba(52,199,89,0.25)", text: "#1a7a3a" };
  if (pct >= 0.5)  return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (pct >= 0)    return { bg: "rgba(52,199,89,0.06)", text: "#0ea5a0" };
  if (pct >= -0.5) return { bg: "rgba(255,59,48,0.06)", text: "#FF3B30" };
  if (pct >= -2)   return { bg: "rgba(255,59,48,0.12)", text: "#FF3B30" };
  return { bg: "rgba(255,59,48,0.25)", text: "#cc1010" };
}

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

// ── Label normaliser ───────────────────────────────────────────────────────
function normLabel(label: string | null): string {
  if (!label) return "Trung lập";
  const l = label.toLowerCase();
  if (l.includes("positive") || l.includes("tích")) return "Tích cực";
  if (l.includes("negative") || l.includes("cảnh") || l.includes("warning")) return "Cảnh báo";
  if (l.includes("event") || l.includes("sự kiện")) return "Sự kiện";
  return label;
}

// ─────────────────────────────────────────────────────────────────────────────
export function MarketPulse({
  onNavigate: _onNavigate,
  onSelectTicker,
  isDark = false,
}: {
  onNavigate: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  isDark?: boolean;
}) {
  const cardBg    = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08)";
  const fg        = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgSubtle  = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const divider   = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand     = isDark ? "#4D8FE8" : "#0849AC";
  const hoverBg   = isDark ? "#1a2438" : "#E8F0FE";

  // ── State ────────────────────────────────────────────────────────────────
  const [gainers,  setGainers]  = useState<MoverRow[]>([]);
  const [losers,   setLosers]   = useState<MoverRow[]>([]);
  const [sectors,  setSectors]  = useState<SectorRow[]>([]);
  const [newsItems, setNewsItems] = useState<NewsRow[]>([]);
  const [indices,  setIndices]  = useState<IndexState[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastDate, setLastDate] = useState<string>("—");
  const [detailIdx, setDetailIdx] = useState<{ code: "VNINDEX" | "HNX"; name: string } | null>(null);

  // ── Data fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      await Promise.all([loadMovers(), loadIndices(), loadNews()]);
      if (!cancelled) setLoading(false);
    }

    async function loadMovers() {
      const { data: latestRow } = await supabase
        .from("prices_daily").select("date").order("date", { ascending: false }).limit(1).single();
      if (!latestRow || cancelled) return;

      const dateStr = new Date(latestRow.date).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
      if (!cancelled) setLastDate(dateStr);

      // Cửa sổ 10 ngày thay vì đúng 1 ngày global mới nhất: job realtime trong
      // phiên chỉ cập nhật HÔM NAY cho VN30 ∪ portfolio (~30 mã), không phủ hết
      // mọi mã mọi sàn — nếu ép theo đúng 1 ngày global, mã nào (đặc biệt toàn
      // bộ HNX/UPCOM) chưa có dữ liệu hôm nay sẽ bị loại hẳn khỏi danh sách.
      // Mỗi mã tự lấy DÒNG MỚI NHẤT CỦA RIÊNG NÓ trong cửa sổ này.
      const windowCutoff = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 10);
        return d.toISOString().slice(0, 10);
      })();
      // Tiebreaker phụ (id) bắt buộc: hàng nghìn dòng trùng "date" mỗi ngày,
      // chỉ order theo date thì Postgres không đảm bảo thứ tự ổn định giữa các
      // trang .range() → có thể làm rớt hẳn 1 dòng của 1 mã ở ranh giới trang.
      const rows: any[] = [];
      for (let from = 0; from < 16000; from += 1000) {
        const { data } = await supabase.from("prices_daily").select("symbol,date,open,close,volume")
          .gte("date", windowCutoff).order("date", { ascending: false }).order("id", { ascending: false }).range(from, from + 999);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      if (!rows.length || cancelled) return;

      const latestBySym = new Map<string, any>();
      for (const r of rows) if (!latestBySym.has(r.symbol)) latestBySym.set(r.symbol, r); // rows đã sort date desc
      const prices = [...latestBySym.values()];

      // Filter to only symbols in price data to avoid Supabase 1000-row default limit missing VN30 symbols
      const priceSymbols = prices.map((p: any) => p.symbol);
      const { data: stocksInfo } = priceSymbols.length > 0
        ? await supabase.from("stocks").select("symbol,sector_name").in("symbol", priceSymbols)
        : { data: [] };

      const sectorMap: Record<string, string> = {};
      stocksInfo?.forEach((s: any) => { sectorMap[s.symbol] = s.sector_name || "Khác"; });

      const withPct = prices.map((p: any) => ({
        symbol: p.symbol,
        price: p.close,
        pct: p.open > 0 ? ((p.close - p.open) / p.open) * 100 : 0,
        vol: fmtVol(p.volume),
        sector: sectorMap[p.symbol] || "Khác",
      }));

      const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
      if (!cancelled) {
        setGainers(sorted.slice(0, 5).map(s => ({
          symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol,
          isCeil: s.pct >= 6.9, isFloor: false,
        })));
        setLosers(sorted.slice(-5).reverse().map(s => ({
          symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol,
          isCeil: false, isFloor: s.pct <= -6.9,
        })));

        // Sector heatmap
        const groups: Record<string, number[]> = {};
        withPct.forEach((p: any) => {
          if (!groups[p.sector]) groups[p.sector] = [];
          groups[p.sector].push(p.pct);
        });
        const sRows: SectorRow[] = Object.entries(groups)
          .map(([name, pcts]) => ({ name, pct: pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 8);
        setSectors(sRows);
      }
    }

    async function loadIndices() {
      const { data } = await supabase
        .from("market_indices")
        .select("index_code,close,change_pct,date,volume")
        .in("index_code", ["VNINDEX", "HNX"])
        .order("date", { ascending: false })
        .limit(20);
      if (!data || cancelled) return;

      const groups: Record<string, { close: number; date: string; change_pct: number | null; volume: number | null }[]> = {};
      data.forEach((row: any) => {
        if (!groups[row.index_code]) groups[row.index_code] = [];
        groups[row.index_code].push(row);
      });

      const result: IndexState[] = [];
      for (const [code, rows] of Object.entries(groups)) {
        const sortedRows = rows.sort((a: any, b: any) => a.date.localeCompare(b.date));
        const latest = sortedRows[sortedRows.length - 1];
        const prev   = sortedRows[sortedRows.length - 2];
        const spark  = sortedRows.slice(-7).map((r: any) => r.close);
        const pt     = prev ? latest.close - prev.close : 0;
        result.push({
          name: code === "VNINDEX" ? "VN-INDEX" : "HNX-INDEX",
          value: latest.close,
          pt,
          pct: latest.change_pct ?? 0,
          spark,
          vol: fmtVol(latest.volume),
        });
      }
      if (!cancelled && result.length > 0) setIndices(result);
    }

    async function loadNews() {
      const { data } = await supabase
        .from("market_news")
        .select("title,published_at,label,article_url")
        .neq("label", "trash")
        .not("label", "is", null)
        .order("published_at", { ascending: false })
        .limit(3);
      if (!data || cancelled) return;
      setNewsItems(data.map((n: any) => ({
        sentiment: normLabel(n.label),
        source: (() => {
          try { return new URL(n.article_url).hostname.replace("www.", ""); } catch { return "Wealbee"; }
        })(),
        time: relativeTime(n.published_at),
        title: n.title,
        url: n.article_url,
      })));
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const now = new Date();
  const isMarketOpen = (() => {
    const h = now.getHours(), m = now.getMinutes();
    const mins = h * 60 + m;
    return mins >= 9 * 60 + 15 && mins < 15 * 60;
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "0.5px solid " + divider }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: 0 }}>Thị trường</h1>
          <span style={{ fontSize: 13, color: fgSubtle }}>{lastDate}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} color={fgSubtle} strokeWidth={1.5} />
            <span style={{ fontSize: 13, color: fgSubtle }}>
              {now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: isMarketOpen ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.08)", border: isDark ? `0.5px solid ${isMarketOpen ? "rgba(52,199,89,0.20)" : "rgba(255,59,48,0.15)"}` : "none" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: isMarketOpen ? "#34C759" : "#FF3B30" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: isMarketOpen ? "#34C759" : "#FF3B30" }}>HOSE {isMarketOpen ? "đang mở" : "đã đóng"}</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: fgSubtle }}>· kéo card chỉ số vào Action Hub để AI phân tích</span>
      </div>

      {/* Indices */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {loading && indices.length === 0 ? (
          [0, 1].map(i => (
            <div key={i} style={{ flex: 1, background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, height: 110, opacity: 0.5 }} />
          ))
        ) : (
          indices.map(idx => {
            const isUp = idx.pt >= 0;
            const minS = Math.min(...idx.spark), maxS = Math.max(...idx.spark);
            const range = maxS - minS || 1;
            const card: ContextCard = {
              id: `market-index-${idx.name}`,
              type: "index",
              label: idx.name,
              badge: `${idx.pct >= 0 ? "+" : ""}${idx.pct.toFixed(2)}%`,
              summary: `${idx.value.toLocaleString("vi-VN")} · ${idx.spark.length} ngày`,
            };
            return (
              <div key={idx.name} {...makeDragHandlers(card)}
                onClick={() => setDetailIdx({ code: idx.name.startsWith("VN") ? "VNINDEX" : "HNX", name: idx.name })}
                title="Xem chi tiết chỉ số"
                style={{ flex: 1, background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, cursor: "pointer", userSelect: "none", position: "relative" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 2 }}>{idx.name}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: fg, marginBottom: 4 }}>{idx.value.toLocaleString("vi-VN")}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                  {isUp ? <TrendingUp size={13} color="#34C759" strokeWidth={1.5} /> : <TrendingDown size={13} color="#FF3B30" strokeWidth={1.5} />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? "#34C759" : "#FF3B30" }}>
                    {isUp ? "+" : ""}{idx.pt.toFixed(2)} ({isUp ? "+" : ""}{idx.pct.toFixed(2)}%)
                  </span>
                </div>
                {idx.spark.length > 1 && (
                  <svg width="100%" height={28} viewBox={`0 0 ${idx.spark.length * 10} 28`} preserveAspectRatio="none" style={{ marginBottom: 4 }}>
                    <polyline
                      points={idx.spark.map((v, i) => `${i * 10 + 5},${28 - ((v - minS) / range) * 24}`).join(" ")}
                      fill="none" stroke={isUp ? "#34C759" : "#FF3B30"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: fgSubtle }}>KL: {idx.vol}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: brand }}>Chi tiết →</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {detailIdx && (
        <IndexDetailModal
          indexCode={detailIdx.code}
          name={detailIdx.name}
          isDark={isDark}
          onClose={() => setDetailIdx(null)}
        />
      )}

      {/* Top Movers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* TĂNG MẠNH */}
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <TrendingUp size={16} color="#34C759" strokeWidth={1.5} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>TĂNG MẠNH</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {loading && gainers.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ height: 30, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", marginBottom: 2 }} />
              ))
            ) : gainers.map(s => {
              const card: ContextCard = { id: `mover-gain-${s.symbol}`, type: "mover", label: s.symbol, badge: `+${s.pct.toFixed(2)}%`, summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}` };
              return (
                <div key={s.symbol} {...makeDragHandlers(card)} onClick={() => onSelectTicker?.(s.symbol)}
                  style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease", userSelect: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                  <span style={{ marginRight: 8 }}>
                    <PctBadge value={s.pct} ceilingFloor={s.isCeil ? "ceil" : undefined} />
                  </span>
                  <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* GIẢM MẠNH */}
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <TrendingDown size={16} color="#FF3B30" strokeWidth={1.5} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>GIẢM MẠNH</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {loading && losers.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ height: 30, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", marginBottom: 2 }} />
              ))
            ) : losers.map(s => {
              const card: ContextCard = { id: `mover-loss-${s.symbol}`, type: "mover", label: s.symbol, badge: `${s.pct.toFixed(2)}%`, summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}` };
              return (
                <div key={s.symbol} {...makeDragHandlers(card)} onClick={() => onSelectTicker?.(s.symbol)}
                  style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease", userSelect: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                  <span style={{ marginRight: 8 }}>
                    <PctBadge value={s.pct} ceilingFloor={s.isFloor ? "floor" : undefined} />
                  </span>
                  <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sector Heatmap */}
      {sectors.length > 0 && (
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 12 }}>HEATMAP NGÀNH</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {sectors.map(s => {
              const col = getSectorColor(s.pct);
              return (
                <div key={s.name}
                  style={{ padding: "12px 14px", borderRadius: 10, background: col.bg, cursor: "default", transition: "opacity 150ms ease" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col.text }}>{s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Liquidity & Foreign — still static (no volume data in DB) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <AlertCircle size={14} color={fgSubtle} strokeWidth={1.5} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>THANH KHOẢN</div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: fgSubtle, lineHeight: 1.6 }}>
            Dữ liệu thanh khoản thị trường chưa có trong DB hiện tại.
            Sẽ cập nhật khi tích hợp feed HOSE.
          </p>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <AlertCircle size={14} color={fgSubtle} strokeWidth={1.5} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>KHỐI NGOẠI</div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: fgSubtle, lineHeight: 1.6 }}>
            Dữ liệu giao dịch khối ngoại chưa có trong DB hiện tại.
            Sẽ cập nhật khi tích hợp feed SSI/VNDS.
          </p>
        </div>
      </div>

      {/* News */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 12 }}>TIN THỊ TRƯỜNG</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading && newsItems.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 48, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
            ))
          ) : newsItems.map((item, i) => {
            const sc = getSentimentColor(item.sentiment, isDark);
            const card: ContextCard = {
              id: `market-news-${i}`,
              type: "news",
              label: item.title.length > 36 ? item.title.slice(0, 36) + "…" : item.title,
              badge: item.sentiment,
              summary: `${item.source} · ${item.time} trước`,
            };
            return (
              <div key={i} {...makeDragHandlers(card)}
                style={{ display: "flex", gap: 12, padding: "10px 8px", borderBottom: i < newsItems.length - 1 ? "0.5px solid " + divider : "none", cursor: "grab", borderRadius: 8, transition: "background 80ms ease", userSelect: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isDark ? "#0f1220" : "#F5F5F7"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: sc.bg, color: sc.text, whiteSpace: "nowrap", height: "fit-content", marginTop: 2 }}>
                  {item.sentiment}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: fgSubtle, marginBottom: 4 }}>{item.source} · {item.time} trước</div>
                  <div style={{ fontSize: 14, color: fg, lineHeight: 1.5 }}>{item.title}</div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ background: "none", border: "none", color: brand, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 6, padding: 0, display: "inline-block", textDecoration: "none", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                      Đọc thêm →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
