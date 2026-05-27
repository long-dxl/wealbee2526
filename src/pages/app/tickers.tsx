import { useState } from "react";
import { Search, Star, SlidersHorizontal, ArrowUpRight } from "lucide-react";

function PctBadge({ value, isCeil, isFloor }: { value: number; isCeil?: boolean; isFloor?: boolean }) {
  if (isCeil) {
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(124,58,237,0.12)", color: "#7C3AED", fontFamily: "'Montserrat', system-ui, sans-serif" }}>+{value.toFixed(2)}%</span>;
  }
  if (isFloor) {
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{value.toFixed(2)}%</span>;
  }
  const isUp = value > 0;
  const isDown = value < 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)",
      color: isUp ? "#34C759" : isDown ? "#FF3B30" : "rgba(26,26,46,0.45)",
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

const allTickers = [
  { symbol: "VCB", name: "Vietcombank", price: 91200, change: 0.80, volume: "8.2M", sector: "Ngân hàng", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "BID", name: "BIDV", price: 48500, change: 0.62, volume: "6.5M", sector: "Ngân hàng", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "HPG", name: "Hoà Phát Group", price: 26500, change: 4.10, volume: "12.4M", sector: "Thép", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "HSG", name: "Hoa Sen Group", price: 18200, change: 2.80, volume: "7.3M", sector: "Thép", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "FPT", name: "FPT Corporation", price: 128400, change: 1.45, volume: "5.1M", sector: "IT", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "MWG", name: "Mobile World", price: 62100, change: -3.20, volume: "8.1M", sector: "Bán lẻ", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "VNM", name: "Vinamilk", price: 68900, change: -0.43, volume: "3.2M", sector: "Thực phẩm", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "VIC", name: "Vingroup", price: 47800, change: 3.80, volume: "9.2M", sector: "BĐS", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "DXG", name: "Đất Xanh Group", price: 14200, change: -2.90, volume: "5.6M", sector: "BĐS", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "TCB", name: "Techcombank", price: 24800, change: 2.40, volume: "8.4M", sector: "Ngân hàng", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "MSN", name: "Masan Group", price: 68200, change: 2.91, volume: "6.8M", sector: "Hàng tiêu dùng", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "STB", name: "Sacombank", price: 31200, change: 7.00, volume: "5.1M", sector: "Ngân hàng", exchange: "HOSE", isCeil: true, isFloor: false },
  { symbol: "ACB", name: "ACB", price: 22100, change: 1.14, volume: "7.6M", sector: "Ngân hàng", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "NVL", name: "Novaland", price: 8900, change: -2.50, volume: "3.8M", sector: "BĐS", exchange: "HOSE", isCeil: false, isFloor: false },
  { symbol: "PDR", name: "Phát Đạt Real Estate", price: 11800, change: -7.00, volume: "5.6M", sector: "BĐS", exchange: "HOSE", isCeil: false, isFloor: true },
];

const tabs = ["Tất cả", "VN30", "HNX30", "Watchlist", "Danh mục của tôi"];
const sortOptions = ["Thay đổi", "Vốn hóa", "Thanh khoản", "Ngành"];

