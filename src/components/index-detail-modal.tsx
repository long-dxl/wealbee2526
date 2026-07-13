/**
 * IndexDetailModal — Trang chi tiết chỉ số (VN-Index / HNX-Index).
 *
 * Tier A: toàn bộ metric tính từ market_indices (đã có data tới hôm nay), không cần nguồn ngoài.
 *  - OHLC trong ngày + biên độ + volume
 *  - Hiệu suất đa kỳ: 1 tuần / 1 tháng / YTD
 *  - Đỉnh–đáy 52 tuần + vị trí hiện tại trong vùng
 *  - Chart lớn với khung thời gian 1M / 3M / YTD / 1Y
 */
import { useEffect, useMemo, useState } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "../lib/supabase/client";
import { IndexCandleChart } from "./index-candle-chart";
import { useIsMobile } from "./ui/use-mobile";

interface Row {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  change_pt: number | null;
  change_pct: number | null;
  updated_at: string | null;
}

// "1D" không dùng PERIOD_DAYS để cắt/zoom theo ngày — đây là chế độ RIÊNG
// (nến phút trong phiên, lấy trực tiếp từ DNSE qua edge function
// intraday-quote), xem IndexCandleChart. Giữ "1D": 0 chỉ để không vỡ type.
type Period = "1D" | "7D" | "1M" | "3M" | "YTD" | "5Y";
const PERIOD_DAYS: Record<Period, number> = { "1D": 0, "7D": 7, "1M": 30, "3M": 90, "YTD": 365, "5Y": 1825 };
const PERIODS: Period[] = ["1D", "7D", "1M", "3M", "YTD", "5Y"];

const UP = "#34C759";
const DOWN = "#FF3B30";

