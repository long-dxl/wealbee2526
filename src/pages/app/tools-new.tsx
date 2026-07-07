import { useState } from "react";
import { useNavigate } from "react-router";
import {
  TrendingUp, FileText, Calculator, Newspaper, Globe,
  Activity, GitBranch, Search, Check, ChevronRight,
} from "lucide-react";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";

export type Category = "Tất cả" | "Thị trường" | "Tài chính" | "Định giá" | "Kỹ thuật" | "Tin tức" | "Vĩ mô";

export interface Tool {
  id: string;
  name: string;
  oneliner: string;
  longDescription: string;
  category: Exclude<Category, "Tất cả">;
  icon: React.ElementType;
  available?: boolean;
  /** id công cụ thật mà agent dùng (khớp ALL_TOOLS trong agent-studio-new.tsx), undefined nếu chưa có backend */
  backendToolId?: string;
  /** Các mảng nhỏ cấu thành tool này (vd tool Tin tức gồm nhiều nguồn báo). Dùng cho cả tag trên card và mục chi tiết. */
  breakdown?: { title: string; desc: string }[];
}

// Mỗi tool ở đây khớp 1:1 với 1 tool thật mà Agent Studio cho phép chọn (xem ALL_TOOLS,
// agent-studio-new.tsx) và tool backend thực thi (xem OPENAI_TOOL_DEFS, supabase/functions/run-agent/index.ts).
// KHÔNG tách nhiều card cho cùng 1 tool backend (vd "Giá cổ phiếu", "Chỉ số", "Top tăng/giảm" trước đây
// là 3 card riêng dù cùng dùng price_feed) — thay vào đó gộp thành 1 card, phần "breakdown" cho biết
// bên trong tool đó thực sự gồm những gì.
export const tools: Tool[] = [
  {
    id: "price-feed",
    name: "Giá & Chỉ số",
    oneliner: "Giá cổ phiếu, chỉ số thị trường và top tăng/giảm theo từng phiên giao dịch",
    longDescription: "Giá đóng cửa, khối lượng khớp lệnh, các chỉ số thị trường chính và top tăng/giảm mạnh theo từng phiên HOSE/HNX/UPCoM, dữ liệu nền để Agent nắm diễn biến giá mới nhất trước khi phân tích sâu hơn.",
    category: "Thị trường",
    icon: TrendingUp,
    backendToolId: "price_feed",
    breakdown: [
      { title: "Giá cổ phiếu cuối phiên", desc: "Giá đóng cửa, khối lượng khớp lệnh và biến động % theo phiên HOSE/HNX/UPCoM." },
      { title: "Chỉ số thị trường", desc: "VN-Index, HNX-Index, UPCoM-Index theo từng phiên giao dịch." },
      { title: "Top tăng/giảm mạnh", desc: "Các mã biến động mạnh nhất phiên, xếp hạng theo % thay đổi." },
    ],
  },
  {
    id: "financials",
    name: "BCTC & Nội bộ",
    oneliner: "Báo cáo tài chính, giao dịch nội bộ và lịch sử cổ tức theo quý/năm",
    longDescription: "Báo cáo kết quả kinh doanh, bảng cân đối kế toán, lưu chuyển tiền tệ 5 năm gần nhất theo đúng 4 loại hình doanh nghiệp, cùng giao dịch nội bộ và lịch sử cổ tức.",
    category: "Tài chính",
    icon: FileText,
    backendToolId: "financials",
    breakdown: [
      { title: "Báo cáo tài chính", desc: "BCKQKD, BCĐKT, LCTTT theo quý/năm, chỉ số riêng theo 4 loại hình doanh nghiệp (ngân hàng, chứng khoán, bảo hiểm, doanh nghiệp thường)." },
      { title: "Giao dịch nội bộ", desc: "Theo dõi giao dịch mua/bán của ban lãnh đạo, người nội bộ và cổ đông lớn." },
      { title: "Lịch sử cổ tức", desc: "Lịch sử chi trả cổ tức và tỷ suất cổ tức theo giá hiện tại." },
    ],
  },
  {
    id: "value-chain",
    name: "Giá hàng hóa (chuỗi cung ứng)",
    oneliner: "Kéo giá realtime nguyên liệu đầu vào & sản phẩm đầu ra theo ngành (khung tác động luôn áp dụng)",
    longDescription: "Kéo GIÁ thị trường realtime của nguyên liệu đầu vào và sản phẩm đầu ra theo từng ngành (thép: quặng, than cốc đến HRC; cảng, hàng không: dầu, nhiên liệu; phân bón: khí đến ure...). Khung suy luận chuỗi cung ứng & yếu tố vĩ mô tác động biên lợi nhuận LUÔN được agent áp dụng — tool này chỉ bổ sung số giá thị trường realtime.",
    category: "Tài chính",
    icon: Activity,
    backendToolId: "value_chain",
    breakdown: [
      { title: "Giá nguyên liệu đầu vào", desc: "Số giá realtime chi phí đầu vào theo ngành (Yahoo/benchmark)." },
      { title: "Giá sản phẩm đầu ra", desc: "Số giá realtime nguồn doanh thu chính theo ngành." },
      { title: "Khung tác động: luôn áp dụng", desc: "Cấu trúc nhân-quả input→output→vĩ mô là năng lực nền, không cần bật." },
    ],
  },
  {
    id: "news-feed",
    name: "Tin tức thị trường",
    oneliner: "Tin 48 giờ từ 12 trang báo tài chính, lọc theo mã trong danh mục",
    longDescription: "Tổng hợp tin tức tài chính trong 48 giờ gần nhất từ 12 trang báo, lọc theo mã trong watchlist và xếp hạng theo mức độ ảnh hưởng đến danh mục.",
    category: "Tin tức",
    icon: Newspaper,
    backendToolId: "news_feed",
    breakdown: [
      { title: "Market Times", desc: "Tin tức thị trường tài chính và chứng khoán cập nhật liên tục." },
      { title: "Vietstock", desc: "Phân tích chuyên gia và nhận định thị trường chuyên sâu." },
      { title: "Stockbiz", desc: "Tin tức và dữ liệu thị trường chứng khoán." },
      { title: "Báo Đầu tư", desc: "Tin tức đầu tư, doanh nghiệp và chính sách kinh tế." },
      { title: "Thời báo Tài chính Việt Nam", desc: "Tin tức tài chính, ngân sách và chính sách nhà nước." },
      { title: "Vietnam Finance", desc: "Tin tức tài chính, ngân hàng và doanh nghiệp." },
      { title: "Thời báo Ngân hàng", desc: "Tin tức ngành ngân hàng và chính sách tiền tệ." },
      { title: "CafeF", desc: "Nguồn tài chính hàng đầu Việt Nam, cập nhật liên tục." },
      { title: "VnEconomy", desc: "Tin tức kinh tế vĩ mô và thị trường." },
      { title: "Tin nhanh Chứng khoán", desc: "Tin tức nhanh về thị trường chứng khoán." },
      { title: "The Saigon Times", desc: "Tin tức kinh tế, tài chính bằng tiếng Anh." },
      { title: "VnExpress", desc: "Tin tức kinh tế, tài chính từ báo điện tử VnExpress." },
    ],
  },
  {
    id: "pe-ratio",
    name: "P/E & Định giá",
    oneliner: "Cổ phiếu đang rẻ hay đắt? So sánh trailing/forward",
    longDescription: "So sánh định giá P/E, P/B, EV/EBITDA của cổ phiếu với trung bình ngành và lịch sử. Đang được phát triển, chưa thể dùng trong Agent.",
    category: "Định giá",
    icon: Calculator,
    backendToolId: "pe_ratio",
    available: false,
  },
  {
    id: "macro",
    name: "Vĩ mô",
    oneliner: "CPI, lãi suất điều hành & tỷ giá USD/VND từ NHNN",
    longDescription: "CPI, lãi suất điều hành và tỷ giá USD/VND từ Ngân hàng Nhà nước. Đang được phát triển, chưa thể dùng trong Agent.",
    category: "Vĩ mô",
    icon: Globe,
    backendToolId: "macro",
    available: false,
  },
  {
    id: "rsi",
    name: "RSI - Quá mua / Quá bán",
    oneliner: "RSI 14 ngày: vùng >70 quá mua, <30 quá bán",
    longDescription: "Chỉ báo RSI 14 ngày để phát hiện vùng quá mua/quá bán. Đang được phát triển, chưa thể dùng trong Agent.",
    category: "Kỹ thuật",
    icon: Activity,
    backendToolId: "rsi",
    available: false,
  },
  {
    id: "macd",
    name: "MACD - Xu hướng & Động lực",
    oneliner: "MACD(12,26,9): phát hiện đảo chiều & sức mạnh xu hướng",
    longDescription: "Chỉ báo MACD(12,26,9) phát hiện đảo chiều và sức mạnh xu hướng. Đang được phát triển, chưa thể dùng trong Agent.",
    category: "Kỹ thuật",
    icon: GitBranch,
    backendToolId: "macd",
    available: false,
  },
];

