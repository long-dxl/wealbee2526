import { useState, useMemo, createContext, useContext } from "react";
import { ArrowLeft, ExternalLink, BarChart2, BookOpen, Scale, Banknote } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  getTickerDetail, getPriceHistory, getFinancials,
  type TickerDetail as TTickerDetail,
  type FinancialYear,
  type Period,
} from "../../data/tickerData";

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const DARK_TOKENS = {
  BG:      "#0B0D18",
  CARD:    "#111422",
  CARD2:   "#0E1020",
  BORDER:  "rgba(255,255,255,0.06)",
  BORDER2: "rgba(255,255,255,0.10)",
  TEXT:    "#EDEEFF",
  MUTED:   "rgba(237,238,255,0.40)",
  MUTED2:  "rgba(237,238,255,0.22)",
  BLUE:    "#4F8EFF",
  // Brand accent for financial section
  ACCENT:       "#4D8FE8",
  ACCENT_TEXT:  "#7BB3FF",
  ACCENT_HL:    "rgba(77,143,232,0.14)",
  ACCENT_BAR:   "#4D8FE8",
  ACCENT_CHART: "#4D8FE8",
  ACCENT_TEAL:  "#818CF8",
  HEADER_BG:     "rgba(11,13,24,0.90)",
  GRID_STROKE:   "rgba(255,255,255,0.04)",
  REF_STROKE:    "rgba(255,255,255,0.08)",
  TOOLTIP_BG:    "#1A1D30",
  RANGE_TRACK:   "rgba(255,255,255,0.08)",
  BACK_BTN_BG:   "rgba(255,255,255,0.06)",
  BACK_BTN_HOV:  "rgba(255,255,255,0.10)",
  ROW_HOV:       "rgba(255,255,255,0.025)",
};

const LIGHT_TOKENS = {
  BG:      "#F5F5F7",
  CARD:    "#FFFFFF",
  CARD2:   "#F5F5F7",
  BORDER:  "rgba(8,73,172,0.10)",
  BORDER2: "rgba(8,73,172,0.18)",
  TEXT:    "#1A1A2E",
  MUTED:   "rgba(26,26,46,0.50)",
  MUTED2:  "rgba(26,26,46,0.35)",
  BLUE:    "#0849AC",
  // Brand accent for financial section
  ACCENT:       "#0849AC",
  ACCENT_TEXT:  "#0849AC",
  ACCENT_HL:    "rgba(8,73,172,0.06)",
  ACCENT_BAR:   "#0849AC",
  ACCENT_CHART: "#0849AC",
  ACCENT_TEAL:  "#6366F1",
  HEADER_BG:     "#F5F5F7",
  GRID_STROKE:   "rgba(8,73,172,0.06)",
  REF_STROKE:    "rgba(8,73,172,0.15)",
  TOOLTIP_BG:    "#FFFFFF",
  RANGE_TRACK:   "rgba(8,73,172,0.10)",
  BACK_BTN_BG:   "rgba(8,73,172,0.06)",
  BACK_BTN_HOV:  "#E8F0FE",
  ROW_HOV:       "rgba(8,73,172,0.03)",
};

type Tokens = typeof DARK_TOKENS;

// ─── Internal theme context ───────────────────────────────────────────────────
const TK = createContext<Tokens>(DARK_TOKENS);
function useTK() { return useContext(TK); }

// ─── Constants (non-theme) ────────────────────────────────────────────────────
const GREEN  = "#27C840";
const RED    = "#FF3931";
const VNI_C  = "#5D7FFF";
const HNX_C  = "#8B5CF6";
const FONT   = "'Montserrat', system-ui, sans-serif";

