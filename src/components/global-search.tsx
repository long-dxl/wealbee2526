import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "../lib/supabase/client";
import { TICKER_LIST } from "../data/tickerData";
import { fmtStockPrice } from "../lib/format-price";

interface TickerRow {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  price: number;
  changePct: number;
}

interface Props {
  onSelectTicker: (symbol: string) => void;
  onNavigate: (page: string) => void;
  isDark?: boolean;
  // "mobile": dùng trong search overlay full-screen — input full-width ≥16px
  // (chống iOS zoom), kết quả render thành list tĩnh cuộn dọc thay vì dropdown.
  variant?: "desktop" | "mobile";
}

const FONT = "'Montserrat', system-ui, sans-serif";

const SECTOR_COLORS: Record<string, string> = {
  "Ngân hàng":     "#1D6AFF",
  "Thép":          "#E07B00",
  "Công nghệ":     "#8B5CF6",
  "Bán lẻ":        "#0EA5E9",
  "Thực phẩm":     "#16A34A",
  "Bất động sản":  "#D97706",
  "Hàng tiêu dùng":"#DB2777",
};

function sectorBg(sector: string)    { return `${SECTOR_COLORS[sector] ?? "#4B5563"}22`; }
function sectorColor(sector: string) { return SECTOR_COLORS[sector] ?? "#4B5563"; }

// Fallback data từ mock nếu Supabase chưa có data
const FALLBACK: TickerRow[] = TICKER_LIST.map((t) => ({
  symbol:    t.symbol,
  name:      t.name,
  sector:    t.sector,
  exchange:  t.exchange,
  price:     t.price,
  changePct: t.changePct,
}));

function useTickers(): TickerRow[] {
  const [tickers, setTickers] = useState<TickerRow[]>(FALLBACK);

  useEffect(() => {
    async function load() {
      // 1. Lấy danh sách tickers
      const { data: tickerRows } = await supabase
        .from("tickers")
        .select("symbol, name, sector, exchange")
        .order("symbol");

      if (!tickerRows?.length) return;

      // 2. Lấy giá của 2 ngày giao dịch gần nhất
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const { data: priceRows } = await supabase
        .from("prices_daily")
        .select("symbol, date, close")
        .gte("date", cutoff.toISOString().slice(0, 10))
        .order("date", { ascending: false });

      // 3. Lấy giá mới nhất và trước đó mỗi mã
      const latest:  Record<string, number> = {};
      const prev:    Record<string, number> = {};
      for (const p of (priceRows ?? [])) {
        const c = Number(p.close);
        if (!(p.symbol in latest))     { latest[p.symbol] = c; }
        else if (!(p.symbol in prev))  { prev[p.symbol]   = c; }
      }

      const rows: TickerRow[] = tickerRows.map((t) => {
        const cur  = latest[t.symbol] ?? 0;
        const pre  = prev[t.symbol]   ?? cur;
        const pct  = pre > 0 ? ((cur - pre) / pre) * 100 : 0;
        return {
          symbol:    t.symbol,
          name:      t.name,
          sector:    t.sector ?? "Khác",
          exchange:  t.exchange ?? "",
          price:     cur,
          changePct: parseFloat(pct.toFixed(2)),
        };
      });

      setTickers(rows);
    }

    load();
  }, []);

  return tickers;
}

