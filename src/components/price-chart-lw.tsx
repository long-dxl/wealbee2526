// Chart giá cổ phiếu — Chiến lược A: tự vẽ bằng lightweight-charts (thư viện mã
// nguồn mở do chính TradingView duy trì) + data OHLCV thật từ Supabase prices_daily
// (nguồn DNSE, pipeline hiện có). Thay cho AreaChart Recharts trước đây.
// 2 chế độ: Nến (candlestick + volume, dùng OHLC thật — riêng khung "1D" là nến
// 1 phút trong phiên lấy trực tiếp từ DNSE qua edge function intraday-quote,
// không đi qua Supabase DB) và % so sánh (mã vs VN-Index vs HNX-Index).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "../lib/supabase/client";
import { fmtStockPrice, fmtStockChange } from "../lib/format-price";

// Trục giá + legend OHLC hiển thị theo đơn vị "nghìn đồng" (chuẩn bảng giá chứng
// khoán VN — SSI iBoard, VNDirect, TCBS, DNSE, Finpath đều quy ước vậy: 12.600đ
// hiện là "12.60"), phẩy ngăn cách nghìn/chấm thập phân theo chuẩn ngành, KHÔNG
// theo locale vi-VN thông thường (chấm ngăn nghìn/phẩy thập phân).
const axisPriceFormatter = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type OhlcRow = { date: string; open: number; high: number; low: number; close: number; volume: number };
type IndexRow = { date: string; close: number };
// Dạng chuẩn hoá dùng chung để đổ vào series — "date" (chuỗi ngày, dùng cho data
// theo ngày) hoặc "1D" (nến phút, time là unix giây thật) đều quy về đây trước
// khi vẽ, để phần còn lại của component không cần biết đang ở nguồn nào.
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number };

interface PriceChartLWProps {
  ohlc: OhlcRow[];
  periodCutoff: string;   // mốc ngày bắt đầu của khung đang chọn (7D/1M/3M/YTD/5Y) — chỉ dùng để ZOOM + làm baseline %, KHÔNG cắt bỏ data
  period: string;         // "1D" | "7D" | "1M" | "3M" | "YTD" | "5Y" — "1D" kích hoạt chế độ nến phút riêng
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
  isMobile?: boolean;
  // Trang cha (ticker-detail-page) sở hữu state "period" và render pill chọn
  // khung thời gian NGOÀI component này — khi bung full-screen (che kín toàn bộ
  // trang), pill đó bị khuất theo nên phải có cách đổi khung ngay trong overlay.
  onPeriodChange?: (p: string) => void;
  // Tên đầy đủ công ty + thời điểm cập nhật giá — hiện ở footer full-screen (mobile
  // header rút gọn không có 2 thông tin này) để tận dụng khoảng trống dưới chart.
  companyName?: string;
  updatedAt?: string;
  // Full-screen ẩn hẳn header trang (giống Finpath — tập trung tối đa cho chart),
  // thay bằng 1 pill nổi gọn hiện mã + giá + % thay đổi — lấy đúng số liệu trang
  // cha đã tính (đồng bộ với mọi nơi khác trên trang, tránh lệch số do tính lại).
  latestClose?: number | null;
  chgAbs?: number | null;
  chgPct?: number | null;
}

const FS_PERIODS = ["1D", "7D", "1M", "3M", "YTD", "5Y"] as const;

const toTime = (dateStr: string): UTCTimestamp => (Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000) as UTCTimestamp);

const fmtVol = (v: number): string => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