// ─── Sector badge colors ──────────────────────────────────────────────────────
const SECTOR_PALETTE: Record<string, string> = {
  "Ngân hàng":      "#1D6AFF",
  "Thép":           "#D4700A",
  "Công nghệ":      "#7C3AED",
  "Bán lẻ":         "#0284C7",
  "Thực phẩm":      "#15803D",
  "Bất động sản":   "#B45309",
  "Hàng tiêu dùng": "#BE185D",
};
function sc(sector: string) { return SECTOR_PALETTE[sector] ?? "#4B5563"; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN   = (n: number) => n.toLocaleString("vi-VN");
const fmtP   = (n: number) => n.toLocaleString("vi-VN");
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

// ─── Sub-components ───────────────────────────────────────────────────────────
function ChangeChip({ value, pct }: { value: number; pct: number }) {
  const up = value >= 0;
  return (
    <span style={{ color: up ? GREEN : RED, fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px" }}>
      {up ? "+" : ""}{fmtP(value)} ({up ? "+" : ""}{pct.toFixed(2)}%)
    </span>
  );
}

function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const tk = useTK();
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: tk.MUTED }}>{fmtP(low)}</span>
        <span style={{ fontSize: 11, color: tk.MUTED }}>{fmtP(high)}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: tk.RANGE_TRACK, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${RED},${GREEN})`, borderRadius: 2 }} />
        <div style={{ position: "absolute", top: -4, left: `${pct}%`, transform: "translateX(-50%)", width: 11, height: 11, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 2px rgba(128,128,180,0.30)" }} />
      </div>
    </>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  const tk = useTK();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `0.5px solid ${tk.BORDER}` }}>
      <span style={{ fontSize: 12, color: tk.MUTED, flexShrink: 0 }}>{label}</span>
      {link
        ? <a href="#" style={{ fontSize: 12, color: tk.BLUE, fontWeight: 500, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>{value}<ExternalLink size={10} /></a>
        : <span style={{ fontSize: 12, color: tk.TEXT, fontWeight: 600, textAlign: "right" }}>{value}</span>
      }
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  const tk = useTK();
  return (
    <div style={{ background: tk.CARD2, borderRadius: 10, padding: "10px 14px", border: `1px solid ${tk.BORDER}` }}>
      <div style={{ fontSize: 10, color: tk.MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: tk.TEXT }}>{value}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  const tk = useTK();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: tk.TOOLTIP_BG, border: `1px solid ${tk.BORDER2}`, borderRadius: 10, padding: "10px 14px", fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
      <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ fontSize: 12, color: tk.MUTED }}>{p.name}:</span>
          <span style={{ fontSize: 12, color: p.color, fontWeight: 700 }}>
            {p.dataKey === "stock" ? fmtP(p.value) : fmtPct(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FinTooltip({ active, payload, label, unit }: any) {
  const tk = useTK();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: tk.TOOLTIP_BG, border: `1px solid ${tk.BORDER2}`, borderRadius: 10, padding: "10px 14px", fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
      <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: tk.ACCENT }}>{fmtN(payload[0]?.value)} {unit}</div>
    </div>
  );
}

// ─── Financial types ──────────────────────────────────────────────────────────
type FinTab = "metrics" | "income" | "balance" | "cashflow";

interface RowDef {
  label: string;
  key: keyof FinancialYear;
  fmt: (v: number) => string;
  unit: string;
}

const YEARS = [2021, 2022, 2023, 2024, 2025];

const TAB_CONFIG: Record<FinTab, {
  icon: React.ElementType;
  label: string;
  chartTitle: string;
  tableTitle: string;
  unit: string;
  rows: RowDef[];
}> = {
  metrics: {
    icon: BarChart2, label: "Chỉ số", chartTitle: "P/E Ratio Trend",
    tableTitle: "Chỉ số tài chính", unit: "",
    rows: [
      { label: "Vốn hóa",      key: "marketCap",    fmt: (v) => `${(v / 1000).toFixed(1)}K tỷ`, unit: "" },
      { label: "P/E Ratio",    key: "pe",           fmt: (v) => v.toFixed(2),                    unit: "" },
      { label: "P/B Ratio",    key: "pb",           fmt: (v) => v.toFixed(2),                    unit: "" },
      { label: "Nợ/Vốn CSH",  key: "de",           fmt: (v) => v.toFixed(2),                    unit: "" },
      { label: "ROE",          key: "roe",          fmt: (v) => `${v.toFixed(2)}%`,               unit: "%" },
      { label: "Current Ratio",key: "currentRatio", fmt: (v) => v.toFixed(2),                    unit: "" },
    ],
  },
  income: {
    icon: BookOpen, label: "Doanh thu", chartTitle: "Doanh thu Trend (tỷ VND)",
    tableTitle: "Kết quả kinh doanh", unit: "tỷ",
    rows: [
      { label: "Doanh thu",          key: "revenue",    fmt: fmtN, unit: "tỷ" },
      { label: "Lợi nhuận gộp",      key: "grossProfit",fmt: fmtN, unit: "tỷ" },
      { label: "EBIT",               key: "ebit",       fmt: fmtN, unit: "tỷ" },
      { label: "Lợi nhuận sau thuế", key: "netIncome",  fmt: fmtN, unit: "tỷ" },
      { label: "EPS (đồng)",         key: "eps",        fmt: fmtN, unit: "đ"  },
    ],
  },
  balance: {
    icon: Scale, label: "Bảng cân đối", chartTitle: "Tổng tài sản Trend (tỷ VND)",
    tableTitle: "Bảng cân đối kế toán", unit: "tỷ",
    rows: [
      { label: "Tổng tài sản",        key: "totalAssets",fmt: fmtN, unit: "tỷ" },
      { label: "Tiền và tương đương", key: "cash",       fmt: fmtN, unit: "tỷ" },
      { label: "Nợ vay",              key: "totalDebt",  fmt: fmtN, unit: "tỷ" },
      { label: "Vốn chủ sở hữu",     key: "equity",     fmt: fmtN, unit: "tỷ" },
    ],
  },
  cashflow: {
    icon: Banknote, label: "Dòng tiền", chartTitle: "Free Cash Flow Trend (tỷ VND)",
    tableTitle: "Báo cáo lưu chuyển tiền tệ", unit: "tỷ",
    rows: [
      { label: "CF hoạt động",   key: "operatingCF",   fmt: fmtN,                    unit: "tỷ" },
      { label: "Free Cash Flow", key: "fcf",           fmt: fmtN,                    unit: "tỷ" },
      { label: "CapEx",          key: "capex",         fmt: (v) => fmtN(Math.abs(v)),unit: "tỷ" },
      { label: "Biến động tiền", key: "netCashChange", fmt: fmtN,                    unit: "tỷ" },
    ],
  },
};

// ─── Financial panel ──────────────────────────────────────────────────────────
function FinancialPanel({ data, tab }: { data: FinancialYear[]; tab: FinTab }) {
  const tk = useTK();
  const config = TAB_CONFIG[tab];
  const [activeKey, setActiveKey] = useState<keyof FinancialYear>(config.rows[0]?.key ?? "revenue");

  const chartTitle = config.rows.find((r) => r.key === activeKey)?.label ?? config.chartTitle;
  const chartUnit  = config.rows.find((r) => r.key === activeKey)?.unit ?? config.unit;

  const barData = data.map((d) => ({
    year: String(d.year),
    value: Math.abs(d[activeKey] as number),
  }));
  const maxVal = Math.max(...barData.map((b) => b.value));

  return (
    <div>
      <div style={{ background: tk.CARD, borderRadius: 14, border: `1px solid ${tk.BORDER}`, padding: "20px 22px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: tk.TEXT }}>{chartTitle}</span>
          </div>
        </div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barSize={36} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={tk.GRID_STROKE} />
              <XAxis dataKey="year" tick={{ fill: tk.MUTED, fontSize: 12, fontFamily: FONT }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: tk.MUTED, fontSize: 11, fontFamily: FONT }}
                axisLine={false} tickLine={false} width={42}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                domain={[0, maxVal * 1.18]}
              />
              <Tooltip content={<FinTooltip unit={chartUnit} />} cursor={{ fill: `${tk.ACCENT_CHART}0D` }} />
              <Bar dataKey="value" fill={tk.ACCENT} radius={[6, 6, 0, 0]} name={chartTitle} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: tk.CARD, borderRadius: 14, border: `1px solid ${tk.BORDER}`, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 10px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tk.TEXT, marginBottom: 3 }}>{config.tableTitle}</div>
          <div style={{ fontSize: 12, color: tk.MUTED }}>Click vào từng chỉ tiêu để xem biểu đồ</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
          <thead>
            <tr style={{ background: tk.CARD2 }}>
              <th style={{ textAlign: "left", padding: "10px 22px", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Chỉ tiêu</th>
              {YEARS.map((y) => (
                <th key={y} style={{ textAlign: "right", padding: "10px 16px 10px 0", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em" }}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.rows.map((row) => {
              const isActive = activeKey === row.key;
              return (
                <tr
                  key={String(row.key)}
                  onClick={() => setActiveKey(row.key)}
                  style={{
                    cursor: "pointer",
                    background: isActive ? tk.ACCENT_HL : "transparent",
                    borderTop: `0.5px solid ${tk.BORDER}`,
                    transition: "background 120ms",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = tk.ROW_HOV; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "11px 22px", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 700 : 400 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isActive && <div style={{ width: 3, height: 16, background: tk.ACCENT_BAR, borderRadius: 2, flexShrink: 0 }} />}
                      {row.label}
                    </div>
                  </td>
                  {YEARS.map((y) => {
                    const d = data.find((f) => f.year === y);
                    const raw = d ? (d[row.key] as number) : null;
                    return (
                      <td key={y} style={{ padding: "11px 16px 11px 0", textAlign: "right", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 600 : 400 }}>
                        {raw !== null ? row.fmt(raw) : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  symbol: string;
  onBack: () => void;
  isDark?: boolean;
}

const PERIODS: Period[] = ["5D", "1M", "3M", "YTD", "5Y"];

export function TickerDetail({ symbol, onBack, isDark = false }: Props) {
  const tk = isDark ? DARK_TOKENS : LIGHT_TOKENS;

  const [period, setPeriod] = useState<Period>("3M");
  const [finTab, setFinTab] = useState<FinTab>("income");
  const [showVni, setShowVni] = useState(true);
  const [showHnx, setShowHnx] = useState(true);

  const detail = useMemo<TTickerDetail | null>(() => getTickerDetail(symbol), [symbol]);
  const raw    = useMemo(() => getPriceHistory(symbol, period), [symbol, period]);
  const fins   = useMemo(() => getFinancials(symbol), [symbol]);

  if (!detail) return null;

  const isUp = detail.change >= 0;

  const baseStock = raw[0]?.price ?? detail.price;
  const baseVni   = raw[0]?.vni   ?? 1250;
  const baseHnx   = raw[0]?.hnx   ?? 235;

  const chartData = raw.map((p) => ({
    date:  p.date,
    stock: p.price,
    vni:   parseFloat(((p.vni / baseVni - 1) * 100).toFixed(2)),
    hnx:   parseFloat(((p.hnx / baseHnx - 1) * 100).toFixed(2)),
  }));

  const stockChange = chartData.length
    ? ((chartData[chartData.length - 1].stock / baseStock - 1) * 100)
    : 0;
  const STOCK_C = stockChange >= 0 ? GREEN : RED;

  const FIN_TABS: { id: FinTab; icon: React.ElementType; label: string }[] = [
    { id: "metrics",  icon: TAB_CONFIG.metrics.icon,  label: TAB_CONFIG.metrics.label  },
    { id: "income",   icon: TAB_CONFIG.income.icon,   label: TAB_CONFIG.income.label   },
    { id: "balance",  icon: TAB_CONFIG.balance.icon,  label: TAB_CONFIG.balance.label  },
    { id: "cashflow", icon: TAB_CONFIG.cashflow.icon, label: TAB_CONFIG.cashflow.label },
  ];

  return (
    <TK.Provider value={tk}>
      <div style={{ minHeight: "100%", background: tk.BG, fontFamily: FONT, color: tk.TEXT }}>

        {/* ── Sticky header ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: tk.HEADER_BG, backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${tk.BORDER}`,
          padding: "0 32px", height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button
              onClick={onBack}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: tk.BACK_BTN_BG, border: `1px solid ${tk.BORDER}`,
                borderRadius: 8, padding: "6px 14px", color: tk.TEXT, fontSize: 13,
                cursor: "pointer", fontFamily: FONT, fontWeight: 500,
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = tk.BACK_BTN_HOV; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = tk.BACK_BTN_BG; }}
            >
              <ArrowLeft size={14} strokeWidth={2} /> Quay lại
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: sc(detail.sector),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", flexShrink: 0,
              }}>
                {detail.symbol.slice(0, 3)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.3px", color: tk.TEXT }}>{detail.shortName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: sc(detail.sector), color: "#fff", padding: "2px 8px", borderRadius: 4 }}>{detail.sector}</span>
                  <span style={{ fontSize: 11, color: tk.MUTED }}>{detail.exchange} · {detail.symbol}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.8px", marginBottom: 3, color: tk.TEXT }}>
              {fmtP(detail.price)}
            </div>
            <ChangeChip value={detail.change} pct={detail.changePct} />
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 32px" }}>

          {/* Top 2-col */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

            {/* Company info */}
            <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, padding: "20px 22px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tk.TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Thông tin công ty</div>
              <InfoRow label="Vốn hóa thị trường" value={detail.marketCap} />
              <InfoRow label="Sàn giao dịch"       value={detail.exchange} />
              <InfoRow label="Quốc gia"             value={detail.country} />
              <InfoRow label="CEO"                  value={detail.ceo} />
              <InfoRow label="Ngày IPO"             value={detail.founded} />
              <InfoRow label="Website"              value={detail.website} link />
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${tk.BORDER}` }}>
                <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 6 }}>Giới thiệu</div>
                <div style={{ fontSize: 12, color: tk.TEXT, lineHeight: 1.7, opacity: 0.82 }}>{detail.about}</div>
              </div>
            </div>

            {/* Price info */}
            <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, padding: "20px 22px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tk.TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Thông tin giá</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
                <MetricPill label="Giá hiện tại"  value={fmtP(detail.price)} />
                <MetricPill label="Thay đổi"      value={`${isUp ? "+" : ""}${fmtP(detail.change)}`} />
                <MetricPill label="% Thay đổi"    value={`${isUp ? "+" : ""}${detail.changePct.toFixed(2)}%`} />
                <MetricPill label="Khối lượng GD" value={detail.volume} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 10 }}>Biên độ trong ngày</div>
                <RangeBar low={detail.dayLow} high={detail.dayHigh} current={detail.price} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 10 }}>Biên độ 52 tuần</div>
                <RangeBar low={detail.week52Low} high={detail.week52High} current={detail.price} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <MetricPill label="P/E" value={detail.pe.toFixed(1)} />
                <MetricPill label="P/B" value={detail.pb.toFixed(2)} />
                <MetricPill label="ROE" value={`${detail.roe.toFixed(1)}%`} />
              </div>
            </div>
          </div>

          {/* ── Price chart ── */}
          <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, padding: "22px 24px", marginBottom: 14 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 6, color: tk.TEXT }}>
                  {fmtP(detail.price)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: isUp ? GREEN : RED, fontSize: 15, fontWeight: 700, letterSpacing: "-0.2px" }}>
                    {isUp ? "+" : ""}{fmtP(detail.change)} ({isUp ? "+" : ""}{detail.changePct.toFixed(2)}%)
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: stockChange >= 0 ? GREEN : RED,
                    background: stockChange >= 0 ? "rgba(39,200,64,0.10)" : "rgba(255,57,49,0.10)",
                    padding: "3px 9px", borderRadius: 6,
                  }}>
                    {stockChange >= 0 ? "+" : ""}{stockChange.toFixed(2)}% trong kỳ
                  </span>
                </div>
              </div>

              {/* Period selector */}
              <div style={{ display: "flex", background: tk.CARD2, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${tk.BORDER}` }}>
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: period === p ? "#0849AC" : "transparent",
                      color: period === p ? "#fff" : tk.MUTED,
                      fontSize: 12, fontWeight: period === p ? 700 : 500,
                      fontFamily: FONT, transition: "all 100ms",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gStock" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={STOCK_C} stopOpacity={isDark ? 0.28 : 0.20} />
                      <stop offset="100%" stopColor={STOCK_C} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gVni" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={VNI_C} stopOpacity={0.10} />
                      <stop offset="100%" stopColor={VNI_C} stopOpacity={0.00} />
                    </linearGradient>
                    <linearGradient id="gHnx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={HNX_C} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={HNX_C} stopOpacity={0.00} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={tk.GRID_STROKE} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: tk.MUTED, fontSize: 10, fontFamily: FONT }} axisLine={false} tickLine={false} interval={Math.max(1, Math.floor(chartData.length / 7))} />
                  <YAxis yAxisId="left" dataKey="stock" tick={{ fill: tk.MUTED, fontSize: 10, fontFamily: FONT }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: tk.MUTED, fontSize: 10, fontFamily: FONT }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine yAxisId="right" y={0} stroke={tk.REF_STROKE} strokeDasharray="3 3" />
                  <Area yAxisId="left"  type="monotone" dataKey="stock" stroke={STOCK_C}  strokeWidth={2.5} fill="url(#gStock)" dot={false} name={detail.symbol} />
                  {showVni && <Area yAxisId="right" type="monotone" dataKey="vni" stroke={VNI_C} strokeWidth={1.5} fill="url(#gVni)" dot={false} name="VN-Index"  strokeDasharray="5 2" />}
                  {showHnx && <Area yAxisId="right" type="monotone" dataKey="hnx" stroke={HNX_C} strokeWidth={1.5} fill="url(#gHnx)" dot={false} name="HNX-Index" strokeDasharray="5 2" />}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend — clickable toggles */}
            <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>

              {/* Stock symbol — always visible */}
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "6px 13px", borderRadius: 99,
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.05)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(26,26,46,0.12)"}`,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: STOCK_C, flexShrink: 0, boxShadow: `0 0 0 3px ${STOCK_C}30` }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: tk.TEXT }}>{detail.symbol}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: stockChange >= 0 ? GREEN : RED }}>{fmtPct(stockChange)}</span>
              </div>

              {/* VN-Index toggle */}
              <button
                onClick={() => setShowVni((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99,
                  cursor: "pointer", fontFamily: FONT, transition: "all 120ms",
                  background: showVni ? (isDark ? "rgba(93,127,255,0.12)" : "rgba(93,127,255,0.08)") : "transparent",
                  border: showVni ? "1px solid rgba(93,127,255,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}`,
                }}
              >
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: showVni ? VNI_C : "transparent",
                  border: showVni ? "none" : `2px solid ${VNI_C}`,
                }} />
                <span style={{ fontSize: 12, fontWeight: showVni ? 700 : 400, color: showVni ? tk.TEXT : tk.MUTED }}>VN-Index</span>
                {showVni && chartData.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: chartData[chartData.length - 1].vni >= 0 ? GREEN : RED }}>
                    {fmtPct(chartData[chartData.length - 1].vni)}
                  </span>
                )}
              </button>

              {/* HNX-Index toggle */}
              <button
                onClick={() => setShowHnx((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99,
                  cursor: "pointer", fontFamily: FONT, transition: "all 120ms",
                  background: showHnx ? (isDark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)") : "transparent",
                  border: showHnx ? "1px solid rgba(139,92,246,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}`,
                }}
              >
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: showHnx ? HNX_C : "transparent",
                  border: showHnx ? "none" : `2px solid ${HNX_C}`,
                }} />
                <span style={{ fontSize: 12, fontWeight: showHnx ? 700 : 400, color: showHnx ? tk.TEXT : tk.MUTED }}>HNX-Index</span>
                {showHnx && chartData.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: chartData[chartData.length - 1].hnx >= 0 ? GREEN : RED }}>
                    {fmtPct(chartData[chartData.length - 1].hnx)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Financial tabs ── */}
          <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${tk.BORDER}`, padding: "0 8px" }}>
              {FIN_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = finTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFinTab(tab.id)}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 5, padding: "14px 8px",
                      border: "none", background: "transparent",
                      cursor: "pointer", fontFamily: FONT, position: "relative",
                      borderBottom: active ? `2px solid ${tk.ACCENT}` : "2px solid transparent",
                      transition: "all 120ms", marginBottom: -1,
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = tk.ROW_HOV; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                      background: active ? tk.ACCENT_HL : "transparent",
                      transition: "background 120ms",
                    }}>
                      <Icon size={16} strokeWidth={1.8} color={active ? tk.ACCENT : tk.MUTED} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? tk.ACCENT : tk.MUTED }}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "20px 22px" }}>
              <FinancialPanel key={finTab} data={fins} tab={finTab} />
            </div>
          </div>

          <div style={{ height: 32 }} />
        </div>
      </div>
    </TK.Provider>
  );
}
