import {
  TrendingUp, TrendingDown, BarChart3, Plus, RefreshCw,
  X, Trash2, Edit3, PieChart,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from "recharts";
import { supabase } from "../../lib/supabase/client";
import { pipelineSupabase } from "../../lib/supabase/pipeline-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DBHolding {
  id: string;
  symbol: string;
  quantity: number;
  avg_cost: number;
  notes: string | null;
}

interface Holding extends DBHolding {
  name: string;
  sector: string;
  current_price: number;
  market_value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
}

interface ChartPoint {
  date: string;
  value: number;
  cost: number;
}

// ─── Ticker meta ─────────────────────────────────────────────────────────────

const TICKER_META: Record<string, { name: string; sector: string }> = {
  ACB:{ name:"ACB",              sector:"Ngân hàng" },
  BID:{ name:"BIDV",             sector:"Ngân hàng" },
  BVH:{ name:"Bảo Việt",         sector:"Bảo hiểm" },
  CTG:{ name:"VietinBank",       sector:"Ngân hàng" },
  FPT:{ name:"FPT Corp",         sector:"Công nghệ" },
  GAS:{ name:"PV Gas",           sector:"Năng lượng" },
  HDB:{ name:"HDBank",           sector:"Ngân hàng" },
  HPG:{ name:"Hòa Phát",         sector:"Thép" },
  MBB:{ name:"MB Bank",          sector:"Ngân hàng" },
  MSN:{ name:"Masan",            sector:"Tiêu dùng" },
  MWG:{ name:"Thế Giới Di Động", sector:"Bán lẻ" },
  PLX:{ name:"Petrolimex",       sector:"Năng lượng" },
  SAB:{ name:"Sabeco",           sector:"Đồ uống" },
  SSI:{ name:"SSI",              sector:"Chứng khoán" },
  STB:{ name:"Sacombank",        sector:"Ngân hàng" },
  TCB:{ name:"Techcombank",      sector:"Ngân hàng" },
  TPB:{ name:"TPBank",           sector:"Ngân hàng" },
  VCB:{ name:"Vietcombank",      sector:"Ngân hàng" },
  VHM:{ name:"Vinhomes",         sector:"BĐS" },
  VIB:{ name:"VIB",              sector:"Ngân hàng" },
  VIC:{ name:"Vingroup",         sector:"BĐS" },
  VJC:{ name:"VietJet",          sector:"Hàng không" },
  VNM:{ name:"Vinamilk",         sector:"Tiêu dùng" },
  VPB:{ name:"VPBank",           sector:"Ngân hàng" },
  VRE:{ name:"Vincom Retail",    sector:"BĐS" },
};

const VN30_SYMBOLS = Object.keys(TICKER_META);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} tỷ`;
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)} tr`;
  return v.toLocaleString("vi-VN") + " đ";
}

// ─── Add/Edit dialog ─────────────────────────────────────────────────────────

