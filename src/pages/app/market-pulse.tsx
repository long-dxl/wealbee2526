import { TrendingUp, TrendingDown, Clock, AlertCircle } from "lucide-react";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";

function PctBadge({ value, ceilingFloor }: { value: number; ceilingFloor?: "ceil" | "floor" }) {
  if (ceilingFloor === "ceil") {
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(124,58,237,0.12)", color: "#7C3AED", fontFamily: "'Montserrat', system-ui, sans-serif" }}>+{value.toFixed(2)}%</span>;
  }
  if (ceilingFloor === "floor") {
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{value.toFixed(2)}%</span>;
  }
  const isUp = value > 0, isDown = value < 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "rgba(26,26,46,0.45)", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

const sectors = [
  { name: "Thép", pct: 2.8 }, { name: "IT/Tech", pct: 1.4 },
  { name: "Ngân hàng", pct: 0.9 }, { name: "Hóa chất", pct: 0.6 },
  { name: "BĐS", pct: -1.9 }, { name: "Bán lẻ", pct: -1.2 },
  { name: "Xây dựng", pct: -0.8 }, { name: "Thủy sản", pct: -0.4 },
];

const topGainers = [
  { symbol: "HPG", price: 26500, pct: 4.10, vol: "12.4M", isFloor: false, isCeil: false },
  { symbol: "VIC", price: 47800, pct: 3.80, vol: "9.2M", isFloor: false, isCeil: false },
  { symbol: "MSN", price: 68200, pct: 2.91, vol: "6.8M", isFloor: false, isCeil: false },
  { symbol: "STB", price: 31200, pct: 7.00, vol: "5.1M", isFloor: false, isCeil: true },
  { symbol: "TCB", price: 24800, pct: 2.40, vol: "8.4M", isFloor: false, isCeil: false },
];

const topLosers = [
  { symbol: "MWG", price: 62100, pct: -3.20, vol: "8.1M", isFloor: false, isCeil: false },
  { symbol: "DXG", price: 14200, pct: -2.90, vol: "5.6M", isFloor: false, isCeil: false },
  { symbol: "PDR", price: 11800, pct: -7.00, vol: "5.6M", isFloor: true, isCeil: false },
  { symbol: "NVL", price: 8900, pct: -2.50, vol: "3.8M", isFloor: false, isCeil: false },
  { symbol: "SHB", price: 8200, pct: -1.80, vol: "6.2M", isFloor: false, isCeil: false },
];

const newsItems = [
  { sentiment: "Tích cực", source: "CafeF", time: "30p", title: "HPG dẫn đầu sàn nhờ giá thép HRC phục hồi tuần này" },
  { sentiment: "Trung lập", source: "Vietstock", time: "1h", title: "NHNN giữ lãi suất điều hành, thị trường không biến động" },
  { sentiment: "Cảnh báo", source: "HOSE Filing", time: "2h", title: "Phó TGĐ HPG đăng ký bán 500,000 cp" },
];

function getSentimentColor(sentiment: string, isDark: boolean): { bg: string; text: string } {
  if (sentiment === "Tích cực") return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (sentiment === "Cảnh báo") return { bg: "rgba(255,59,48,0.10)", text: "#FF3B30" };
  return isDark
    ? { bg: "rgba(255,255,255,0.08)", text: "rgba(240,242,255,0.55)" }
    : { bg: "rgba(26,26,46,0.08)", text: "rgba(26,26,46,0.60)" };
}

function getSectorColor(pct: number) {
  if (pct >= 2) return { bg: "rgba(52,199,89,0.25)", text: "#1a7a3a" };
  if (pct >= 0.5) return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (pct >= 0) return { bg: "rgba(52,199,89,0.06)", text: "#0ea5a0" };
  if (pct >= -0.5) return { bg: "rgba(255,59,48,0.06)", text: "#FF3B30" };
  if (pct >= -2) return { bg: "rgba(255,59,48,0.12)", text: "#FF3B30" };
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

export function MarketPulse({ onNavigate, onSelectTicker, isDark = false }: { onNavigate: (page: string) => void; onSelectTicker?: (symbol: string) => void; isDark?: boolean }) {
  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08)";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.60)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const hoverBg = isDark ? "#1a2438" : "#E8F0FE";
  void hoverBg; void fgMuted;
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "0.5px solid " + divider }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: 0 }}>Thị trường</h1>
          <span style={{ fontSize: 13, color: fgSubtle }}>Thứ Năm, 15/05</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} color={fgSubtle} strokeWidth={1.5} />
            <span style={{ fontSize: 13, color: fgSubtle }}>09:24</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: "rgba(52,199,89,0.12)", border: isDark ? "0.5px solid rgba(52,199,89,0.20)" : "none" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#34C759" }}>HOSE đang mở</span>
          </div>
        </div>
      </div>

      {/* Block 1: Indices — draggable */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          · kéo card chỉ số vào Action Hub để AI phân tích
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          { name: "VN-INDEX", exchange: "HOSE", value: 1287.34, pt: 5.41, pct: 0.42, vol: "8,240 tỷ", spark: [1275, 1278, 1280, 1282, 1279, 1283, 1287] },
          { name: "HNX-INDEX", exchange: "HNX", value: 232.18, pt: -0.25, pct: -0.11, vol: "1,120 tỷ", spark: [233, 232.8, 232.5, 232.3, 232.6, 232.4, 232.18] },
          { name: "UPCoM", exchange: "UPCoM", value: 96.42, pt: 0.00, pct: 0.00, vol: "320 tỷ", spark: [96.4, 96.4, 96.42, 96.41, 96.43, 96.42, 96.42] },
        ].map((idx) => {
          const isUp = idx.pt >= 0;
          const minS = Math.min(...idx.spark);
          const maxS = Math.max(...idx.spark);
          const range = maxS - minS || 1;
          const card: ContextCard = {
            id: `market-index-${idx.name}`,
            type: "index",
            label: idx.name,
            badge: `${idx.pct >= 0 ? "+" : ""}${idx.pct.toFixed(2)}%`,
            summary: `${idx.value.toLocaleString("vi-VN")} · Vol: ${idx.vol}`,
          };
          return (
            <div
              key={idx.name}
              {...makeDragHandlers(card)}
              style={{ flex: 1, background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, cursor: "grab", userSelect: "none", position: "relative" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
                const hint = (e.currentTarget as HTMLElement).querySelector(".mp-drag-hint") as HTMLElement | null;
                if (hint) hint.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
                const hint = (e.currentTarget as HTMLElement).querySelector(".mp-drag-hint") as HTMLElement | null;
                if (hint) hint.style.opacity = "0";
              }}
            >
              <div className="mp-drag-hint" style={{ position: "absolute", top: 8, right: 8, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 2 }}>{idx.name}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: fg, marginBottom: 4 }}>{idx.value.toLocaleString("vi-VN")}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                {isUp ? <TrendingUp size={13} color="#34C759" strokeWidth={1.5} /> : <TrendingDown size={13} color="#FF3B30" strokeWidth={1.5} />}
                <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? "#34C759" : "#FF3B30" }}>
                  {isUp ? "+" : ""}{idx.pt.toFixed(2)} ({isUp ? "+" : ""}{idx.pct.toFixed(2)}%)
                </span>
              </div>
              <svg width="100%" height={28} viewBox={`0 0 ${idx.spark.length * 10} 28`} preserveAspectRatio="none" style={{ marginBottom: 4 }}>
                <polyline
                  points={idx.spark.map((v, i) => `${i * 10 + 5},${28 - ((v - minS) / range) * 24}`).join(" ")}
                  fill="none" stroke={isUp ? "#34C759" : "#FF3B30"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              <div style={{ fontSize: 12, color: fgSubtle }}>Vol: {idx.vol}</div>
            </div>
          );
        })}
      </div>

      {/* Block 2: Top Movers — rows draggable */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <TrendingUp size={16} color="#34C759" strokeWidth={1.5} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>TĂNG MẠNH</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {topGainers.map((s) => {
              const card: ContextCard = {
                id: `mover-gain-${s.symbol}`,
                type: "mover",
                label: s.symbol,
                badge: `+${s.pct.toFixed(2)}%`,
                summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}`,
              };
              return (
                <div
                  key={s.symbol}
                  {...makeDragHandlers(card)}
                  onClick={() => onSelectTicker?.(s.symbol)}
                  style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease", userSelect: "none" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "#1a2438" : "#E8F0FE"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                  <span style={{ marginRight: 8 }}>
                    {s.isCeil ? <PctBadge value={s.pct} ceilingFloor="ceil" /> : <PctBadge value={s.pct} />}
                  </span>
                  <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <TrendingDown size={16} color="#FF3B30" strokeWidth={1.5} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>GIẢM MẠNH</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {topLosers.map((s) => {
              const card: ContextCard = {
                id: `mover-loss-${s.symbol}`,
                type: "mover",
                label: s.symbol,
                badge: `${s.pct.toFixed(2)}%`,
                summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}`,
              };
              return (
                <div
                  key={s.symbol}
                  {...makeDragHandlers(card)}
                  onClick={() => onSelectTicker?.(s.symbol)}
                  style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease", userSelect: "none" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "#1a2438" : "#E8F0FE"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                  <span style={{ marginRight: 8 }}>
                    {s.isFloor ? <PctBadge value={s.pct} ceilingFloor="floor" /> : <PctBadge value={s.pct} />}
                  </span>
                  <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Block 3: Sector Heatmap */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 12 }}>HEATMAP NGÀNH</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {sectors.map((s) => {
            const col = getSectorColor(s.pct);
            return (
              <div
                key={s.name}
                style={{ padding: "12px 14px", borderRadius: 10, background: col.bg, cursor: "pointer", transition: "opacity 150ms ease" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: col.text }}>{s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Block 4: Liquidity & Foreign */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 12 }}>THANH KHOẢN HÔM NAY</div>
          {[{ label: "HOSE", val: "8,240 tỷ" }, { label: "HNX", val: "1,120 tỷ" }, { label: "Tổng", val: "9,360 tỷ" }].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: fgSubtle }}>{r.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>{r.val}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: fgSubtle }}>vs TB 30 ngày:</span>
            <span style={{ background: "rgba(52,199,89,0.12)", color: "#34C759", fontSize: 12, fontWeight: 700, padding: "2px 7px", borderRadius: 6 }}>+18%</span>
          </div>
        </div>
        <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 12 }}>KHỐI NGOẠI</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#34C759", marginBottom: 8 }}>Mua ròng +124 tỷ</div>
          {[{ label: "HPG", val: "+48 tỷ", up: true }, { label: "VCB", val: "+31 tỷ", up: true }, { label: "MSN", val: "-22 tỷ", up: false }].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>{r.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: r.up ? "#34C759" : "#FF3B30" }}>{r.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Block 5: News — draggable */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle, marginBottom: 12 }}>TIN THỊ TRƯỜNG</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {newsItems.map((item, i) => {
            const sc = getSentimentColor(item.sentiment, isDark);
            const card: ContextCard = {
              id: `market-news-${i}`,
              type: "news",
              label: item.title.length > 36 ? item.title.slice(0, 36) + "…" : item.title,
              badge: item.sentiment,
              summary: `${item.source} · ${item.time} trước`,
            };
            return (
              <div
                key={i}
                {...makeDragHandlers(card)}
                style={{ display: "flex", gap: 12, padding: "10px 8px", borderBottom: i < newsItems.length - 1 ? "0.5px solid " + divider : "none", cursor: "grab", borderRadius: 8, transition: "background 80ms ease", userSelect: "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "#0f1220" : "#F5F5F7"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: sc.bg, color: sc.text, whiteSpace: "nowrap", height: "fit-content", marginTop: 2 }}>
                  {item.sentiment}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: fgSubtle, marginBottom: 4 }}>{item.source} · {item.time} trước</div>
                  <div style={{ fontSize: 14, color: fg, lineHeight: 1.5 }}>{item.title}</div>
                  <button style={{ background: "none", border: "none", color: brand, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 6, padding: 0, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                    Đọc thêm →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
