import { TrendingUp, TrendingDown, BarChart3, Plus, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { pipelineSupabase } from "../../lib/supabase/pipeline-client";

interface Holding {
  ticker: string;
  company_name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_percent: number;
  sector: string;
}

const DEMO_HOLDINGS: Holding[] = [
  { ticker: "VCB",  company_name: "Vietcombank",      quantity: 100, avg_cost: 89000,  current_price: 95800,  market_value: 9580000,  pnl: 680000,  pnl_percent: 7.64,  sector: "Ngân hàng" },
  { ticker: "FPT",  company_name: "FPT Corporation",  quantity: 50,  avg_cost: 118000, current_price: 125600, market_value: 6280000,  pnl: 380000,  pnl_percent: 6.44,  sector: "Công nghệ" },
  { ticker: "HPG",  company_name: "Hòa Phát Group",   quantity: 200, avg_cost: 29500,  current_price: 27950,  market_value: 5590000,  pnl: -310000, pnl_percent: -5.25, sector: "Thép" },
  { ticker: "VHM",  company_name: "Vinhomes",         quantity: 80,  avg_cost: 40000,  current_price: 38700,  market_value: 3096000,  pnl: -104000, pnl_percent: -3.25, sector: "BĐS" },
  { ticker: "MBB",  company_name: "MB Bank",          quantity: 150, avg_cost: 25000,  current_price: 28900,  market_value: 4335000,  pnl: 585000,  pnl_percent: 15.60, sector: "Ngân hàng" },
];

function formatVND(v: number) {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} tỷ`;
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)} tr`;
  return v.toLocaleString("vi-VN") + " đ";
}

export function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadHoldings(); }, []);

  async function loadHoldings() {
    setLoading(true);
    try {
      const { data } = await pipelineSupabase.from("holdings").select("*").limit(20);
      setHoldings(data && data.length > 0 ? (data as unknown as Holding[]) : DEMO_HOLDINGS);
    } catch { setHoldings(DEMO_HOLDINGS); }
    finally { setLoading(false); }
  }

  const refresh = async () => { setRefreshing(true); await loadHoldings(); setRefreshing(false); };

  const totalValue = holdings.reduce((s, h) => s + h.market_value, 0);
  const totalCost  = holdings.reduce((s, h) => s + (h.avg_cost * h.quantity), 0);
  const totalPnL   = totalValue - totalCost;
  const totalPct   = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Portfolio</h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>{holdings.length} cổ phiếu</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refresh} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6a7282" }}>
            <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "inherit" }}>
            <Plus style={{ width: 14, height: 14 }} />Thêm giao dịch
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Tổng tài sản", value: formatVND(totalValue), color: "#1a1a2e", bold: true },
          { label: "Tổng đầu tư", value: formatVND(totalCost), color: "#1a1a2e", bold: false },
          { label: "Lãi/Lỗ",      value: (totalPnL >= 0 ? "+" : "") + formatVND(totalPnL), color: totalPnL >= 0 ? "#0ea5a0" : "#ef4444", bold: true },
          { label: "% Return",    value: (totalPct >= 0 ? "+" : "") + totalPct.toFixed(2) + "%", color: totalPct >= 0 ? "#0ea5a0" : "#ef4444", bold: true },
        ].map(card => (
          <div key={card.label} style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "16px 18px" }}>
            <p style={{ fontSize: "0.6875rem", color: "#99a1af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{card.label}</p>
            <p style={{ fontSize: "1.125rem", fontWeight: 700, color: card.color, fontFamily: "'IBM Plex Mono', monospace" }}>{card.value}</p>
          </div>
        ))}
      </div>
      <div style={{ background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr", padding: "10px 18px", borderBottom: "1px solid rgba(8,73,172,0.06)" }}>
          {["Mã / Công ty", "Số lượng", "Giá vốn", "Giá hiện tại", "Giá trị TT", "Lãi/Lỗ"].map(h => (
            <p key={h} style={{ fontSize: "0.625rem", fontWeight: 700, color: "#99a1af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</p>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #0849ac", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          </div>
        ) : holdings.map((h, idx) => (
          <div key={h.ticker} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr", padding: "14px 18px", borderBottom: idx < holdings.length - 1 ? "1px solid rgba(8,73,172,0.04)" : "none", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>{h.ticker}</p>
              <p style={{ fontSize: "0.6875rem", color: "#99a1af" }}>{h.company_name} · {h.sector}</p>
            </div>
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>{h.quantity.toLocaleString()}</p>
            <p style={{ fontSize: "0.875rem", color: "#6a7282", fontFamily: "'IBM Plex Mono', monospace" }}>{h.avg_cost.toLocaleString()}</p>
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{h.current_price.toLocaleString()}</p>
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontFamily: "'IBM Plex Mono', monospace" }}>{formatVND(h.market_value)}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {h.pnl >= 0 ? <TrendingUp style={{ width: 13, height: 13, color: "#0ea5a0" }} /> : <TrendingDown style={{ width: 13, height: 13, color: "#ef4444" }} />}
              <div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: h.pnl >= 0 ? "#0ea5a0" : "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>{h.pnl >= 0 ? "+" : ""}{formatVND(h.pnl)}</p>
                <p style={{ fontSize: "0.6875rem", color: h.pnl >= 0 ? "#0ea5a0" : "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>{h.pnl_percent >= 0 ? "+" : ""}{h.pnl_percent.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        ))}
        {holdings.length === 0 && !loading && (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <BarChart3 style={{ width: 36, height: 36, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Chưa có holdings</p>
            <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>Thêm giao dịch để bắt đầu theo dõi danh mục</p>
          </div>
        )}
      </div>
      <p style={{ fontSize: "0.6875rem", color: "#c4c9d4", marginTop: 16, fontStyle: "italic" }}>* Giá tham chiếu cuối phiên. Đơn vị: VNĐ. Không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