function HoldingDialog({
  onClose, onSave, initial,
}: {
  onClose: () => void;
  onSave: (symbol: string, quantity: number, avgCost: number, notes: string) => Promise<void>;
  initial?: DBHolding;
}) {
  const [symbol, setSymbol]   = useState(initial?.symbol ?? "");
  const [qty, setQty]         = useState(initial?.quantity?.toString() ?? "");
  const [cost, setCost]       = useState(initial?.avg_cost?.toString() ?? "");
  const [notes, setNotes]     = useState(initial?.notes ?? "");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)",
    fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", color: "#1a1a2e",
    background: "#f8faff", boxSizing: "border-box" as const,
  };

  const handle = async () => {
    const sym = symbol.toUpperCase().trim();
    const q   = parseInt(qty);
    const c   = parseFloat(cost.replace(/,/g, ""));
    if (!sym) { setErr("Vui lòng chọn mã CP"); return; }
    if (!q || q <= 0) { setErr("Số lượng phải > 0"); return; }
    if (!c || c <= 0) { setErr("Giá vốn phải > 0"); return; }
    setSaving(true);
    try {
      await onSave(sym, q, c, notes);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 28, width: 420,
        boxShadow: "0 24px 64px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1a1a2e" }}>
            {initial ? "Sửa vị thế" : "Thêm vị thế"}
          </h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#99a1af" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Symbol */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 5 }}>
              Mã cổ phiếu *
            </label>
            {initial ? (
              <input value={symbol} disabled style={{ ...inputStyle, background: "#f0f0f0", color: "#99a1af" }} />
            ) : (
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                style={{ ...inputStyle }}
              >
                <option value="">-- Chọn mã --</option>
                {VN30_SYMBOLS.map(s => (
                  <option key={s} value={s}>{s} — {TICKER_META[s].name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 5 }}>
              Số lượng (CP) *
            </label>
            <input
              type="number" value={qty} min="1"
              onChange={(e) => setQty(e.target.value)}
              placeholder="Ví dụ: 100"
              style={inputStyle}
            />
          </div>

          {/* Avg cost */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 5 }}>
              Giá vốn bình quân (VNĐ) *
            </label>
            <input
              type="number" value={cost} min="1"
              onChange={(e) => setCost(e.target.value)}
              placeholder="Ví dụ: 85000"
              style={inputStyle}
            />
            {cost && !isNaN(parseFloat(cost)) && (
              <p style={{ fontSize: "0.6875rem", color: "#99a1af", marginTop: 4 }}>
                = {parseFloat(cost).toLocaleString("vi-VN")} đ/CP
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6a7282", display: "block", marginBottom: 5 }}>
              Ghi chú
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tùy chọn"
              style={inputStyle}
            />
          </div>

          {err && <p style={{ fontSize: "0.75rem", color: "#ef4444", padding: "8px 12px", background: "rgba(239,68,68,0.06)", borderRadius: 7 }}>{err}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", cursor: "pointer", fontSize: "0.875rem", color: "#6a7282", fontFamily: "inherit" }}>
              Hủy
            </button>
            <button onClick={handle} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: 9, border: "none", background: saving ? "#94a3b8" : "#0849ac", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: 600, fontFamily: "inherit" }}>
              {saving ? "Đang lưu..." : (initial ? "Cập nhật" : "Thêm vào danh mục")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PortfolioPage ─────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const [holdings, setHoldings]   = useState<Holding[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<DBHolding | undefined>(undefined);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [userId, setUserId]       = useState<string | null>(null);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUserId(data.session.user.id);
      } else {
        setNotLoggedIn(true);
        setLoading(false);
      }
    });
  }, []);

  // ── Load holdings + current prices ──
  const loadHoldings = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch user holdings
      const { data: raw, error } = await supabase
        .from("portfolio_holdings")
        .select("id, symbol, quantity, avg_cost, notes")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!raw || raw.length === 0) { setHoldings([]); setChartData([]); return; }

      // 2. Fetch latest prices for each symbol
      const symbols = raw.map((r) => r.symbol);
      const { data: prices } = await pipelineSupabase
        .from("prices_daily")
        .select("symbol, date, close")
        .in("symbol", symbols)
        .order("date", { ascending: false })
        .limit(symbols.length * 2);

      // Latest price per symbol
      const latestPrice: Record<string, number> = {};
      for (const p of prices ?? []) {
        if (!latestPrice[p.symbol]) latestPrice[p.symbol] = Number(p.close);
      }

      // 3. Build holdings with P&L
      const enriched: Holding[] = raw.map((h) => {
        const cp    = latestPrice[h.symbol] ?? h.avg_cost;
        const mv    = cp * h.quantity;
        const cb    = Number(h.avg_cost) * h.quantity;
        const pnl   = mv - cb;
        const meta  = TICKER_META[h.symbol] ?? { name: h.symbol, sector: "—" };
        return {
          ...h,
          name: meta.name,
          sector: meta.sector,
          current_price: cp,
          market_value: mv,
          cost_basis: cb,
          pnl,
          pnl_pct: cb > 0 ? (pnl / cb) * 100 : 0,
        };
      });
      setHoldings(enriched);

      // 4. Build 30-day portfolio value chart
      await buildChart(raw, symbols);
    } catch (e) {
      console.error("Portfolio load error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const buildChart = async (raw: DBHolding[], symbols: string[]) => {
    try {
      const { data: hist } = await pipelineSupabase
        .from("prices_daily")
        .select("symbol, date, close")
        .in("symbol", symbols)
        .order("date", { ascending: true })
        .limit(symbols.length * 30);

      if (!hist) return;

      // Group prices by date → symbol → close
      const byDate: Record<string, Record<string, number>> = {};
      for (const row of hist) {
        if (!byDate[row.date]) byDate[row.date] = {};
        byDate[row.date][row.symbol] = Number(row.close);
      }

      const totalCost = raw.reduce((s, h) => s + Number(h.avg_cost) * h.quantity, 0);

      const points: ChartPoint[] = Object.entries(byDate)
        .slice(-30)
        .map(([date, prices]) => {
          const value = raw.reduce((s, h) => {
            const p = prices[h.symbol];
            return s + (p ? p * h.quantity : Number(h.avg_cost) * h.quantity);
          }, 0);
          return { date: date.slice(5), value: Math.round(value), cost: Math.round(totalCost) };
        });

      setChartData(points);
    } catch { /* skip */ }
  };

  useEffect(() => {
    if (userId) loadHoldings();
  }, [userId, loadHoldings]);

  // ── CRUD ──
  const saveHolding = async (symbol: string, quantity: number, avgCost: number, notes: string) => {
    if (!userId) return;
    if (editTarget) {
      await supabase.from("portfolio_holdings")
        .update({ quantity, avg_cost: avgCost, notes: notes || null, updated_at: new Date().toISOString() })
        .eq("id", editTarget.id);
    } else {
      const { error } = await supabase.from("portfolio_holdings")
        .insert({ user_id: userId, symbol, quantity, avg_cost: avgCost, notes: notes || null });
      if (error) throw new Error(error.message);
    }
    await loadHoldings();
  };

  const deleteHolding = async (id: string) => {
    if (!confirm("Xóa vị thế này?")) return;
    await supabase.from("portfolio_holdings").delete().eq("id", id);
    await loadHoldings();
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadHoldings();
    setRefreshing(false);
  };

  // ── Summary ──
  const totalValue = holdings.reduce((s, h) => s + h.market_value, 0);
  const totalCost  = holdings.reduce((s, h) => s + h.cost_basis, 0);
  const totalPnL   = totalValue - totalCost;
  const totalPct   = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // ── Sector breakdown ──
  const sectorMap: Record<string, number> = {};
  for (const h of holdings) {
    sectorMap[h.sector] = (sectorMap[h.sector] ?? 0) + h.market_value;
  }
  const sectors = Object.entries(sectorMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, val]) => ({ name, val, pct: totalValue > 0 ? (val / totalValue) * 100 : 0 }));

  const SECTOR_COLORS = ["#0849ac","#0ea5a0","#8b5cf6","#f59e0b","#ef4444","#10b981","#6366f1","#f97316"];

  if (notLoggedIn) {
    return (
      <div style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ textAlign: "center" }}>
          <BarChart3 style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e" }}>Đăng nhập để xem danh mục</p>
          <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>Portfolio được lưu theo tài khoản của bạn</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1300 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>
            Portfolio
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 3 }}>
            {holdings.length > 0 ? `${holdings.length} vị thế · Giá cuối phiên` : "Chưa có vị thế"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refresh} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw style={{ width: 14, height: 14, color: "#6a7282", animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          </button>
          <button
            onClick={() => { setEditTarget(undefined); setShowDialog(true); }}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Thêm vị thế
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Tổng tài sản",  value: fmt(totalValue), color: "#1a1a2e" },
          { label: "Tổng đầu tư",   value: fmt(totalCost),  color: "#1a1a2e" },
          { label: "Lãi / Lỗ",      value: (totalPnL >= 0 ? "+" : "") + fmt(totalPnL), color: totalPnL >= 0 ? "#0ea5a0" : "#ef4444" },
          { label: "% Return",       value: (totalPct >= 0 ? "+" : "") + totalPct.toFixed(2) + "%", color: totalPct >= 0 ? "#0ea5a0" : "#ef4444" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "16px 18px" }}>
            <p style={{ fontSize: "0.6875rem", color: "#99a1af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{c.label}</p>
            <p style={{ fontSize: "1.125rem", fontWeight: 700, color: c.color, fontFamily: "'IBM Plex Mono', monospace" }}>{c.value || "—"}</p>
          </div>
        ))}
      </div>

      {holdings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginBottom: 24 }}>
          {/* ── P&L Chart ── */}
          {chartData.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
                <TrendingUp style={{ width: 14, height: 14, color: "#0849ac" }} />
                <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a1a2e" }}>Giá trị danh mục 30 ngày</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,73,172,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#99a1af" }} tickLine={false} axisLine={false} interval={6} />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid rgba(8,73,172,0.12)", borderRadius: 8, fontSize: "0.75rem" }}
                    formatter={(val: number) => [fmt(val), ""]}
                    labelStyle={{ color: "#6a7282", fontWeight: 600 }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#0849ac" strokeWidth={2} dot={false} name="Giá trị TT" />
                  <Line type="monotone" dataKey="cost"  stroke="#e5e7eb" strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="Giá vốn" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Sector breakdown ── */}
          <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
              <PieChart style={{ width: 14, height: 14, color: "#8b5cf6" }} />
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a1a2e" }}>Phân bổ ngành</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sectors.map((s, i) => (
                <div key={s.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: "0.75rem", color: "#1a1a2e", fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: "0.75rem", color: "#6a7282", fontFamily: "'IBM Plex Mono', monospace" }}>{s.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "#f1f5f9", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${s.pct}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length], borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Holdings table ── */}
      <div style={{ background: "#fff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1fr 1fr 80px", padding: "10px 18px", borderBottom: "1px solid rgba(8,73,172,0.06)", background: "#fafbff" }}>
          {["Mã / Tên", "Số lượng", "Giá vốn", "Giá hiện tại", "Giá trị TT", "Lãi / Lỗ", ""].map(h => (
            <p key={h} style={{ fontSize: "0.625rem", fontWeight: 700, color: "#99a1af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</p>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #0849ac", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 10 }}>Đang tải dữ liệu...</p>
          </div>
        ) : holdings.length === 0 ? (
          <div style={{ padding: "56px 20px", textAlign: "center" }}>
            <BarChart3 style={{ width: 40, height: 40, color: "#e2e8f0", margin: "0 auto 14px" }} />
            <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>Danh mục trống</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginBottom: 20 }}>Thêm vị thế đầu tiên để bắt đầu theo dõi P&L</p>
            <button
              onClick={() => { setEditTarget(undefined); setShowDialog(true); }}
              style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Plus style={{ width: 14, height: 14 }} /> Thêm vị thế đầu tiên
            </button>
          </div>
        ) : holdings.map((h, idx) => (
          <div
            key={h.id}
            style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1fr 1fr 80px", padding: "14px 18px", borderBottom: idx < holdings.length - 1 ? "1px solid rgba(8,73,172,0.04)" : "none", alignItems: "center", transition: "background 0.1s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fafbff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            {/* Symbol + name */}
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>{h.symbol}</p>
              <p style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{h.name} · {h.sector}</p>
            </div>
            {/* Qty */}
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>
              {h.quantity.toLocaleString()}
            </p>
            {/* Avg cost */}
            <p style={{ fontSize: "0.875rem", color: "#6a7282", fontFamily: "'IBM Plex Mono', monospace" }}>
              {h.avg_cost.toLocaleString("vi-VN")}
            </p>
            {/* Current price */}
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>
              {h.current_price.toLocaleString("vi-VN")}
            </p>
            {/* Market value */}
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>
              {fmt(h.market_value)}
            </p>
            {/* P&L */}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {h.pnl >= 0
                ? <TrendingUp  style={{ width: 13, height: 13, color: "#0ea5a0", flexShrink: 0 }} />
                : <TrendingDown style={{ width: 13, height: 13, color: "#ef4444", flexShrink: 0 }} />
              }
              <div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: h.pnl >= 0 ? "#0ea5a0" : "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}
                </p>
                <p style={{ fontSize: "0.6875rem", color: h.pnl >= 0 ? "#0ea5a0" : "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {h.pnl_pct >= 0 ? "+" : ""}{h.pnl_pct.toFixed(2)}%
                </p>
              </div>
            </div>
            {/* Actions */}
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setEditTarget(h); setShowDialog(true); }}
                title="Sửa"
                style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6a7282" }}
              >
                <Edit3 style={{ width: 12, height: 12 }} />
              </button>
              <button
                onClick={() => deleteHolding(h.id)}
                title="Xóa"
                style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(239,68,68,0.15)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}
              >
                <Trash2 style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {holdings.length > 0 && (
        <p style={{ fontSize: "0.6875rem", color: "#c4c9d4", marginTop: 14, fontStyle: "italic" }}>
          * Giá tham chiếu cuối phiên từ Yahoo Finance. Không phải khuyến nghị đầu tư.
        </p>
      )}

      {/* ── Dialog ── */}
      {showDialog && (
        <HoldingDialog
          initial={editTarget}
          onClose={() => { setShowDialog(false); setEditTarget(undefined); }}
          onSave={saveHolding}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