function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtVol(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} tỷ`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return `${v}`;
}
// "Cập nhật lúc HH:mm:ss" — updated_at tự cập nhật mỗi lần job intraday ghi đè
// giá trong phiên (KHÔNG dùng created_at, chỉ set 1 lần lúc tạo dòng đầu ngày).
function fmtUpdatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function pctFrom(rows: Row[], n: number): number | null {
  if (rows.length <= n) return null;
  const cur = rows[rows.length - 1].close;
  const past = rows[rows.length - 1 - n].close;
  if (!past) return null;
  return ((cur - past) / past) * 100;
}

export function IndexDetailModal({
  indexCode, name, isDark = false, onClose,
}: {
  indexCode: "VNINDEX" | "HNX" | "VN30" | "UPCOM";
  name: string;
  isDark?: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("3M");

  // theme
  const bg       = isDark ? "#131824" : "#fff";
  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgSubtle = isDark ? "rgba(240,242,255,0.45)" : "#3D3D52";
  const tileBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.035)";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("market_indices")
        .select("date,open,high,low,close,volume,change_pt,change_pct,updated_at")
        .eq("index_code", indexCode)
        .order("date", { ascending: false })
        .limit(400);
      if (!cancelled) {
        setRows(((data as Row[]) || []).slice().reverse());
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [indexCode]);

  const metrics = useMemo(() => {
    if (rows.length === 0) return null;
    const latest = rows[rows.length - 1];
    const isUp = (latest.change_pct ?? 0) >= 0;

    // Vùng dao động (tối đa ~252 phiên ≈ 52 tuần, hoặc toàn bộ lịch sử đang có)
    const w52 = rows.slice(-252);
    const hi = Math.max(...w52.map(r => r.high ?? r.close));
    const lo = Math.min(...w52.map(r => r.low ?? r.close));
    const pos = hi > lo ? ((latest.close - lo) / (hi - lo)) * 100 : 100;

    // YTD: phiên đầu tiên của năm hiện tại
    const yr = new Date().getFullYear();
    const firstOfYear = rows.find(r => r.date >= `${yr}-01-01`);
    const ytd = firstOfYear && firstOfYear.close
      ? ((latest.close - firstOfYear.close) / firstOfYear.close) * 100
      : null;

    return {
      latest, isUp,
      day: latest.change_pct,
      week: pctFrom(rows, 5),
      month: pctFrom(rows, 21),
      year: pctFrom(rows, 252),   // ~252 phiên giao dịch/năm
      ytd,
      hi, lo, pos,
    };
  }, [rows]);

  // Mốc ngày bắt đầu khung đã chọn — CHỈ dùng để ZOOM chart nến, không cắt bỏ
  // data (giữ nguyên toàn bộ lịch sử để user kéo/pan ra ngoài khung vẫn thấy
  // được), cùng pattern đã dùng ở PriceChartLW trang chi tiết cổ phiếu.
  const periodCutoff = useMemo(() => {
    if (period === "YTD") return `${new Date().getFullYear()}-01-01`;
    return new Date(Date.now() - PERIOD_DAYS[period] * 86400000).toISOString().slice(0, 10);
  }, [period]);

  return (
    <div
      onClick={onClose}
      style={isMobile ? {
        position: "fixed", inset: 0, zIndex: 1000, background: bg,
      } : {
        position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,12,22,0.55)",
        backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={isMobile ? {
          // Full màn hình trên mobile — không phí diện tích cho backdrop/khung
          // căn giữa, nhường tối đa chỗ cho chart nến.
          width: "100%", height: "100%", overflowY: "auto", background: bg,
          padding: "calc(12px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom))",
          fontFamily: "'Montserrat', system-ui, sans-serif",
        } : {
          width: "100%", maxWidth: 900, maxHeight: "92vh", overflowY: "auto", background: bg,
          borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.30)", padding: 24,
          fontFamily: "'Montserrat', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 12 : 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>
              {name}
            </div>
            {metrics && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <div style={{ fontSize: isMobile ? 28 : 32, fontWeight: 700, color: fg, lineHeight: 1.1 }}>
                    {fmtNum(metrics.latest.close)}
                  </div>
                  {fmtUpdatedAt(metrics.latest.updated_at) && (
                    <span style={{ fontSize: 11, color: fgSubtle, whiteSpace: "nowrap" }}>Cập nhật lúc {fmtUpdatedAt(metrics.latest.updated_at)}</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  {metrics.isUp ? <TrendingUp size={15} color={UP} strokeWidth={1.8} /> : <TrendingDown size={15} color={DOWN} strokeWidth={1.8} />}
                  <span style={{ fontSize: 15, fontWeight: 600, color: metrics.isUp ? UP : DOWN }}>
                    {metrics.isUp ? "+" : ""}{fmtNum(metrics.latest.change_pt)} ({metrics.isUp ? "+" : ""}{fmtNum(metrics.day)}%)
                  </span>
                  <span style={{ fontSize: 12, color: fgSubtle, marginLeft: 4 }}>· {metrics.latest.date}</span>
                </div>
              </>
            )}
          </div>
          {isMobile ? (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: fgSubtle, padding: 4, flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
              <X size={22} />
            </button>
          ) : (
            /* Desktop: nút đóng + nút khung thời gian dồn về góc phải — giải
               phóng hẳn 1 hàng riêng phía trên, nhường không gian cho chart nến. */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: fgSubtle, padding: 4 }}>
                <X size={20} />
              </button>
              {metrics && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {PERIODS.map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                      style={{
                        padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "none", fontFamily: "inherit",
                        background: period === p ? (isDark ? "#2C5FAE" : "#0849AC") : tileBg,
                        color: period === p ? "#fff" : fgSubtle,
                      }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile: pills khung thời gian thành hàng riêng full-width, cuộn ngang
            nếu cần — thay vì nhồi cột dọc góc phải cạnh nút đóng. */}
        {isMobile && metrics && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {PERIODS.map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  border: "none", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
                  background: period === p ? (isDark ? "#2C5FAE" : "#0849AC") : tileBg,
                  color: period === p ? "#fff" : fgSubtle,
                }}>
                {p}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: fgSubtle }}>
            Đang tải…
          </div>
        ) : !metrics ? (
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: fgSubtle }}>
            Chưa có dữ liệu chỉ số.
          </div>
        ) : (
          <>
            {/* Chart nến — mobile full-screen có nhiều chỗ dọc hơn hẳn, tận dụng
                bằng chart cao hơn thay vì giữ nguyên mức cố định cho mọi màn hình. */}
            <div style={{ marginBottom: 18 }}>
              <IndexCandleChart
                rows={rows}
                periodCutoff={periodCutoff}
                period={period}
                symbol={indexCode}
                isDark={isDark}
                UP={UP}
                DOWN={DOWN}
                fmtNum={fmtNum}
                fmtVol={fmtVol}
                candleHeight={isMobile ? 300 : 260}
                volHeight={isMobile ? 90 : 76}
                isMobile={isMobile}
              />
            </div>

            {/* Performance đa kỳ — mobile: 3 cột (2 hàng) thay vì 5 cột dồn cứng,
                tránh số liệu như "+27.21%" bị bóp trong ô quá hẹp */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
              {([
                ["1 tuần", metrics.week],
                ["1 tháng", metrics.month],
                ["1 năm", metrics.year],
                ["YTD", metrics.ytd],
                ["Hôm nay", metrics.day],
              ] as [string, number | null][]).map(([label, val]) => {
                const up = (val ?? 0) >= 0;
                return (
                  <div key={label} style={{ background: tileBg, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: fgSubtle, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: val == null ? fgSubtle : up ? UP : DOWN }}>
                      {val == null ? "—" : `${up ? "+" : ""}${val.toFixed(2)}%`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Biên độ 52 tuần — cùng style RangeBar ở trang chi tiết cổ phiếu.
                Mobile: chỉ 1 dòng nhãn lo–hi ngay trên vạch min/max của thanh
                (bỏ dòng tổng "lo – hi" lặp lại phía trên, dư thừa trên màn hẹp). */}
            <div style={{ background: tileBg, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: fgSubtle }}>Biên độ 52 tuần</span>
                {!isMobile && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: fg }}>
                    {fmtNum(metrics.lo)} – {fmtNum(metrics.hi)}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: isMobile ? 600 : 400, color: isMobile ? fg : fgSubtle }}>{fmtNum(metrics.lo)}</span>
                <span style={{ fontSize: 11, fontWeight: isMobile ? 600 : 400, color: isMobile ? fg : fgSubtle }}>{fmtNum(metrics.hi)}</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.12)", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.max(0, Math.min(100, metrics.pos))}%`, background: `linear-gradient(90deg,${DOWN},${UP})`, borderRadius: 2 }} />
                <div style={{
                  position: "absolute", top: -4, left: `${Math.max(0, Math.min(100, metrics.pos))}%`, transform: "translateX(-50%)",
                  width: 11, height: 11, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 2px rgba(128,128,180,0.30)",
                }} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
