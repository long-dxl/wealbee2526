// Chart giá cổ phiếu — Chiến lược A: tự vẽ bằng lightweight-charts (thư viện mã
// nguồn mở do chính TradingView duy trì) + data OHLCV thật từ Supabase prices_daily
// (nguồn DNSE, pipeline hiện có). Thay cho AreaChart Recharts trước đây.
// 2 chế độ: Nến (candlestick + volume, dùng OHLC thật) và % so sánh (mã vs
// VN-Index vs HNX-Index, giữ nguyên tính năng cũ).
import { useEffect, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";

type OhlcRow = { date: string; open: number; high: number; low: number; close: number; volume: number };
type IndexRow = { date: string; close: number };

interface PriceChartLWProps {
  ohlc: OhlcRow[];
  vniPrices: IndexRow[];
  hnxPrices: IndexRow[];
  sym: string;
  tk: any;
  isDark: boolean;
  GREEN: string;
  RED: string;
  VNI_C: string;
  HNX_C: string;
  fmtPct: (v: number) => string;
  FONT: string;
}

const toTime = (dateStr: string): UTCTimestamp => (Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000) as UTCTimestamp);

function buildPctSeries(ohlc: OhlcRow[], vniPrices: IndexRow[], hnxPrices: IndexRow[]) {
  if (!ohlc.length) return { stock: [], vni: [], hnx: [] };
  const vniMap: Record<string, number> = {};
  vniPrices.forEach(v => { vniMap[v.date] = Number(v.close); });
  const hnxMap: Record<string, number> = {};
  hnxPrices.forEach(v => { hnxMap[v.date] = Number(v.close); });

  const baseStock = Number(ohlc[0].close);
  const firstVni = ohlc.find(p => vniMap[p.date] != null);
  const firstHnx = ohlc.find(p => hnxMap[p.date] != null);
  const baseVni = firstVni ? vniMap[firstVni.date] : 0;
  const baseHnx = firstHnx ? hnxMap[firstHnx.date] : 0;

  let lastVni = baseVni, lastHnx = baseHnx;
  const stock: { time: UTCTimestamp; value: number }[] = [];
  const vni: { time: UTCTimestamp; value: number }[] = [];
  const hnx: { time: UTCTimestamp; value: number }[] = [];
  ohlc.forEach(p => {
    if (vniMap[p.date] != null) lastVni = vniMap[p.date];
    if (hnxMap[p.date] != null) lastHnx = hnxMap[p.date];
    const t = toTime(p.date);
    stock.push({ time: t, value: (Number(p.close) / baseStock - 1) * 100 });
    vni.push({ time: t, value: baseVni > 0 ? (lastVni / baseVni * 100 - 100) : 0 });
    hnx.push({ time: t, value: baseHnx > 0 ? (lastHnx / baseHnx * 100 - 100) : 0 });
  });
  return { stock, vni, hnx };
}

