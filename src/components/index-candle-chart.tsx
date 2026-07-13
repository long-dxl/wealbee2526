// Chart nến cho modal chi tiết chỉ số (VN-Index/VN30/HNX-Index/UPCOM) — cùng
// pattern lightweight-charts đã dùng ở trang chi tiết cổ phiếu (price-chart-lw.tsx):
// zoom theo logical range giữ nguyên toàn bộ lịch sử (không cắt khi đổi khung
// 7D/1M/3M/YTD/5Y), đồng bộ crosshair 2 chiều nến↔volume, chỉ 1 logo TradingView,
// khung "1D" gọi edge function intraday-quote lấy nến phút thật từ DNSE
// (kind=index). Không có tab "So sánh" — chỉ số không cần so sánh với chính nó.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries,
  ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { supabase } from "../lib/supabase/client";

type IdxRow = { date: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null };
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number };

interface IndexCandleChartProps {
  rows: IdxRow[];
  periodCutoff: string;
  period: string;      // "1D" | "7D" | "1M" | "3M" | "YTD" | "5Y"
  symbol: string;       // mã DNSE của chỉ số (VNINDEX/HNX/VN30/UPCOM) — dùng khi period="1D"
  isDark: boolean;
  UP: string;
  DOWN: string;
  fmtNum: (v: number | null | undefined, d?: number) => string;
  fmtVol: (v: number | null | undefined) => string;
  // Chiều cao chart — cho phép nơi gọi (modal full-screen trên mobile) truyền
  // giá trị lớn hơn để tận dụng không gian dọc rộng rãi hơn khi modal chiếm
  // trọn viewport, thay vì cố định 1 mức cho mọi kích thước màn hình.
  candleHeight?: number;
  volHeight?: number;
  isMobile?: boolean;
}

const toTime = (dateStr: string): UTCTimestamp => (Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000) as UTCTimestamp);

