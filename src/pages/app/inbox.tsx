import { Bell, Zap, Mail, CheckCheck, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState, useEffect } from "react";
import { pipelineSupabase } from "../../lib/supabase/pipeline-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brief {
  id: string;
  type: "daily_digest" | "portfolio_alert" | "market_alert" | "system";
  title: string;
  summary: string;
  created_at: string;
  is_read: boolean;
  impact_score?: number;
  tickers?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ImpactBadge({ score }: { score?: number }) {
  if (score === undefined) return null;
  const abs = Math.abs(score);
  const color = score > 3 ? "#0ea5a0" : score < -3 ? "#ef4444" : "#f59e0b";
  const bg    = score > 3 ? "rgba(14,165,160,0.1)" : score < -3 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)";
  const Icon  = score > 0 ? TrendingUp : score < 0 ? TrendingDown : Minus;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 6, fontSize: "0.625rem", fontWeight: 700,
      background: bg, color,
    }}>
      <Icon style={{ width: 10, height: 10 }} />
      {score > 0 ? "+" : ""}{score}
    </span>
  );
}

function BriefTypeIcon({ type }: { type: Brief["type"] }) {
  const configs = {
    daily_digest:    { icon: Mail,         color: "#0849ac", bg: "rgba(8,73,172,0.1)" },
    portfolio_alert: { icon: Bell,         color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    market_alert:    { icon: Zap,          color: "#0ea5a0", bg: "rgba(14,165,160,0.1)" },
    system:          { icon: CheckCheck,   color: "#99a1af", bg: "rgba(153,161,175,0.1)" },
  };
  const { icon: Icon, color, bg } = configs[type] || configs.system;
  return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon style={{ width: 16, height: 16, color }} />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (h < 24) return `${h} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// ─── Demo briefs (used when Supabase is empty or not configured) ──────────────
const DEMO_BRIEFS: Brief[] = [
  {
    id: "demo-1",
    type: "daily_digest",
    title: "Bản tin thị trường buổi sáng — 25/05/2026",
    summary: "VN-Index mở cửa tăng nhẹ 0.4%. Nhóm ngân hàng dẫn đầu tăng trưởng. HPG giảm 1.2% sau thông tin sản lượng thép tháng 5 thấp hơn kỳ vọng. Thanh khoản thị trường đạt 18,400 tỷ đồng trong phiên sáng.",
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    is_read: false,
    tickers: ["VCB", "BID", "HPG"],
  },
  {
    id: "demo-2",
    type: "portfolio_alert",
    title: "FPT tăng 1.7% — Danh mục +2.1 triệu",
    summary: "FPT Corporation (FPT) tăng 1.70% lên 125,600 VNĐ sau thông báo hợp đồng outsourcing mới với đối tác Nhật Bản trị giá 500 tỷ đồng.",
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    is_read: false,
    impact_score: 7,
    tickers: ["FPT"],
  },
  {
    id: "demo-3",
    type: "market_alert",
    title: "Cục Dự trữ Liên bang giữ lãi suất ổn định",
    summary: "Fed quyết định giữ nguyên lãi suất ở mức 5.25-5.5%. Thị trường chứng khoán toàn cầu phản ứng tích cực. VN-Index có thể hưởng lợi từ dòng vốn FDI tiếp tục chảy vào.",
    created_at: new Date(Date.now() - 8 * 3600000).toISOString(),
    is_read: true,
    impact_score: 5,
  },
  {
    id: "demo-4",
    type: "daily_digest",
    title: "Bản tin thị trường — 24/05/2026",
    summary: "VN-Index đóng cửa tại 1,241.32 điểm, giảm 0.3%. Nhóm bất động sản chịu áp lực do lo ngại lãi suất. VHM giảm 2.1%. FPT và VCB giữ vững.",
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    is_read: true,
    tickers: ["VHM", "FPT", "VCB"],
  },
  {
    id: "demo-5",
    type: "market_alert",
    title: "Insider: Cổ đông lớn VIC bán 5 triệu CP",
    summary: "Theo thông báo từ HoSE, một cổ đông lớn của Vingroup (VIC) đã đăng ký bán 5,000,000 cổ phiếu trong ngày 23/05. Giá tham chiếu 42,100 VNĐ/CP.",
    created_at: new Date(Date.now() - 30 * 3600000).toISOString(),
    is_read: true,
    impact_score: -4,
    tickers: ["VIC"],
  },
];

// ─── InboxPage ────────────────────────────────────────────────────────────────
export function InboxPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selected, setSelected] = useState<Brief | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await pipelineSupabase
          .from("briefs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error || !data || data.length === 0) {
          // Use demo data if table is empty or doesn't exist yet
          setBriefs(DEMO_BRIEFS);
        } else {
          setBriefs(data as Brief[]);
        }
      } catch {
        setBriefs(DEMO_BRIEFS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const markRead = (id: string) => {
    setBriefs((prev) => prev.map((b) => b.id === id ? { ...b, is_read: true } : b));
  };

  const filtered = filter === "unread" ? briefs.filter((b) => !b.is_read) : briefs;
  const unreadCount = briefs.filter((b) => !b.is_read).length;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── List panel ── */}
      <div style={{
        width: selected ? 340 : "100%",
        maxWidth: selected ? 340 : undefined,
        flexShrink: 0,
        borderRight: selected ? "1px solid rgba(8,73,172,0.08)" : "none",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.2s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.25rem", fontWeight: 700, color: "#1a1a2e" }}>
                Inbox
              </h1>
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 2 }}>
                {unreadCount > 0 ? `${unreadCount} chưa đọc` : "Tất cả đã đọc"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => setBriefs((prev) => prev.map((b) => ({ ...b, is_read: true })))}
                style={{ fontSize: "0.75rem", color: "#0849ac", fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <CheckCheck style={{ width: 13, height: 13 }} />
                Đọc hết
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit",
                  background: filter === f ? "#0849ac" : "rgba(8,73,172,0.06)",
                  color: filter === f ? "#fff" : "#6a7282",
                }}
              >
                {f === "all" ? `Tất cả (${briefs.length})` : `Chưa đọc (${unreadCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #0849ac", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 8 }}>Đang tải...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <Bell style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Không có thông báo</p>
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>Tất cả đã được đọc</p>
            </div>
          ) : (
            filtered.map((brief) => (
              <div
                key={brief.id}
                onClick={() => { setSelected(brief); markRead(brief.id); }}
                style={{
                  display: "flex", gap: 12, padding: "12px 12px",
                  borderRadius: 10, cursor: "pointer", marginBottom: 2,
                  background: selected?.id === brief.id
                    ? "rgba(8,73,172,0.06)"
                    : !brief.is_read ? "rgba(8,73,172,0.02)" : "transparent",
                  border: selected?.id === brief.id ? "1px solid rgba(8,73,172,0.12)" : "1px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <BriefTypeIcon type={brief.type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p style={{
                      fontSize: "0.8125rem", fontWeight: brief.is_read ? 500 : 700,
                      color: "#1a1a2e", lineHeight: 1.4,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>
                      {brief.title}
                    </p>
                    {!brief.is_read && (
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0849ac", flexShrink: 0, marginTop: 4 }} />
                    )}
                  </div>
                  <p style={{
                    fontSize: "0.6875rem", color: "#99a1af", marginTop: 4, lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {brief.summary}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <Clock style={{ width: 10, height: 10, color: "#c4c9d4" }} />
                    <span style={{ fontSize: "0.5625rem", color: "#c4c9d4" }}>{timeAgo(brief.created_at)}</span>
                    {brief.impact_score !== undefined && <ImpactBadge score={brief.impact_score} />}
                    {brief.tickers?.map((t) => (
                      <span key={t} style={{ fontSize: "0.5625rem", padding: "1px 5px", borderRadius: 4, background: "rgba(8,73,172,0.08)", color: "#0849ac", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div style={{ flex: 1, overflowY: "auto", padding: 28, minWidth: 0 }}>
          <button
            onClick={() => setSelected(null)}
            style={{ fontSize: "0.75rem", color: "#0849ac", fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", gap: 4 }}
          >
            ← Quay lại
          </button>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
            <BriefTypeIcon type={selected.type} />
            <div>
              <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.125rem", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.4 }}>
                {selected.title}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>
                  {new Date(selected.created_at).toLocaleString("vi-VN")}
                </span>
                {selected.impact_score !== undefined && <ImpactBadge score={selected.impact_score} />}
              </div>
            </div>
          </div>

          {/* Tickers */}
          {selected.tickers && selected.tickers.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {selected.tickers.map((t) => (
                <span key={t} style={{
                  padding: "4px 10px", borderRadius: 7,
                  background: "rgba(8,73,172,0.08)", color: "#0849ac",
                  fontWeight: 700, fontSize: "0.8125rem", fontFamily: "'IBM Plex Mono', monospace",
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={{
            background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)",
            borderRadius: 12, padding: "18px 20px",
          }}>
            <p style={{ fontSize: "0.875rem", color: "#1a1a2e", lineHeight: 1.7 }}>
              {selected.summary}
            </p>
          </div>

          <p style={{ fontSize: "0.6875rem", color: "#c4c9d4", marginTop: 20, lineHeight: 1.5, fontStyle: "italic" }}>
            * Nội dung trên chỉ mang tính chất thông tin, không phải khuyến nghị mua/bán chứng khoán.
          </p>
        </div>
      )}
    </div>
  );
}
