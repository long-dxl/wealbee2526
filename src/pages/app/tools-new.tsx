import { useState } from "react";
import {
  TrendingUp, BarChart2, Zap, Eye, FileText,
  Calculator, Percent, Newspaper, Rss, Globe,
  Activity, GitBranch, Search, Check,
} from "lucide-react";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";

type Category = "Tất cả" | "Thị trường" | "Tài chính" | "Định giá" | "Kỹ thuật" | "Tin tức" | "Vĩ mô" | "Nội bộ";

interface Tool {
  id: string;
  name: string;
  oneliner: string;
  category: Exclude<Category, "Tất cả">;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  stats: { uses: string; speed: string; acc: string };
  available?: boolean;
}

const tools: Tool[] = [
  {
    id: "realtime-price",
    name: "Giá cổ phiếu cuối phiên",
    oneliner: "Giá đóng cửa, khối lượng & biến động theo phiên HOSE/HNX",
    category: "Thị trường",
    icon: TrendingUp,
    iconBg: "linear-gradient(135deg,#34C759,#22c55e)",
    iconColor: "#fff",
    stats: { uses: "18.2K", speed: "0.2s", acc: "99.8%" },
  },
  {
    id: "market-indices",
    name: "Chỉ số thị trường",
    oneliner: "VN-Index, HNX-Index, UPCoM theo phiên giao dịch",
    category: "Thị trường",
    icon: BarChart2,
    iconBg: "linear-gradient(135deg,#0849AC,#4D8FE8)",
    iconColor: "#fff",
    stats: { uses: "14.7K", speed: "0.3s", acc: "99.9%" },
  },
  {
    id: "top-movers",
    name: "Top tăng/giảm mạnh",
    oneliner: "Điểm nóng trong phiên — nơi dòng tiền đang chảy",
    category: "Thị trường",
    icon: Zap,
    iconBg: "linear-gradient(135deg,#FF9500,#FF3B30)",
    iconColor: "#fff",
    stats: { uses: "11.3K", speed: "0.4s", acc: "99.5%" },
  },
  {
    id: "insider-trades",
    name: "Giao dịch nội bộ",
    oneliner: "Lãnh đạo & cổ đông lớn đang mua hay bán?",
    category: "Nội bộ",
    icon: Eye,
    iconBg: "linear-gradient(135deg,#7c3aed,#a855f7)",
    iconColor: "#fff",
    stats: { uses: "6.1K", speed: "0.5s", acc: "98.2%" },
  },
  {
    id: "financial-statements",
    name: "Báo cáo tài chính",
    oneliner: "BCKQKD, BCĐKT, LCTTT từ FiinPro theo quý/năm",
    category: "Tài chính",
    icon: FileText,
    iconBg: "linear-gradient(135deg,#6366F1,#818CF8)",
    iconColor: "#fff",
    stats: { uses: "9.8K", speed: "0.7s", acc: "99.1%" },
  },
  {
    id: "pe-pb-valuation",
    name: "Định giá P/E & P/B",
    oneliner: "Cổ phiếu đang rẻ hay đắt? So sánh trailing/forward",
    category: "Định giá",
    icon: Calculator,
    iconBg: "linear-gradient(135deg,#b36200,#FF9500)",
    iconColor: "#fff",
    stats: { uses: "8.4K", speed: "0.3s", acc: "98.9%" },
  },
  {
    id: "dividend-yield",
    name: "Tỷ suất cổ tức",
    oneliner: "Thu nhập thụ động từ danh mục — vs lãi suất ngân hàng",
    category: "Định giá",
    icon: Percent,
    iconBg: "linear-gradient(135deg,#34C759,#22c55e)",
    iconColor: "#fff",
    stats: { uses: "5.2K", speed: "0.2s", acc: "99.3%" },
  },
  {
    id: "cafef-news",
    name: "Tin tức CafeF",
    oneliner: "Nguồn tài chính hàng đầu Việt Nam — cập nhật liên tục",
    category: "Tin tức",
    icon: Newspaper,
    iconBg: "linear-gradient(135deg,#0849AC,#2563eb)",
    iconColor: "#fff",
    stats: { uses: "22.6K", speed: "0.6s", acc: "97.8%" },
  },
  {
    id: "vietstock-news",
    name: "Tin tức Vietstock",
    oneliner: "Phân tích chuyên gia & nhận định thị trường chuyên sâu",
    category: "Tin tức",
    icon: Rss,
    iconBg: "linear-gradient(135deg,#0849AC,#6366F1)",
    iconColor: "#fff",
    stats: { uses: "15.1K", speed: "0.5s", acc: "97.5%" },
  },
  {
    id: "macro-data",
    name: "Dữ liệu kinh tế vĩ mô",
    oneliner: "CPI, lãi suất điều hành & tỷ giá USD/VND từ NHNN",
    category: "Vĩ mô",
    icon: Globe,
    iconBg: "linear-gradient(135deg,#FF3B30,#ef4444)",
    iconColor: "#fff",
    stats: { uses: "7.9K", speed: "0.8s", acc: "99.7%" },
    available: false,
  },
  {
    id: "rsi",
    name: "RSI — Quá mua / Quá bán",
    oneliner: "RSI 14 ngày: vùng >70 quá mua, <30 quá bán",
    category: "Kỹ thuật",
    icon: Activity,
    iconBg: "linear-gradient(135deg,#4b5563,#6b7280)",
    iconColor: "#fff",
    stats: { uses: "10.3K", speed: "0.4s", acc: "96.4%" },
    available: false,
  },
  {
    id: "macd",
    name: "MACD — Xu hướng & Động lực",
    oneliner: "MACD(12,26,9): phát hiện đảo chiều & sức mạnh xu hướng",
    category: "Kỹ thuật",
    icon: GitBranch,
    iconBg: "linear-gradient(135deg,#1A1A2E,#374151)",
    iconColor: "#fff",
    stats: { uses: "9.7K", speed: "0.4s", acc: "95.8%" },
    available: false,
  },
];

