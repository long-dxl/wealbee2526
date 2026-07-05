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
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { supabase } from "../lib/supabase/client";

interface Row {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  change_pt: number | null;
  change_pct: number | null;
}

type Period = "1M" | "3M" | "YTD" | "1Y";
const PERIOD_DAYS: Record<Period, number> = { "1M": 30, "3M": 90, "YTD": 365, "1Y": 365 };
const PERIODS: Period[] = ["1M", "3M", "YTD", "1Y"];

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
  indexCode: "VNINDEX" | "HNX";
  name: string;
  isDark?: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("3M");

  // theme
  const bg       = isDark ? "#131824" : "#fff";
  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgSubtle = isDark ? "rgba(240,242,255,0.45)" : "#3D3D52";
  const divider  = isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)";
  const tileBg   = isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.035)";
  const grid     = isDark ? "rgba(255,255,255,0.06)" : "rgba(8,73,172,0.07)";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("market_indices")
        .select("date,open,high,low,close,volume,change_pt,change_pct")
        .eq("index_code", indexCode)
        .order("date", { ascending: true })
        .limit(400);
      if (!cancelled) {
        setRows((data as Row[]) || []);
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
    const rangeStart = w52[0]?.date ?? latest.date;

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
      ytd,
      hi, lo, pos, rangeStart,
    };
  }, [rows]);

  const chartData = useMemo(() => {
    if (rows.length === 0) return [];
    let slice: Row[];
    if (period === "YTD") {
      const yr = new Date().getFullYear();
      slice = rows.filter(r => r.date >= `${yr}-01-01`);
    } else {
      const cut = new Date(Date.now() - PERIOD_DAYS[period] * 86400000).toISOString().slice(0, 10);
      slice = rows.filter(r => r.date >= cut);
    }
    return slice.map(r => ({ date: r.date, close: r.close }));
  }, [rows, period]);

  const lineColor = metrics?.isUp ? UP : DOWN;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,12,22,0.55)",
        backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", background: bg,
          borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.30)", padding: 24,
          fontFamily: "'Montserrat', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fgSubtle }}>
              {name}
            </div>
            {metrics && (
              <>
                <div style={{ fontSize: 32, fontWeight: 700, color: fg, lineHeight: 1.1, marginTop: 4 }}>
                  {fmtNum(metrics.latest.close)}
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
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: fgSubtle, padding: 4 }}>
            <X size={20} />
          </button>
        </div>

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
            {/* Period selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {PERIODS.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{
                    padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: "none", fontFamily: "inherit",
                    background: period === p ? (isDark ? "#2C5FAE" : "#0849AC") : tileBg,
                    color: period === p ? "#fff" : fgSubtle,
                  }}>
                  {p}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div style={{ height: 240, marginBottom: 18 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIdx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: fgSubtle }} minTickGap={40}
                    tickFormatter={(d: string) => d.slice(5).replace("-", "/")} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: fgSubtle }} width={48}
                    tickFormatter={(v: number) => fmtNum(v, 0)} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: bg, border: `1px solid ${divider}`, borderRadius: 10, fontSize: 12, color: fg }}
                    labelStyle={{ color: fgSubtle }}
                    formatter={(v: number) => [fmtNum(v), "Đóng cửa"]}
                  />
                  <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} fill="url(#gIdx)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Performance đa kỳ */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
              {([
                ["1 tuần", metrics.week],
                ["1 tháng", metrics.month],
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

            {/* OHLC + Volume */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
              {([
                ["Mở cửa", fmtNum(metrics.latest.open)],
                ["Cao nhất", fmtNum(metrics.latest.high)],
                ["Thấp nhất", fmtNum(metrics.latest.low)],
                ["Đóng cửa", fmtNum(metrics.latest.close)],
                ["KL khớp", fmtVol(metrics.latest.volume)],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} style={{ background: tileBg, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: fgSubtle, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: fg }}>{val}</div>
                </div>
              ))}
            </div>

            {/* 52 tuần */}
            <div style={{ background: tileBg, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: fgSubtle, marginBottom: 8 }}>
                <span>Đáy · <b style={{ color: fg }}>{fmtNum(metrics.lo)}</b></span>
                <span>Đỉnh · <b style={{ color: fg }}>{fmtNum(metrics.hi)}</b></span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 3, background: isDark ? "rgba(255,255,255,0.10)" : "rgba(8,73,172,0.12)" }}>
                <div style={{
                  position: "absolute", top: -3, left: `calc(${Math.max(0, Math.min(100, metrics.pos))}% - 6px)`,
                  width: 12, height: 12, borderRadius: "50%", background: lineColor, border: `2px solid ${bg}`,
                }} />
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: fgSubtle, marginTop: 8 }}>
                Hiện ở <b style={{ color: fg }}>{metrics.pos.toFixed(0)}%</b> vùng dao động (từ {metrics.rangeStart})
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