export function PriceChartLW({ ohlc, vniPrices, hnxPrices, sym, tk, isDark, GREEN, RED, VNI_C, HNX_C, fmtPct, FONT }: PriceChartLWProps) {
  const [mode, setMode] = useState<"candle" | "pct">("candle");
  const [showVni, setShowVni] = useState(true);
  const [showHnx, setShowHnx] = useState(true);

  const candleHostRef = useRef<HTMLDivElement>(null);
  const volHostRef    = useRef<HTMLDivElement>(null);
  const pctHostRef     = useRef<HTMLDivElement>(null);

  const candleChartRef  = useRef<IChartApi | null>(null);
  const volChartRef     = useRef<IChartApi | null>(null);
  const pctChartRef     = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);
  const stockLineRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const vniLineRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const hnxLineRef      = useRef<ISeriesApi<"Line"> | null>(null);

  const baseOpts = (host: HTMLDivElement) => ({
    width: host.clientWidth,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: tk.MUTED, fontFamily: FONT },
    grid: { vertLines: { color: tk.GRID_STROKE }, horzLines: { color: tk.GRID_STROKE } },
    rightPriceScale: { borderColor: tk.BORDER },
    timeScale: { borderColor: tk.BORDER, timeVisible: false },
    crosshair: { mode: 0 },
  });

  // Khởi tạo chart 1 lần khi mount
  useEffect(() => {
    if (!candleHostRef.current || !volHostRef.current || !pctHostRef.current) return;

    const candleChart = createChart(candleHostRef.current, { ...baseOpts(candleHostRef.current), height: 220 });
    const candleSeries = candleChart.addSeries(CandlestickSeries, {
      upColor: GREEN, downColor: RED, borderVisible: false, wickUpColor: GREEN, wickDownColor: RED,
    });
    candleChartRef.current = candleChart;
    candleSeriesRef.current = candleSeries;

    const volChart = createChart(volHostRef.current, { ...baseOpts(volHostRef.current), height: 70 });
    const volSeries = volChart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volChartRef.current = volChart;
    volSeriesRef.current = volSeries;

    // Đồng bộ cuộn/zoom giữa nến và volume
    candleChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) volChart.timeScale().setVisibleLogicalRange(r); });
    volChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) candleChart.timeScale().setVisibleLogicalRange(r); });

    const pctChart = createChart(pctHostRef.current, { ...baseOpts(pctHostRef.current), height: 240 });
    const stockLine = pctChart.addSeries(LineSeries, { color: GREEN, lineWidth: 2 });
    const vniLine   = pctChart.addSeries(LineSeries, { color: VNI_C, lineWidth: 1, lineStyle: LineStyle.Dashed });
    const hnxLine   = pctChart.addSeries(LineSeries, { color: HNX_C, lineWidth: 1, lineStyle: LineStyle.Dashed });
    pctChartRef.current = pctChart;
    stockLineRef.current = stockLine;
    vniLineRef.current = vniLine;
    hnxLineRef.current = hnxLine;

    const onResize = () => {
      if (candleHostRef.current) candleChart.applyOptions({ width: candleHostRef.current.clientWidth });
      if (volHostRef.current) volChart.applyOptions({ width: volHostRef.current.clientWidth });
      if (pctHostRef.current) pctChart.applyOptions({ width: pctHostRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      candleChart.remove(); volChart.remove(); pctChart.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Đổ data khi ohlc/index đổi
  useEffect(() => {
    if (!candleSeriesRef.current || !volSeriesRef.current) return;
    candleSeriesRef.current.setData(ohlc.map(r => ({ time: toTime(r.date), open: r.open, high: r.high, low: r.low, close: r.close })));
    volSeriesRef.current.setData(ohlc.map(r => ({ time: toTime(r.date), value: r.volume, color: r.close >= r.open ? `${GREEN}80` : `${RED}80` })));
    candleChartRef.current?.timeScale().fitContent();
    volChartRef.current?.timeScale().fitContent();

    const pct = buildPctSeries(ohlc, vniPrices, hnxPrices);
    stockLineRef.current?.setData(pct.stock);
    vniLineRef.current?.setData(pct.vni);
    hnxLineRef.current?.setData(pct.hnx);
    pctChartRef.current?.timeScale().fitContent();
  }, [ohlc, vniPrices, hnxPrices, GREEN, RED]);

  // Đổi tab Nến/% so sánh: container vừa hiện lại từ display:none có thể vẫn giữ
  // clientWidth=0 tại thời điểm chart được tạo (nếu tab đó chưa từng hiện) — phải
  // đo lại kích thước thật và resize + fit lại range mỗi lần tab được hiện ra.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (mode === "candle") {
        if (candleHostRef.current) candleChartRef.current?.applyOptions({ width: candleHostRef.current.clientWidth });
        if (volHostRef.current) volChartRef.current?.applyOptions({ width: volHostRef.current.clientWidth });
        candleChartRef.current?.timeScale().fitContent();
        volChartRef.current?.timeScale().fitContent();
      } else {
        if (pctHostRef.current) pctChartRef.current?.applyOptions({ width: pctHostRef.current.clientWidth });
        pctChartRef.current?.timeScale().fitContent();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Toggle hiện/ẩn VN-Index, HNX-Index trên chart %
  useEffect(() => {
    vniLineRef.current?.applyOptions({ visible: showVni });
  }, [showVni]);
  useEffect(() => {
    hnxLineRef.current?.applyOptions({ visible: showHnx });
  }, [showHnx]);

  // Cập nhật theme khi đổi dark/light
  useEffect(() => {
    [candleChartRef.current, volChartRef.current, pctChartRef.current].forEach(c => {
      c?.applyOptions({
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: tk.MUTED, fontFamily: FONT },
        grid: { vertLines: { color: tk.GRID_STROKE }, horzLines: { color: tk.GRID_STROKE } },
        rightPriceScale: { borderColor: tk.BORDER },
        timeScale: { borderColor: tk.BORDER },
      });
    });
  }, [isDark, tk]);

  const lastPct = { stock: 0, vni: 0, hnx: 0 };
  const pctPreview = buildPctSeries(ohlc, vniPrices, hnxPrices);
  if (pctPreview.stock.length) lastPct.stock = pctPreview.stock[pctPreview.stock.length - 1].value;
  if (pctPreview.vni.length)   lastPct.vni   = pctPreview.vni[pctPreview.vni.length - 1].value;
  if (pctPreview.hnx.length)   lastPct.hnx   = pctPreview.hnx[pctPreview.hnx.length - 1].value;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["candle", "pct"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "5px 13px", borderRadius: 8, border: "none", cursor: "pointer",
            background: mode === m ? "#0849AC" : tk.CARD2,
            color: mode === m ? "#fff" : tk.MUTED,
            fontSize: 12, fontWeight: mode === m ? 700 : 500, fontFamily: FONT,
          }}>{m === "candle" ? "Nến" : "% so sánh"}</button>
        ))}
      </div>

      {/* Cả 2 luôn mount (giữ chart instance sống), chỉ ẩn/hiện bằng display để tránh
          phải huỷ/tạo lại chart mỗi lần đổi chế độ (tốn hiệu năng + mất trạng thái zoom). */}
      <div style={{ display: mode === "candle" ? "block" : "none" }}>
        <div ref={candleHostRef} />
        <div ref={volHostRef} style={{ marginTop: 2 }} />
      </div>
      <div style={{ display: mode === "pct" ? "block" : "none" }}>
        <div ref={pctHostRef} />
        <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.05)", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(26,26,46,0.12)"}` }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: GREEN }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: tk.TEXT }}>{sym}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: lastPct.stock >= 0 ? GREEN : RED }}>{fmtPct(lastPct.stock)}</span>
          </div>
          <button onClick={() => setShowVni(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: FONT, background: showVni ? (isDark ? "rgba(93,127,255,0.12)" : "rgba(93,127,255,0.08)") : "transparent", border: showVni ? "1px solid rgba(93,127,255,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}` }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: showVni ? VNI_C : "transparent", border: showVni ? "none" : `2px solid ${VNI_C}` }} />
            <span style={{ fontSize: 12, fontWeight: showVni ? 700 : 400, color: showVni ? tk.TEXT : tk.MUTED }}>VN-Index</span>
            {showVni && <span style={{ fontSize: 12, fontWeight: 700, color: lastPct.vni >= 0 ? GREEN : RED }}>{fmtPct(lastPct.vni)}</span>}
          </button>
          <button onClick={() => setShowHnx(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: FONT, background: showHnx ? (isDark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)") : "transparent", border: showHnx ? "1px solid rgba(139,92,246,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}` }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: showHnx ? HNX_C : "transparent", border: showHnx ? "none" : `2px solid ${HNX_C}` }} />
            <span style={{ fontSize: 12, fontWeight: showHnx ? 700 : 400, color: showHnx ? tk.TEXT : tk.MUTED }}>HNX-Index</span>
            {showHnx && <span style={{ fontSize: 12, fontWeight: 700, color: lastPct.hnx >= 0 ? GREEN : RED }}>{fmtPct(lastPct.hnx)}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
