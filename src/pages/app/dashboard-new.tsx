/**
 * Dashboard — data THẬT từ Supabase:
 *  - market_indices  → IndexCard chỉ số (sparkline 7 ngày)
 *  - prices_daily    → Top Gainers / Losers / Sector Heatmap
 *  - market_news     → TIN TỨC section
 *  - portfolios + holdings + assets → DANH MỤC watchlist
 * Phần "AI Highlights" và "Báo cáo phân tích" vẫn là nội dung mẫu
 * (sẽ thay bằng AI-generated khi có pipeline).
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight, TrendingUp, TrendingDown,
  RefreshCw, Eye, FileText, Sparkles, ChevronDown,
  AlertTriangle, Lightbulb, Maximize2,
} from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { useCurrentUser } from "../../lib/hooks/useCurrentUser";
import { useIsMobile } from "../../components/ui/use-mobile";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { IndexDetailModal } from "../../components/index-detail-modal";
import { fmtIndexValue, fmtIndexChange, fmtStockPrice } from "../../lib/format-price";

// ── Types ──────────────────────────────────────────────────────────────────
interface MoverRow   { symbol: string; price: number; pct: number; vol: string; isCeil: boolean; isFloor: boolean; }
interface SectorRow  { name: string; pct: number; }
interface NewsItem   { title: string; tag: string; source: string; time: string; url?: string; }
interface WatchRow   { symbol: string; name: string; price: number; change: number; quantity: number; }
interface IndexState { name: string; value: number; change: number; pct: number; sparkline: number[]; vol: string; code?: string; }

interface DashboardProps {
  onNavigate: (page: string) => void;
  onSelectTicker?: (symbol: string) => void;
  isDark?: boolean;
  // Mobile: thay drag-to-AI (không chạy trên touch) — tap nút sparkle để thêm
  // card vào context và mở chat overlay (addContextCard tự mở hub khi đang đóng).
  onAskAI?: (card: ContextCard) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function relativeTime(ts: string): string {
  const mins = (Date.now() - new Date(ts).getTime()) / 60000;
  if (mins < 60) return `${Math.round(mins)}p`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)} ngày`;
}

// Giờ đăng tin: hôm nay → "HH:MM", ngày khác → "HH:MM DD/MM"
function newsTime(ts: string): string {
  const d = new Date(ts);
  const hhmm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? hhmm : `${hhmm} ${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`;
}

// Ngày báo cáo: "2026-06-30" → "30/06/2026"; rỗng → ""
function reportDate(d: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

// Màu chip khuyến nghị theo loại (không cào bằng xanh nữa)
function recoStyle(reco: string | null, isDark: boolean): { bg: string; text: string } {
  const r = (reco || "").toLowerCase();
  if (/mua|khả quan|tích lũy|outperform|tăng tỷ trọng|\badd\b|\bbuy\b/.test(r))
    return { bg: isDark ? "rgba(52,199,89,0.14)" : "rgba(52,199,89,0.10)", text: "#1a7f37" };   // xanh
  if (/bán|kém|underperform|reduce|\bsell\b|giảm tỷ trọng/.test(r))
    return { bg: isDark ? "rgba(224,82,77,0.16)" : "rgba(224,82,77,0.10)", text: "#c0392b" };   // đỏ
  return { bg: isDark ? "rgba(245,158,11,0.16)" : "rgba(245,158,11,0.12)", text: "#b45309" };   // hổ phách (trung lập/nắm giữ)
}

function fmtVol(v: number | null): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return `${v}`;
}

// "Cập nhật lúc HH:mm:ss" — updated_at tự cập nhật mỗi lần job intraday ghi đè
// giá trong phiên, KHÔNG phải created_at (chỉ set 1 lần lúc tạo dòng đầu ngày).
function fmtUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function normLabel(label: string | null): string {
  if (!label) return "Trung lập";
  const l = label.toLowerCase();
  if (l.includes("positive") || l.includes("tích")) return "Tích cực";
  if (l.includes("negative") || l.includes("cảnh") || l.includes("warning")) return "Cảnh báo";
  if (l.includes("event") || l.includes("sự kiện")) return "Sự kiện";
  return label;
}

// ── Sub-components ─────────────────────────────────────────────────────────
function PctBadge({ value }: { value: number }) {
  const isUp = value > 0, isDown = value < 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "#3D3D52", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {isUp ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function MoverPctBadge({ value, isCeil, isFloor }: { value: number; isCeil?: boolean; isFloor?: boolean }) {
  if (isCeil) return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(124,58,237,0.12)", color: "#7C3AED", fontFamily: "'Montserrat', system-ui, sans-serif" }}>+{value.toFixed(2)}%</span>;
  if (isFloor) return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: "rgba(6,182,212,0.12)", color: "#06B6D4", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{value.toFixed(2)}%</span>;
  const isUp = value > 0, isDown = value < 0;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: isUp ? "rgba(52,199,89,0.12)" : isDown ? "rgba(255,59,48,0.12)" : "rgba(0,0,0,0.06)", color: isUp ? "#34C759" : isDown ? "#FF3B30" : "#3D3D52", fontFamily: "'Montserrat', system-ui, sans-serif" }}>{isUp ? "+" : ""}{value.toFixed(2)}%</span>;
}

function makeDragHandlers(card: ContextCard) {
  return {
    draggable: true as const,
    onDragStart(e: React.DragEvent) {
      e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
      e.dataTransfer.effectAllowed = "copy";
      (e.currentTarget as HTMLElement).style.opacity = "0.7";
    },
    onDragEnd(e: React.DragEvent) { (e.currentTarget as HTMLElement).style.opacity = "1"; },
  };
}

function getSectorColor(pct: number) {
  if (pct >= 2)   return { bg: "rgba(52,199,89,0.25)", text: "#1a7a3a" };
  if (pct >= 0.5) return { bg: "rgba(52,199,89,0.12)", text: "#34C759" };
  if (pct >= 0)   return { bg: "rgba(52,199,89,0.06)", text: "#34C759" };
  if (pct >= -0.5)return { bg: "rgba(255,59,48,0.06)", text: "#FF3B30" };
  if (pct >= -2)  return { bg: "rgba(255,59,48,0.12)", text: "#FF3B30" };
  return { bg: "rgba(255,59,48,0.25)", text: "#cc1010" };
}

function DragHint() {
  // Mobile không có drag — ẩn hẳn (tap kích hoạt mouseenter khiến hint kẹt hiển thị)
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return (
    <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", display: "flex", alignItems: "center", gap: 4, opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }} className="drag-hint">
      <span style={{ fontSize: 10, fontWeight: 700, color: "#0849AC", fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
    </div>
  );
}

// Mobile: nút "Hỏi AI" góc card — thay cho drag-to-AI (HTML5 drag không chạy trên touch)
function AskAiButton({ card, onAsk }: { card: ContextCard; onAsk?: (c: ContextCard) => void }) {
  if (!onAsk) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onAsk(card); }}
      title="Hỏi AI về mục này"
      style={{
        position: "absolute", top: 8, right: 8, width: 32, height: 32, zIndex: 2,
        borderRadius: "50%", border: "none", cursor: "pointer",
        background: "rgba(8,73,172,0.10)", color: "#0849AC",
        display: "flex", alignItems: "center", justifyContent: "center",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Sparkles size={15} strokeWidth={1.8} />
    </button>
  );
}

// Mobile: biến thể inline cho dòng danh sách (điểm nổi bật, insight danh mục)
function AskAiInline({ card, onAsk }: { card: ContextCard; onAsk?: (c: ContextCard) => void }) {
  if (!onAsk) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onAsk(card); }}
      title="Hỏi AI về mục này"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, marginLeft: 4, verticalAlign: "middle",
        borderRadius: "50%", border: "none", cursor: "pointer",
        background: "rgba(8,73,172,0.10)", color: "#0849AC", flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Sparkles size={13} strokeWidth={1.8} />
    </button>
  );
}

function SkeletonRow() {
  return <div style={{ height: 30, borderRadius: 8, background: "rgba(0,0,0,0.05)", margin: "2px 0" }} />;
}

// Map sector chi tiết (GICS-style) -> ICB tier 1 (11 ngành chuẩn)
const ICB1: Record<string, string> = {
  "Phần mềm và dịch vụ": "Công nghệ", "Phần cứng và thiết bị": "Công nghệ",
  "Dịch vụ viễn thông": "Viễn thông",
  "Dược phẩm, công nghệ sinh học và khoa học sự sống": "Y tế", "Thiết bị và dịch vụ chăm sóc sức khỏe": "Y tế",
  "Dịch vụ tài chính": "Tài chính", "Tổ chức tín dụng": "Tài chính", "Bảo hiểm": "Tài chính",
  "Bất động sản": "Bất động sản",
  "Thời trang và hàng lâu bền": "Hàng tiêu dùng", "Xe và linh kiện": "Hàng tiêu dùng",
  "Dịch vụ tiêu dùng": "Hàng tiêu dùng", "Truyền thông và giải trí": "Hàng tiêu dùng",
  "Thương mại hàng không thiết yếu": "Hàng tiêu dùng",
  "Thực phẩm, đồ uống và thuốc lá": "Hàng thiết yếu", "Thương mại hàng thiết yếu": "Hàng thiết yếu",
  "Sản phẩm chăm sóc cá nhân và gia đình": "Hàng thiết yếu",
  "Hàng hóa công nghiệp": "Công nghiệp", "Vận tải": "Công nghiệp", "Dịch vụ thương mại và chuyên nghiệp": "Công nghiệp",
  "Nguyên vật liệu": "Nguyên vật liệu", "Năng lượng": "Năng lượng", "Tiện ích": "Tiện ích",
};
const toIcb1 = (s: string | null | undefined) => (s && ICB1[s]) || "Khác";

function IndexCard({ idx, isDark, onClick, active, onExpand }: { idx: IndexState; isDark: boolean; onClick?: () => void; active?: boolean; onExpand?: () => void }) {
  const isUp = idx.change >= 0;
  const brandC = isDark ? "#4D8FE8" : "#0849AC";
  const maxS = Math.max(...idx.sparkline), minS = Math.min(...idx.sparkline);
  const range = maxS - minS || 1;
  const cardBg     = isDark ? "#131824" : "#fff";
  const cardShadow = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg         = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgSubtle   = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";

  const handleDragStart = (e: React.DragEvent) => {
    const card: ContextCard = { id: `index-${idx.name}`, type: "index", label: idx.name, badge: `${idx.pct >= 0 ? "+" : ""}${idx.pct.toFixed(2)}%`, summary: fmtIndexValue(idx.value) };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div draggable onDragStart={handleDragStart} onClick={onClick}
      style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: active ? `0 0 0 2px ${brandC}` : cardShadow, flex: 1, minWidth: 0, cursor: onClick ? "pointer" : "grab", position: "relative", userSelect: "none", border: active ? `2px solid ${brandC}` : "2px solid transparent", boxSizing: "border-box" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; const x = (e.currentTarget as HTMLElement).querySelector(".expand-hint") as HTMLElement | null; if (x) x.style.opacity = "1"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; const x = (e.currentTarget as HTMLElement).querySelector(".expand-hint") as HTMLElement | null; if (x) x.style.opacity = "0"; }}
      onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
    >
      <DragHint />
      {onExpand && (
        <button
          className="expand-hint"
          onClick={e => { e.stopPropagation(); onExpand(); }}
          title="Xem biểu đồ chi tiết"
          style={{
            position: "absolute", bottom: 10, right: 10, width: 22, height: 22, display: "flex",
            alignItems: "center", justifyContent: "center", borderRadius: 6, border: "none", cursor: "pointer",
            background: isDark ? "rgba(255,255,255,0.08)" : "rgba(8,73,172,0.08)", color: fgSubtle,
            opacity: 0, transition: "opacity 150ms ease",
          }}
        >
          <Maximize2 size={12} strokeWidth={1.8} />
        </button>
      )}
      <div style={{ fontSize: 12, color: fgSubtle, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 4, fontWeight: 600, letterSpacing: "0.04em" }}>{idx.name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif", marginBottom: 4 }}>{idx.value > 0 ? fmtIndexValue(idx.value) : "—"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {isUp ? <TrendingUp size={14} color="#34C759" strokeWidth={1.5} /> : <TrendingDown size={14} color="#FF3B30" strokeWidth={1.5} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? "#34C759" : "#FF3B30", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {fmtIndexChange(idx.change)} ({isUp ? "+" : ""}{idx.pct.toFixed(2)}%)
        </span>
      </div>
      {idx.sparkline.length > 1 && (
        <svg width="100%" height={32} viewBox={`0 0 ${idx.sparkline.length * 10} 32`} preserveAspectRatio="none" style={{ marginBottom: 6 }}>
          <polyline
            points={idx.sparkline.map((v, i) => `${i * 10 + 5},${32 - ((v - minS) / range) * 28}`).join(" ")}
            fill="none" stroke={isUp ? "#34C759" : "#FF3B30"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

interface BriefRow { id: string; title: string; summary: string; type: string; tickers: string[] | null; created_at: string; }
interface AnalystReport { id: string; ticker: string | null; title: string; source_firm: string | null; recommendation: string | null; target_price: number | null; report_date: string | null; pdf_url: string; }

interface NewsHighlight { title: string; source_name: string | null; source_url: string | null; impact_score: number | null; symbols?: string[]; news_type?: string | null; published_at?: string | null; }
interface PortfolioInsight { symbol: string; price: number; pct: number; insight: string | null; insight_source: string | null; source_url: string | null; insight_at?: string | null; }
interface HighlightResult {
  highlights: NewsHighlight[];
  portfolio_insights: PortfolioInsight[];
  watchlist: NewsHighlight[];
  generated_at: string;
}

const tagColors: Record<string, { bg: string; text: string }> = {
  "Tích cực": { bg: "rgba(52,199,89,0.12)", text: "#34C759" },
  "Sự kiện":  { bg: "rgba(8,73,172,0.10)",  text: "#0849AC" },
  "Trung lập":{ bg: "rgba(26,26,46,0.08)",  text: "#3D3D52" },
  "Cảnh báo": { bg: "rgba(255,59,48,0.10)", text: "#FF3B30" },
};

// ── Data fetchers (thuần, dùng làm queryFn cho React Query — xem component bên dưới) ────
// Tách riêng khỏi component để mỗi hàm chỉ trả về data, không tự setState — nhờ vậy
// React Query có thể cache/dedupe/chia sẻ kết quả giữa các lần mount thay vì luôn
// tải lại từ đầu mỗi khi user rời trang rồi quay lại.

async function fetchMarketData(): Promise<{
  vn30Set: Set<string>;
  allMovers: (MoverRow & { sector: string; exchange: string })[];
  gainers: MoverRow[];
  losers: MoverRow[];
  sectors: SectorRow[];
  marketIndices: IndexState[];
  marketUpdatedAt: string | null;
}> {
  // Vũ trụ TOÀN BỘ sàn (HOSE + HNX + UPCoM) + sector, để có thể lọc theo từng sàn
  // khi user bấm vào card chỉ số (VN30/HNX) — xem scopeMovers trong component.
  // ~1576 mã toàn bộ 3 sàn — vượt giới hạn CỨNG 1000 dòng/request của PostgREST
  // (client .limit() không vượt qua được giới hạn server), nên phải phân trang bằng .range().
  async function fetchAllStocks(): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; from < 4000; from += 1000) {
      const { data } = await supabase.from("stocks").select("symbol,sector_name,exchange").range(from, from + 999);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }

  const [stocksRows, indicesRes, vn30Res] = await Promise.all([
    fetchAllStocks(),
    supabase.from("market_indices")
      .select("index_code,close,change_pct,date,updated_at")
      .in("index_code", ["VNINDEX", "HNX", "VN30", "UPCOM"])
      .order("date", { ascending: false })
      .limit(60),
    supabase.from("tickers").select("symbol").eq("in_vn30", true),
  ]);

  const vn30Set = new Set<string>((vn30Res.data ?? []).map((t: any) => t.symbol));
  const sectorMap: Record<string, string> = {};
  const exchangeMap: Record<string, string> = {};
  const universeSet = new Set<string>();
  stocksRows.forEach((s: any) => {
    sectorMap[s.symbol] = s.sector_name || "";
    exchangeMap[s.symbol] = s.exchange || "";
    universeSet.add(s.symbol);
  });

  // Cửa sổ 10 ngày gần nhất (đủ bao trọn cuối tuần/lễ dài). KHÔNG dùng "2 ngày
  // global mới nhất" nữa: job realtime trong phiên chỉ cập nhật HÔM NAY cho
  // VN30 ∪ portfolio (~30 mã) chứ không phủ hết 700+ mã mọi sàn — nếu ép mọi
  // mã so theo đúng 1 cặp ngày chung, mã nào chưa có dữ liệu HÔM NAY (toàn bộ
  // HNX/UPCOM + phần lớn HOSE ngoài VN30) sẽ bị coi là "phẳng 0%" oan vì thiếu
  // đúng ngày global mới nhất. Mỗi mã tự lấy 2 NGÀY GẦN NHẤT CỦA RIÊNG NÓ.
  const windowCutoff = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    return d.toISOString().slice(0, 10);
  })();

  // QUAN TRỌNG: phải có tiebreaker phụ (id) — hàng nghìn dòng trùng "date" mỗi
  // ngày, nếu chỉ order theo date, Postgres không đảm bảo thứ tự ổn định giữa
  // các trang .range() liên tiếp → có thể LÀM RỚT hẳn 1 dòng của 1 mã ở ranh
  // giới trang (đã bắt được thực tế: HDB/SHB mất đúng dòng 1 ngày, khiến %thay
  // đổi tính nhảy sang so với 2 ngày trước thay vì đúng 1 ngày trước).
  const prc: any[] = [];
  for (let from = 0; from < 16000; from += 1000) {
    const { data } = await supabase.from("prices_daily").select("symbol,date,close,volume")
      .gte("date", windowCutoff).order("date", { ascending: false }).order("id", { ascending: false }).range(from, from + 999);
    if (!data?.length) break;
    prc.push(...data);
    if (data.length < 1000) break;
  }

  // gom theo mã (mọi sàn), mỗi mã tự sort theo NGÀY CỦA RIÊNG NÓ: [0]=phiên cuối, [1]=phiên trước
  const bySym: Record<string, any[]> = {};
  prc.forEach((p: any) => { if (universeSet.has(p.symbol)) (bySym[p.symbol] ??= []).push(p); });
  const withPct = Object.keys(bySym).map((sym: string) => {
    const rows = bySym[sym].sort((a, b) => b.date.localeCompare(a.date));
    const latest = rows[0], prev = rows[1];
    const pct = prev && prev.close > 0 ? ((Number(latest.close) - Number(prev.close)) / Number(prev.close)) * 100 : 0;
    return { symbol: sym, price: Number(latest.close), pct, vol: fmtVol(latest.volume), sector: toIcb1(sectorMap[sym]), exchange: exchangeMap[sym] || "" };
  });

  // allMovers: TOÀN BỘ sàn — dùng khi user lọc theo VN30/HNX (scopeMovers).
  // Biên độ dao động khác nhau theo sàn (HOSE ±7%, HNX ±10%) nên ngưỡng trần/sàn
  // phải theo từng sàn — dùng chung ±6.9% sẽ gắn nhãn "trần/sàn" sai cho mã HNX.
  const ceilFloorThreshold = (exchange: string) => (exchange === "HNX" ? 9.9 : 6.9);
  const sortedAll = [...withPct].sort((a, b) => b.pct - a.pct);
  const allMovers = sortedAll.map((s) => {
    const t = ceilFloorThreshold(s.exchange);
    return {
      symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol, sector: s.sector, exchange: s.exchange,
      isCeil: s.pct >= t, isFloor: s.pct <= -t,
    };
  });

  // gainers/losers mặc định (chưa lọc gì) VÀ heatmap ngành: giữ nguyên như trước, chỉ tính trên HOSE
  // — tránh đổi hành vi mặc định khi chưa bấm chọn sàn nào.
  const withPctHose = withPct.filter((p) => p.exchange === "HOSE");
  const sortedHose = [...withPctHose].sort((a, b) => b.pct - a.pct);
  const gainers = sortedHose.slice(0, 5).map((s) => ({
    symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol,
    isCeil: s.pct >= 6.9, isFloor: false,
  }));
  const losers = sortedHose.slice(-5).reverse().map((s) => ({
    symbol: s.symbol, price: s.price, pct: s.pct, vol: s.vol,
    isCeil: false, isFloor: s.pct <= -6.9,
  }));

  const groups: Record<string, number[]> = {};
  withPctHose.forEach((p) => {
    if (!groups[p.sector]) groups[p.sector] = [];
    groups[p.sector].push(p.pct);
  });
  const sectors: SectorRow[] = Object.entries(groups)
    .filter(([name]) => name !== "Khác")   // chỉ 11 ngành ICB tier 1, bỏ nhóm chưa phân loại
    .map(([name, pcts]) => ({ name, pct: pcts.reduce((a, b) => a + b, 0) / pcts.length }))
    .sort((a, b) => b.pct - a.pct).slice(0, 12);

  // — Market Indices —
  const indexGroups: Record<string, { close: number; date: string; change_pct: number | null; updated_at?: string }[]> = {};
  indicesRes.data?.forEach((row: any) => {
    if (!indexGroups[row.index_code]) indexGroups[row.index_code] = [];
    indexGroups[row.index_code].push(row);
  });
  const NAMES: Record<string, string> = { VNINDEX: "VN-INDEX", HNX: "HNX-INDEX", VN30: "VN30", UPCOM: "UPCOM" };
  // "Cập nhật lúc" cạnh tiêu đề CHỈ SỐ THỊ TRƯỜNG = mốc MỚI NHẤT trong 4 chỉ số
  // (updated_at tự cập nhật mỗi lần job intraday ghi đè giá trong phiên — xem
  // migration 20260712000000_price_updated_at.sql).
  let marketUpdatedAt: string | null = null;
  const marketIndices: IndexState[] = ["VNINDEX", "VN30", "HNX", "UPCOM"].map(code => {
    const rows = (indexGroups[code] ?? []).sort((a: any, b: any) => a.date.localeCompare(b.date));
    if (!rows.length) return { code, name: NAMES[code], value: 0, change: 0, pct: 0, sparkline: [], vol: "—" };
    const latest = rows[rows.length - 1];
    const prev   = rows[rows.length - 2];
    const spark  = rows.slice(-7).map((r: any) => r.close);
    const change = prev ? latest.close - prev.close : 0;
    const pct    = latest.change_pct ?? (prev && prev.close ? (change / prev.close) * 100 : 0);
    if (latest.updated_at && (!marketUpdatedAt || latest.updated_at > marketUpdatedAt)) marketUpdatedAt = latest.updated_at;
    return { code, name: NAMES[code], value: latest.close, change, pct, sparkline: spark, vol: "—" };
  });

  return { vn30Set, allMovers, gainers, losers, sectors, marketIndices, marketUpdatedAt };
}

async function fetchDashboardNews(): Promise<NewsItem[]> {
  const { data } = await supabase
    .from("market_news")
    .select("title,published_at,label,article_url")
    .neq("label", "trash")
    .not("label", "is", null)
    .order("published_at", { ascending: false })
    .limit(4);
  return (data ?? []).map((n: any) => ({
    title: n.title,
    tag: normLabel(n.label),
    source: (() => { try { return new URL(n.article_url).hostname.replace("www.", ""); } catch { return "Wealbee"; } })(),
    time: newsTime(n.published_at),
    url: n.article_url,
  }));
}

async function fetchWatchlist(userId: string): Promise<WatchRow[]> {
  const { data: rows } = await supabase
    .from("portfolio_holdings")
    .select("symbol, quantity, avg_cost")
    .eq("user_id", userId)
    .limit(8);
  if (!rows?.length) return [];

  const symbols = rows.map((r: any) => r.symbol);
  const latestPrices: Record<string, number> = {};
  const latestChanges: Record<string, number> = {};
  const tickerNames: Record<string, string> = {};

  // Giá mới nhất THEO TỪNG MÃ (mỗi mã có phiên cuối khác nhau → không dùng 1 ngày global)
  const [pricesRes, tickersRes] = await Promise.all([
    supabase.from("prices_daily").select("symbol,date,close")
      .in("symbol", symbols).order("date", { ascending: false }).limit(symbols.length * 4),
    supabase.from("tickers").select("symbol,name").in("symbol", symbols),
  ]);
  // % thay đổi = so với giá đóng cửa phiên TRƯỚC (close-to-close), đồng nhất với dashboard-highlight
  const bySymbol = new Map<string, { date: string; close: number }[]>();
  pricesRes.data?.forEach((p: any) => {
    if (p.close == null) return;
    const arr = bySymbol.get(p.symbol) ?? [];
    if (arr.length < 2) arr.push({ date: p.date, close: Number(p.close) });
    bySymbol.set(p.symbol, arr);
  });
  bySymbol.forEach((rowsForSymbol, symbol) => {
    const [latest, prev] = rowsForSymbol;
    latestPrices[symbol] = latest.close;
    latestChanges[symbol] = prev && prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  });
  tickersRes.data?.forEach((t: any) => { tickerNames[t.symbol] = t.name; });

  return rows.map((r: any) => ({
    symbol: r.symbol,
    name: tickerNames[r.symbol] || r.symbol,
    quantity: Number(r.quantity),
    price: latestPrices[r.symbol] ?? 0,
    change: latestChanges[r.symbol] ?? 0,
  }));
}

async function fetchDashboardBriefs(userId: string): Promise<BriefRow[]> {
  const { data } = await supabase
    .from("briefs")
    .select("id,title,summary,type,tickers,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as BriefRow[];
}

async function fetchAnalystReports(): Promise<AnalystReport[]> {
  const { data } = await supabase
    .from("analyst_reports")
    .select("id,ticker,title,source_firm,recommendation,target_price,report_date,pdf_url")
    // Sắp theo edocs id (thứ tự Vietstock thêm báo cáo), KHÔNG theo report_date — nhiều
    // báo cáo report_date null/sai (parse từ PDF cũ) sẽ bị đẩy lệch vị trí. Khớp trang /app/reports.
    .order("id", { ascending: false })
    .limit(12);
  return (data ?? []) as AnalystReport[];
}

async function fetchHighlight(): Promise<HighlightResult | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/dashboard-highlight`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  return await res.json() as HighlightResult;
}

// ── Dashboard component ─────────────────────────────────────────────────────
export function Dashboard({ onNavigate, onSelectTicker, isDark = false, onAskAI }: DashboardProps) {
  const isMobile = useIsMobile();
  // Nút "Hỏi AI" chỉ hiện trên mobile — desktop vẫn dùng drag như cũ
  const askAI = isMobile ? onAskAI : undefined;
  // Mobile: gộp 2 card Tăng/Giảm mạnh thành 1 card 2 tab
  const [moverTab, setMoverTab] = useState<"gain" | "loss">("gain");
  const cardBg      = isDark ? "#131824" : "#fff";
  const cardShadow  = isDark ? "0 1px 3px rgba(0,0,0,0.40)" : "0 1px 3px rgba(8,73,172,0.08), 0 1px 2px rgba(0,0,0,0.04)";
  const fg          = isDark ? "rgba(240,242,255,0.90)" : "#1A1A2E";
  const fgMuted     = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const fgSubtle    = isDark ? "rgba(240,242,255,0.85)" : "#3D3D52";
  const divider     = isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)";
  const brand       = isDark ? "#4D8FE8" : "#0849AC";
  const hoverBg     = isDark ? "#1a2438" : "#E8F0FE";

  const [marketExpanded, setMarketExpanded] = useState(true);

  // ── Real data state (đồng bộ từ React Query bên dưới — xem useEffect sync) ───
  const [gainers,       setGainers]       = useState<MoverRow[]>([]);
  const [losers,        setLosers]        = useState<MoverRow[]>([]);
  const [allMovers,     setAllMovers]     = useState<(MoverRow & { sector: string; exchange: string })[]>([]);
  const [sectors,       setSectors]       = useState<SectorRow[]>([]);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [vn30Active,    setVn30Active]    = useState(false);
  const [hnxActive,     setHnxActive]     = useState(false);
  const [vn30Set,       setVn30Set]       = useState<Set<string>>(new Set());
  const [dashNews,      setDashNews]      = useState<NewsItem[]>([]);
  const [watchHoldings, setWatchHoldings] = useState<WatchRow[]>([]);
  const [marketIndices, setMarketIndices] = useState<IndexState[]>([]);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);
  const [detailIndex,   setDetailIndex]   = useState<{ code: "VNINDEX" | "HNX" | "VN30" | "UPCOM"; name: string } | null>(null);
  const [briefs,        setBriefs]        = useState<BriefRow[]>([]);
  const [reports,       setReports]       = useState<AnalystReport[]>([]);
  const [highlight,     setHighlight]     = useState<HighlightResult | null>(null);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });

  // ── Data fetch, có cache (React Query) ────────────────────────────────────
  // Chuyển trang đi rồi quay lại trong thời gian "stale" sẽ không tải lại từ đầu —
  // chỉ khi hết hạn (staleTime) mới âm thầm làm mới nền. 5 nguồn dưới đây ĐỘC LẬP
  // với nhau nên React Query tự chạy song song, không còn cảnh Tin tức/Watchlist/
  // Briefs/Báo cáo phải xếp hàng chờ dữ liệu thị trường tải xong như code cũ.
  const userQuery = useCurrentUser();
  const userId = userQuery.data?.id;

  const marketQuery = useQuery({ queryKey: ["dashboard", "market"], queryFn: fetchMarketData, staleTime: 60_000 });
  const newsQuery = useQuery({ queryKey: ["dashboard", "news"], queryFn: fetchDashboardNews, staleTime: 5 * 60_000 });
  const watchlistQuery = useQuery({
    queryKey: ["dashboard", "watchlist", userId],
    queryFn: () => fetchWatchlist(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const briefsQuery = useQuery({
    queryKey: ["dashboard", "briefs", userId],
    queryFn: () => fetchDashboardBriefs(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const reportsQuery = useQuery({ queryKey: ["dashboard", "reports"], queryFn: fetchAnalystReports, staleTime: 5 * 60_000 });
  // Highlight KHÔNG còn phụ thuộc marketQuery (dashboard-highlight tự truy vấn
  // giá + tin tức đã chấm điểm sẵn, không tốn LLM) — chạy song song độc lập,
  // vào nhanh hơn thay vì phải chờ market load xong trước.
  const highlightQuery = useQuery({
    queryKey: ["dashboard", "highlight", userId],
    queryFn: fetchHighlight,
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Đồng bộ kết quả query vào state hiện có, để phần JSX phía dưới không phải sửa lại
  useEffect(() => {
    if (!marketQuery.data) return;
    const m = marketQuery.data;
    setVn30Set(m.vn30Set);
    setAllMovers(m.allMovers);
    setGainers(m.gainers);
    setLosers(m.losers);
    setSectors(m.sectors);
    setMarketIndices(m.marketIndices);
    setMarketUpdatedAt(m.marketUpdatedAt);
  }, [marketQuery.data]);
  useEffect(() => { if (newsQuery.data) setDashNews(newsQuery.data); }, [newsQuery.data]);
  useEffect(() => { if (watchlistQuery.data) setWatchHoldings(watchlistQuery.data); }, [watchlistQuery.data]);
  useEffect(() => { if (briefsQuery.data) setBriefs(briefsQuery.data); }, [briefsQuery.data]);
  useEffect(() => { if (reportsQuery.data) setReports(reportsQuery.data); }, [reportsQuery.data]);
  useEffect(() => { if (highlightQuery.data) setHighlight(highlightQuery.data); }, [highlightQuery.data]);

  const moversLoading    = marketQuery.isLoading;
  const newsLoading      = newsQuery.isLoading;
  const watchLoading     = userQuery.isLoading || watchlistQuery.isLoading;
  const briefsLoading    = userQuery.isLoading || briefsQuery.isLoading;
  const reportsLoading   = reportsQuery.isLoading;
  const highlightLoading = marketQuery.isLoading || highlightQuery.isLoading;

  // ── Computed portfolio summary ────────────────────────────────────────────
  const portfolioTotal = watchHoldings.reduce((s, h) => s + h.price * h.quantity, 0);

  // Lọc movers: VN30/HNX ∩ ngành (kết hợp được); null = toàn bộ HOSE (mặc định)
  // QUAN TRỌNG: luôn phải ràng buộc sàn — mặc định (chưa bật HNX) là HOSE, KHÔNG
  // được để lọt cả HNX/UPCOM vào khi user chỉ bấm chọn 1 ngành trên heatmap.
  // Trước đây thiếu ràng buộc này khiến mã UPCOM (biên độ ±15%, không có trong
  // bảng `tickers` nên bấm vào bị lỗi "Không tìm thấy mã") lộ ra ở Top tăng/giảm.
  const scopeMovers = (vn30Active || hnxActive || selectedSector)
    ? allMovers.filter(m =>
        (!vn30Active || vn30Set.has(m.symbol)) &&
        (hnxActive ? m.exchange === "HNX" : m.exchange === "HOSE") &&
        (!selectedSector || m.sector === selectedSector)
      )
    : null;
  const scopeLabel = [vn30Active ? "VN30" : null, hnxActive ? "HNX" : null, selectedSector].filter(Boolean).join(" · ") || null;
  // Heatmap ngành: khi chọn rổ VN30/HNX, phải tính lại theo ĐÚNG rổ đó (không
  // giữ cố định toàn bộ HOSE như trước) — chỉ lọc theo sàn/rổ, KHÔNG lọc theo
  // selectedSector (bấm 1 ô ngành chỉ để lọc Top tăng/giảm, không thu hẹp
  // heatmap còn 1 ô).
  const scopeSectors = (vn30Active || hnxActive)
    ? (() => {
        const scoped = allMovers.filter(m => (!vn30Active || vn30Set.has(m.symbol)) && (!hnxActive || m.exchange === "HNX"));
        const groups: Record<string, number[]> = {};
        scoped.forEach(m => { if (m.sector !== "Khác") (groups[m.sector] ??= []).push(m.pct); });
        return Object.entries(groups)
          .map(([name, pcts]) => ({ name, pct: pcts.reduce((a, b) => a + b, 0) / pcts.length }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 12);
      })()
    : null;
  const displaySectors = scopeSectors ?? sectors;
  // Chuẩn CTCK: TĂNG = chỉ mã tăng (xanh), GIẢM = chỉ mã giảm (đỏ). Card giữ size nhờ minHeight.
  const displayGainers = scopeMovers
    ? scopeMovers.filter(m => m.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 5).map(m => ({ ...m, isFloor: false }))
    : gainers;
  const displayLosers = scopeMovers
    ? scopeMovers.filter(m => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 5).map(m => ({ ...m, isCeil: false }))
    : losers;

  const newsCard = (item: NewsItem): ContextCard => ({
    id: `news-${item.title.slice(0, 20)}`, type: "news",
    label: item.title.length > 32 ? item.title.slice(0, 32) + "…" : item.title,
    badge: item.tag, summary: `${item.source} · ${item.time}`,
  });

  const handleNewsDragStart = (e: React.DragEvent, item: NewsItem) => {
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(newsCard(item)));
    e.dataTransfer.effectAllowed = "copy";
  };

  // Kéo 1 dòng trong "Điểm nổi bật hôm nay" / "Cần theo dõi" vào Action Hub
  // Card factory dùng chung cho cả drag (desktop) và nút "Hỏi AI" (mobile)
  const highlightCard = (item: NewsHighlight, idPrefix: string): ContextCard => ({
    id: `${idPrefix}-${item.title.slice(0, 20)}`,
    type: "news",
    label: item.title.length > 32 ? item.title.slice(0, 32) + "…" : item.title,
    badge: item.source_name ?? undefined,
    summary: [item.source_name, item.published_at ? `${relativeTime(item.published_at)} trước` : null].filter(Boolean).join(" · "),
  });

  const insightCard = (p: PortfolioInsight): ContextCard => ({
    id: `insight-${p.symbol}`,
    type: "mover",
    label: p.symbol,
    badge: `${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(2)}%`,
    summary: [p.insight, p.insight_source].filter(Boolean).join(" · "),
  });

  const handleHighlightDragStart = (e: React.DragEvent, item: NewsHighlight, idPrefix: string) => {
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(highlightCard(item, idPrefix)));
    e.dataTransfer.effectAllowed = "copy";
  };

  // Kéo 1 dòng trong "Ý nghĩa với danh mục" vào Action Hub
  const handlePortfolioInsightDragStart = (e: React.DragEvent, p: PortfolioInsight) => {
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(insightCard(p)));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleReportDragStart = (e: React.DragEvent, card: ContextCard) => {
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handlePortfolioDragStart = (e: React.DragEvent) => {
    const card: ContextCard = {
      id: "portfolio-main",
      type: "portfolio",
      label: "Danh mục của bạn",
      badge: watchHoldings.length > 0 ? `${watchHoldings.length} mã` : "Chưa có dữ liệu",
      summary: portfolioTotal > 0 ? `Tổng: ${portfolioTotal.toLocaleString("vi-VN")} đ · ${watchHoldings.map(h => h.symbol).join(" ")}` : "Chưa có holdings",
    };
    e.dataTransfer.setData(DRAG_CARD_MIME, JSON.stringify(card));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px" : "24px", fontFamily: "'Montserrat', system-ui, sans-serif", background: isDark ? "#0B0D18" : undefined }}>

      {/* Greeting header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: fgSubtle, marginBottom: 2 }}>{dateStr} · {timeStr}</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: fg, margin: 0 }}>Chào buổi sáng.</h1>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: cardBg, cursor: "pointer", fontSize: 13, fontWeight: 600, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}
          onClick={() => window.location.reload()}>
          <RefreshCw size={14} strokeWidth={1.5} /> Làm mới
        </button>
      </div>

      {/* AI Highlights — parsed from real briefs + LLM impacts */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: brand, display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} strokeWidth={1.5} color={brand} /> ĐIỂM NỔI BẬT HÔM NAY
          </div>
          {!highlightLoading && highlight?.generated_at && (
            <span style={{ fontSize: 10, fontWeight: 600, color: fgSubtle }}>
              Cập nhật {relativeTime(highlight.generated_at)}
            </span>
          )}
        </div>

        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />

        {/* Loading skeleton */}
        {highlightLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[100, 90, 85, 70].map((w, i) => (
              <div key={i} style={{ height: 18, borderRadius: 5, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.06)", width: `${w}%` }} />
            ))}
          </div>
        )}

        {!highlightLoading && !highlight?.highlights?.length && !highlight?.portfolio_insights?.length && !highlight?.watchlist?.length && (
          <p style={{ margin: 0, fontSize: 14, color: fgSubtle, textAlign: "center", padding: "12px 0" }}>
            Chưa có tin tức/danh mục để tổng hợp.
          </p>
        )}

        {!highlightLoading && (
          <>
            {/* Điểm nổi bật: tin tác động lớn nhất 48h gần nhất + trích nguồn */}
            {(highlight?.highlights ?? []).length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                {highlight!.highlights.map((h, i) => (
                  <li key={i} draggable
                    onDragStart={e => handleHighlightDragStart(e, h, "highlight")}
                    onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                    onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 15, color: fg, lineHeight: 1.5, position: "relative", cursor: "grab", userSelect: "none", borderRadius: 8, padding: "3px 6px", margin: "-3px -6px", transition: "background 100ms ease" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
                    <DragHint />
                    <span style={{ color: brand, marginTop: 2, flexShrink: 0 }}>•</span>
                    <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>
                      {h.title}
                      {h.source_name && h.source_url && (
                        <a href={h.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ marginLeft: 3, textDecoration: "none" }}
                          title={`Nguồn: ${h.source_name}`}>
                          <sup style={{ fontSize: 10, color: brand, fontWeight: 700, textDecoration: "underline" }}>[{h.source_name}]</sup>
                        </a>
                      )}
                      {h.published_at && <span style={{ fontSize: 12, color: fgSubtle, marginLeft: 5 }}>· {relativeTime(h.published_at)} trước</span>}
                      <AskAiInline card={highlightCard(h, "highlight")} onAsk={askAI} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Ý nghĩa với danh mục: %giá hôm nay (xanh/đỏ mặc định theo dấu) + insight ngắn từ tin/báo cáo */}
            {(highlight?.portfolio_insights ?? []).length > 0 && (
              <>
                <div style={{ height: "0.5px", background: divider, margin: "16px 0" }} />
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366F1", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Lightbulb size={12} strokeWidth={1.5} color="#6366F1" /> Ý NGHĨA VỚI DANH MỤC
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                  {highlight!.portfolio_insights.map((p) => (
                    <li key={p.symbol} draggable
                      onDragStart={e => handlePortfolioInsightDragStart(e, p)}
                      onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                      style={{ fontSize: 14, lineHeight: 1.8, position: "relative", cursor: "grab", userSelect: "none", borderRadius: 8, padding: "3px 6px", margin: "-3px -6px", transition: "background 100ms ease" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
                      {/* Không dùng display:flex ở đây — flex item không tự reflow theo
                          từ khi wrap (cả span bị đẩy nguyên khối xuống dòng mới), phải
                          để inline flow tự nhiên như văn bản thường mới "cùng 1 dòng". */}
                      <DragHint />
                      <span style={{ fontWeight: 700, color: fg, marginRight: 8 }}>{p.symbol}</span>
                      <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 8 }}><PctBadge value={p.pct} /></span>
                      {p.insight && (
                        <span style={{ color: fgSubtle }}>
                          {p.insight}
                          {p.insight_source && p.source_url && (
                            <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                              style={{ marginLeft: 3, textDecoration: "none" }}
                              title={`Nguồn: ${p.insight_source}`}>
                              <sup style={{ fontSize: 10, color: brand, fontWeight: 700, textDecoration: "underline" }}>[{p.insight_source}]</sup>
                            </a>
                          )}
                          {/* Mốc thời gian rõ ràng — tránh hiểu nhầm insight cũ là lý do giá đổi HÔM NAY */}
                          {p.insight_at && <span style={{ fontSize: 12, color: fgSubtle, marginLeft: 5 }}>· {relativeTime(p.insight_at)} trước</span>}
                        </span>
                      )}
                      <AskAiInline card={insightCard(p)} onAsk={askAI} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Cần theo dõi: tin vĩ mô/liên ngành tác động lớn + trích nguồn */}
            {(highlight?.watchlist ?? []).length > 0 && (
              <>
                <div style={{ height: "0.5px", background: divider, margin: "16px 0" }} />
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FF9500", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={12} strokeWidth={1.5} color="#FF9500" /> CẦN THEO DÕI
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {highlight!.watchlist.map((w, i) => (
                    <li key={i} draggable
                      onDragStart={e => handleHighlightDragStart(e, w, "watch")}
                      onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                      style={{ display: "flex", alignItems: "flex-start", gap: 8, position: "relative", cursor: "grab", userSelect: "none", borderRadius: 8, padding: "3px 6px", margin: "-3px -6px", transition: "background 100ms ease" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
                      <DragHint />
                      <span style={{ color: "#FF9500", marginTop: 2, flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: 15, color: fg, lineHeight: 1.5, flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>
                        {w.title}
                        {w.source_name && w.source_url && (
                          <a href={w.source_url} target="_blank" rel="noopener noreferrer"
                            style={{ marginLeft: 3, textDecoration: "none" }}
                            title={`Nguồn: ${w.source_name}`}>
                            <sup style={{ fontSize: 10, color: brand, fontWeight: 700, textDecoration: "underline" }}>[{w.source_name}]</sup>
                          </a>
                        )}
                        {w.published_at && <span style={{ fontSize: 12, color: fgSubtle, marginLeft: 5 }}>· {relativeTime(w.published_at)} trước</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {/* Market section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg }}>THỊ TRƯỜNG</span>
          {marketUpdatedAt && <span style={{ fontSize: 10, color: fgSubtle }}>Cập nhật lúc {fmtUpdatedAt(marketUpdatedAt)}</span>}
        </div>
        <button onClick={() => setMarketExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, color: fgSubtle, transition: "background 120ms ease" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>{marketExpanded ? "Ẩn" : "Hiện"}</span>
          <ChevronDown size={14} strokeWidth={2} style={{ transform: marketExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 250ms ease" }} />
        </button>
      </div>

      <div style={{ overflow: "hidden", maxHeight: marketExpanded ? 2000 : 0, opacity: marketExpanded ? 1 : 0, transition: "max-height 350ms ease, opacity 200ms ease" }}>

        {/* Index Cards — mobile: dải cuộn ngang snap (pattern app CK VN); desktop: grid 4 cột */}
        <div style={isMobile
          ? { display: "flex", overflowX: "auto", gap: 12, marginBottom: 16, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", paddingBottom: 4 }
          : { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {moversLoading && marketIndices.length === 0 ? (
            [0, 1, 2, 3].map(i => <div key={i} style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, height: 130, opacity: 0.5, ...(isMobile ? { flex: "0 0 168px" } : {}) }} />)
          ) : (
            marketIndices.map(idx => {
              const card = <IndexCard key={idx.name} idx={idx} isDark={isDark}
                onClick={
                  idx.code === "VN30" ? () => { setVn30Active(a => !a); setHnxActive(false); setSelectedSector(null); }
                  : idx.code === "HNX" ? () => { setHnxActive(a => !a); setVn30Active(false); setSelectedSector(null); }
                  : undefined
                }
                active={(idx.code === "VN30" && vn30Active) || (idx.code === "HNX" && hnxActive)}
                onExpand={idx.code ? () => setDetailIndex({ code: idx.code as "VNINDEX" | "HNX" | "VN30" | "UPCOM", name: idx.name }) : undefined} />;
              return isMobile
                ? <div key={idx.name} style={{ flex: "0 0 168px", scrollSnapAlign: "start", display: "flex" }}>{card}</div>
                : card;
            })
          )}
        </div>

        {detailIndex && (
          <IndexDetailModal
            indexCode={detailIndex.code}
            name={detailIndex.name}
            isDark={isDark}
            onClose={() => setDetailIndex(null)}
          />
        )}

        {/* Top Movers — mobile: 1 card gộp 2 tab Tăng/Giảm; desktop: 2 card cạnh nhau */}
        {isMobile && (() => {
          const rows = moverTab === "gain" ? displayGainers : displayLosers;
          const tabCard: ContextCard = moverTab === "gain"
            ? { id: "top-gainers", type: "mover", label: "Tăng mạnh hôm nay", badge: `${displayGainers.length} mã`, summary: displayGainers.map(s => `${s.symbol} +${s.pct.toFixed(2)}%`).join(" · ") }
            : { id: "top-losers", type: "mover", label: "Giảm mạnh hôm nay", badge: `${displayLosers.length} mã`, summary: displayLosers.map(s => `${s.symbol} ${s.pct.toFixed(2)}%`).join(" · ") };
          return (
            <div style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, marginBottom: 16, position: "relative" }}>
              <AskAiButton card={tabCard} onAsk={askAI} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.05)", borderRadius: 10, padding: 3, gap: 2 }}>
                  {([["gain", "Tăng mạnh"], ["loss", "Giảm mạnh"]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setMoverTab(id)} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: moverTab === id ? cardBg : "transparent",
                      boxShadow: moverTab === id ? (isDark ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 4px rgba(8,73,172,0.14)") : "none",
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                      fontSize: 12.5, fontWeight: moverTab === id ? 700 : 500,
                      color: moverTab === id ? (id === "gain" ? "#34C759" : "#FF3B30") : fgSubtle,
                      WebkitTapHighlightColor: "transparent",
                    }}>
                      {id === "gain" ? <TrendingUp size={13} strokeWidth={2} /> : <TrendingDown size={13} strokeWidth={2} />}
                      {label}
                    </button>
                  ))}
                </div>
                {scopeLabel && <span style={{ fontSize: 10, fontWeight: 700, color: brand, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", padding: "2px 7px", borderRadius: 10 }}>{scopeLabel}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 185 }}>
                {moversLoading && rows.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : rows.map(s => (
                    <div key={s.symbol} onClick={() => onSelectTicker?.(s.symbol)}
                      style={{ display: "flex", alignItems: "center", padding: "9px 8px", borderRadius: 8, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                      <span style={{ width: 52, fontWeight: 700, fontSize: 15, color: fg }}>{s.symbol}</span>
                      <span style={{ flex: 1, fontSize: 13.5, color: fgSubtle, fontVariantNumeric: "tabular-nums" }}>{fmtStockPrice(s.price)}</span>
                      <span style={{ marginRight: 8 }}><MoverPctBadge value={s.pct} isCeil={moverTab === "gain" ? s.isCeil : undefined} isFloor={moverTab === "loss" ? s.isFloor : undefined} /></span>
                      <span style={{ fontSize: 12, color: fgSubtle, width: 42, textAlign: "right" }}>{s.vol}</span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })()}
        <div style={{ display: isMobile ? "none" : "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {/* TĂNG MẠNH */}
          {(() => {
            const gainCard: ContextCard = { id: "top-gainers", type: "mover", label: "Tăng mạnh hôm nay", badge: `${displayGainers.length} mã`, summary: displayGainers.map(s => `${s.symbol} +${s.pct.toFixed(2)}%`).join(" · ") };
            return (
              <div {...makeDragHandlers(gainCard)}
                style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
                {!isMobile && <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
                </div>}
                <AskAiButton card={gainCard} onAsk={askAI} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <TrendingUp size={15} color="#34C759" strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>TĂNG MẠNH</span>
                  {scopeLabel && <span style={{ fontSize: 10, fontWeight: 700, color: brand, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", padding: "2px 7px", borderRadius: 10 }}>{scopeLabel}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 185 }}>
                  {moversLoading && displayGainers.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    : displayGainers.map(s => {
                      const rowCard: ContextCard = { id: `gain-${s.symbol}`, type: "mover", label: s.symbol, badge: `+${s.pct.toFixed(2)}%`, summary: `${fmtStockPrice(s.price)} · Vol: ${s.vol}` };
                      return (
                        <div key={s.symbol} {...makeDragHandlers(rowCard)} onClick={() => onSelectTicker?.(s.symbol)}
                          style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                          <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{fmtStockPrice(s.price)}</span>
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
            const lossCard: ContextCard = { id: "top-losers", type: "mover", label: "Giảm mạnh hôm nay", badge: `${displayLosers.length} mã`, summary: displayLosers.map(s => `${s.symbol} ${s.pct.toFixed(2)}%`).join(" · ") };
            return (
              <div {...makeDragHandlers(lossCard)}
                style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, position: "relative", cursor: "grab", userSelect: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
                {!isMobile && <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
                </div>}
                <AskAiButton card={lossCard} onAsk={askAI} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <TrendingDown size={15} color="#FF3B30" strokeWidth={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>GIẢM MẠNH</span>
                  {scopeLabel && <span style={{ fontSize: 10, fontWeight: 700, color: brand, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", padding: "2px 7px", borderRadius: 10 }}>{scopeLabel}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 185 }}>
                  {moversLoading && displayLosers.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    : displayLosers.map(s => {
                      const rowCard: ContextCard = { id: `loss-${s.symbol}`, type: "mover", label: s.symbol, badge: `${s.pct.toFixed(2)}%`, summary: `${fmtStockPrice(s.price)} · Vol: ${s.vol}` };
                      return (
                        <div key={s.symbol} {...makeDragHandlers(rowCard)} onClick={() => onSelectTicker?.(s.symbol)}
                          style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <span style={{ width: 48, fontWeight: 700, fontSize: 14, color: fg }}>{s.symbol}</span>
                          <span style={{ flex: 1, fontSize: 13, color: fgSubtle }}>{fmtStockPrice(s.price)}</span>
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
        {displaySectors.length > 0 && (() => {
          const heatmapScopeLabel = [vn30Active ? "VN30" : null, hnxActive ? "HNX" : null].filter(Boolean).join(" · ") || null;
          const heatmapCard: ContextCard = { id: "heatmap-nganh", type: "index", label: "Heatmap ngành", badge: dateStr, summary: displaySectors.map(s => `${s.name}: ${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(1)}%`).join(" · ") };
          return (
            <div {...makeDragHandlers(heatmapCard)}
              style={{ background: cardBg, borderRadius: 14, padding: 16, boxShadow: cardShadow, marginBottom: 16, position: "relative", cursor: "grab", userSelect: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const h = (e.currentTarget as HTMLElement).querySelector(".card-hint") as HTMLElement | null; if (h) h.style.opacity = "0"; }}>
              {!isMobile && <div className="card-hint" style={{ position: "absolute", top: 10, right: 10, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.10)", borderRadius: 6, padding: "3px 7px", opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>⠿ Kéo vào AI</span>
              </div>}
              <AskAiButton card={heatmapCard} onAsk={askAI} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>HEATMAP NGÀNH</div>
                {heatmapScopeLabel && <span style={{ fontSize: 10, fontWeight: 700, color: brand, background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", padding: "2px 7px", borderRadius: 10 }}>{heatmapScopeLabel}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
                {displaySectors.map(s => {
                  const col = getSectorColor(s.pct);
                  const isSelected = selectedSector === s.name;
                  return (
                    <div key={s.name}
                      onClick={() => setSelectedSector(isSelected ? null : s.name)}
                      style={{ padding: "12px 14px", borderRadius: 10, background: col.bg, cursor: "pointer", transition: "all 150ms ease", outline: isSelected ? `2px solid ${brand}` : "2px solid transparent", outlineOffset: 2 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 4 }}>{s.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: col.text }}>{s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      </div>{/* end market collapsible */}

      {/* Portfolio watchlist */}
      <div draggable onDragStart={handlePortfolioDragStart}
        onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
        style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16, cursor: "grab", position: "relative", userSelect: "none" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isDark ? "0 4px 12px rgba(0,0,0,0.50)" : "0 4px 12px rgba(8,73,172,0.16)"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = cardShadow; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
        <DragHint />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg, marginBottom: 4 }}>DANH MỤC CỦA BẠN</div>
            {watchLoading ? (
              <div style={{ fontSize: 22, color: fgSubtle }}>Đang tải…</div>
            ) : watchHoldings.length > 0 ? (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, color: fg }}>{portfolioTotal.toLocaleString("vi-VN")} đ</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: fgSubtle }}>{watchHoldings.length} mã</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: fgSubtle }}>Chưa có holdings — thêm mã trong trang Danh mục</div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onNavigate("portfolio"); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.20)"), background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            Xem danh mục <ArrowUpRight size={14} strokeWidth={1.5} />
          </button>
        </div>

        {watchHoldings.length > 0 && (
          <>
            <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {watchHoldings.map(h => (
                <div key={h.symbol} onClick={() => onSelectTicker?.(h.symbol)}
                  style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", transition: "background 80ms ease" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 60, fontWeight: 700, fontSize: 14, color: fg }}>{h.symbol}</span>
                  <span style={{ flex: 1, fontSize: 13, color: fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  <span style={{ width: 80, fontSize: 14, fontWeight: 600, color: fg, textAlign: "right" }}>{fmtStockPrice(h.price)}</span>
                  <div style={{ width: 80, display: "flex", justifyContent: "flex-end" }}><PctBadge value={h.change} /></div>
                  {/* Cột chấm trạng thái chỉ trang trí — ẩn trên mobile cho khỏi tràn ngang */}
                  {!isMobile && (
                    <div style={{ width: 90, display: "flex", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: 12, color: "#34C759" }}>●</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* News */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg, marginBottom: 12 }}>TIN TỨC</div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          {newsLoading && dashNews.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 90, borderRadius: 10, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"), background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }} />
            ))
          ) : dashNews.map((item, i) => {
            const tagStyle = tagColors[item.tag] ?? tagColors["Trung lập"];
            return (
              <div key={i} draggable
                onDragStart={e => handleNewsDragStart(e, item)}
                onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                style={{ padding: "12px 14px", border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.07)" : "rgba(8,73,172,0.12)"), borderRadius: 10, cursor: "grab", position: "relative", userSelect: "none", transition: "all 150ms ease" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.transform = "none"; const hint = (e.currentTarget as HTMLElement).querySelector(".drag-hint") as HTMLElement | null; if (hint) hint.style.opacity = "0"; }}>
                <DragHint />
                <AskAiButton card={newsCard(item)} onAsk={askAI} />
                {/* Meta luôn 1 hàng (mobile hay gãy): tag nowrap, tên nguồn dài → ellipsis, giờ không rơi dòng */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, paddingRight: askAI ? 36 : 0, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: tagStyle.bg, color: tagStyle.text, whiteSpace: "nowrap", flexShrink: 0 }}>{item.tag}</span>
                  <span style={{ fontSize: 12, color: fgSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{item.source}</span>
                  <span style={{ fontSize: 12, color: fgSubtle, whiteSpace: "nowrap", flexShrink: 0 }}>· {item.time}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: fg, lineHeight: 1.5 }}>{item.title}</p>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, color: brand, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                    Đọc thêm <ArrowUpRight size={13} strokeWidth={1.5} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis Reports — từ briefs DB */}
      <div style={{ background: cardBg, borderRadius: 14, padding: 20, boxShadow: cardShadow, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: fg }}>BÁO CÁO PHÂN TÍCH</div>
          <button onClick={() => onNavigate("reports")} style={{ fontSize: 12, fontWeight: 600, color: brand, background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            Xem tất cả →
          </button>
        </div>
        <div style={{ height: "0.5px", background: divider, marginBottom: 14 }} />

        {reportsLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 72, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.04)" }} />)}
          </div>
        )}

        {!reportsLoading && reports.length === 0 && (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <FileText size={28} style={{ color: fgSubtle, marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: fgSubtle, margin: 0 }}>Chưa có báo cáo phân tích</p>
          </div>
        )}

        {!reportsLoading && reports.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {reports.slice(0, 5).map((rp, i) => {
              const shown = Math.min(reports.length, 5);
              const rs = recoStyle(rp.recommendation, isDark);
              const metaBits = [rp.recommendation, rp.target_price ? `MT ${fmtStockPrice(rp.target_price)}` : null, reportDate(rp.report_date) || null].filter(Boolean).join(" · ");
              const card: ContextCard = { id: rp.id, type: "report", label: rp.title.slice(0, 60), badge: rp.source_firm ?? "Vietstock", summary: [rp.ticker, metaBits].filter(Boolean).join(" · ").slice(0, 110) };
              return (
                <div key={rp.id} draggable
                  onDragStart={e => handleReportDragStart(e, card)}
                  onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onDragStartCapture={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
                  style={{ padding: "14px 0", borderBottom: i < shown - 1 ? "0.5px solid " + divider : "none", cursor: "grab", position: "relative", userSelect: "none", transition: "background 100ms" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.06)" : "rgba(8,73,172,0.025)"; (e.currentTarget as HTMLElement).style.margin = "0 -20px"; (e.currentTarget as HTMLElement).style.padding = "14px 20px"; (e.currentTarget as HTMLElement).querySelectorAll(".drag-hint").forEach(h => { (h as HTMLElement).style.opacity = "1"; }); }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.margin = "0"; (e.currentTarget as HTMLElement).style.padding = "14px 0"; (e.currentTarget as HTMLElement).querySelectorAll(".drag-hint").forEach(h => { (h as HTMLElement).style.opacity = "0"; }); }}>
                  <DragHint />
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, #0a2a6e 0%, #1a56c8 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 2 }}>
                      {rp.ticker
                        ? <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "0.01em", fontFamily: "'Montserrat', system-ui, sans-serif", textAlign: "center", lineHeight: 1 }}>{rp.ticker}</span>
                        : <FileText size={20} color="rgba(255,255,255,0.90)" strokeWidth={1.5} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: fg, lineHeight: 1.4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{rp.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <AskAiInline card={card} onAsk={askAI} />
                          <button onClick={e => { e.stopPropagation(); window.open(rp.pdf_url, "_blank", "noopener"); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "0.5px solid " + (isDark ? "rgba(255,255,255,0.13)" : "rgba(8,73,172,0.18)"), background: "transparent", color: brand, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                            <Eye size={12} strokeWidth={1.5} /> Xem
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: fgSubtle }}>{rp.source_firm ?? "Vietstock"}{reportDate(rp.report_date) ? " · " + reportDate(rp.report_date) : ""}</span>
                        {rp.recommendation && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: rs.bg, color: rs.text }}>{rp.recommendation}</span>}
                        {rp.target_price != null && <span style={{ fontSize: 11, fontWeight: 700, color: brand }}>Giá MT {fmtStockPrice(rp.target_price)}</span>}
                        {!isMobile && <span className="drag-hint" style={{ fontSize: 11, color: fgSubtle, opacity: 0, transition: "opacity 120ms", marginLeft: "auto", whiteSpace: "nowrap" }}>⠿ Kéo vào ActionHub</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
    </>
  );
}