export const catStyle: Record<Exclude<Category, "Tất cả">, { bg: string; text: string }> = {
  "Thị trường": { bg: "rgba(52,199,89,0.12)", text: "#1a7a3a" },
  "Tài chính": { bg: "rgba(255,149,0,0.12)", text: "#b36200" },
  "Định giá": { bg: "rgba(109,40,217,0.10)", text: "#6d28d9" },
  "Kỹ thuật": { bg: "rgba(26,26,46,0.08)", text: "rgba(26,26,46,0.65)" },
  "Tin tức": { bg: "rgba(99,102,241,0.12)", text: "#4338ca" },
  "Vĩ mô": { bg: "rgba(255,59,48,0.10)", text: "#c41a1a" },
};

const CATS: Category[] = ["Tất cả", "Thị trường", "Tài chính", "Định giá", "Kỹ thuật", "Tin tức", "Vĩ mô"];

export function ToolLibrary({ isDark = false }: { isDark?: boolean }) {
  const cardBg = isDark ? "#131824" : "#fff";
  const fg = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgDisabled = isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.30)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const inputBg = isDark ? "#131824" : "#fff";
  const inputBorder = isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.15)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.08)";

  const navigate = useNavigate();
  const [active, setActive] = useState<Category>("Tất cả");
  const [search, setSearch] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  const filtered = tools
    .filter((t) => {
      const matchCat = active === "Tất cả" || t.category === active;
      const q = search.toLowerCase();
      return matchCat && (!q || t.name.toLowerCase().includes(q) || t.oneliner.toLowerCase().includes(q));
    })
    // Tool dùng được đẩy lên trên, "Sắp ra mắt" xuống dưới (giữ nguyên thứ tự trong từng nhóm)
    .sort((a, b) => Number(b.available !== false) - Number(a.available !== false));

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
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: fg, margin: "0 0 4px" }}>Công cụ phân tích</h1>
        <p style={{ margin: 0, fontSize: 13, color: fgSubtle }}>
          {tools.length} công cụ tích hợp sẵn · Bấm để xem chi tiết · Kéo vào Action Hub để hỏi sâu hơn
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
              onClick={() => navigate(`/app/tools/${tool.id}`)}
              onMouseEnter={() => setHoverId(tool.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                background: cardBg,
                borderRadius: 14,
                padding: "16px 16px 14px",
                opacity: unavail ? 0.45 : 1,
                filter: unavail ? "grayscale(0.6)" : "none",
                cursor: unavail ? "pointer" : "grab",
                border: hovered
                  ? "1px solid " + (isDark ? "rgba(77,143,232,0.35)" : "rgba(8,73,172,0.20)")
                  : "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.09)"),
                boxShadow: hovered
                  ? isDark ? "0 8px 24px rgba(0,0,0,0.40)" : "0 8px 24px rgba(8,73,172,0.10)"
                  : isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.06)",
                userSelect: "none",
                transition: "box-shadow 150ms ease, border 150ms ease, transform 120ms ease",
                transform: hovered ? "translateY(-2px)" : "none",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Top row: icon + hint */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                {/* Icon — nền tint theo màu category, đồng bộ design system (không dùng gradient tuỳ tiện) */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: cs.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={22} color={cs.text} strokeWidth={1.5} />
                </div>

                {/* Hint: kéo vào AI (nếu dùng được) hoặc mở chi tiết */}
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
                  {unavail ? <>Xem chi tiết <ChevronRight size={11} strokeWidth={2.5} /></> : "⠿ Kéo vào AI"}
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
                    <span style={{ fontSize: 11, color: fgSubtle, fontWeight: 600 }}>Wealbee · Tích hợp chính thức</span>
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

              {/* Bottom: category tag + xem chi tiết */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
                  background: cs.bg, color: cs.text,
                  letterSpacing: "0.02em",
                }}>
                  {tool.category}
                </span>
                <ChevronRight size={14} strokeWidth={2} color={fgDisabled} />
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