function buildPctSeries(ohlc: OhlcRow[], vniPrices: IndexRow[], hnxPrices: IndexRow[], periodCutoff: string) {
  if (!ohlc.length) return { stock: [], vni: [], hnx: [] };
  const vniMap: Record<string, number> = {};
  vniPrices.forEach(v => { vniMap[v.date] = Number(v.close); });
  const hnxMap: Record<string, number> = {};
  hnxPrices.forEach(v => { hnxMap[v.date] = Number(v.close); });

  // Chart So sánh KHÔNG áp dụng kiểu "zoom, giữ nguyên data cũ" như chart Nến —
  // chuẩn tài chính khi so sánh hiệu suất là chỉ hiển thị ĐÚNG trong khung đã
  // chọn, mốc đầu tiên luôn = 0%. Nên phải CẮT data về đúng khung (periodCutoff)
  // trước khi build series, chứ không chỉ dịch baseline như trước.
  const periodOhlc = ohlc.filter(p => p.date >= periodCutoff);
  if (!periodOhlc.length) return { stock: [], vni: [], hnx: [] };

  const baseStock = Number(periodOhlc[0].close);
  const firstVni = periodOhlc.find(p => vniMap[p.date] != null);
  const firstHnx = periodOhlc.find(p => hnxMap[p.date] != null);
  const baseVni = firstVni ? vniMap[firstVni.date] : 0;
  const baseHnx = firstHnx ? hnxMap[firstHnx.date] : 0;

  let lastVni = baseVni, lastHnx = baseHnx;
  const stock: { time: UTCTimestamp; value: number }[] = [];
  const vni: { time: UTCTimestamp; value: number }[] = [];
  const hnx: { time: UTCTimestamp; value: number }[] = [];
  periodOhlc.forEach(p => {
    if (vniMap[p.date] != null) lastVni = vniMap[p.date];
    if (hnxMap[p.date] != null) lastHnx = hnxMap[p.date];
    const t = toTime(p.date);
    stock.push({ time: t, value: (Number(p.close) / baseStock - 1) * 100 });
    vni.push({ time: t, value: baseVni > 0 ? (lastVni / baseVni * 100 - 100) : 0 });
    hnx.push({ time: t, value: baseHnx > 0 ? (lastHnx / baseHnx * 100 - 100) : 0 });
  });
  return { stock, vni, hnx };
}