// Trục giá bên phải: chỉ số là điểm số, không chia 1000 — chỉ cần phẩy ngăn
// nghìn + chấm thập phân theo chuẩn ngành (vd "1,800.54"), khác định dạng mặc
// định của lightweight-charts (không có dấu ngăn cách hàng nghìn).
const axisPriceFormatter = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function IndexCandleChart({ rows, periodCutoff, period, symbol, isDark, UP, DOWN, fmtNum, fmtVol, candleHeight = 260, volHeight = 76, isMobile = false }: IndexCandleChartProps) {
  const [hoverBar, setHoverBar] = useState<Bar | null>(null);
  const [intradayBars, setIntradayBars] = useState<Bar[]>([]);
  const [intradayLoading, setIntradayLoading] = useState(false);
  const [intradayError, setIntradayError] = useState<string | null>(null);
  const is1D = period === "1D";

  const candleHostRef = useRef<HTMLDivElement>(null);
  const volHostRef    = useRef<HTMLDivElement>(null);
  const candleChartRef  = useRef<IChartApi | null>(null);
  const volChartRef     = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barByTimeRef    = useRef<Map<number, Bar>>(new Map());

  // Chỉ số nào cũng có OHLC đầy đủ trong market_indices — không cần bar nào
  // thiếu open/high/low (fallback về close nếu thiếu, hiếm khi xảy ra).
  const dailyBars: Bar[] = useMemo(() => rows
    .filter(r => r.close != null)
    .map(r => ({
      time: toTime(r.date),
      open: r.open ?? r.close, high: r.high ?? r.close, low: r.low ?? r.close, close: r.close,
      volume: r.volume ?? 0,
    })), [rows]);

  const activeBars: Bar[] = is1D ? intradayBars : dailyBars;

  const baseOpts = (host: HTMLDivElement, textColor: string, gridColor: string, borderColor: string) => ({
    width: host.clientWidth,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor, fontFamily: "'Montserrat', system-ui, sans-serif" },
    grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
    // minimumWidth cố định — bắt buộc để cột giá bên phải của chart Nến và
    // Volume rộng bằng nhau. LƯU Ý: đây là FLOOR (tối thiểu), không phải giá
    // trị CỐ ĐỊNH — nếu label tự nhiên của 1 trong 2 chart (giá "1,800.54" vs
    // volume "845.36M", label giá trị hiện tại dạng chip đậm/đệm rộng hơn tick
    // thường) vượt quá minimumWidth, chart đó sẽ rộng hơn minimumWidth, phá vỡ
    // sự bằng nhau. Giảm từ 100 -> 76 để trục sát mép phải hơn (vẫn đủ rộng
    // cho cả 2 loại label trong thực tế, chỉ bớt khoảng trắng dư thừa).
    rightPriceScale: { borderColor, minimumWidth: 76 },
    timeScale: { borderColor, timeVisible: false },
    crosshair: { mode: 0 as const },
  });

  useEffect(() => {
    if (!candleHostRef.current || !volHostRef.current) return;
    const textColor  = isDark ? "rgba(240,242,255,0.45)" : "#3D3D52";
    const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(8,73,172,0.07)";
    const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)";

    const candleChart = createChart(candleHostRef.current, {
      ...baseOpts(candleHostRef.current, textColor, gridColor, borderColor), height: candleHeight,
      layout: { ...baseOpts(candleHostRef.current, textColor, gridColor, borderColor).layout, attributionLogo: false },
      timeScale: { ...baseOpts(candleHostRef.current, textColor, gridColor, borderColor).timeScale, visible: false },
    });
    const candleSeries = candleChart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: "custom", formatter: axisPriceFormatter, minMove: 0.01 },
    });
    candleChartRef.current = candleChart;
    candleSeriesRef.current = candleSeries;

    const volChart = createChart(volHostRef.current, {
      ...baseOpts(volHostRef.current, textColor, gridColor, borderColor), height: volHeight,
      layout: { ...baseOpts(volHostRef.current, textColor, gridColor, borderColor).layout, attributionLogo: true },
    });
    const volSeries = volChart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volChartRef.current = volChart;
    volSeriesRef.current = volSeries;

    candleChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) volChart.timeScale().setVisibleLogicalRange(r); });
    volChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) candleChart.timeScale().setVisibleLogicalRange(r); });

    const isSyncingRef = { current: false };
    candleChart.subscribeCrosshairMove(param => {
      if (isSyncingRef.current) return;
      if (!param.time) { setHoverBar(null); volChart.clearCrosshairPosition(); return; }
      const bar = barByTimeRef.current.get(param.time as number);
      setHoverBar(bar ?? null);
      isSyncingRef.current = true;
      if (bar) volChart.setCrosshairPosition(bar.volume, param.time, volSeries);
      else volChart.clearCrosshairPosition();
      isSyncingRef.current = false;
    });
    volChart.subscribeCrosshairMove(param => {
      if (isSyncingRef.current) return;
      if (!param.time) { setHoverBar(null); candleChart.clearCrosshairPosition(); return; }
      const bar = barByTimeRef.current.get(param.time as number);
      setHoverBar(bar ?? null);
      isSyncingRef.current = true;
      if (bar) candleChart.setCrosshairPosition(bar.close, param.time, candleSeries);
      else candleChart.clearCrosshairPosition();
      isSyncingRef.current = false;
    });

    const onResize = () => {
      if (candleHostRef.current) candleChart.applyOptions({ width: candleHostRef.current.clientWidth });
      if (volHostRef.current) volChart.applyOptions({ width: volHostRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      candleChart.remove(); volChart.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gọi edge function intraday-quote khi bật "1D" — nến phút của CHỈ SỐ, lấy
  // trực tiếp từ DNSE (kind=index), KHÔNG qua DB (không lưu lịch sử phút).
  useEffect(() => {
    if (!is1D || !symbol) { setIntradayError(null); return; }
    let cancelled = false;
    setIntradayLoading(true);
    setIntradayError(null);
    supabase.functions.invoke("intraday-quote", { body: { symbol, kind: "index" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.bars) {
          setIntradayError("Không tải được dữ liệu trong phiên hôm nay.");
          setIntradayBars([]);
          return;
        }
        const bars: Bar[] = (data.bars as any[]).map(b => ({
          time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
        }));
        setIntradayBars(bars);
        if (!bars.length) setIntradayError("Ngoài giờ giao dịch hoặc chưa có dữ liệu phiên hôm nay.");
      })
      .catch(() => { if (!cancelled) { setIntradayError("Lỗi kết nối."); setIntradayBars([]); } })
      .finally(() => { if (!cancelled) setIntradayLoading(false); });
    return () => { cancelled = true; };
  }, [is1D, symbol]);

  const applyZoom = () => {
    if (!activeBars.length) return;
    if (is1D) { candleChartRef.current?.timeScale().fitContent(); return; }
    const fromIdx = activeBars.findIndex(b => b.time >= toTime(periodCutoff));
    const from = fromIdx === -1 ? 0 : fromIdx;
    candleChartRef.current?.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: activeBars.length - 0.5 });
  };

  useEffect(() => {
    if (!candleSeriesRef.current || !volSeriesRef.current) return;
    candleSeriesRef.current.setData(activeBars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    volSeriesRef.current.setData(activeBars.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? `${UP}80` : `${DOWN}80` })));
    barByTimeRef.current = new Map(activeBars.map(b => [b.time, b]));
    volChartRef.current?.applyOptions({ timeScale: { timeVisible: is1D, secondsVisible: false } });
    applyZoom();
  }, [activeBars, periodCutoff, is1D, UP, DOWN]); // eslint-disable-line react-hooks/exhaustive-deps

  // candleHeight/volHeight đổi (VD: mở modal full-screen trên mobile) — chart đã
  // tạo 1 lần lúc mount với height cố định, phải applyOptions lại + refit zoom.
  useEffect(() => {
    if (!candleChartRef.current || !volChartRef.current) return;
    candleChartRef.current.applyOptions({ height: candleHeight });
    volChartRef.current.applyOptions({ height: volHeight });
    if (candleHostRef.current) candleChartRef.current.applyOptions({ width: candleHostRef.current.clientWidth });
    if (volHostRef.current) volChartRef.current.applyOptions({ width: volHostRef.current.clientWidth });
    applyZoom();
  }, [candleHeight, volHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme đổi (isDark) — hiếm khi đổi khi modal đang mở, nhưng vẫn xử lý cho gọn.
  useEffect(() => {
    const textColor  = isDark ? "rgba(240,242,255,0.45)" : "#3D3D52";
    const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(8,73,172,0.07)";
    const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.10)";
    [candleChartRef.current, volChartRef.current].forEach(c => {
      c?.applyOptions({
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { borderColor, minimumWidth: 76 },
        timeScale: { borderColor },
      });
    });
  }, [isDark]);

  const displayBar = hoverBar ?? activeBars[activeBars.length - 1] ?? null;
  const barColor = displayBar && displayBar.close >= displayBar.open ? UP : DOWN;
  const mutedColor = isDark ? "rgba(240,242,255,0.45)" : "#3D3D52";
  const textColor = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";

  return (
    <div>
      <div style={{ position: "relative" }}>
        {displayBar && (
          /* Grid cố định 3 cột thay vì flexWrap tự do — flexWrap từng bị số liệu dài
             (VD "1.829,50") đẩy tràn vào đúng vùng trục giá bên phải (minimumWidth
             100), gây chữ đè chữ. Grid luôn chia đều trong maxWidth an toàn nên
             không bao giờ chạm trục giá dù số liệu dài ngắn thế nào. */
          <div style={{
            position: "absolute", top: 6, left: 6, zIndex: 2,
            maxWidth: isMobile ? "calc(100% - 84px)" : "calc(100% - 110px)",
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px 8px",
            fontSize: isMobile ? 10 : 11, fontFamily: "'Montserrat', system-ui, sans-serif",
            pointerEvents: "none", background: isDark ? "rgba(19,24,36,0.55)" : "rgba(255,255,255,0.72)",
            borderRadius: 6, padding: "3px 6px",
          }}>
            <span style={{ color: mutedColor, whiteSpace: "nowrap" }}>O <b style={{ color: barColor }}>{fmtNum(displayBar.open, 2)}</b></span>
            <span style={{ color: mutedColor, whiteSpace: "nowrap" }}>H <b style={{ color: barColor }}>{fmtNum(displayBar.high, 2)}</b></span>
            <span style={{ color: mutedColor, whiteSpace: "nowrap" }}>L <b style={{ color: barColor }}>{fmtNum(displayBar.low, 2)}</b></span>
            <span style={{ color: mutedColor, whiteSpace: "nowrap" }}>C <b style={{ color: barColor }}>{fmtNum(displayBar.close, 2)}</b></span>
            <span style={{ color: mutedColor, whiteSpace: "nowrap", gridColumn: "span 2" }}>Vol <b style={{ color: textColor }}>{fmtVol(displayBar.volume)}</b></span>
          </div>
        )}
        {is1D && (intradayLoading || intradayError) && (
          <div style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: "'Montserrat', system-ui, sans-serif", color: mutedColor, background: isDark ? "rgba(19,24,36,0.5)" : "rgba(255,255,255,0.6)" }}>
            {intradayLoading ? "Đang tải dữ liệu trong phiên…" : intradayError}
          </div>
        )}
        <div ref={candleHostRef} />
      </div>
      <div ref={volHostRef} style={{ marginTop: 2 }} />
    </div>
  );
}
