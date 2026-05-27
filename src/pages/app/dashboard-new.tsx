import { useState } from "react";
import { ArrowUpRight, AlertTriangle, TrendingUp, TrendingDown, RefreshCw, Eye, BarChart2, FileText, Layers, Globe, Sparkles, Lightbulb, ChevronDown } from "lucide-react";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";

interface DashboardProps {
  onNavigate: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  isDark?: boolean;
}

function PctBadge({ value }: { value: number }) {
  const isUp = value > 0;
  const isDown = value < 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)",
      color: isUp ? "#34C759" : isDown ? "#FF3B30" : "rgba(26,26,46,0.45)",
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function MoverPctBadge({ value, isCeil, isFloor }: { value: number; isCeil?: boolean; isFloor?: boolean }) {
  if (isCeil) return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(124,58,237,0.12)", color: "#7C3AED", fontFamily: "'Montserrat', system-ui, sans-serif" }}>+{value.toFixed(2)}%</span>;
  if (isFloor) return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{value.toFixed(2)}%</span>;
  const isUp = value > 0, isDown = value < 0;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "rgba(26,26,46,0.45)", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{isUp ? "+" : ""}{value.toFixed(2)}%</span>;
}

const topGainers = [
  { symbol: "HPG", price: 26500, pct: 4.10, vol: "12.4M", isCeil: false, isFloor: false },
  { symbol: "VIC", price: 47800, pct: 3.80, vol: "9.2M", isCeil: false, isFloor: false },
  { symbol: "MSN", price: 68200, pct: 2.91, vol: "6.8M", isCeil: false, isFloor: false },
  { symbol: "STB", price: 31200, pct: 7.00, vol: "5.1M", isCeil: true, isFloor: false },
  { symbol: "TCB", price: 24800, pct: 2.40, vol: "8.4M", isCeil: false, isFloor: false },
];

const topLosers = [
  { symbol: "MWG", price: 62100, pct: -3.20, vol: "8.1M", isCeil: false, isFloor: false },
  { symbol: "DXG", price: 14200, pct: -2.90, vol: "5.6M", isCeil: false, isFloor: false },
  { symbol: "PDR", price: 11800, pct: -7.00, vol: "5.6M", isCeil: false, isFloor: true },
  { symbol: "NVL", price: 8900, pct: -2.50, vol: "3.8M", isCeil: false, isFloor: false },
  { symbol: "SHB", price: 8200, pct: -1.80, vol: "6.2M", isCeil: false, isFloor: false },
];

const sectors = [
  { name: "Thép", pct: 2.8 }, { name: "IT/Tech", pct: 1.4 },
  { name: "Ngân hàng", pct: 0.9 }, { name: "Hóa chất", pct: 0.6 },
  { name: "BĐS", pct: -1.9 }, { name: "Bán lẻ", pct: -1.2 },
  { name: "Xây dựng", pct: -0.8 }, { name: "Thủy sản", pct: -0.4 },
];

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

function getSectorColor(pct: number) {
  if (pct >= 2) return { bg: "rgba(52,199,89,0.25)", text: "#1a7a3a" };
  if (pct >= 0.5) return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (pct >= 0) return { bg: "rgba(52,199,89,0.06)", text: "#34C759" };
  if (pct >= -0.5) return { bg: "rgba(255,59,48,0.06)", text: "#FF3B30" };
  if (pct >= -2) return { bg: "rgba(255,59,48,0.12)", text: "#FF3B30" };
  return { bg: "rgba(255,59,48,0.25)", text: "#cc1010" };
}

