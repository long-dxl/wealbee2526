import {
  Bell, Zap, Mail, CheckCheck, Clock, TrendingUp, TrendingDown,
  Minus, RefreshCw, Bot, BarChart3, Search, Globe,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brief {
  id: string;
  type: string;
  title: string;
  summary: string;
  content: string | null;
  created_at: string;
  is_read: boolean;
  impact_score?: number | null;
  tickers?: string[] | null;
  agent_id?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ImpactBadge({ score }: { score?: number | null }) {
  if (score == null) return null;
  const color = score > 3 ? "#0ea5a0" : score < -3 ? "#ef4444" : "#f59e0b";
  const bg    = score > 3 ? "rgba(14,165,160,0.1)" : score < -3 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)";
  const Icon  = score > 0 ? TrendingUp : score < 0 ? TrendingDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 6, fontSize: "0.625rem", fontWeight: 700, background: bg, color }}>
      <Icon style={{ width: 10, height: 10 }} />
      {score > 0 ? "+" : ""}{score}
    </span>
  );
}

function BriefTypeIcon({ type }: { type: string }) {
  const cfgMap: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    daily_digest:    { icon: Mail,      color: "#0849ac", bg: "rgba(8,73,172,0.1)" },
    portfolio_health:{ icon: BarChart3, color: "#0ea5a0", bg: "rgba(14,165,160,0.1)" },
    market_scanner:  { icon: Search,    color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
    earnings_watch:  { icon: TrendingUp,color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    macro_watch:     { icon: Globe,     color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    portfolio_alert: { icon: Bell,      color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    market_alert:    { icon: Zap,       color: "#0ea5a0", bg: "rgba(14,165,160,0.1)" },
    system:          { icon: CheckCheck,color: "#99a1af", bg: "rgba(153,161,175,0.1)" },
  };
  const { icon: Icon, color, bg } = cfgMap[type] ?? cfgMap.system;
  return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon style={{ width: 16, height: 16, color }} />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (h < 24) return `${h} giờ trước`;
  if (d < 7)  return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// ─── Markdown-lite renderer (same as ActionHub) ───────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function MdContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: "0.875rem", color: "#1a1a2e", lineHeight: 1.75 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;
        if (trimmed.startsWith("## ")) return <h3 key={i} style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#1a1a2e", margin: "14px 0 6px" }}>{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith("### ")) return <h4 key={i} style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1a1a2e", margin: "10px 0 4px" }}>{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "#0849ac", flexShrink: 0, marginTop: 2 }}>•</span>
            <span>{renderInline(trimmed.slice(2))}</span>
          </div>;
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const [num, ...rest] = trimmed.split(/\.\s(.+)/);
          return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "#0849ac", flexShrink: 0, fontWeight: 700, minWidth: 18 }}>{num}.</span>
            <span>{renderInline(rest[0] ?? "")}</span>
          </div>;
        }
        return <p key={i} style={{ margin: "0 0 6px" }}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

// ─── InboxPage ────────────────────────────────────────────────────────────────

export function InboxPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selected, setSelected] = useState<Brief | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user.id ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!userId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const { data, error } = await supabase
      .from("briefs")
      .select("id,type,title,summary,content,created_at,is_read,impact_score,tickers,agent_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) setBriefs(data as Brief[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Real-time subscription
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("briefs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "briefs", filter: `user_id=eq.${userId}` },
        (payload) => {
          setBriefs(prev => [payload.new as Brief, ...prev]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const markRead = async (id: string) => {
    await supabase.from("briefs").update({ is_read: true }).eq("id", id);
    setBriefs(prev => prev.map(b => b.id === id ? { ...b, is_read: true } : b));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("briefs").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setBriefs(prev => prev.map(b => ({ ...b, is_read: true })));
  };

  const deleteBrief = async (id: string) => {
    await supabase.from("briefs").delete().eq("id", id);
    setBriefs(prev => prev.filter(b => b.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const filtered = filter === "unread" ? briefs.filter(b => !b.is_read) : briefs;
  const unreadCount = briefs.filter(b => !b.is_read).length;

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.25rem", fontWeight: 700, color: "#1a1a2e" }}>Inbox</h1>
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 2 }}>
                {unreadCount > 0 ? `${unreadCount} chưa đọc` : "Tất cả đã đọc"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => load(true)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(8,73,172,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#99a1af" }}>
                <RefreshCw style={{ width: 13, height: 13, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              </button>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ fontSize: "0.75rem", color: "#0849ac", fontWeight: 600, border: "1px solid rgba(8,73,172,0.12)", background: "transparent", cursor: "pointer", padding: "5px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCheck style={{ width: 12, height: 12 }} />Đọc hết
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {(["all", "unread"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit", background: filter === f ? "#0849ac" : "rgba(8,73,172,0.06)", color: filter === f ? "#fff" : "#6a7282" }}>
                {f === "all" ? `Tất cả (${briefs.length})` : `Chưa đọc (${unreadCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <RefreshCw style={{ width: 20, height: 20, color: "#0849ac", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 8 }}>Đang tải…</p>
            </div>
          ) : !userId ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <Bot style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Đăng nhập để xem Inbox</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <Bell style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>
                {filter === "unread" ? "Tất cả đã đọc 🎉" : "Inbox trống"}
              </p>
              <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>
                {filter === "all" && "Chạy agent để tạo bản tin đầu tiên"}
              </p>
            </div>
          ) : (
            filtered.map(brief => (
              <div
                key={brief.id}
                data-brief-id={brief.id}
                onClick={() => { setSelected(brief); markRead(brief.id); }}
                style={{
                  display: "flex", gap: 12, padding: "12px 12px",
                  borderRadius: 10, cursor: "pointer", marginBottom: 2,
                  background: selected?.id === brief.id ? "rgba(8,73,172,0.06)" : !brief.is_read ? "rgba(8,73,172,0.02)" : "transparent",
                  border: selected?.id === brief.id ? "1px solid rgba(8,73,172,0.12)" : "1px solid transparent",
                  transition: "all 0.12s",
                }}
              >
                <BriefTypeIcon type={brief.type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: brief.is_read ? 500 : 700, color: "#1a1a2e", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {brief.title}
                    </p>
                    {!brief.is_read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0849ac", flexShrink: 0, marginTop: 4 }} />}
                  </div>
                  <p style={{ fontSize: "0.6875rem", color: "#99a1af", marginTop: 4, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {brief.summary}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <Clock style={{ width: 10, height: 10, color: "#c4c9d4" }} />
                    <span style={{ fontSize: "0.5625rem", color: "#c4c9d4" }}>{timeAgo(brief.created_at)}</span>
                    {brief.impact_score != null && <ImpactBadge score={brief.impact_score} />}
                    {brief.tickers?.slice(0, 4).map(t => (
                      <span key={t} style={{ fontSize: "0.5625rem", padding: "1px 5px", borderRadius: 4, background: "rgba(8,73,172,0.08)", color: "#0849ac", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{t}</span>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button onClick={() => setSelected(null)} style={{ fontSize: "0.75rem", color: "#0849ac", fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              ← Quay lại
            </button>
            <button onClick={() => deleteBrief(selected.id)} style={{ fontSize: "0.75rem", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", background: "transparent", cursor: "pointer", padding: "4px 10px", borderRadius: 7 }}>
              Xóa
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
            <BriefTypeIcon type={selected.type} />
            <div>
              <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.0625rem", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.4 }}>
                {selected.title}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>
                  {new Date(selected.created_at).toLocaleString("vi-VN")}
                </span>
                {selected.impact_score != null && <ImpactBadge score={selected.impact_score} />}
              </div>
            </div>
          </div>

          {/* Tickers */}
          {selected.tickers && selected.tickers.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {selected.tickers.map(t => (
                <span key={t} style={{ padding: "4px 10px", borderRadius: 7, background: "rgba(8,73,172,0.08)", color: "#0849ac", fontWeight: 700, fontSize: "0.8125rem", fontFamily: "'IBM Plex Mono', monospace" }}>{t}</span>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={{ background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "18px 20px" }}>
            {selected.content
              ? <MdContent text={selected.content} />
              : <p style={{ fontSize: "0.875rem", color: "#1a1a2e", lineHeight: 1.7 }}>{selected.summary}</p>
            }
          </div>

          <p style={{ fontSize: "0.625rem", color: "#c4c9d4", marginTop: 20, lineHeight: 1.5, fontStyle: "italic" }}>
            * Nội dung trên chỉ mang tính chất thông tin, không phải khuyến nghị mua/bán chứng khoán.
          </p>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