export function PriceChartLW({ ohlc, periodCutoff, period, vniPrices, hnxPrices, sym, tk, isDark, GREEN, RED, VNI_C, HNX_C, fmtPct, FONT, isMobile = false, onPeriodChange, companyName, updatedAt, latestClose, chgAbs, chgPct }: PriceChartLWProps) {
  const [mode, setMode] = useState<"candle" | "pct">("candle");
  const [showVni, setShowVni] = useState(true);
  const [showHnx, setShowHnx] = useState(true);
  const [hoverBar, setHoverBar] = useState<Bar | null>(null);   // null = chưa hover, hiện nến mới nhất
  // Mobile: xem chart trong 1 card nhỏ giữa trang khá gò bó khi cần soi kỹ nến/
  // volume — cho phép bung chart ra chiếm trọn viewport (đóng bằng nút X/thu nhỏ).
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [intradayBars, setIntradayBars] = useState<Bar[]>([]);
  const [intradayLoading, setIntradayLoading] = useState(false);
  const [intradayError, setIntradayError] = useState<string | null>(null);
  const is1D = period === "1D";

  const candleHostRef = useRef<HTMLDivElement>(null);
  const volHostRef    = useRef<HTMLDivElement>(null);
  const pctHostRef     = useRef<HTMLDivElement>(null);
  const ohlcByTimeRef  = useRef<Map<number, Bar>>(new Map());

  const candleChartRef  = useRef<IChartApi | null>(null);
  const volChartRef     = useRef<IChartApi | null>(null);
  const pctChartRef     = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);
  const stockLineRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const vniLineRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const hnxLineRef      = useRef<ISeriesApi<"Line"> | null>(null);

  // Nến hiện đang vẽ trên chart Nến/Volume — "1D" dùng nến phút từ DNSE (edge
  // function, không lưu DB), các khung còn lại dùng data ngày sẵn có trong `ohlc`.
  // BẮT BUỘC useMemo: nếu tính lại (map) mỗi lần render sẽ ra mảng MỚI dù nội
  // dung y hệt — effect đổ data bên dưới lấy activeBars làm dependency nên sẽ
  // tưởng data đổi và chạy lại applyCandleZoom() mỗi khi component render lại
  // (kể cả chỉ vì di chuột đổi hoverBar), kéo camera zoom về đúng khung period
  // ban đầu liên tục → user tưởng bị KHOÁ zoom, không zoom ra được (đã gặp thực tế).
  const activeBars: Bar[] = useMemo(() => (
    is1D
      ? intradayBars
      : ohlc.map(r => ({ time: toTime(r.date), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume }))
  ), [is1D, intradayBars, ohlc]);

  // Chiều cao chart theo breakpoint + trạng thái full-screen — mobile mặc định
  // cao hơn desktop 1 chút (nhiều đất hơn khi không có sidebar/ActionHub chiếm
  // 2 bên). Full-screen ẩn hẳn chrome của trang (header trang + app-bar — xem
  // pill nổi thay thế bên dưới) nên tận dụng gần hết chiều cao viewport thật:
  // volH tăng theo % thay vì cố định 120 như trước (khối lượng từng bị "lùn"
  // so với không gian thật có), chừa lại cho footer tên công ty/giờ cập nhật.
  const computeHeights = (fullscreen: boolean, mobile: boolean) => {
    if (fullscreen) {
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      return {
        candleH: Math.max(300, Math.round(vh * 0.50)),
        volH: Math.max(100, Math.round(vh * 0.17)),
        pctH: Math.max(340, Math.round(vh * 0.62)),
      };
    }
    return { candleH: mobile ? 240 : 220, volH: mobile ? 80 : 70, pctH: mobile ? 260 : 240 };
  };

  const baseOpts = (host: HTMLDivElement) => ({
    width: host.clientWidth,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: tk.MUTED, fontFamily: FONT },
    grid: { vertLines: { color: tk.GRID_STROKE }, horzLines: { color: tk.GRID_STROKE } },
    // minimumWidth cố định — bắt buộc để cột giá bên phải của chart Nến và Volume
    // rộng bằng nhau (nếu không, label "9,500.00" so với "555.1K" khác độ rộng
    // ký tự sẽ khiến 2 chart co giãn khác nhau, làm đường crosshair bị lệch trục
    // dọc giữa 2 pane dù cùng 1 vị trí thời gian).
    // minimumWidth giảm từ 70 -> 56: sau khi giá cổ phiếu quy về đơn vị nghìn
    // đồng (2 số thập phân, VD "16.00" thay vì "16000.00"), chuỗi nhãn ngắn hơn
    // hẳn, gutter trục Y không cần rộng như cũ — kéo trục sát mép phải hơn.
    rightPriceScale: { borderColor: tk.BORDER, minimumWidth: 56 },
    timeScale: { borderColor: tk.BORDER, timeVisible: false },
    crosshair: { mode: 0 },
  });

  // Khởi tạo chart 1 lần khi mount
  useEffect(() => {
    if (!candleHostRef.current || !volHostRef.current || !pctHostRef.current) return;
    const initH = computeHeights(false, isMobile); // isFullscreen luôn false lúc mount

    // Chart Nến KHÔNG hiện trục thời gian riêng (ẩn hẳn hàng tháng/ngày) — chỉ
    // chart Volume bên dưới hiện, để không bị lặp 2 hàng label. Logo TradingView
    // cũng dời xuống góc chart Volume cho đồng bộ với chỗ hiện trục thời gian.
    const candleChart = createChart(candleHostRef.current, {
      ...baseOpts(candleHostRef.current), height: initH.candleH,
      layout: { ...baseOpts(candleHostRef.current).layout, attributionLogo: false },
      timeScale: { ...baseOpts(candleHostRef.current).timeScale, visible: false },
    });
    const candleSeries = candleChart.addSeries(CandlestickSeries, {
      upColor: GREEN, downColor: RED, borderVisible: false, wickUpColor: GREEN, wickDownColor: RED,
      priceFormat: { type: "custom", formatter: axisPriceFormatter, minMove: 0.01 },
    });
    candleChartRef.current = candleChart;
    candleSeriesRef.current = candleSeries;

    const volChart = createChart(volHostRef.current, { ...baseOpts(volHostRef.current), height: initH.volH, layout: { ...baseOpts(volHostRef.current).layout, attributionLogo: true } });
    const volSeries = volChart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volChartRef.current = volChart;
    volSeriesRef.current = volSeries;

    // Đồng bộ cuộn/zoom giữa nến và volume
    candleChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) volChart.timeScale().setVisibleLogicalRange(r); });
    volChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) candleChart.timeScale().setVisibleLogicalRange(r); });

    // Rê chuột vào 1 cây nến → hiện O/H/L/C/Volume của đúng ngày/phút đó (tra
    // theo ohlcByTimeRef, luôn được cập nhật ở effect đổ data bên dưới). Đồng
    // thời ĐỒNG BỘ crosshair (đường kẻ dọc + nhãn thời gian trên trục dưới,
    // nhãn giá bên phải) sang chart Volume — 2 chart tách biệt nên mặc định
    // không tự nối với nhau, phải setCrosshairPosition thủ công để trông liền
    // mạch như 1 chart 2 pane. Đồng bộ CẢ 2 CHIỀU: rê ở Volume cũng phải phản
    // chiếu ngược lại chart Nến. isSyncingRef chặn vòng lặp nếu
    // setCrosshairPosition vô tình bắn lại sự kiện subscribeCrosshairMove của
    // chính chart vừa set.
    const isSyncingRef = { current: false };
    candleChart.subscribeCrosshairMove(param => {
      if (isSyncingRef.current) return;
      if (!param.time) { setHoverBar(null); volChart.clearCrosshairPosition(); return; }
      const row = ohlcByTimeRef.current.get(param.time as number);
      setHoverBar(row ?? null);
      isSyncingRef.current = true;
      if (row) volChart.setCrosshairPosition(row.volume, param.time, volSeries);
      else volChart.clearCrosshairPosition();
      isSyncingRef.current = false;
    });
    volChart.subscribeCrosshairMove(param => {
      if (isSyncingRef.current) return;
      if (!param.time) { setHoverBar(null); candleChart.clearCrosshairPosition(); return; }
      const row = ohlcByTimeRef.current.get(param.time as number);
      setHoverBar(row ?? null);
      isSyncingRef.current = true;
      if (row) candleChart.setCrosshairPosition(row.close / 1000, param.time, candleSeries);
      else candleChart.clearCrosshairPosition();
      isSyncingRef.current = false;
    });

    const pctChart = createChart(pctHostRef.current, { ...baseOpts(pctHostRef.current), height: initH.pctH, layout: { ...baseOpts(pctHostRef.current).layout, attributionLogo: false } });
    const pctFormat = { type: "custom" as const, formatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` };
    const stockLine = pctChart.addSeries(LineSeries, { color: GREEN, lineWidth: 2, priceFormat: pctFormat });
    const vniLine   = pctChart.addSeries(LineSeries, { color: VNI_C, lineWidth: 1, lineStyle: LineStyle.Dashed, priceFormat: pctFormat });
    const hnxLine   = pctChart.addSeries(LineSeries, { color: HNX_C, lineWidth: 1, lineStyle: LineStyle.Dashed, priceFormat: pctFormat });
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

  // Gọi edge function intraday-quote khi bật khung "1D" — nến 1 phút lấy trực
  // tiếp từ DNSE, KHÔNG qua Supabase DB (pipeline hiện tại chỉ gộp nến phút
  // thành 1 dòng ngày, không lưu lịch sử theo phút). Mỗi lần bật lại "1D" hoặc
  // đổi mã đều fetch mới (không cache) vì đây là dữ liệu realtime trong phiên.
  useEffect(() => {
    if (!is1D || !sym) { setIntradayError(null); return; }
    let cancelled = false;
    setIntradayLoading(true);
    setIntradayError(null);
    supabase.functions.invoke("intraday-quote", { body: { symbol: sym } })
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
  }, [is1D, sym]);

  // Chart Nến/Volume — khung "1D": fit vừa khít nến phút trong phiên (không có
  // "lịch sử ngoài khung" để zoom/pan ra). Các khung ngày khác: ZOOM vào
  // [periodCutoff, nến mới nhất] bằng LOGICAL RANGE (theo index nến, không theo
  // timestamp — đáng tin cậy hơn setVisibleRange vì không phụ thuộc periodCutoff
  // có trùng khớp chính xác ngày giao dịch hay không cuối tuần/lễ), data vẫn
  // giữ NGUYÊN toàn bộ lịch sử để pan/kéo ra ngoài khung.
  const applyCandleZoom = () => {
    if (!activeBars.length) return;
    if (is1D) { candleChartRef.current?.timeScale().fitContent(); return; }
    const fromIdx = ohlc.findIndex(p => p.date >= periodCutoff);
    const from = fromIdx === -1 ? 0 : fromIdx;
    const logicalRange = { from: from - 0.5, to: activeBars.length - 0.5 };
    candleChartRef.current?.timeScale().setVisibleLogicalRange(logicalRange);
    // volChart tự đồng bộ theo candleChart qua subscribeVisibleLogicalRangeChange ở trên
  };

  // Chart So sánh: data đã được buildPctSeries CẮT đúng khung periodCutoff rồi
  // (chuẩn tài chính: mốc đầu = 0%, không hiện gì trước đó), nên chỉ cần fit
  // vừa khít toàn bộ data hiện có, không zoom theo full-history. Không áp dụng
  // cho "1D" (so sánh % theo phút với chỉ số ngày không có ý nghĩa).
  const applyPctFit = () => {
    pctChartRef.current?.timeScale().fitContent();
  };

  // Đổ data khi ohlc/index/period đổi
  useEffect(() => {
    if (!candleSeriesRef.current || !volSeriesRef.current) return;
    // Chia 1000 khi đổ vào series — trục Y + nhãn giá nến hiển thị theo đơn vị
    // nghìn đồng (xem axisPriceFormatter). ohlcByTimeRef/activeBars vẫn giữ giá
    // trị VND gốc để không ảnh hưởng logic khác (buildPctSeries, zoom theo index...).
    candleSeriesRef.current.setData(activeBars.map(b => ({ time: b.time, open: b.open / 1000, high: b.high / 1000, low: b.low / 1000, close: b.close / 1000 })));
    volSeriesRef.current.setData(activeBars.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? `${GREEN}80` : `${RED}80` })));
    ohlcByTimeRef.current = new Map(activeBars.map(b => [b.time, b]));

    // Trục thời gian dưới Volume: "1D" hiện giờ:phút, các khung khác hiện ngày/tháng.
    volChartRef.current?.applyOptions({ timeScale: { timeVisible: is1D, secondsVisible: false } });

    if (!is1D) {
      const pct = buildPctSeries(ohlc, vniPrices, hnxPrices, periodCutoff);
      stockLineRef.current?.setData(pct.stock);
      vniLineRef.current?.setData(pct.vni);
      hnxLineRef.current?.setData(pct.hnx);
      applyPctFit();
    }

    applyCandleZoom();
  }, [activeBars, ohlc, vniPrices, hnxPrices, periodCutoff, is1D, GREEN, RED]);

  // Đổi tab Nến/% so sánh: container vừa hiện lại từ display:none có thể vẫn giữ
  // clientWidth=0 tại thời điểm chart được tạo (nếu tab đó chưa từng hiện) — phải
  // đo lại kích thước thật và fit/zoom lại đúng khung period hiện tại mỗi lần tab hiện ra.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (mode === "candle") {
        if (candleHostRef.current) candleChartRef.current?.applyOptions({ width: candleHostRef.current.clientWidth });
        if (volHostRef.current) volChartRef.current?.applyOptions({ width: volHostRef.current.clientWidth });
        applyCandleZoom();
      } else {
        if (pctHostRef.current) pctChartRef.current?.applyOptions({ width: pctHostRef.current.clientWidth });
        applyPctFit();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bật/tắt full-screen (hoặc đổi breakpoint) — chart đã tạo 1 lần lúc mount với
  // height cố định, phải applyOptions lại height + width rồi refit/zoom đúng
  // chế độ đang xem. requestAnimationFrame vì container vừa đổi layout (fixed
  // inset:0) có thể chưa kịp phản ánh clientWidth mới trong cùng tick.
  useEffect(() => {
    const { candleH, volH, pctH } = computeHeights(isFullscreen, isMobile);
    candleChartRef.current?.applyOptions({ height: candleH });
    volChartRef.current?.applyOptions({ height: volH });
    pctChartRef.current?.applyOptions({ height: pctH });
    const raf = requestAnimationFrame(() => {
      if (candleHostRef.current) candleChartRef.current?.applyOptions({ width: candleHostRef.current.clientWidth });
      if (volHostRef.current) volChartRef.current?.applyOptions({ width: volHostRef.current.clientWidth });
      if (pctHostRef.current) pctChartRef.current?.applyOptions({ width: pctHostRef.current.clientWidth });
      if (mode === "candle") applyCandleZoom(); else applyPctFit();
    });
    return () => cancelAnimationFrame(raf);
  }, [isFullscreen, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const displayBar = hoverBar ?? activeBars[activeBars.length - 1] ?? null;
  const barUp = displayBar ? displayBar.close >= displayBar.open : true;
  const barColor = barUp ? GREEN : RED;

  const lastPct = { stock: 0, vni: 0, hnx: 0 };
  const pctPreview = buildPctSeries(ohlc, vniPrices, hnxPrices, periodCutoff);
  if (pctPreview.stock.length) lastPct.stock = pctPreview.stock[pctPreview.stock.length - 1].value;
  if (pctPreview.vni.length)   lastPct.vni   = pctPreview.vni[pctPreview.vni.length - 1].value;
  if (pctPreview.hnx.length)   lastPct.hnx   = pctPreview.hnx[pctPreview.hnx.length - 1].value;

  // Legend OHLC/Vol 1 hàng ngang bất cứ khi nào đủ rộng: desktop (luôn rộng) hoặc
  // mobile full-screen (không còn header trang chiếm chỗ, thừa hẳn không gian) —
  // chỉ card nhúng trên mobile (chật, cạnh sidebar/ActionHub) mới cần grid 3 cột.
  const legendSingleRow = !isMobile || isFullscreen;
  const isPriceUp = chgAbs != null ? chgAbs >= 0 : true;

  return (
    <div style={isFullscreen ? {
      // Full-screen ẩn hẳn chrome của trang (app-bar + header trang) — giống
      // triết lý Finpath: tập trung tối đa cho chart. Thay vào đó là 1 pill nổi
      // gọn (mã + giá + %) ngay bên dưới, không chiếm nguyên 1 hàng header cứng.
      position: "fixed", inset: 0, zIndex: 500, background: tk.CARD,
      // Lề phải giảm còn 6px (thay vì 14px như lề trái) — full-screen là màn hình
      // dành riêng cho chart, trục giá nên sát mép phải nhất có thể mà vẫn chừa đủ
      // để không dính viền/bo góc thiết bị (khác padding card thường cần đều 4 phía).
      padding: "calc(12px + env(safe-area-inset-top)) 6px calc(16px + env(safe-area-inset-bottom)) 14px",
      overflowY: "auto",
    } : undefined}>
      {/* Pill nổi mã + giá + % — thay thế hoàn toàn header trang bị ẩn khi
          full-screen, phong cách Finpath nhưng theo màu sắc/font Wealbee
          (CARD2 + border thay vì nền đen trong suốt, brand color cho mã). */}
      {isFullscreen && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "7px 12px", borderRadius: 10, background: tk.CARD2, border: `1px solid ${tk.BORDER}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: tk.MUTED, fontFamily: FONT }}>{sym}</span>
          {latestClose != null && (
            <span style={{ fontSize: 15, fontWeight: 800, color: tk.TEXT, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{fmtStockPrice(latestClose)}</span>
          )}
          {chgAbs != null && chgPct != null && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: isPriceUp ? GREEN : RED, fontFamily: FONT }}>
              {fmtStockChange(chgAbs)} ({isPriceUp ? "+" : ""}{chgPct.toFixed(2)}%)
            </span>
          )}
        </div>
      )}
      {isFullscreen && onPeriodChange && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {FS_PERIODS.map(p => (
            <button key={p} onClick={() => onPeriodChange(p)} style={{
              padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer", flexShrink: 0,
              background: period === p ? "#0849AC" : tk.CARD2,
              color: period === p ? "#fff" : tk.MUTED,
              fontSize: 12.5, fontWeight: period === p ? 700 : 500, fontFamily: FONT,
            }}>{p}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["candle", "pct"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "5px 13px", borderRadius: 8, border: "none", cursor: "pointer",
              background: mode === m ? "#0849AC" : tk.CARD2,
              color: mode === m ? "#fff" : tk.MUTED,
              fontSize: 12, fontWeight: mode === m ? 700 : 500, fontFamily: FONT,
            }}>{m === "candle" ? "Nến" : "Tương quan"}</button>
          ))}
        </div>
        {/* Mở rộng toàn màn hình — chỉ mobile cần (desktop đã đủ chỗ trong layout 3 cột).
            marginRight 10px: canvas trục giá bên phải rộng hơn số hiển thị thật ~10px
            (lightweight-charts tự chừa margin nội bộ quanh nhãn giá) — lùi nút vào
            đúng 10px để thẳng hàng dọc với chữ số trục Oy thay vì với mép canvas. */}
        {isMobile && (
          <button onClick={() => setIsFullscreen(v => !v)} title={isFullscreen ? "Thu nhỏ" : "Mở rộng toàn màn hình"} style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, flexShrink: 0,
            marginRight: 10, borderRadius: 8, border: "none", cursor: "pointer", background: tk.CARD2, color: tk.MUTED,
            WebkitTapHighlightColor: "transparent",
          }}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>

      {/* Cả 2 luôn mount (giữ chart instance sống), chỉ ẩn/hiện bằng display để tránh
          phải huỷ/tạo lại chart mỗi lần đổi chế độ (tốn hiệu năng + mất trạng thái zoom). */}
      <div style={{ display: mode === "candle" ? "block" : "none" }}>
        <div style={{ position: "relative" }}>
          {displayBar && (
            /* legendSingleRow=false (chỉ còn card nhúng chật trên mobile): grid cố
               định 3 cột — tránh số liệu dài tràn vào vùng trục giá bên phải, gây
               chữ đè chữ. legendSingleRow=true (desktop, hoặc mobile full-screen —
               đủ rộng): 1 hàng ngang gọn, không cần vỡ dòng. Tên mã không lặp lại ở
               đây nữa — header trang (luôn hiện, kể cả khi full-screen) đã có sẵn. */
            <div style={{
              position: "absolute", top: 6, left: 6, zIndex: 2,
              maxWidth: isMobile ? "calc(100% - 84px)" : "calc(100% - 110px)",
              display: legendSingleRow ? "flex" : "grid",
              gridTemplateColumns: legendSingleRow ? undefined : "repeat(3, 1fr)",
              gap: legendSingleRow ? 14 : "2px 10px",
              fontSize: isMobile ? 11 : 12, fontFamily: FONT, pointerEvents: "none",
              background: isDark ? "rgba(11,13,24,0.55)" : "rgba(255,255,255,0.72)",
              borderRadius: 6, padding: "3px 7px",
            }}>
              <span style={{ color: tk.MUTED, whiteSpace: "nowrap" }}>O <b style={{ color: barColor }}>{fmtStockPrice(displayBar.open)}</b></span>
              <span style={{ color: tk.MUTED, whiteSpace: "nowrap" }}>H <b style={{ color: barColor }}>{fmtStockPrice(displayBar.high)}</b></span>
              <span style={{ color: tk.MUTED, whiteSpace: "nowrap" }}>L <b style={{ color: barColor }}>{fmtStockPrice(displayBar.low)}</b></span>
              <span style={{ color: tk.MUTED, whiteSpace: "nowrap" }}>C <b style={{ color: barColor }}>{fmtStockPrice(displayBar.close)}</b></span>
              <span style={{ color: tk.MUTED, whiteSpace: "nowrap", gridColumn: legendSingleRow ? undefined : "span 2" }}>Vol <b style={{ color: tk.TEXT }}>{fmtVol(displayBar.volume)}</b></span>
            </div>
          )}
          {is1D && (intradayLoading || intradayError) && (
            <div style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: FONT, color: tk.MUTED, background: isDark ? "rgba(11,13,24,0.5)" : "rgba(255,255,255,0.6)" }}>
              {intradayLoading ? "Đang tải dữ liệu trong phiên…" : intradayError}
            </div>
          )}
          <div ref={candleHostRef} />
        </div>
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
      {/* Footer full-screen: tận dụng khoảng trống còn lại dưới chart — header
          trang trên mobile rút gọn không hiện tên đầy đủ (ellipsis) lẫn giờ cập
          nhật, nên vẫn cần thông tin này ở đây dù header đã hiện phía trên. */}
      {isFullscreen && (companyName || updatedAt) && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${tk.BORDER}` }}>
          {companyName && <div style={{ fontSize: 15, fontWeight: 700, color: tk.TEXT }}>{companyName}</div>}
          {updatedAt && <div style={{ fontSize: 12, color: tk.MUTED, marginTop: 3 }}>{sym} · Cập nhật lúc {updatedAt}</div>}
        </div>
      )}
    </div>
  );
}