const catStyle: Record<Exclude<Category, "Tất cả">, { bg: string; text: string }> = {
  "Thị trường": { bg: "rgba(52,199,89,0.12)", text: "#1a7a3a" },
  "Tài chính": { bg: "rgba(255,149,0,0.12)", text: "#b36200" },
  "Định giá": { bg: "rgba(109,40,217,0.10)", text: "#6d28d9" },
  "Kỹ thuật": { bg: "rgba(26,26,46,0.08)", text: "rgba(26,26,46,0.65)" },
  "Tin tức": { bg: "rgba(99,102,241,0.12)", text: "#4338ca" },
  "Vĩ mô": { bg: "rgba(255,59,48,0.10)", text: "#c41a1a" },
  "Nội bộ": { bg: "rgba(8,73,172,0.10)", text: "#0849AC" },
};

const CATS: Category[] = ["Tất cả", "Thị trường", "Tài chính", "Định giá", "Kỹ thuật", "Tin tức", "Vĩ mô", "Nội bộ"];

export function ToolLibrary({ isDark = false }: { isDark?: boolean }) {
  const cardBg = isDark ? "#131824" : "#fff";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.55)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.40)" : "rgba(26,26,46,0.45)";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.30)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const inputBg = isDark ? "#131824" : "#fff";
  const inputBorder = isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.15)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";

  const [active, setActive] = useState<Category>("Tất cả");
  const [search, setSearch] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  const filtered = tools.filter((t) => {
    const matchCat = active === "Tất cả" || t.category === active;
    const q = search.toLowerCase();
    return matchCat && (!q || t.name.toLowerCase().includes(q) || t.oneliner.toLowerCase().includes(q));
  });

  const handleDragStart = (e: React.DragEvent, tool: Tool) => {
    const card: ContextCard = {
      id: `tool-${tool.id}`,
      type: "tool",
      label: tool.name,
      badge: tool.category,
      summary: tool.oneliner,
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
    (e.currentTarget as HTMLElement).style.opacity = "0.6";
  };

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: "0 0 4px" }}>Công cụ phân tích</h1>
        <p style={{ margin: 0, fontSize: 13, color: fgSubtle }}>
          {tools.length} công cụ tích hợp sẵn · Kéo vào Action Hub để hỏi sâu hơn
        </p>
      </div>

      {/* Category tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {CATS.map((cat) => (
          <button
            key={cat}
            onClick={() => setActive(cat)}
            style={{
              padding: "6px 14px", borderRadius: 99, border: "none", cursor: "pointer",
              background: active === cat ? brand : isDark ? "rgba(255,255,255,0.07)" : "rgba(26,26,46,0.06)",
              color: active === cat ? "#fff" : fgMuted,
              fontSize: 12, fontWeight: active === cat ? 700 : 500,
              fontFamily: "'Montserrat', system-ui, sans-serif",
              transition: "all 120ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {cat}
            {active === cat && filtered.length !== tools.length && (
              <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.8 }}>({filtered.length})</span>
            )}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: inputBg, border: "0.5px solid " + inputBorder, borderRadius: 10, padding: "0 12px", height: 36 }}>
          <Search size={14} strokeWidth={1.5} color={fgDisabled} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm công cụ…"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif", width: 140 }}
          />
        </div>
      </div>

      {/* 3-column card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {filtered.map((tool) => {
          const cs = catStyle[tool.category];
          const Icon = tool.icon;
          const hovered = hoverId === tool.id;

          const unavail = tool.available === false;
          return (
            <div
              key={tool.id}
              draggable={!unavail}
              onDragStart={(e) => !unavail && handleDragStart(e, tool)}
              onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseEnter={() => !unavail && setHoverId(tool.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                background: cardBg,
                borderRadius: 14,
                padding: "16px 16px 14px",
                opacity: unavail ? 0.45 : 1,
                filter: unavail ? "grayscale(0.6)" : "none",
                cursor: unavail ? "default" : "grab",
                border: hovered
                  ? "1px solid " + (isDark ? "rgba(77,143,232,0.35)" : "rgba(8,73,172,0.20)")
                  : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.09)"),
                boxShadow: hovered
                  ? isDark ? "0 8px 24px rgba(0,0,0,0.40)" : "0 8px 24px rgba(8,73,172,0.10)"
                  : isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.06)",
                cursor: "grab",
                userSelect: "none",
                transition: "box-shadow 150ms ease, border 150ms ease, transform 120ms ease",
                transform: hovered ? "translateY(-2px)" : "none",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Top row: icon + drag hint */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                {/* Icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: tool.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
                }}>
                  <Icon size={22} color={tool.iconColor} strokeWidth={1.5} />
                </div>

                {/* Drag badge */}
                <div style={{
                  opacity: hovered ? 1 : 0,
                  transition: "opacity 150ms ease",
                  background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.08)",
                  borderRadius: 6, padding: "3px 8px",
                  fontSize: 10, fontWeight: 700, color: brand,
                  fontFamily: "'Montserrat', system-ui, sans-serif",
                  display: "flex", alignItems: "center", gap: 3,
                  pointerEvents: "none",
                }}>
                  ⠿ Kéo vào AI
                </div>
              </div>

              {/* Name + verified / coming soon */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: fg, marginBottom: 3, lineHeight: 1.3 }}>
                  {tool.name}
                </div>
                {tool.available === false ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", color: fgSubtle }}>Sắp ra mắt</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check size={9} color="#fff" strokeWidth={3} />
                    </div>
                    <span style={{ fontSize: 11, color: fgSubtle, fontWeight: 500 }}>Wealbee · Tích hợp chính thức</span>
                  </div>
                )}
              </div>

              {/* One-liner description */}
              <p style={{
                margin: 0, fontSize: 12, color: fgMuted, lineHeight: 1.55,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
              }}>
                {tool.oneliner}
              </p>

              {/* Divider */}
              <div style={{ height: "0.5px", background: divider }} />

              {/* Bottom: category tag + stats */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
                  background: cs.bg, color: cs.text,
                  letterSpacing: "0.02em",
                }}>
                  {tool.category}
                </span>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <StatBit value={tool.stats.uses} label="lượt" isDark={isDark} />
                  <StatBit value={tool.stats.speed} label="" isDark={isDark} />
                  <StatBit value={tool.stats.acc} label="" color="#34C759" isDark={isDark} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 15, color: fgSubtle, margin: 0 }}>Không tìm thấy công cụ phù hợp</p>
        </div>
      )}
    </div>
  );
}

function StatBit({ value, label, color, isDark }: { value: string; label: string; color?: string; isDark?: boolean }) {
  return (
    <span style={{ fontSize: 11, color: color || (isDark ? "rgba(240,242,255,0.35)" : "rgba(26,26,46,0.40)"), fontWeight: 600, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {value}{label ? ` ${label}` : ""}
    </span>
  );
}
