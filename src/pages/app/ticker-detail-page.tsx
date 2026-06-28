/**
 * TickerDetailPage — Trang chi tiết mã cổ phiếu
 * UI theo template wealbee-platform-main/TickerDetail.tsx
 * Data thật từ Supabase: prices_daily, tickers, financials_annual,
 *   dividends, insider_transactions, market_news, market_indices
 */

import { useState, useEffect, useMemo, createContext, useContext, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router";
import {
  ArrowLeft, ExternalLink, BarChart2, BookOpen,
  RefreshCw, AlertCircle, Info, Users, Coins, Newspaper, Scale, TrendingUp,
  Building2,
} from "lucide-react";
import { VN30_PROFILES } from "../../data/vn30-profiles";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../../lib/supabase/client";
import type { AppOutletContext } from "./page-wrappers";

// ─── Theme tokens ─────────────────────────────────────────────────────────────

const DARK_TOKENS = {
  BG: "#0B0D18", CARD: "#111422", CARD2: "#0E1020",
  BORDER: "rgba(255,255,255,0.06)", BORDER2: "rgba(255,255,255,0.10)",
  TEXT: "#EDEEFF", MUTED: "rgba(237,238,255,0.40)", MUTED2: "rgba(237,238,255,0.22)",
  BLUE: "#4F8EFF",
  ACCENT: "#4D8FE8", ACCENT_TEXT: "#7BB3FF", ACCENT_HL: "rgba(77,143,232,0.14)",
  ACCENT_BAR: "#4D8FE8", ACCENT_CHART: "#4D8FE8", ACCENT_TEAL: "#818CF8",
  HEADER_BG: "rgba(11,13,24,0.92)", GRID_STROKE: "rgba(255,255,255,0.04)",
  REF_STROKE: "rgba(255,255,255,0.08)", TOOLTIP_BG: "#1A1D30",
  RANGE_TRACK: "rgba(255,255,255,0.08)", BACK_BTN_BG: "rgba(255,255,255,0.06)",
  BACK_BTN_HOV: "rgba(255,255,255,0.10)", ROW_HOV: "rgba(255,255,255,0.025)",
};
const LIGHT_TOKENS = {
  BG: "#F5F5F7", CARD: "#FFFFFF", CARD2: "#F5F5F7",
  BORDER: "rgba(8,73,172,0.10)", BORDER2: "rgba(8,73,172,0.18)",
  TEXT: "#1A1A2E", MUTED: "rgba(26,26,46,0.50)", MUTED2: "rgba(26,26,46,0.35)",
  BLUE: "#0849AC",
  ACCENT: "#0849AC", ACCENT_TEXT: "#0849AC", ACCENT_HL: "rgba(8,73,172,0.06)",
  ACCENT_BAR: "#0849AC", ACCENT_CHART: "#0849AC", ACCENT_TEAL: "#6366F1",
  HEADER_BG: "#F5F5F7", GRID_STROKE: "rgba(8,73,172,0.06)",
  REF_STROKE: "rgba(8,73,172,0.15)", TOOLTIP_BG: "#FFFFFF",
  RANGE_TRACK: "rgba(8,73,172,0.10)", BACK_BTN_BG: "rgba(8,73,172,0.06)",
  BACK_BTN_HOV: "#E8F0FE", ROW_HOV: "rgba(8,73,172,0.03)",
};
type Tokens = typeof DARK_TOKENS;

const TK = createContext<Tokens>(DARK_TOKENS);
function useTK() { return useContext(TK); }

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN = "#27C840";
const RED   = "#FF3931";
const VNI_C = "#5D7FFF";
const HNX_C = "#8B5CF6";
const FONT  = "'Montserrat', system-ui, sans-serif";

const SECTOR_PALETTE: Record<string, string> = {
  "Ngân hàng":      "#1D6AFF",
  "Thép":           "#D4700A",
  "Công nghệ":      "#7C3AED",
  "Bán lẻ":         "#0284C7",
  "Thực phẩm":      "#15803D",
  "Bất động sản":   "#B45309",
  "Hàng tiêu dùng": "#BE185D",
  "Bảo hiểm":       "#065F46",
  "Chứng khoán":    "#1E40AF",
  "Hàng không":     "#0EA5E9",
  "Năng lượng":     "#D97706",
  "Đồ uống":        "#7C3AED",
};
function sc(sector: string) { return SECTOR_PALETTE[sector] ?? "#4B5563"; }

const PERIOD_DAYS: Record<string, number> = { "5D": 5, "1M": 30, "3M": 90, "YTD": 365, "5Y": 1825 };
const PERIODS = ["5D", "1M", "3M", "YTD", "5Y"] as const;
type Period = typeof PERIODS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtN   = (n: number) => n.toLocaleString("vi-VN");
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtDate = (d: string) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`; };
const fmtShort = (d: string) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; };
const fmtB = (n: number | null | undefined) => {
  if (n == null) return "—";
  const b = n / 1e9;
  return b >= 1000 ? `${(b / 1000).toFixed(1)}K tỷ` : `${b.toFixed(0)} tỷ`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const tk = useTK();
  const pct = Math.min(100, Math.max(0, ((current - low) / Math.max(1, high - low)) * 100));
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: tk.MUTED }}>{fmtN(low)}</span>
        <span style={{ fontSize: 11, color: tk.MUTED }}>{fmtN(high)}</span>
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
        : <span style={{ fontSize: 12, color: tk.TEXT, fontWeight: 600, textAlign: "right" }}>{value}</span>}
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
            {fmtPct(p.value)}
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

function EmptyState({ message }: { message: string }) {
  const tk = useTK();
  return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <BarChart2 size={32} style={{ color: tk.MUTED, marginBottom: 10 }} />
      <p style={{ color: tk.MUTED, fontSize: 13 }}>{message}</p>
    </div>
  );
}

// ─── Financial Panel ──────────────────────────────────────────────────────────

type FinTab = "metrics" | "income" | "balance" | "cashflow";

interface FinancialRow {
  year: number;
  revenue: number | null;
  gross_profit: number | null;
  ebt: number | null;
  net_profit: number | null;
  eps: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
}

interface BSRow {
  period: string;
  period_date: string;
  total_assets: number | null;
  cash: number | null;
  total_debt: number | null;
  equity: number | null;
  current_ratio: number | null;
}

interface CFRow {
  period: string;
  period_date: string;
  operating_cf: number | null;
  capex: number | null;
  fcf: number | null;
  net_cash_change: number | null;
}

interface RowDef { label: string; key: keyof FinancialRow; fmt: (v: number) => string; unit: string; }

const TAB_CONFIG: Record<"metrics" | "income", { icon: React.ElementType; label: string; rows: RowDef[]; unit: string }> = {
  metrics: {
    icon: BarChart2, label: "Chỉ số", unit: "",
    rows: [
      { label: "P/E Ratio",        key: "pe_ratio",       fmt: v => v.toFixed(2),               unit: "" },
      { label: "P/B Ratio",        key: "pb_ratio",       fmt: v => v.toFixed(2),               unit: "" },
      { label: "Nợ / Vốn (D/E)",  key: "debt_to_equity", fmt: v => v.toFixed(2),               unit: "" },
      { label: "ROE",              key: "roe",            fmt: v => `${(v * 100).toFixed(1)}%`, unit: "%" },
      { label: "ROA",              key: "roa",            fmt: v => `${(v * 100).toFixed(1)}%`, unit: "%" },
      { label: "Current Ratio",    key: "current_ratio",  fmt: v => v.toFixed(2),               unit: "" },
    ],
  },
  income: {
    icon: BookOpen, label: "Doanh thu", unit: "tỷ",
    rows: [
      { label: "Doanh thu",          key: "revenue",      fmt: v => fmtN(Math.round(v / 1e9)), unit: "tỷ" },
      { label: "Lợi nhuận gộp",      key: "gross_profit", fmt: v => fmtN(Math.round(v / 1e9)), unit: "tỷ" },
      { label: "Lợi nhuận sau thuế", key: "net_profit",   fmt: v => fmtN(Math.round(v / 1e9)), unit: "tỷ" },
      { label: "EPS (đồng)",         key: "eps",          fmt: v => fmtN(Math.round(v)),        unit: "đ" },
    ],
  },
};

function FinancialPanel({ data, tab }: { data: FinancialRow[]; tab: "metrics" | "income" }) {
  const tk = useTK();
  const config = TAB_CONFIG[tab];
  const [activeKey, setActiveKey] = useState<keyof FinancialRow>(config.rows[0]?.key ?? "revenue");

  // Reset active key when tab changes
  useEffect(() => { setActiveKey(config.rows[0]?.key ?? "revenue"); }, [tab]);

  const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);
  const barData = data.map(d => ({
    year: String(d.year),
    value: Math.abs((d[activeKey] as number | null) ?? 0),
  })).sort((a, b) => Number(a.year) - Number(b.year));

  const chartTitle = config.rows.find(r => r.key === activeKey)?.label ?? "";
  const chartUnit  = config.rows.find(r => r.key === activeKey)?.unit ?? "";

  return (
    <div>
      {/* Bar chart */}
      <div style={{ background: tk.CARD, borderRadius: 14, border: `1px solid ${tk.BORDER}`, padding: "20px 22px", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tk.TEXT, marginBottom: 16 }}>{chartTitle}</div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barSize={36} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={tk.GRID_STROKE} />
              <XAxis dataKey="year" tick={{ fill: tk.MUTED, fontSize: 12, fontFamily: FONT }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: tk.MUTED, fontSize: 11, fontFamily: FONT }}
                axisLine={false} tickLine={false} width={48}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v))}
              />
              <Tooltip content={<FinTooltip unit={chartUnit} />} cursor={{ fill: `${tk.ACCENT_CHART}0D` }} />
              <Bar dataKey="value" fill={tk.ACCENT} radius={[6, 6, 0, 0]} name={chartTitle} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: tk.CARD, borderRadius: 14, border: `1px solid ${tk.BORDER}`, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 10px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tk.TEXT, marginBottom: 3 }}>Chỉ tiêu tài chính</div>
          <div style={{ fontSize: 12, color: tk.MUTED }}>Click vào từng chỉ tiêu để xem biểu đồ</div>
        </div>
        {data.length === 0 ? (
          <EmptyState message="Chưa có dữ liệu tài chính" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
            <thead>
              <tr style={{ background: tk.CARD2 }}>
                <th style={{ textAlign: "left", padding: "10px 22px", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Chỉ tiêu</th>
                {years.map(y => (
                  <th key={y} style={{ textAlign: "right", padding: "10px 16px 10px 0", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em" }}>{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.rows.map(row => {
                const isActive = activeKey === row.key;
                return (
                  <tr
                    key={String(row.key)}
                    onClick={() => setActiveKey(row.key)}
                    style={{ cursor: "pointer", background: isActive ? tk.ACCENT_HL : "transparent", borderTop: `0.5px solid ${tk.BORDER}`, transition: "background 120ms" }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = tk.ROW_HOV; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "11px 22px", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 700 : 400 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isActive && <div style={{ width: 3, height: 16, background: tk.ACCENT_BAR, borderRadius: 2, flexShrink: 0 }} />}
                        {row.label}
                      </div>
                    </td>
                    {years.map(y => {
                      const d = data.find(f => f.year === y);
                      const raw = d ? (d[row.key] as number | null) : null;
                      return (
                        <td key={y} style={{ padding: "11px 16px 11px 0", textAlign: "right", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 600 : 400, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                          {raw != null ? row.fmt(raw) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Balance Sheet Panel ──────────────────────────────────────────────────────

type BSKey = keyof BSRow;
const fmtTy = (v: number) => Math.round(v).toLocaleString("vi-VN");

const BS_ROWS: { label: string; key: BSKey; fmt: (v: number) => string }[] = [
  { label: "Tổng tài sản",       key: "total_assets",  fmt: fmtTy },
  { label: "Tiền và tương đương", key: "cash",          fmt: fmtTy },
  { label: "Tổng nợ phải trả",   key: "total_debt",    fmt: fmtTy },
  { label: "Vốn chủ sở hữu",     key: "equity",        fmt: fmtTy },
  { label: "Current Ratio",       key: "current_ratio", fmt: v => v.toFixed(2) },
];

function BalanceSheetPanel({ data }: { data: BSRow[] }) {
  const tk = useTK();
  const [activeKey, setActiveKey] = useState<BSKey>("total_assets");

  if (!data.length) return <EmptyState message="Chưa có dữ liệu bảng cân đối" />;

  const recent = [...data].sort((a, b) => a.period_date.localeCompare(b.period_date)).slice(-8);
  const activeRow = BS_ROWS.find(r => r.key === activeKey)!;

  const chartData = recent.map(r => ({
    period: r.period,
    value: Math.abs((r[activeKey] as number | null) ?? 0),
  }));

  return (
    <div>
      {/* Trend chart */}
      <div style={{ background: tk.CARD2, borderRadius: 14, border: `1px solid ${tk.BORDER}`, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tk.TEXT, marginBottom: 14 }}>{activeRow.label} (tỷ VND)</div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tk.GRID_STROKE} vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: tk.MUTED }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip content={<FinTooltip unit="tỷ" />} />
              <Bar dataKey="value" fill={tk.ACCENT_BAR} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
          <thead>
            <tr style={{ background: tk.CARD2 }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: tk.MUTED2, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `0.5px solid ${tk.BORDER}`, minWidth: 180 }}>Chỉ tiêu</th>
              {recent.map(r => (
                <th key={r.period} style={{ padding: "10px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: tk.MUTED2, borderBottom: `0.5px solid ${tk.BORDER}`, whiteSpace: "nowrap" }}>{r.period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BS_ROWS.map((row, i) => {
              const isActive = activeKey === row.key;
              return (
                <tr key={row.key} onClick={() => setActiveKey(row.key)}
                  style={{ background: isActive ? tk.ACCENT_HL : i % 2 === 0 ? "transparent" : tk.ROW_HOV, borderBottom: `0.5px solid ${tk.BORDER}`, cursor: "pointer" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 700 : 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isActive && <div style={{ width: 3, height: 16, background: tk.ACCENT_BAR, borderRadius: 2 }} />}
                      {row.label}
                    </div>
                  </td>
                  {recent.map(r => {
                    const val = r[row.key] as number | null;
                    return (
                      <td key={r.period} style={{ padding: "11px 10px", textAlign: "right", fontSize: 13, fontWeight: isActive ? 700 : 400, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                        {val != null ? row.fmt(val) : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: tk.MUTED2, textAlign: "right" }}>Nguồn: Simplize · tỷ VND</div>
    </div>
  );
}

// ─── Cash Flow Panel ──────────────────────────────────────────────────────────

type CFKey = keyof CFRow;
const CF_ROWS: { label: string; key: CFKey }[] = [
  { label: "CF hoạt động kinh doanh", key: "operating_cf"    },
  { label: "Dòng tiền tự do (FCF)",   key: "fcf"             },
  { label: "CapEx",                   key: "capex"           },
  { label: "Biến động tiền thuần",    key: "net_cash_change" },
];

function CashFlowPanel({ data }: { data: CFRow[] }) {
  const tk = useTK();
  const [activeKey, setActiveKey] = useState<CFKey>("operating_cf");

  if (!data.length) return <EmptyState message="Chưa có dữ liệu dòng tiền" />;

  const recent = [...data].sort((a, b) => a.period_date.localeCompare(b.period_date)).slice(-8);
  const activeRow = CF_ROWS.find(r => r.key === activeKey)!;

  const fmtCF = (v: number | null) => v == null ? "—"
    : `${v < 0 ? "-" : ""}${Math.round(Math.abs(v)).toLocaleString("vi-VN")}`;
  const colorOf = (v: number | null) => v == null ? tk.MUTED : v >= 0 ? GREEN : RED;

  const chartData = recent.map(r => ({
    period: r.period,
    value: (r[activeKey] as number | null) ?? 0,
  }));

  return (
    <div>
      {/* Trend chart */}
      <div style={{ background: tk.CARD2, borderRadius: 14, border: `1px solid ${tk.BORDER}`, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tk.TEXT, marginBottom: 14 }}>{activeRow.label} (tỷ VND)</div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tk.GRID_STROKE} vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: tk.MUTED }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <ReferenceLine y={0} stroke={tk.REF_STROKE} />
              <Tooltip content={<FinTooltip unit="tỷ" />} />
              <Bar dataKey="value" fill={tk.ACCENT_BAR} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
          <thead>
            <tr style={{ background: tk.CARD2 }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: tk.MUTED2, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `0.5px solid ${tk.BORDER}`, minWidth: 220 }}>Chỉ tiêu</th>
              {recent.map(r => (
                <th key={r.period} style={{ padding: "10px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: tk.MUTED2, borderBottom: `0.5px solid ${tk.BORDER}`, whiteSpace: "nowrap" }}>{r.period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CF_ROWS.map((row, i) => {
              const isActive = activeKey === row.key;
              return (
                <tr key={row.key} onClick={() => setActiveKey(row.key)}
                  style={{ background: isActive ? tk.ACCENT_HL : i % 2 === 0 ? "transparent" : tk.ROW_HOV, borderBottom: `0.5px solid ${tk.BORDER}`, cursor: "pointer" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 700 : 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isActive && <div style={{ width: 3, height: 16, background: tk.ACCENT_BAR, borderRadius: 2 }} />}
                      {row.label}
                    </div>
                  </td>
                  {recent.map(r => {
                    const val = r[row.key] as number | null;
                    return (
                      <td key={r.period} style={{ padding: "11px 10px", textAlign: "right", fontSize: 13, fontWeight: isActive ? 700 : 400, color: isActive ? tk.ACCENT_TEXT : colorOf(val), fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                        {fmtCF(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: tk.MUTED2, textAlign: "right" }}>Nguồn: Simplize · tỷ VND · (x) = âm</div>
    </div>
  );
}

// ─── Hiển thị tài chính theo LOẠI HÌNH (FY, 5 năm gần nhất) ───────────────────

type StmtFmt = "ty" | "eps" | "pct" | "x";
interface DispRow { label: string; code: string; src: "stmt" | "ratio"; fmt: StmtFmt; }
const fam = (ct: string | null | undefined) => (ct === "bank" ? "bank" : "other");

const FIN_TEMPLATES: Record<FinTab, Record<"bank" | "other", DispRow[]>> = {
  income: {
    other: [
      { label: "Doanh thu",       code: "IS_REVENUE",           src: "stmt", fmt: "ty" },
      { label: "Lợi nhuận gộp",   code: "IS_GROSS_PROFIT",      src: "stmt", fmt: "ty" },
      { label: "LN từ HĐKD",      code: "IS_OPERATING_PROFIT",  src: "stmt", fmt: "ty" },
      { label: "LN sau thuế",     code: "IS_NET_PROFIT_PARENT", src: "stmt", fmt: "ty" },
      { label: "EPS (đồng)",      code: "IS_EPS",               src: "stmt", fmt: "eps" },
    ],
    bank: [
      { label: "Tổng thu nhập HĐ",   code: "BANK_TOI",          src: "stmt", fmt: "ty" },
      { label: "Thu nhập lãi thuần", code: "BANK_NII",          src: "stmt", fmt: "ty" },
      { label: "LN từ HĐKD",         code: "BANK_PREPROVISION", src: "stmt", fmt: "ty" },
      { label: "LN sau thuế",        code: "IS_NET_PROFIT_PARENT", src: "stmt", fmt: "ty" },
      { label: "EPS (đồng)",         code: "IS_EPS",            src: "stmt", fmt: "eps" },
    ],
  },
  balance: {
    other: [
      { label: "Tổng tài sản",     code: "BS_TOTAL_ASSETS",   src: "stmt", fmt: "ty" },
      { label: "Tài sản ngắn hạn", code: "BS_CURRENT_ASSETS", src: "stmt", fmt: "ty" },
      { label: "Nợ phải trả",      code: "BS_TOTAL_DEBT",     src: "stmt", fmt: "ty" },
      { label: "Vốn chủ sở hữu",   code: "BS_EQUITY",         src: "stmt", fmt: "ty" },
    ],
    bank: [
      { label: "Tổng tài sản",        code: "BS_TOTAL_ASSETS", src: "stmt", fmt: "ty" },
      { label: "Cho vay khách hàng",  code: "BANK_LOANS",      src: "stmt", fmt: "ty" },
      { label: "Tiền gửi khách hàng", code: "BANK_DEPOSITS",   src: "stmt", fmt: "ty" },
      { label: "Nợ phải trả",         code: "BS_TOTAL_DEBT",   src: "stmt", fmt: "ty" },
      { label: "Vốn chủ sở hữu",      code: "BS_EQUITY",       src: "stmt", fmt: "ty" },
    ],
  },
  cashflow: {
    other: [
      { label: "CF hoạt động KD",      code: "CF_OPERATING", src: "stmt", fmt: "ty" },
      { label: "CF đầu tư",            code: "CF_INVESTING", src: "stmt", fmt: "ty" },
      { label: "CF tài chính",         code: "CF_FINANCING", src: "stmt", fmt: "ty" },
      { label: "Biến động tiền thuần", code: "CF_NET",       src: "stmt", fmt: "ty" },
    ],
    // Ngân hàng: CF ít giá trị phân tích (TT49 gộp dòng tài chính vào HĐKD, financing để trống) → giữ tối giản
    bank: [
      { label: "CF hoạt động KD",      code: "CF_OPERATING", src: "stmt", fmt: "ty" },
      { label: "CF đầu tư",            code: "CF_INVESTING", src: "stmt", fmt: "ty" },
      { label: "Biến động tiền thuần", code: "CF_NET",       src: "stmt", fmt: "ty" },
    ],
  },
  metrics: {
    other: [
      { label: "ROE",            code: "ROE",            src: "ratio", fmt: "pct" },
      { label: "ROA",            code: "ROA",            src: "ratio", fmt: "pct" },
      { label: "Biên LN gộp",    code: "GROSS_MARGIN",   src: "ratio", fmt: "pct" },
      { label: "Biên LN ròng",   code: "NET_MARGIN",     src: "ratio", fmt: "pct" },
      { label: "Nợ / Vốn (D/E)", code: "DEBT_TO_EQUITY", src: "ratio", fmt: "x" },
    ],
    bank: [
      { label: "ROE",          code: "ROE",  src: "ratio", fmt: "pct" },
      { label: "ROA",          code: "ROA",  src: "ratio", fmt: "pct" },
      { label: "NIM",          code: "NIM",  src: "ratio", fmt: "pct" },
      { label: "CIR",          code: "CIR",  src: "ratio", fmt: "pct" },
      { label: "Nợ xấu (NPL)", code: "NPL",  src: "ratio", fmt: "pct" },
    ],
  },
};

const fmtCell = (v: number, f: StmtFmt) =>
  f === "ty"  ? (v < 0 ? "-" : "") + Math.round(Math.abs(v) / 1e9).toLocaleString("vi-VN")
: f === "eps" ? Math.round(v).toLocaleString("vi-VN")
: f === "pct" ? `${(v * 100).toFixed(1)}%`
:               v.toFixed(2);
const chartVal = (v: number, f: StmtFmt) => f === "ty" ? v / 1e9 : f === "pct" ? v * 100 : v;

function StatementPanel({ tab, companyType, stmt, ratios }: {
  tab: FinTab; companyType: string | null; stmt: any[]; ratios: any[];
}) {
  const tk = useTK();
  const rows = FIN_TEMPLATES[tab][fam(companyType)];
  const [activeCode, setActiveCode] = useState(rows[0].code);
  useEffect(() => { setActiveCode(rows[0].code); }, [tab, companyType]);

  const lookup: Record<string, Record<number, number>> = {};
  const put = (c: string, y: number, v: number) => { (lookup[c] ??= {})[y] = v; };
  stmt.forEach(r => { if (r.value != null) put(r.item_code, Number(r.period), Number(r.value)); });
  ratios.forEach(r => { if (r.value != null) put(r.ratio_code, Number(r.period), Number(r.value)); });

  const years = [...new Set(stmt.map(r => Number(r.period)).filter(y => !isNaN(y)))]
    .sort((a, b) => a - b).slice(-5);
  if (!years.length) return <EmptyState message="Chưa có dữ liệu tài chính" />;

  const active = rows.find(r => r.code === activeCode) ?? rows[0];
  const isPct  = active.fmt === "pct" || active.fmt === "x";
  const barData = years.map(y => ({ year: String(y), value: lookup[active.code]?.[y] != null ? chartVal(lookup[active.code][y], active.fmt) : 0 }));

  return (
    <div>
      <div style={{ background: tk.CARD2, borderRadius: 14, border: `1px solid ${tk.BORDER}`, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tk.TEXT, marginBottom: 14 }}>{active.label}{isPct ? " (%)" : active.fmt === "eps" ? " (đồng)" : " (tỷ VND)"}</div>
        <div style={{ height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barSize={38} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tk.GRID_STROKE} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: tk.MUTED }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <ReferenceLine y={0} stroke={tk.REF_STROKE} />
              <Tooltip content={<FinTooltip unit={isPct ? "%" : active.fmt === "eps" ? "đ" : "tỷ"} />} cursor={{ fill: `${tk.ACCENT_CHART}0D` }} />
              <Bar dataKey="value" fill={tk.ACCENT_BAR} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: tk.CARD, borderRadius: 14, border: `1px solid ${tk.BORDER}`, overflow: "hidden" }}>
        <div style={{ padding: "16px 22px 8px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tk.TEXT, marginBottom: 3 }}>Chỉ tiêu tài chính</div>
          <div style={{ fontSize: 12, color: tk.MUTED }}>Click vào từng chỉ tiêu để xem biểu đồ · {years[0]}–{years[years.length - 1]}</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
            <thead>
              <tr style={{ background: tk.CARD2 }}>
                <th style={{ textAlign: "left", padding: "10px 22px", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: 170 }}>Chỉ tiêu</th>
                {years.map(y => (
                  <th key={y} style={{ textAlign: "right", padding: "10px 16px 10px 0", fontSize: 11, fontWeight: 700, color: tk.MUTED2 }}>{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isActive = activeCode === row.code;
                return (
                  <tr key={row.code} onClick={() => setActiveCode(row.code)}
                    style={{ cursor: "pointer", background: isActive ? tk.ACCENT_HL : "transparent", borderTop: `0.5px solid ${tk.BORDER}` }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = tk.ROW_HOV; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <td style={{ padding: "11px 22px", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 700 : 400 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isActive && <div style={{ width: 3, height: 16, background: tk.ACCENT_BAR, borderRadius: 2, flexShrink: 0 }} />}
                        {row.label}
                      </div>
                    </td>
                    {years.map(y => {
                      const raw = lookup[row.code]?.[y];
                      return (
                        <td key={y} style={{ padding: "11px 16px 11px 0", textAlign: "right", fontSize: 13, color: isActive ? tk.ACCENT_TEXT : tk.TEXT, fontWeight: isActive ? 600 : 400, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                          {raw != null ? fmtCell(raw, row.fmt) : "—"}
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
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TickerDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate   = useNavigate();

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("wealbee-theme");
    setIsDark(stored === "dark");
  }, []);

  const tk = isDark ? DARK_TOKENS : LIGHT_TOKENS;

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [ticker,    setTicker]    = useState<any>(null);
  const [prices,    setPrices]    = useState<any[]>([]);
  const [vniPrices, setVniPrices] = useState<any[]>([]);
  const [hnxPrices, setHnxPrices] = useState<any[]>([]);
  const [stmt,      setStmt]      = useState<any[]>([]);
  const [ratiosFY,  setRatiosFY]  = useState<any[]>([]);
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [dividends,  setDividends]  = useState<any[]>([]);
  const [insiders,   setInsiders]   = useState<any[]>([]);
  const [news,       setNews]       = useState<any[]>([]);
  const [period,     setPeriod]     = useState<Period>("3M");
  const [finTab,     setFinTab]     = useState<FinTab>("income");
  const [showVni,    setShowVni]    = useState(true);
  const [showHnx,    setShowHnx]    = useState(true);
  const [extraTab,   setExtraTab]   = useState<"dividends" | "insiders" | "news">("dividends");
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const sym = symbol?.toUpperCase() ?? "";

  // ── Outlet context (optional — page can also be rendered standalone) ────────
  let addContextCard: AppOutletContext["addContextCard"] | undefined;
  let removeContextCard: AppOutletContext["removeContextCard"] | undefined;
  try {
    const ctx = useOutletContext<AppOutletContext>();
    addContextCard = ctx.addContextCard;
    removeContextCard = ctx.removeContextCard;
  } catch { /* standalone render, no outlet */ }

  const contextCardId = `ticker-${sym}`;
  const addedRef = useRef(false);

  // Add context card when ticker data loads, remove on unmount
  useEffect(() => {
    if (!sym || !removeContextCard) return;
    addedRef.current = false;
    return () => {
      removeContextCard!(contextCardId);
      addedRef.current = false;
    };
  }, [sym]);

  useEffect(() => {
    if (!sym) return;
    loadAll(sym);
  }, [sym]);

  const loadAll = async (s: string) => {
    setLoading(true); setError(null);
    try {
      const [
        { data: tickerData },
        { data: priceData },
        { data: stmtData },
        { data: divData },
        { data: insiderData },
        { data: newsData },
        { data: vniData },
        { data: hnxData },
        { data: stockData },
        { data: ratioData },
      ] = await Promise.all([
        supabase.from("tickers").select("symbol,name,exchange,sector,in_vn30,company_type,founded_year,listing_date").eq("symbol", s).single(),
        supabase.from("prices_daily").select("date,open,high,low,close,volume").eq("symbol", s).order("date", { ascending: true }).limit(2000),
        supabase.from("financial_statements").select("statement,period,item_code,value").eq("symbol", s).eq("period_type", "FY").limit(2000),
        supabase.from("dividends").select("id,ex_date,payment_date,dividend_type,amount").eq("symbol", s).order("ex_date", { ascending: false }).limit(10),
        supabase.from("insider_transactions").select("id,trade_date,insider_name,trade_type,volume").eq("symbol", s).order("trade_date", { ascending: false }).limit(10),
        supabase.from("market_news").select("title,published_at,impact_score,label,article_url").contains("affected_symbols", [s]).neq("label", "trash").not("label", "is", null).order("published_at", { ascending: false }).limit(10),
        supabase.from("market_indices").select("date,close").eq("index_code", "VNINDEX").order("date", { ascending: true }).limit(2000),
        supabase.from("market_indices").select("date,close").eq("index_code", "HNX").order("date", { ascending: true }).limit(2000),
        supabase.from("stocks").select("symbol,name,sector_name,company_context").eq("symbol", s).single(),
        supabase.from("financial_ratios").select("period,period_type,ratio_code,value").eq("symbol", s).limit(2000),
      ]);

      if (!tickerData) { setError(`Không tìm thấy mã "${s}"`); setLoading(false); return; }
      setTicker(tickerData);
      setPrices(priceData ?? []);
      setStmt(stmtData ?? []);
      setRatiosFY(ratioData ?? []);
      setStockInfo(stockData ?? null);
      setDividends(divData ?? []);
      setInsiders(insiderData ?? []);
      setNews(newsData ?? []);
      setVniPrices(vniData ?? []);
      setHnxPrices(hnxData ?? []);

      // Auto-add context card to Action Hub
      if (addContextCard && !addedRef.current) {
        addedRef.current = true;
        addContextCard({
          id: `ticker-${s}`,
          type: "ticker",
          label: s,
          badge: stockData?.name ?? tickerData.name ?? s,
          summary: stockData?.company_context ?? undefined,
        });
      }
    } catch { setError("Lỗi kết nối. Vui lòng thử lại."); }
    setLoading(false);
  };

  // ── Filter prices by period ────────────────────────────────────────────────

  const filteredPrices = useMemo(() => {
    if (!prices.length) return [];
    let cutStr: string;
    if (period === "YTD") {
      cutStr = `${new Date().getFullYear()}-01-01`;   // từ đầu năm, không phải 365 ngày
    } else {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period]);
      cutStr = cutoff.toISOString().slice(0, 10);
    }
    return prices.filter(p => p.date >= cutStr);
  }, [prices, period]);

  // ── Build chart data with % change vs VN-Index ────────────────────────────

  const chartData = useMemo(() => {
    if (!filteredPrices.length) return [];

    const vniMap: Record<string, number> = {};
    vniPrices.forEach(v => { vniMap[v.date] = Number(v.close); });
    const hnxMap: Record<string, number> = {};
    hnxPrices.forEach(v => { hnxMap[v.date] = Number(v.close); });

    const baseStock = Number(filteredPrices[0].close);
    // baseline index = điểm ĐẦU TIÊN có dữ liệu trong cửa sổ (tránh 0% khi ngày đầu thiếu data index)
    const firstVni  = filteredPrices.find(p => vniMap[p.date] != null);
    const firstHnx  = filteredPrices.find(p => hnxMap[p.date] != null);
    const baseVni   = firstVni ? vniMap[firstVni.date] : 0;
    const baseHnx   = firstHnx ? hnxMap[firstHnx.date] : 0;

    // forward-fill: ngày thiếu data index → giữ giá trị gần nhất (không rớt về 0%)
    let lastVni = baseVni, lastHnx = baseHnx;
    return filteredPrices.map(p => {
      if (vniMap[p.date] != null) lastVni = vniMap[p.date];
      if (hnxMap[p.date] != null) lastHnx = hnxMap[p.date];
      return {
        date:  fmtShort(p.date),
        stock: parseFloat(((Number(p.close) / baseStock - 1) * 100).toFixed(2)),
        vni:   baseVni > 0 ? parseFloat((lastVni / baseVni * 100 - 100).toFixed(2)) : 0,
        hnx:   baseHnx > 0 ? parseFloat((lastHnx / baseHnx * 100 - 100).toFixed(2)) : 0,
      };
    });
  }, [filteredPrices, vniPrices, hnxPrices]);

  const latest  = prices.length > 0 ? prices[prices.length - 1] : null;
  const prev    = prices.length > 1 ? prices[prices.length - 2] : null;
  const chgAbs  = latest && prev ? Number(latest.close) - Number(prev.close) : null;
  const chgPct  = latest && prev ? (chgAbs! / Number(prev.close)) * 100 : null;
  const isUp    = chgPct != null ? chgPct >= 0 : null;

  const stockPeriodPct = chartData.length >= 2 ? chartData[chartData.length - 1].stock : 0;
  const STOCK_C = stockPeriodPct >= 0 ? GREEN : RED;

  const FIN_TABS: { id: FinTab; icon: React.ElementType; label: string }[] = [
    { id: "metrics",   icon: BarChart2,   label: "Chỉ số" },
    { id: "income",    icon: BookOpen,    label: "Doanh thu" },
    { id: "balance",   icon: Scale,       label: "Bảng cân đối" },
    { id: "cashflow",  icon: TrendingUp,  label: "Dòng tiền" },
  ];
  const EXTRA_TABS: { id: "dividends" | "insiders" | "news"; icon: React.ElementType; label: string; count: number }[] = [
    { id: "dividends", icon: Coins,     label: "Cổ tức",  count: dividends.length },
    { id: "insiders",  icon: Users,     label: "Insider", count: insiders.length  },
    { id: "news",      icon: Newspaper, label: "Tin tức", count: news.length      },
  ];

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, flexDirection: "column", gap: 12, fontFamily: FONT }}>
        <RefreshCw size={22} style={{ color: "#0849AC", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "rgba(26,26,46,0.55)", fontSize: 14 }}>Đang tải dữ liệu {sym}…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !ticker) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", padding: "0 24px", textAlign: "center", fontFamily: FONT }}>
        <AlertCircle size={40} style={{ color: "#FF3B30", marginBottom: 12 }} />
        <p style={{ fontSize: 16, fontWeight: 700 }}>{error ?? "Không tìm thấy mã cổ phiếu"}</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: 16, padding: "9px 20px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.2)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
          ← Quay lại
        </button>
      </div>
    );
  }

  return (
    <TK.Provider value={tk}>
      <div style={{ minHeight: "100%", background: tk.BG, fontFamily: FONT, color: tk.TEXT }}>

        {/* ── Sticky header ────────────────────────────────────────────────── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: tk.HEADER_BG, backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${tk.BORDER}`,
          padding: "0 32px", height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: tk.BACK_BTN_BG, border: `1px solid ${tk.BORDER}`,
                borderRadius: 8, padding: "6px 14px", color: tk.TEXT, fontSize: 13,
                cursor: "pointer", fontFamily: FONT, fontWeight: 500, transition: "background 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = tk.BACK_BTN_HOV; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = tk.BACK_BTN_BG; }}
            >
              <ArrowLeft size={14} strokeWidth={2} /> Quay lại
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: sc(ticker.sector ?? ""),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", flexShrink: 0,
              }}>
                {ticker.symbol.slice(0, 3)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.3px", color: tk.TEXT }}>{ticker.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: sc(ticker.sector ?? ""), color: "#fff", padding: "2px 8px", borderRadius: 4 }}>{ticker.sector}</span>
                  <span style={{ fontSize: 11, color: tk.MUTED }}>{ticker.exchange} · {ticker.symbol}</span>
                  {ticker.in_vn30 && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(8,73,172,0.12)", color: "#0849AC", padding: "2px 6px", borderRadius: 4 }}>VN30</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.8px", color: tk.TEXT, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              {latest ? latest.close.toLocaleString("vi-VN") : "—"}
              <span style={{ fontSize: 13, color: tk.MUTED, marginLeft: 5 }}>đ</span>
            </div>
            {chgPct != null && (
              <div style={{ fontSize: 13, fontWeight: 700, color: isUp ? GREEN : RED }}>
                {isUp ? "+" : ""}{chgAbs?.toLocaleString("vi-VN")} ({isUp ? "+" : ""}{chgPct.toFixed(2)}%)
              </div>
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 32px" }}>

          {/* 2-col: company info + price */}
          {(() => {
            const profile = VN30_PROFILES[ticker.symbol];
            const curR: Record<string, number> = {};
            ratiosFY.forEach((r: any) => { if (r.period_type === "CURRENT" && r.value != null) curR[r.ratio_code] = Number(r.value); });
            const fyRoe = ratiosFY.filter((r: any) => r.ratio_code === "ROE" && /^\d{4}$/.test(String(r.period)))
              .sort((a: any, b: any) => String(a.period).localeCompare(String(b.period))).pop();
            const latestFin = (curR.PE != null || curR.PB != null || fyRoe)
              ? { pe_ratio: curR.PE ?? null, pb_ratio: curR.PB ?? null, roe: fyRoe?.value ?? null }
              : null;

            // 52-week high/low from prices array
            const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const cutStr52 = oneYearAgo.toISOString().slice(0, 10);
            const yrPrices = prices.filter(p => p.date >= cutStr52);
            const yr52High = yrPrices.length ? Math.max(...yrPrices.map(p => Number(p.high))) : null;
            const yr52Low  = yrPrices.length ? Math.min(...yrPrices.map(p => Number(p.low)))  : null;

            const divider = <div style={{ height: 1, background: tk.BORDER, margin: "16px 0" }} />;

            const InfoField = ({ label, value }: { label: string; value: string }) => (
              <div>
                <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: tk.TEXT }}>{value || "—"}</div>
              </div>
            );

            const PriceField = ({ label, value, color }: { label: string; value: string; color?: string }) => (
              <div>
                <div style={{ fontSize: 11, color: tk.MUTED, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: color ?? tk.TEXT, fontFamily: "'Montserrat', system-ui, sans-serif", letterSpacing: "-0.5px" }}>{value}</div>
              </div>
            );

            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

                {/* Company Info card */}
                <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, padding: "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <Building2 size={14} color={tk.MUTED} strokeWidth={2} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: tk.TEXT }}>Thông tin doanh nghiệp</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                    <InfoField label="Sàn giao dịch" value={ticker.exchange ?? profile?.exchange ?? "—"} />
                    <InfoField label="Ngành" value={ticker.sector ?? "—"} />
                    <InfoField label="Quốc gia" value="Việt Nam" />
                    <InfoField label="Thành lập" value={ticker.founded_year ? `Năm ${ticker.founded_year}` : profile?.founded ? `Năm ${profile.founded}` : "—"} />
                    <InfoField label="Ngày niêm yết" value={ticker.listing_date ? `${new Date(ticker.listing_date).toLocaleDateString("vi-VN")} (HOSE)` : profile?.listed ? `${profile.listed} (HOSE)` : "—"} />
                    <InfoField label="Trong VN30" value={ticker.in_vn30 ? "Có" : "Không"} />
                  </div>

                  {latestFin && (
                    <>
                      {divider}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 8px" }}>
                        {[
                          { label: "P/E", val: latestFin.pe_ratio?.toFixed(1) ?? "—" },
                          { label: "P/B", val: latestFin.pb_ratio?.toFixed(2) ?? "—" },
                          { label: "ROE", val: latestFin.roe != null ? `${(latestFin.roe * 100).toFixed(1)}%` : "—" },
                        ].map(m => (
                          <div key={m.label} style={{ textAlign: "center", background: tk.CARD2, borderRadius: 10, padding: "10px 8px" }}>
                            <div style={{ fontSize: 10, color: tk.MUTED, marginBottom: 4 }}>{m.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: tk.ACCENT, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{m.val}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {(stockInfo?.company_context || profile?.about) && (() => { const about = (stockInfo?.company_context ?? profile?.about ?? "") as string; return (
                    <>
                      {divider}
                      <div style={{ fontSize: 11, fontWeight: 700, color: tk.MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Về công ty</div>
                      <div style={{ fontSize: 12.5, color: tk.TEXT, lineHeight: 1.65, opacity: 0.85, whiteSpace: "pre-line" }}>
                        {aboutExpanded || about.length <= 280
                          ? about
                          : about.slice(0, 280) + "..."}
                      </div>
                      {about.length > 280 && (
                        <button
                          onClick={() => setAboutExpanded(e => !e)}
                          style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: tk.ACCENT_TEXT, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: FONT }}
                        >
                          {aboutExpanded ? "Thu gọn ↑" : "Xem thêm →"}
                        </button>
                      )}
                    </>
                  ); })()}
                </div>

                {/* Price card */}
                <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, padding: "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <TrendingUp size={14} color={tk.MUTED} strokeWidth={2} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: tk.TEXT }}>Giá</span>
                  </div>

                  {latest ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                        <PriceField label="Giá đóng cửa" value={`${Number(latest.close).toLocaleString("vi-VN")} đ`} />
                        <PriceField
                          label="Thay đổi"
                          value={chgAbs != null ? `${chgAbs > 0 ? "+" : ""}${chgAbs.toLocaleString("vi-VN")} đ` : "—"}
                          color={isUp === true ? GREEN : isUp === false ? RED : tk.TEXT}
                        />
                        <PriceField
                          label="Thay đổi %"
                          value={chgPct != null ? `${chgPct > 0 ? "+" : ""}${chgPct.toFixed(2)}%` : "—"}
                          color={isUp === true ? GREEN : isUp === false ? RED : tk.TEXT}
                        />
                        <PriceField
                          label="Khối lượng"
                          value={latest.volume >= 1e6 ? `${(latest.volume / 1e6).toFixed(2)}M` : latest.volume.toLocaleString("vi-VN")}
                        />
                      </div>

                      {divider}

                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: tk.MUTED }}>Biên độ trong ngày</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: tk.TEXT }}>
                            {Number(latest.low).toLocaleString("vi-VN")} – {Number(latest.high).toLocaleString("vi-VN")}
                          </span>
                        </div>
                        <RangeBar low={Number(latest.low)} high={Number(latest.high)} current={Number(latest.close)} />
                      </div>

                      {yr52Low != null && yr52High != null && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: tk.MUTED }}>Biên độ 52 tuần</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: tk.TEXT }}>
                              {yr52Low.toLocaleString("vi-VN")} – {yr52High.toLocaleString("vi-VN")}
                            </span>
                          </div>
                          <RangeBar low={yr52Low} high={yr52High} current={Number(latest.close)} />
                        </div>
                      )}
                    </>
                  ) : (
                    <EmptyState message="Chưa có dữ liệu giá" />
                  )}
                </div>

              </div>
            );
          })()}

          {/* ── Price chart card (always visible) ─────────────────────────── */}
          <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "22px 24px" }}>
              <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 6, color: tk.TEXT, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                        {latest ? latest.close.toLocaleString("vi-VN") : "—"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {chgPct != null && (
                          <span style={{ color: isUp ? GREEN : RED, fontSize: 15, fontWeight: 700 }}>
                            {isUp ? "+" : ""}{chgAbs?.toLocaleString("vi-VN")} ({isUp ? "+" : ""}{chgPct.toFixed(2)}%)
                          </span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: stockPeriodPct >= 0 ? GREEN : RED, background: stockPeriodPct >= 0 ? "rgba(39,200,64,0.10)" : "rgba(255,57,49,0.10)", padding: "3px 9px", borderRadius: 6 }}>
                          {stockPeriodPct >= 0 ? "+" : ""}{stockPeriodPct.toFixed(2)}% trong kỳ {period}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", background: tk.CARD2, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${tk.BORDER}` }}>
                      {PERIODS.map(p => (
                        <button key={p} onClick={() => setPeriod(p)} style={{
                          padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                          background: period === p ? "#0849AC" : "transparent",
                          color: period === p ? "#fff" : tk.MUTED,
                          fontSize: 12, fontWeight: period === p ? 700 : 500,
                          fontFamily: FONT, transition: "all 100ms",
                        }}>{p}</button>
                      ))}
                    </div>
                  </div>

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
                        <YAxis tick={{ fill: tk.MUTED, fontSize: 10, fontFamily: FONT }} axisLine={false} tickLine={false} width={48} tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine y={0} stroke={tk.REF_STROKE} strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="stock" stroke={STOCK_C}  strokeWidth={2.5} fill="url(#gStock)" dot={false} name={sym} />
                        {showVni && <Area type="monotone" dataKey="vni" stroke={VNI_C} strokeWidth={1.5} fill="url(#gVni)" dot={false} name="VN-Index"  strokeDasharray="5 2" />}
                        {showHnx && <Area type="monotone" dataKey="hnx" stroke={HNX_C} strokeWidth={1.5} fill="url(#gHnx)" dot={false} name="HNX-Index" strokeDasharray="5 2" />}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend */}
                  <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.05)", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(26,26,46,0.12)"}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: STOCK_C, boxShadow: `0 0 0 3px ${STOCK_C}30` }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: tk.TEXT }}>{sym}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: stockPeriodPct >= 0 ? GREEN : RED }}>{fmtPct(stockPeriodPct)}</span>
                    </div>
                    <button onClick={() => setShowVni(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: FONT, background: showVni ? (isDark ? "rgba(93,127,255,0.12)" : "rgba(93,127,255,0.08)") : "transparent", border: showVni ? "1px solid rgba(93,127,255,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: showVni ? VNI_C : "transparent", border: showVni ? "none" : `2px solid ${VNI_C}` }} />
                      <span style={{ fontSize: 12, fontWeight: showVni ? 700 : 400, color: showVni ? tk.TEXT : tk.MUTED }}>VN-Index</span>
                      {showVni && chartData.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: chartData[chartData.length - 1].vni >= 0 ? GREEN : RED }}>{fmtPct(chartData[chartData.length - 1].vni)}</span>}
                    </button>
                    <button onClick={() => setShowHnx(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: FONT, background: showHnx ? (isDark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)") : "transparent", border: showHnx ? "1px solid rgba(139,92,246,0.30)" : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,26,46,0.08)"}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: showHnx ? HNX_C : "transparent", border: showHnx ? "none" : `2px solid ${HNX_C}` }} />
                      <span style={{ fontSize: 12, fontWeight: showHnx ? 700 : 400, color: showHnx ? tk.TEXT : tk.MUTED }}>HNX-Index</span>
                      {showHnx && chartData.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: chartData[chartData.length - 1].hnx >= 0 ? GREEN : RED }}>{fmtPct(chartData[chartData.length - 1].hnx)}</span>}
                    </button>
                  </div>
                </div>
            </div>
          </div>

          {/* ── Financial section (always visible below chart) ─────────────── */}
          <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${tk.BORDER}`, padding: "0 8px", gap: 2 }}>
              {FIN_TABS.map(tab => {
                const Icon   = tab.icon;
                const active = finTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setFinTab(tab.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "14px 16px", border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: FONT,
                    borderBottom: active ? `2px solid ${tk.ACCENT}` : "2px solid transparent",
                    color: active ? tk.ACCENT : tk.MUTED,
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    transition: "all 120ms", marginBottom: -1,
                  }}>
                    <Icon size={14} strokeWidth={1.8} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "22px 24px" }}>
              {stmt.length === 0
                ? <EmptyState message={`Chưa có dữ liệu tài chính cho ${sym}`} />
                : <StatementPanel key={finTab} tab={finTab} companyType={ticker?.company_type ?? null} stmt={stmt} ratios={ratiosFY} />
              }
            </div>
          </div>

          {/* ── Cổ tức / Insider / Tin tức ────────────────────────────────── */}
          <div style={{ background: tk.CARD, borderRadius: 16, border: `1px solid ${tk.BORDER}`, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${tk.BORDER}`, padding: "0 8px", gap: 2 }}>
              {EXTRA_TABS.map(tab => {
                const Icon   = tab.icon;
                const active = extraTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setExtraTab(tab.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "14px 16px", border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: FONT,
                    borderBottom: active ? `2px solid ${tk.ACCENT}` : "2px solid transparent",
                    color: active ? tk.ACCENT : tk.MUTED,
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    transition: "all 120ms", marginBottom: -1,
                  }}>
                    <Icon size={14} strokeWidth={1.8} />
                    {tab.label}
                    {tab.count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: active ? tk.ACCENT_HL : "transparent", color: active ? tk.ACCENT : tk.MUTED2, padding: "1px 5px", borderRadius: 99 }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "22px 24px" }}>

              {/* ─ Dividends ─ */}
              {extraTab === "dividends" && (
                dividends.length === 0 ? <EmptyState message={`Chưa có dữ liệu cổ tức cho ${sym}`} /> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: tk.CARD2 }}>
                          {["Ngày ĐKCC", "Ngày thanh toán", "Loại", "Tỷ lệ"].map(h => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `0.5px solid ${tk.BORDER}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dividends.map((d: any, i: number) => (
                          <tr key={d.id} style={{ background: i % 2 === 0 ? "transparent" : tk.ROW_HOV, borderBottom: `0.5px solid ${tk.BORDER}` }}>
                            <td style={{ padding: "10px 16px", fontWeight: 600, color: tk.TEXT }}>{fmtDate(d.ex_date)}</td>
                            <td style={{ padding: "10px 16px", color: tk.MUTED }}>{d.payment_date ? fmtDate(d.payment_date) : "—"}</td>
                            <td style={{ padding: "10px 16px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: d.dividend_type === "cash" ? "rgba(52,199,89,0.12)" : "rgba(8,73,172,0.1)", color: d.dividend_type === "cash" ? "#16a34a" : "#0849AC" }}>
                                {d.dividend_type === "cash" ? "Tiền mặt" : "Cổ phiếu"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 16px", fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 600, color: tk.TEXT }}>
                              {d.dividend_type === "cash" ? `${fmtN(d.amount)} đ/CP` : `${(d.amount * 100).toFixed(0)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* ─ Insiders ─ */}
              {extraTab === "insiders" && (
                insiders.length === 0 ? <EmptyState message={`Chưa có dữ liệu giao dịch nội bộ cho ${sym}`} /> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: tk.CARD2 }}>
                          {["Ngày GD", "Người nội bộ", "Loại GD", "Khối lượng"].map(h => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: tk.MUTED2, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `0.5px solid ${tk.BORDER}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {insiders.map((ins: any, i: number) => (
                          <tr key={ins.id} style={{ background: i % 2 === 0 ? "transparent" : tk.ROW_HOV, borderBottom: `0.5px solid ${tk.BORDER}` }}>
                            <td style={{ padding: "10px 16px", fontWeight: 600, color: tk.TEXT }}>{fmtDate(ins.trade_date)}</td>
                            <td style={{ padding: "10px 16px", color: tk.MUTED, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ins.insider_name}</td>
                            <td style={{ padding: "10px 16px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: ins.trade_type === "buy" ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.1)", color: ins.trade_type === "buy" ? "#16a34a" : "#FF3B30" }}>
                                {ins.trade_type === "buy" ? "▲ MUA" : "▼ BÁN"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 16px", fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 600, color: tk.TEXT }}>
                              {ins.volume != null ? `${ins.volume.toLocaleString("vi-VN")} CP` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* ─ News ─ */}
              {extraTab === "news" && (
                news.length === 0 ? <EmptyState message={`Chưa có tin tức liên quan đến ${sym}`} /> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {news.map((n: any, i: number) => {
                      const lc = n.label === "positive" ? { bg: "rgba(52,199,89,0.12)", text: "#16a34a", txt: "Tích cực" }
                        : n.label === "negative" ? { bg: "rgba(255,59,48,0.1)", text: "#FF3B30", txt: "Tiêu cực" }
                        : { bg: tk.CARD2, text: tk.MUTED, txt: "Trung lập" };
                      return (
                        <a key={i} href={n.article_url ?? "#"} target={n.article_url ? "_blank" : "_self"} rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <div style={{ background: tk.CARD2, border: `1px solid ${tk.BORDER}`, borderRadius: 12, padding: "14px 16px", transition: "border-color 0.15s", cursor: n.article_url ? "pointer" : "default" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tk.ACCENT; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = tk.BORDER; }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: tk.TEXT, lineHeight: 1.5 }}>{n.title}</p>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: lc.bg, color: lc.text }}>{lc.txt}</span>
                                {n.impact_score != null && <span style={{ fontSize: 10, color: tk.MUTED }}>Tác động: {n.impact_score > 0 ? "+" : ""}{n.impact_score}</span>}
                              </div>
                            </div>
                            <p style={{ margin: "6px 0 0", fontSize: 11, color: tk.MUTED }}>
                              {new Date(n.published_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              {n.article_url && <span style={{ marginLeft: 8, color: tk.ACCENT }}>↗ Đọc bài</span>}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )
              )}

            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: tk.MUTED }}>
            <Info size={10} />
            Thông tin chỉ mang tính tham khảo · Không phải khuyến nghị đầu tư theo Luật Chứng khoán 2019
          </div>

          <div style={{ height: 32 }} />
        </div>
      </div>
    </TK.Provider>
  );
}
