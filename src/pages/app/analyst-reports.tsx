/**
 * Trang "Báo cáo phân tích" — danh sách đầy đủ (từ analyst_reports).
 * Đồng bộ giao diện dashboard: card mã cổ phiếu, khuyến nghị tô màu, giá mục tiêu,
 * ngày đăng (ẩn nếu không có), kéo vào ActionHub, mở PDF gốc. Có tìm kiếm + lọc khuyến nghị.
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { FileText, Eye, Search, ArrowLeft, Sparkles } from "lucide-react";

interface AnalystReport {
  id: string; ticker: string | null; title: string; source_firm: string | null;
  recommendation: string | null; target_price: number | null; report_date: string | null; pdf_url: string;
}

const FONT = "'Montserrat', system-ui, sans-serif";

// "2026-06-30" → "30/06/2026"; null → ""
function reportDate(d: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function recoGroup(reco: string | null): "buy" | "hold" | "sell" | null {
  const r = (reco || "").toLowerCase();
  if (/mua|khả quan|tích lũy|outperform|tăng tỷ trọng|\badd\b|\bbuy\b/.test(r)) return "buy";
  if (/bán|kém|underperform|reduce|\bsell\b|giảm tỷ trọng/.test(r)) return "sell";
  return r ? "hold" : null;
}

function recoStyle(reco: string | null, isDark: boolean): { bg: string; text: string } {
  const g = recoGroup(reco);
  if (g === "buy") return { bg: isDark ? "rgba(52,199,89,0.14)" : "rgba(52,199,89,0.10)", text: "#1a7f37" };
  if (g === "sell") return { bg: isDark ? "rgba(224,82,77,0.16)" : "rgba(224,82,77,0.10)", text: "#c0392b" };
  return { bg: isDark ? "rgba(245,158,11,0.16)" : "rgba(245,158,11,0.12)", text: "#b45309" };
}

export function AnalystReportsPage({ isDark, addContextCard }: { isDark: boolean; addContextCard: (c: ContextCard) => void }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<AnalystReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "buy" | "hold" | "sell">("all");

  // ── Theme tokens (khớp dashboard) ──
  const pageBg     = isDark ? "#0B0D18" : "#F5F7FB";
  const cardBg     = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg         = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgSubtle   = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const divider    = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand      = isDark ? "#4D8FE8" : "#0849AC";
  const inputBg    = isDark ? "#1a2032" : "#fff";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("analyst_reports")
        .select("id,ticker,title,source_firm,recommendation,target_price,report_date,pdf_url")
        // Sắp theo edocs id (thứ tự Vietstock thêm báo cáo). report_date từ PDF không đáng
        // tin (nhiều báo cáo null/sai) nên KHÔNG dùng để sắp xếp.
        .order("id", { ascending: false })
        .limit(300);
      if (!cancelled) { setReports((data ?? []) as AnalystReport[]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return reports.filter(r => {
      if (filter !== "all" && recoGroup(r.recommendation) !== filter) return false;
      if (!s) return true;
      return (r.ticker || "").toLowerCase().includes(s)
        || (r.source_firm || "").toLowerCase().includes(s)
        || (r.title || "").toLowerCase().includes(s);
    });
  }, [reports, q, filter]);

  const toCard = (rp: AnalystReport): ContextCard => {
    const meta = [rp.recommendation, rp.target_price ? `MT ${rp.target_price.toLocaleString("vi-VN")}đ` : null, reportDate(rp.report_date) || null]
      .filter(Boolean).join(" · ");
    return { id: rp.id, type: "report", label: rp.title.slice(0, 60), badge: rp.source_firm ?? "Vietstock", summary: [rp.ticker, meta].filter(Boolean).join(" · ").slice(0, 110) };
  };
  const onDrag = (e: React.DragEvent, rp: AnalystReport) => {
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(toCard(rp)));
    e.dataTransfer.effectAllowed = "copy";
  };

  const FILTERS: { id: typeof filter; label: string }[] = [
    { id: "all", label: "Tất cả" }, { id: "buy", label: "Mua / Khả quan" },
    { id: "hold", label: "Trung lập" }, { id: "sell", label: "Bán / Kém" },
  ];

  return (
    <div style={{ minHeight: "100%", background: pageBg, fontFamily: FONT }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>

        {/* Header */}
        <button onClick={() => navigate("/app")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: fgSubtle, fontSize: 13, fontFamily: FONT, marginBottom: 14, padding: 0 }}>
          <ArrowLeft size={16} strokeWidth={1.5} /> Tổng quan
        </button>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: fg, margin: 0 }}>Báo cáo phân tích</h1>
            <p style={{ fontSize: 13, color: fgSubtle, margin: "4px 0 0" }}>
              {loading ? "Đang tải…" : `${reports.length} báo cáo từ các công ty chứng khoán · kéo vào ActionHub để phân tích`}
            </p>
          </div>
          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: inputBg, border: "0.5px solid " + divider, borderRadius: 10, padding: "9px 12px", minWidth: 260 }}>
            <Search size={15} color={fgSubtle} strokeWidth={1.5} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã, CTCK, tiêu đề…"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: fg, fontFamily: FONT }} />
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{ padding: "6px 14px", borderRadius: 99, border: "0.5px solid " + (active ? brand : divider), background: active ? (isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.07)") : cardBg, color: active ? brand : fgSubtle, fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: FONT }}>
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 128, borderRadius: 14, background: cardBg, boxShadow: cardShadow }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: fgSubtle }}>
            <FileText size={32} style={{ marginBottom: 10, opacity: 0.6 }} />
            <p style={{ margin: 0, fontSize: 14 }}>Không có báo cáo khớp bộ lọc</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
            {filtered.map(rp => {
              const rs = recoStyle(rp.recommendation, isDark);
              const dt = reportDate(rp.report_date);
              return (
                <div key={rp.id} draggable onDragStart={e => onDrag(e, rp)}
                  style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, cursor: "grab", userSelect: "none", border: "1px solid transparent", transition: "border-color 120ms, box-shadow 120ms", position: "relative", display: "flex", flexDirection: "column" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = isDark ? "rgba(77,143,232,0.35)" : "rgba(8,73,172,0.25)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, #0a2a6e 0%, #1a56c8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {rp.ticker
                        ? <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: FONT, lineHeight: 1 }}>{rp.ticker}</span>
                        : <FileText size={20} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: fg, lineHeight: 1.4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{rp.title}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: fgSubtle }}>{rp.source_firm ?? "Vietstock"}{dt ? " · " + dt : ""}</span>
                    {rp.recommendation && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: rs.bg, color: rs.text }}>{rp.recommendation}</span>}
                    {rp.target_price != null && <span style={{ fontSize: 11, fontWeight: 700, color: brand }}>Giá MT {rp.target_price.toLocaleString("vi-VN")}đ</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                    <button onClick={() => addContextCard(toCard(rp))}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "none", background: isDark ? "rgba(77,143,232,0.14)" : "rgba(8,73,172,0.08)", color: brand, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, WebkitTapHighlightColor: "transparent" }}>
                      <Sparkles size={13} strokeWidth={2} /> Hỏi AI
                    </button>
                    <button onClick={() => window.open(rp.pdf_url, "_blank", "noopener")}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "0.5px solid " + divider, background: "transparent", color: fgSubtle, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                      <Eye size={13} strokeWidth={1.5} /> Xem PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