export function GlobalSearch({ onSelectTicker, onNavigate, isDark = false, variant = "desktop" }: Props) {
  const isMobileVariant = variant === "mobile";
  const [query,  setQuery]  = useState("");
  const [open,   setOpen]   = useState(isMobileVariant);
  const [cursor, setCursor] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  const allTickers = useTickers();

  const q = query.trim().toLowerCase();
  const results = q.length === 0
    ? allTickers.slice(0, 6)
    : allTickers.filter((t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.sector.toLowerCase().includes(q)
      ).slice(0, 8);

  const isRecent = q.length === 0;

  // Theme tokens
  const inputBg           = isDark ? (open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)") : (open ? "#fff" : "rgba(255,255,255,0.72)");
  const inputBorder       = isDark ? (open ? "1.5px solid #4D8FE8" : "1px solid rgba(255,255,255,0.12)") : (open ? "1.5px solid #0849AC" : "1px solid rgba(8,73,172,0.14)");
  const inputShadow       = isDark ? (open ? "0 0 0 3px rgba(77,143,232,0.12)" : "none") : (open ? "0 0 0 3px rgba(8,73,172,0.08)" : "none");
  const searchIconColor   = isDark ? (open ? "#4D8FE8" : "rgba(240,242,255,0.35)") : (open ? "#0849AC" : "rgba(26,26,46,0.35)");
  const inputTextColor    = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const dropdownBg        = isDark ? "#131824" : "#fff";
  const dropdownBorder    = isDark ? "1.5px solid #4D8FE8" : "1.5px solid #0849AC";
  const dropdownTopBorder = isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(8,73,172,0.10)";
  const dropdownShadow    = isDark ? "0 12px 36px rgba(0,0,0,0.50), 0 2px 8px rgba(0,0,0,0.30)" : "0 12px 36px rgba(8,73,172,0.14), 0 2px 8px rgba(0,0,0,0.06)";
  const sectionLabel      = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.38)";
  const emptyText         = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const rowBorderColor    = isDark ? "rgba(255,255,255,0.05)" : "rgba(8,73,172,0.06)";
  const rowActiveBg       = isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.05)";
  const symbolColor       = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const nameColor         = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const priceColor        = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const footerBg          = isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.02)";
  const footerBorder      = isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(8,73,172,0.08)";
  const footerColor       = isDark ? "#4D8FE8" : "#0849AC";

  useEffect(() => {
    if (isMobileVariant) return; // overlay mobile luôn mở, đóng bằng nút back của overlay
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCursor(-1);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isMobileVariant]);

  const select = useCallback((symbol: string) => {
    onSelectTicker(symbol);
    setQuery("");
    setOpen(false);
    setCursor(-1);
    inputRef.current?.blur();
  }, [onSelectTicker]);

  function handleKey(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === "Enter" && cursor >= 0 && results[cursor]) {
      select(results[cursor].symbol);
    } else if (e.key === "Escape") {
      setOpen(false);
      setCursor(-1);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} style={{
      position: "relative", width: isMobileVariant ? "100%" : 340, fontFamily: FONT,
      ...(isMobileVariant ? { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } : {}),
    }}>
      {/* Input */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: inputBg, border: inputBorder,
        borderRadius: isMobileVariant ? 12 : (open ? "12px 12px 0 0" : 12),
        padding: "0 12px", height: 38,
        transition: "all 140ms ease", boxShadow: inputShadow,
        backdropFilter: isDark ? "blur(8px)" : undefined,
      }}>
        <Search size={15} strokeWidth={2} color={searchIconColor} style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          autoFocus={isMobileVariant}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setCursor(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Tìm cổ phiếu, chỉ số..."
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: isMobileVariant ? 16 : 13, fontFamily: FONT, color: inputTextColor }}
        />
        {query && (
          <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={13} color={isDark ? "rgba(240,242,255,0.35)" : "rgba(26,26,46,0.35)"} />
          </button>
        )}
      </div>

      {/* Dropdown (desktop) / list tĩnh cuộn dọc (mobile overlay) */}
      {open && (
        <div style={isMobileVariant ? {
          flex: 1, minHeight: 0, overflowY: "auto", marginTop: 8,
          background: "transparent",
        } : {
          position: "absolute", top: 38, left: 0, right: 0,
          background: dropdownBg, border: dropdownBorder,
          borderTop: dropdownTopBorder, borderRadius: "0 0 14px 14px",
          boxShadow: dropdownShadow, zIndex: 200, overflow: "hidden",
        }}>
          <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: sectionLabel, textTransform: "uppercase" }}>
            {isRecent ? "Gần đây" : `Kết quả cho "${query}"`}
          </div>

          {results.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: emptyText, textAlign: "center" }}>
              Không tìm thấy mã phù hợp
            </div>
          ) : (
            <div>
              {results.map((ticker, i) => {
                const isUp     = ticker.changePct >= 0;
                const isActive = cursor === i;
                return (
                  <div
                    key={ticker.symbol}
                    onMouseEnter={() => setCursor(i)}
                    onMouseDown={() => select(ticker.symbol)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 14px", cursor: "pointer",
                      background: isActive ? rowActiveBg : "transparent",
                      transition: "background 80ms",
                      borderTop: i === 0 ? "none" : `0.5px solid ${rowBorderColor}`,
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: sectorBg(ticker.sector),
                      border: `1px solid ${sectorColor(ticker.sector)}22`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: sectorColor(ticker.sector),
                    }}>
                      {ticker.symbol.slice(0, 2)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: symbolColor }}>{ticker.symbol}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: sectorColor(ticker.sector), background: sectorBg(ticker.sector), padding: "1px 6px", borderRadius: 4 }}>{ticker.sector}</span>
                      </div>
                      <div style={{ fontSize: 11, color: nameColor, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticker.name}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {ticker.price > 0 ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 700, color: priceColor }}>
                            {fmtStockPrice(ticker.price)}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 1 }}>
                            {isUp ? <TrendingUp size={10} color="#28C840" /> : <TrendingDown size={10} color="#FF3B30" />}
                            <span style={{ fontSize: 11, fontWeight: 600, color: isUp ? "#28C840" : "#FF3B30" }}>
                              {isUp ? "+" : ""}{ticker.changePct.toFixed(2)}%
                            </span>
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: nameColor }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div
            onMouseDown={() => { onNavigate("tickers"); setOpen(false); setQuery(""); }}
            style={{ padding: "9px 14px", borderTop: footerBorder, fontSize: 12, color: footerColor, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: footerBg }}
          >
            <span>Xem tất cả cổ phiếu</span>
            <span style={{ fontSize: 10 }}>→</span>
          </div>
        </div>
      )}
    </div>
  );
}