function DragHint() {
  return (
    <div style={{
      position: "absolute", top: 8, right: 8,
      background: "rgba(8,73,172,0.10)", borderRadius: 6,
      padding: "3px 7px", display: "flex", alignItems: "center", gap: 4,
      opacity: 0, transition: "opacity 150ms ease",
      pointerEvents: "none",
    }} className="drag-hint">
      <span style={{ fontSize: 10, fontWeight: 700, color: "#0849AC", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        ⠿ Kéo vào AI
      </span>
    </div>
  );
}

function IndexCard({ name, value, change, pct, sparkline, vol, isDark = false }: {
  name: string; value: number; change: number; pct: number; sparkline: number[]; vol: string; isDark?: boolean;
}) {
  const isUp = change >= 0;
  const maxSpark = Math.max(...sparkline);
  const minSpark = Math.min(...sparkline);
  const range = maxSpark - minSpark || 1;
  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";

  const handleDragStart = (e: React.DragEvent) => {
    const card: ContextCard = {
      id: `index-${name}`,
      type: "index",
      label: name,
      badge: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
      summary: `${value.toLocaleString("vi-VN")} · Vol: ${vol}`,
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        background: cardBg, borderRadius: 14, padding: 16,
        boxShadow: cardShadow,
        flex: 1, minWidth: 0, cursor: "grab", position: "relative",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
        const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
        if (hint) hint.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
        const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
        if (hint) hint.style.opacity = "0";
      }}
      onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      onDragStartCapture={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
    >
      <DragHint />
      <div style={{ fontSize: 12, color: fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 4, fontWeight: 600, letterSpacing: "0.04em" }}>
        {name}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 4 }}>
        {value.toLocaleString("vi-VN")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {isUp ? <TrendingUp size={14} color="#34C759" strokeWidth={1.5} /> : <TrendingDown size={14} color="#FF3B30" strokeWidth={1.5} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? "#34C759" : "#FF3B30", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{pct.toFixed(2)}%)
        </span>
      </div>
      <svg width="100%" height={32} viewBox={`0 0 ${sparkline.length * 10} 32`} preserveAspectRatio="none" style={{ marginBottom: 6 }}>
        <polyline
          points={sparkline.map((v, i) => `${i * 10 + 5},${32 - ((v - minSpark) / range) * 28}`).join(" ")}
          fill="none" stroke={isUp ? "#34C759" : "#FF3B30"}
          strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <div style={{ fontSize: 12, color: fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        Vol: {vol}
      </div>
    </div>
  );
}

export function Dashboard({ onNavigate, onSelectTicker, isDark = false }: DashboardProps) {
  const cardBg = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.60)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const hoverBg = isDark ? "#1a2438" : "#E8F0FE";
  const [marketExpanded, setMarketExpanded] = useState(true);
  const _quickActionBg = isDark ? "#131824" : "#F5F5F7";
  const _quickActionBorder = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  void _quickActionBg; void _quickActionBorder;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });

  const holdings = [
    { symbol: "VCB", name: "Vietcombank", price: 91200, change: 0.80, status: "normal" },
    { symbol: "HPG", name: "Hoà Phát", price: 26500, change: 4.10, status: "brief" },
    { symbol: "MWG", name: "Mobile World", price: 62100, change: -3.20, status: "alert" },
    { symbol: "FPT", name: "FPT Corp", price: 128400, change: 1.45, status: "normal" },
    { symbol: "VNM", name: "Vinamilk", price: 68900, change: -0.43, status: "normal" },
  ];

  const news = [
    { title: "HPG dẫn đầu sàn nhờ giá thép HRC phục hồi", tag: "Tích cực", source: "CafeF", time: "30p" },
    { title: "FPT ĐHCĐ 14:00 hôm nay, cổ tức dự kiến 20%", tag: "Sự kiện", source: "Vietstock", time: "1h" },
    { title: "NHNN giữ lãi suất điều hành, thị trường ổn định", tag: "Trung lập", source: "HOSE", time: "2h" },
    { title: "Phó TGĐ HPG đăng ký bán 500,000 cp", tag: "Cảnh báo", source: "HOSE Filing", time: "3h" },
  ];

  const reports = [
    {
      id: "r1",
      title: "HPG: Khuyến nghị MUA — Giá mục tiêu 31,500",
      source: "VNDIRECT Research",
      sourceShort: "VNDIRECT",
      time: "2 giờ trước",
      excerpt: "Giá thép HRC phục hồi +8% từ đáy tháng 3, HPG dự kiến LNST Q2 tăng 35% YoY. P/E forward 10.2x hấp dẫn so với trung bình ngành.",
      rating: "MUA",
      ratingColor: "#15803D",
      ratingBg: "rgba(21,128,61,0.10)",
      icon: TrendingUp,
      iconBg: "linear-gradient(135deg, #1a5c2e 0%, #27a348 100%)",
      tickers: ["HPG"],
    },
    {
      id: "r2",
      title: "Triển vọng ngành ngân hàng Q2/2026: NIM cải thiện",
      source: "SSI Research",
      sourceShort: "SSI",
      time: "5 giờ trước",
      excerpt: "Lãi suất ổn định kết hợp tín dụng tăng trưởng 14–15% tạo nền tảng cho NIM phục hồi. Ưu tiên VCB, TCB trong quý này.",
      rating: "Tích cực",
      ratingColor: "#0849AC",
      ratingBg: "rgba(8,73,172,0.10)",
      icon: BarChart2,
      iconBg: "linear-gradient(135deg, #0a2a6e 0%, #1a56c8 100%)",
      tickers: ["VCB", "TCB"],
    },
    {
      id: "r3",
      title: "Chiến lược tháng 5/2026: Phòng thủ có chọn lọc",
      source: "Wealbee AI",
      sourceShort: "Wealbee",
      time: "8 giờ trước",
      excerpt: "VN-Index tiệm cận kháng cự 1,310 điểm. Khuyến nghị giảm beta danh mục, tăng tỷ trọng nhóm tiêu dùng thiết yếu và ngân hàng lớn.",
      rating: "Trung lập",
      ratingColor: "#7c3aed",
      ratingBg: "rgba(124,58,237,0.10)",
      icon: Layers,
      iconBg: "linear-gradient(135deg, #3b0d8a 0%, #7c3aed 100%)",
      tickers: [],
    },
    {
      id: "r4",
      title: "FPT: Cập nhật sau ĐHCĐ — Kế hoạch lợi nhuận 2026",
      source: "VCSC",
      sourceShort: "VCSC",
      time: "1 ngày trước",
      excerpt: "Ban lãnh đạo đặt mục tiêu doanh thu 75,000 tỷ (+12% YoY), cổ tức tiền mặt 3,000đ/cp. Mảng xuất khẩu phần mềm tiếp tục là động lực chính.",
      rating: "MUA",
      ratingColor: "#15803D",
      ratingBg: "rgba(21,128,61,0.10)",
      icon: Globe,
      iconBg: "linear-gradient(135deg, #0d4f6e 0%, #4D8FE8 100%)",
      tickers: ["FPT"],
    },
    {
      id: "r5",
      title: "Vĩ mô Việt Nam tháng 5: CPI, tỷ giá và dòng vốn ngoại",
      source: "HSC Research",
      sourceShort: "HSC",
      time: "1 ngày trước",
      excerpt: "CPI 3.7% nằm trong biên kiểm soát. USD/VND ổn định 25,400 nhờ xuất siêu. Khối ngoại mua ròng 1,240 tỷ trong tuần qua — tín hiệu tích cực.",
      rating: "Tích cực",
      ratingColor: "#0849AC",
      ratingBg: "rgba(8,73,172,0.10)",
      icon: FileText,
      iconBg: "linear-gradient(135deg, #6b2a0a 0%, #d4700a 100%)",
      tickers: [],
    },
  ];

  const tagColors: Record<string, { bg: string; text: string }> = {
    "Tích cực": { bg: "rgba(52,199,89,0.12)", text: "#34C759" },
    "Sự kiện": { bg: "rgba(8,73,172,0.10)", text: "#0849AC" },
    "Trung lập": { bg: "rgba(26,26,46,0.08)", text: "rgba(26,26,46,0.60)" },
    "Cảnh báo": { bg: "rgba(255,59,48,0.10)", text: "#FF3B30" },
  };

  const handlePortfolioDragStart = (e: React.DragEvent) => {
    const card: ContextCard = {
      id: "portfolio-main",
      type: "portfolio",
      label: "Danh mục của bạn",
      badge: "+0.67% hôm nay",
      summary: "5 mã · 1,247,500,000 đ · VCB HPG MWG FPT VNM",
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleNewsDragStart = (e: React.DragEvent, item: typeof news[0]) => {
    const card: ContextCard = {
      id: `news-${item.title.slice(0, 20)}`,
      type: "news",
      label: item.title.length > 32 ? item.title.slice(0, 32) + "…" : item.title,
      badge: item.tag,
      summary: `${item.source} · ${item.time} trước`,
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleReportDragStart = (e: React.DragEvent, report: typeof reports[0]) => {
    const card: ContextCard = {
      id: `report-${report.id}`,
      type: "report",
      label: report.title.length > 40 ? report.title.slice(0, 40) + "…" : report.title,
      badge: report.sourceShort,
      summary: report.excerpt.slice(0, 80) + "…",
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>
      {/* Greeting header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: fgSubtle, marginBottom: 2 }}>{dateStr} · {timeStr}</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: fg, margin: 0 }}>Chào An.</h1>
        </div>
        <button style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10,
          border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: cardBg,
          cursor: "pointer", fontSize: 13, fontWeight: 600, color: brand,
          fontFamily: "'Montserrat', system-ui, sans-serif",
        }}>
          <RefreshCw size={14} strokeWidth={1.5} /> Làm mới
        </button>
      </div>

      {/* AI Highlights */}
      <div style={{
        background: cardBg, borderRadius: 14, padding: 20,
        boxShadow: cardShadow, marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: brand, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={12} strokeWidth={1.5} color={brand} /> ĐIỂM NỔI BẬT HÔM NAY
        </div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
            <span style={{ color: brand, marginTop: 2, flexShrink: 0 }}>•</span>
            <span>HPG tăng <PctBadge value={4.10} /> nhờ giá thép HRC phục hồi · Insider bán 500k cp<sup style={{ fontSize: 10, color: brand, marginLeft: 2 }}>[1]</sup></span>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
            <span style={{ color: brand, marginTop: 2, flexShrink: 0 }}>•</span>
            <span>CPI tháng 4: 3.7%, NHNN giữ lãi suất điều hành</span>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
            <span style={{ color: brand, marginTop: 2, flexShrink: 0 }}>•</span>
            <span>FPT ĐHCĐ hôm nay lúc 14:00 — dự kiến công bố kế hoạch cổ tức</span>
          </li>
        </ul>

        <div style={{ height: "0.5px", background: divider, margin: "16px 0" }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366F1", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Lightbulb size={12} strokeWidth={1.5} color="#6366F1" /> Ý NGHĨA
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
            <span style={{ color: "#6366F1", marginTop: 2, flexShrink: 0 }}>•</span>
            <span>Nhóm thép hưởng lợi ngắn hạn nếu giá HRC giữ · nhưng insider bán là tín hiệu cần theo dõi thêm</span>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5 }}>
            <span style={{ color: "#6366F1", marginTop: 2, flexShrink: 0 }}>•</span>
            <span>Lãi suất ổn định giảm áp lực P/E nhóm bất động sản</span>
          </li>
        </ul>

        <div style={{ height: "0.5px", background: divider, margin: "16px 0" }} />
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FF9500", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={12} strokeWidth={1.5} color="#FF9500" /> CẦN THEO DÕI
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: "#FF9500", marginTop: 2, flexShrink: 0 }}>•</span>
            <span style={{ fontSize: 15, color: fg, lineHeight: 1.5 }}>
              MWG <PctBadge value={-3.20} /> dưới ngưỡng cảnh báo →{" "}
              <button onClick={() => onNavigate("inbox")} style={{ background: "none", border: "none", color: brand, cursor: "pointer", fontSize: 15, fontFamily: "'Montserrat', system-ui, sans-serif", padding: 0, textDecoration: "underline" }}>
                Portfolio Health đã gửi alert
              </button>
            </span>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: "#FF9500", marginTop: 2, flexShrink: 0 }}>•</span>
            <span style={{ fontSize: 15, color: fg, lineHeight: 1.5 }}>
              HPG insider bán ·{" "}
              <button onClick={() => onNavigate("inbox")} style={{ background: "none", border: "none", color: brand, cursor: "pointer", fontSize: 15, fontFamily: "'Montserrat', system-ui, sans-serif", padding: 0, textDecoration: "underline" }}>
                xem brief Insider [2] →
              </button>
            </span>
          </li>
        </ul>
      </div>

      {/* Market section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg }}>
          CHỈ SỐ THỊ TRƯỜNG
        </span>
        <button
          onClick={() => setMarketExpanded((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, color: fgSubtle, transition: "background 120ms ease" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          title={marketExpanded ? "Ẩn thị trường" : "Hiện thị trường"}
        >
          <span style={{ fontSize: 11, fontWeight: 600 }}>{marketExpanded ? "Ẩn" : "Hiện"}</span>
          <ChevronDown size={14} strokeWidth={2} style={{ transform: marketExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 250ms ease" }} />
        </button>
      </div>

      {/* Market collapsible content */}
      <div style={{ overflow: "hidden", maxHeight: marketExpanded ? 2000 : 0, opacity: marketExpanded ? 1 : 0, transition: "max-height 350ms ease, opacity 200ms ease" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <IndexCard name="VN-INDEX (HOSE)" value={1287.34} change={5.41} pct={0.42} sparkline={[1275, 1278, 1280, 1282, 1279, 1283, 1287]} vol="8,240 tỷ" isDark={isDark} />
        <IndexCard name="HNX-INDEX" value={232.18} change={-0.25} pct={-0.11} sparkline={[233, 232.8, 232.5, 232.3, 232.6, 232.4, 232.18]} vol="1,120 tỷ" isDark={isDark} />
        <IndexCard name="UPCoM" value={96.42} change={0.00} pct={0.00} sparkline={[96.4, 96.4, 96.42, 96.41, 96.43, 96.42, 96.42]} vol="320 tỷ" isDark={isDark} />
      </div>

      {/* Top Movers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* TĂNG MẠNH */}
        {(() => {
          const gainCard: ContextCard = { id: "top-gainers", type: "mover", label: "Tăng mạnh hôm nay", badge: `${topGainers.length} mã`, summary: topGainers.map((s) => `${s.symbol} +${s.pct.toFixed(2)}%`).join(" · ") };
          return (
            <div
              {...makeDragHandlers(gainCard)}
              style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "0";
              }}
            >
              <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <TrendingUp size={15} color="#34C759" strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>TĂNG MẠNH</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {topGainers.map((s) => {
                  const rowCard: ContextCard = { id: `gain-${s.symbol}`, type: "mover", label: s.symbol, badge: `+${s.pct.toFixed(2)}%`, summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}` };
                  return (
                    <div key={s.symbol} {...makeDragHandlers(rowCard)} onClick={() => onSelectTicker?.(s.symbol)}
                      style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                      <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                      <span style={{ marginRight: 8 }}><MoverPctBadge value={s.pct} isCeil={s.isCeil} /></span>
                      <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* GIẢM MẠNH */}
        {(() => {
          const lossCard: ContextCard = { id: "top-losers", type: "mover", label: "Giảm mạnh hôm nay", badge: `${topLosers.length} mã`, summary: topLosers.map((s) => `${s.symbol} ${s.pct.toFixed(2)}%`).join(" · ") };
          return (
            <div
              {...makeDragHandlers(lossCard)}
              style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "0";
              }}
            >
              <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <TrendingDown size={15} color="#FF3B30" strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>GIẢM MẠNH</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {topLosers.map((s) => {
                  const rowCard: ContextCard = { id: `loss-${s.symbol}`, type: "mover", label: s.symbol, badge: `${s.pct.toFixed(2)}%`, summary: `${s.price.toLocaleString("vi-VN")} · Vol: ${s.vol}` };
                  return (
                    <div key={s.symbol} {...makeDragHandlers(rowCard)} onClick={() => onSelectTicker?.(s.symbol)}
                      style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                      <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{s.price.toLocaleString("vi-VN")}</span>
                      <span style={{ marginRight: 8 }}><MoverPctBadge value={s.pct} isFloor={s.isFloor} /></span>
                      <span style={{ fontSize: 12, color: fgSubtle, width: 40, textAlign: "right" }}>{s.vol}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Heatmap Ngành */}
      {(() => {
        const heatmapCard: ContextCard = { id: "heatmap-nganh", type: "index", label: "Heatmap ngành", badge: "15/05", summary: sectors.map((s) => `${s.name}: ${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(1)}%`).join(" · ") };
        return (
          <div
            {...makeDragHandlers(heatmapCard)}
            style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, marginBottom: 16, position: "relative", cursor: "grab", userSelect: "none" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
              const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
              if (h) h.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
              const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
              if (h) h.style.opacity = "0";
            }}
          >
            <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>HEATMAP NGÀNH</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {sectors.map((s) => {
                const col = getSectorColor(s.pct);
                return (
                  <div key={s.name}
                    style={{ padding: "12px 14px", borderRadius: 10, background: col.bg, cursor: "pointer", transition: "opacity 150ms ease" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: col.text }}>{s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Thanh khoản & Khối ngoại */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {(() => {
          const liqCard: ContextCard = { id: "thanh-khoan", type: "index", label: "Thanh khoản hôm nay", badge: "9,360 tỷ", summary: "HOSE: 8,240 tỷ · HNX: 1,120 tỷ · Tổng: 9,360 tỷ · vs TB30: +18%" };
          return (
            <div
              {...makeDragHandlers(liqCard)}
              style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "0";
              }}
            >
              <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>THANH KHOẢN HÔM NAY</div>
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
          );
        })()}
        {(() => {
          const foreignCard: ContextCard = { id: "khoi-ngoai", type: "index", label: "Khối ngoại hôm nay", badge: "Mua ròng", summary: "Mua ròng +124 tỷ · HPG: +48 tỷ · VCB: +31 tỷ · MSN: -22 tỷ" };
          return (
            <div
              {...makeDragHandlers(foreignCard)}
              style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
                const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null;
                if (h) h.style.opacity = "0";
              }}
            >
              <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>KHỐI NGOẠI</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#34C759", marginBottom: 8 }}>Mua ròng +124 tỷ</div>
              {[{ label: "HPG", val: "+48 tỷ", up: true }, { label: "VCB", val: "+31 tỷ", up: true }, { label: "MSN", val: "-22 tỷ", up: false }].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: fg }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: r.up ? "#34C759" : "#FF3B30" }}>{r.val}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      </div>{/* end market collapsible */}

      {/* Portfolio — draggable */}
      <div
        draggable
        onDragStart={handlePortfolioDragStart}
        onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        onDragStartCapture={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
        style={{
          background: cardBg, borderRadius: 14, padding: 20,
          boxShadow: cardShadow,
          marginBottom: 16, cursor: "grab", position: "relative", userSelect: "none",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)";
          const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
          if (hint) hint.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = cardShadow;
          const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
          if (hint) hint.style.opacity = "0";
        }}
      >
        <DragHint />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg, marginBottom: 4 }}>
              DANH MỤC CỦA BẠN
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: fg }}>1,247,500,000 đ</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <TrendingUp size={14} color="#34C759" strokeWidth={1.5} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#34C759" }}>+8,340,000 · +0.67% hôm nay</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate("portfolio"); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10,
              border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: "transparent",
              cursor: "pointer", fontSize: 13, fontWeight: 600, color: brand,
              fontFamily: "'Montserrat', system-ui, sans-serif",
            }}
          >
            Xem danh mục <ArrowUpRight size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {holdings.map((h) => (
            <div
              key={h.symbol}
              onClick={() => onSelectTicker?.(h.symbol)}
              style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ width: 60, fontWeight: 700, fontSize: 14, color: fg }}>{h.symbol}</span>
              <span style={{ flex: 1, fontSize: 13, color: fgMuted }}>{h.name}</span>
              <span style={{ width: 80, fontSize: 14, fontWeight: 600, color: fg, textAlign: "right" }}>{h.price.toLocaleString("vi-VN")}</span>
              <div style={{ width: 80, display: "flex", justifyContent: "flex-end" }}><PctBadge value={h.change} /></div>
              <div style={{ width: 90, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                {h.status === "normal" && <span style={{ fontSize: 12, color: "#34C759" }}>●</span>}
                {h.status === "brief" && <span onClick={(e) => { e.stopPropagation(); onNavigate("inbox"); }} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", color: brand, cursor: "pointer" }}>⚑ Brief →</span>}
                {h.status === "alert" && <span onClick={(e) => { e.stopPropagation(); onNavigate("inbox"); }} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(255,149,0,0.12)", color: "#FF9500", cursor: "pointer" }}>⚠ Alert →</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* News — each card draggable */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>
          TIN TỨC
        </div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {news.map((item, i) => {
            const tagStyle = tagColors[item.tag] || tagColors["Trung lập"];
            return (
              <div
                key={i}
                draggable
                onDragStart={(e) => handleNewsDragStart(e, item)}
                onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onDragStartCapture={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                style={{ padding: "12px 14px", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"), borderRadius: 10, cursor: "grab", position: "relative", userSelect: "none", transition: "all 150ms ease" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = hoverBg;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
                  if (hint) hint.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.transform = "none";
                  const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
                  if (hint) hint.style.opacity = "0";
                }}
              >
                <DragHint />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: tagStyle.bg, color: tagStyle.text }}>{item.tag}</span>
                  <span style={{ fontSize: 12, color: fgSubtle }}>{item.source} · {item.time} trước</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: fg, lineHeight: 1.5 }}>{item.title}</p>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, color: brand, fontSize: 13, fontWeight: 600 }}>
                  Đọc thêm <ArrowUpRight size={13} strokeWidth={1.5} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis Reports */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg }}>
              BÁO CÁO PHÂN TÍCH
            </div>
          </div>
          <button style={{
            fontSize: 12, fontWeight: 600, color: brand,
            background: "transparent", border: "none", cursor: "pointer",
            padding: "4px 8px", fontFamily: "'Montserrat', system-ui, sans-serif",
          }}>
            Xem tất cả →
          </button>
        </div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 14 }} />

        {/* Report list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {reports.map((report, i) => {
            const Icon = report.icon;
            return (
              <div
                key={report.id}
                draggable
                onDragStart={(e) => handleReportDragStart(e, report)}
                onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onDragStartCapture={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                style={{
                  padding: "14px 0",
                  borderBottom: i < reports.length - 1 ? "0.5px solid " + divider : "none",
                  cursor: "grab", position: "relative", userSelect: "none",
                  transition: "background 100ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.025)";
                  (e.currentTarget as HTMLElement).style.margin = "0 -20px";
                  (e.currentTarget as HTMLElement).style.padding = "14px 20px";
                  const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
                  if (hint) hint.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.margin = "0";
                  (e.currentTarget as HTMLElement).style.padding = "14px 0";
                  const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null;
                  if (hint) hint.style.opacity = "0";
                }}
              >
                <DragHint />
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  {/* Icon block */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: report.iconBg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                  }}>
                    <Icon size={22} color="rgba(255,255,255,0.90)" strokeWidth={1.5} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: title + view button */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 5 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: fg, lineHeight: 1.4, flex: 1 }}>
                        {report.title}
                      </div>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "5px 10px", borderRadius: 8,
                          border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"),
                          background: "transparent",
                          color: brand, fontSize: 12, fontWeight: 600,
                          cursor: "pointer", flexShrink: 0,
                          fontFamily: "'Montserrat', system-ui, sans-serif",
                        }}
                      >
                        <Eye size={12} strokeWidth={1.5} /> Xem
                      </button>
                    </div>

                    {/* Meta row: source + time + badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: fgSubtle }}>
                        {report.source} · {report.time}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                        background: report.ratingBg, color: report.ratingColor,
                        letterSpacing: "0.02em",
                      }}>
                        {report.rating}
                      </span>
                      {report.tickers.map((t) => (
                        <span key={t} style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                          background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", color: brand,
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* Excerpt */}
                    <p style={{ margin: 0, fontSize: 13, color: fgMuted, lineHeight: 1.6 }}>
                      {report.excerpt}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