export function Tickers({ onNavigate: _onNavigate, onSelectTicker, isDark = false }: { onNavigate: (page: string) => void; onSelectTicker?: (symbol: string) => void; isDark?: boolean }) {
  void _onNavigate;
  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.60)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const bgMuted = isDark ? "#0f1220" : "#F5F5F7";
  const hoverBg = isDark ? "#1a2438" : "#E8F0FE";
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Tất cả");
  const [sortBy, setSortBy] = useState("Thay đổi");
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set(["HPG", "FPT", "VCB"]));

  const toggleWatchlist = (symbol: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  let filtered = allTickers.filter((t) => {
    const q = search.toLowerCase();
    return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.sector.toLowerCase().includes(q);
  });

  if (activeTab === "Watchlist") filtered = filtered.filter((t) => watchlist.has(t.symbol));
  if (activeTab === "VN30") filtered = filtered.slice(0, 10);

  if (sortBy === "Thay đổi") filtered = [...filtered].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  else if (sortBy === "Thanh khoản") filtered = [...filtered].sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: "0 0 4px" }}>Tickers</h1>
        <span style={{ fontSize: 13, color: fgSubtle }}>
          {allTickers.length} mã · cập nhật realtime
        </span>
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: cardBg,
          border: "0.5px solid " + divider,
          borderRadius: 10,
          padding: "0 16px",
          height: 48,
          marginBottom: 12,
          boxShadow: isDark ? "0 1px 3px rgba(0,0,0,0.30)" : "0 1px 3px rgba(8,73,172,0.06)",
        }}
      >
        <Search size={18} strokeWidth={1.5} color={fgSubtle} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm mã cổ phiếu (VD: HPG, FPT, Ngân hàng...)"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 15,
            color: fg,
            fontFamily: "'Montserrat', system-ui, sans-serif",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ background: "none", border: "none", cursor: "pointer", color: fgSubtle, padding: 4 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Tabs + Sort */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: activeTab === tab ? brand : "transparent",
                color: activeTab === tab ? "#fff" : fgMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 150ms ease",
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}
            >
              {tab}
              {tab === "Watchlist" && watchlist.size > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    background: activeTab === tab ? "rgba(255,255,255,0.25)" : isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.12)",
                    color: activeTab === tab ? "#fff" : brand,
                    borderRadius: 99,
                    padding: "0px 5px",
                  }}
                >
                  {watchlist.size}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SlidersHorizontal size={14} color={fgSubtle} strokeWidth={1.5} />
          {sortOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                background: sortBy === opt ? (isDark ? "rgba(77,143,232,0.18)" : "rgba(8,73,172,0.08)") : "transparent",
                color: sortBy === opt ? brand : fgSubtle,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: cardBg, borderRadius: 14, boxShadow: cardShadow, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "80px 1fr 100px 100px 90px 100px 40px",
          padding: "10px 16px",
          borderBottom: "0.5px solid " + divider,
          background: bgMuted,
        }}>
          {["Mã", "Tên công ty", "Giá", "Thay đổi", "KL", "Ngành", ""].map((col) => (
            <div key={col} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>
              {col}
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            {activeTab === "Watchlist" ? (
              <>
                <Star size={32} color={fgSubtle} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                <p style={{ fontSize: 15, color: fgSubtle, margin: "0 0 8px" }}>Watchlist của bạn trống</p>
                <p style={{ fontSize: 13, color: fgSubtle, margin: 0 }}>Thêm mã cổ phiếu bằng cách click ★ trên bất kỳ mã nào</p>
              </>
            ) : (
              <p style={{ fontSize: 15, color: fgSubtle, margin: 0 }}>
                Không tìm thấy mã "{search}"
              </p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map((ticker, i) => (
              <div
                key={ticker.symbol}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 100px 100px 90px 100px 40px",
                  padding: "10px 16px",
                  borderBottom: i < filtered.length - 1 ? "0.5px solid " + divider : "none",
                  cursor: "pointer",
                  transition: "background 80ms ease",
                  alignItems: "center",
                }}
                onClick={() => onSelectTicker?.(ticker.symbol)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: fg }}>{ticker.symbol}</span>
                <span style={{ fontSize: 13, color: fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticker.name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>{ticker.price.toLocaleString("vi-VN")}</span>
                <PctBadge value={ticker.change} isCeil={ticker.isCeil} isFloor={ticker.isFloor} />
                <span style={{ fontSize: 13, color: fgMuted }}>{ticker.volume}</span>
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.06)", color: fgMuted, width: "fit-content" }}>{ticker.sector}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleWatchlist(ticker.symbol); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
                  title={watchlist.has(ticker.symbol) ? "Xóa khỏi Watchlist" : "Thêm vào Watchlist"}
                >
                  <Star
                    size={16}
                    strokeWidth={1.5}
                    fill={watchlist.has(ticker.symbol) ? "#FFD60A" : "none"}
                    color={watchlist.has(ticker.symbol) ? "#FFD60A" : fgSubtle}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
