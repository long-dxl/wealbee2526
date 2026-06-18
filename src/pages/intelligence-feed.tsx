import { useState, useEffect, useMemo } from "react";
import posthog from "posthog-js";
import { pipelineSupabase } from "../lib/supabase/pipeline-client";
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Zap, ExternalLink, RefreshCw, Clock, Newspaper, AlertTriangle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketNews {
  id: string;
  title: string;
  content: string | null;
  content_summary: string | null;
  article_url: string;
  label: "very_positive" | "positive" | "neutral" | "negative" | "very_negative";
  impact_score: number | null;
  impact_reasoning: string | null;
  affected_symbols: string[] | null;
  source: string;
  published_at: string;
  news_type: string | null;
}

type SentimentOption = "positive" | "negative" | "neutral";
type DaysFilter = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  vietstock: "Vietstock",
  markettimes: "Markettimes",
  thoibaotaichinhvietnam: "Thời báo TCVN",
  baodautu: "Báo Đầu tư",
  stockbiz: "Stockbiz",
  kinhtechungkhoan: "KT Chứng khoán",
  nhadautu: "Nhà đầu tư",
  tinnhanhchungkhoan: "Tin nhanh CK",
  cafef: "CafeF",
};

const NEWS_TYPE_VI: Record<string, string> = {
  vi_mo: "Vĩ mô",
  vi_mo_dn: "Vĩ mô ngành",
  hoat_dong_kd: "Hoạt động KD",
  phap_ly: "Pháp lý",
  thi_truong: "Thị trường",
  du_bao: "Dự báo",
};

const DAYS_OPTIONS: { value: DaysFilter; label: string }[] = [
  { value: 1, label: "24h" },
  { value: 2, label: "2 ngày" },
  { value: 3, label: "3 ngày" },
  { value: 4, label: "4 ngày" },
  { value: 5, label: "5 ngày" },
  { value: 6, label: "6 ngày" },
  { value: 7, label: "7 ngày" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSourceLabel(source: string) {
  return SOURCE_LABEL[source] || source;
}

function getSentiment(label: string): "positive" | "negative" | "neutral" {
  if (label === "positive" || label === "very_positive") return "positive";
  if (label === "negative" || label === "very_negative") return "negative";
  return "neutral";
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function getDateGroupLabel(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);

  const toDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const diffDays = Math.round((toDay(now) - toDay(date)) / 86400000);

  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchNews(days: DaysFilter): Promise<MarketNews[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await pipelineSupabase
    .from("market_news")
    .select(
      "id,title,content,content_summary,article_url,label,impact_score,impact_reasoning,affected_symbols,source,published_at,news_type"
    )
    .not("label", "in", '("trash")')
    .not("label", "is", null)
    .gte("published_at", since.toISOString())
    .order("published_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as MarketNews[];
}

// ── Main Component ────────────────────────────────────────────────────────────

export function IntelligenceFeed() {
  const [days, setDays] = useState<DaysFilter>(1);
  const [sentimentFilter, setSentimentFilter] = useState<Set<SentimentOption>>(
    new Set(["positive", "negative"])
  );
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [news, setNews] = useState<MarketNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (d: DaysFilter, manual = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNews(d);
      setNews(data);
      if (manual) posthog.capture("feed_refreshed", { days: d });
    } catch (e: any) {
      setError(e?.message ?? "Không thể tải tin tức");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); }, [days]);

  // Danh sách nguồn dynamic từ data
  const availableSources = useMemo(() => {
    const set = new Set(news.map((n) => n.source).filter(Boolean));
    return Array.from(set).sort();
  }, [news]);

  const toggleSentiment = (s: SentimentOption) => {
    setSentimentFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size > 1) next.delete(s);
      } else {
        next.add(s);
      }
      posthog.capture("feed_filter_changed", { filter: "sentiment", value: Array.from(next).join(",") });
      return next;
    });
  };

  // Filtered news (client-side)
  const filtered = useMemo(() => {
    return news.filter((n) => {
      const sentiment = getSentiment(n.label);
      if (!sentimentFilter.has(sentiment)) return false;
      if (sourceFilter !== "all" && n.source !== sourceFilter) return false;
      return true;
    });
  }, [news, sentimentFilter, sourceFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: MarketNews[] }>();
    for (const item of filtered) {
      const key = getDateKey(item.published_at);
      if (!map.has(key)) {
        map.set(key, { label: getDateGroupLabel(item.published_at), items: [] });
      }
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  }, [filtered]);

  // Top 5 by abs(impact_score) từ toàn bộ news (không filter sentiment/source)
  const top5 = useMemo(() => {
    return [...news]
      .filter((n) => n.impact_score !== null)
      .sort((a, b) => Math.abs(b.impact_score!) - Math.abs(a.impact_score!))
      .slice(0, 5);
  }, [news]);

  // Top 3 tuần (7 ngày) — load lại nếu days < 7 thì dùng news hiện có, top 3 theo score
  const top3Week = useMemo(() => {
    return [...news]
      .filter((n) => n.impact_score !== null)
      .sort((a, b) => Math.abs(b.impact_score!) - Math.abs(a.impact_score!))
      .slice(0, 3);
  }, [news]);

  const maxScore = top5.length > 0 ? Math.abs(top5[0].impact_score!) : 10;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1>Luồng tin thông minh</h1>
          <p className="text-muted-foreground" style={{ fontSize: "0.875rem" }}>
            Tin tức ảnh hưởng trực tiếp đến danh mục với phân tích sentiment và đánh giá tác động bằng AI
          </p>
        </div>
        <button
          onClick={() => load(days, true)}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(8,73,172,0.15)",
            background: "#ffffff", cursor: "pointer",
            fontSize: "0.8125rem", color: "#0849ac",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw style={{ width: 13, height: 13, animation: loading ? "spin 1s linear infinite" : "none" }} />
          Làm mới
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap gap-3 items-center">
        {/* Time range — dropdown */}
        <div className="flex items-center gap-2">
          <Clock style={{ width: 14, height: 14, color: "#99a1af", flexShrink: 0 }} />
          <select
            value={days}
            onChange={(e) => {
              const d = Number(e.target.value) as DaysFilter;
              posthog.capture("feed_filter_changed", { filter: "days", value: d });
              setDays(d);
            }}
            style={{
              padding: "5px 10px",
              borderRadius: 7,
              border: "1px solid rgba(8,73,172,0.15)",
              background: "#ffffff",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#0849ac",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {DAYS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "rgba(8,73,172,0.1)" }} />

        {/* Sentiment — multi-select pills */}
        <div className="flex gap-1.5">
          {(["positive", "negative", "neutral"] as SentimentOption[]).map((s) => {
            const labels: Record<SentimentOption, string> = {
              positive: "Tích cực",
              negative: "Tiêu cực",
              neutral: "Trung lập",
            };
            const colors: Record<SentimentOption, string> = {
              positive: "#10b981",
              negative: "#ef4444",
              neutral: "#6a7282",
            };
            const active = sentimentFilter.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleSentiment(s)}
                style={{
                  padding: "4px 11px",
                  borderRadius: 20,
                  border: `1.5px solid ${active ? colors[s] : "rgba(0,0,0,0.08)"}`,
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: active ? `${colors[s]}18` : "transparent",
                  color: active ? colors[s] : "#99a1af",
                }}
              >
                {active && <span style={{ marginRight: 4 }}>✓</span>}
                {labels[s]}
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 20, background: "rgba(8,73,172,0.1)" }} />

        {/* Source filter — dropdown */}
        <div className="flex items-center gap-2">
          <Newspaper style={{ width: 14, height: 14, color: "#99a1af", flexShrink: 0 }} />
          <select
            value={sourceFilter}
            onChange={(e) => {
              posthog.capture("feed_filter_changed", { filter: "source", value: e.target.value });
              setSourceFilter(e.target.value);
            }}
            style={{
              padding: "5px 10px",
              borderRadius: 7,
              border: "1px solid rgba(8,73,172,0.15)",
              background: "#ffffff",
              fontSize: "0.8125rem",
              color: "#1a1a2e",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="all">Tất cả nguồn</option>
            {availableSources.map((src) => (
              <option key={src} value={src}>{getSourceLabel(src)}</option>
            ))}
          </select>
        </div>

        {/* Count */}
        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#99a1af" }}>
          {loading ? "Đang tải..." : `${filtered.length} bài`}
        </span>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Main feed */}
        <div className="col-span-2">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load(days)} />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.label}>
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-3">
                    <span style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#0849ac",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {group.label}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "rgba(8,73,172,0.1)" }} />
                    <span style={{ fontSize: "0.6875rem", color: "#99a1af" }}>
                      {group.items.length} bài
                    </span>
                  </div>

                  {/* News cards trong group */}
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const isExpanded = expandedId === item.id;
                      const sentiment = getSentiment(item.label);
                      const borderColor = sentiment === "positive" ? "#10b981" : sentiment === "negative" ? "#ef4444" : "#cbd5e1";
                      const SentIcon = sentiment === "positive" ? TrendingUp : sentiment === "negative" ? TrendingDown : Minus;
                      const sentLabel = sentiment === "positive" ? "TÍCH CỰC" : sentiment === "negative" ? "TIÊU CỰC" : "TRUNG LẬP";
                      const sentTextColor = sentiment === "positive" ? "#059669" : sentiment === "negative" ? "#dc2626" : "#64748b";
                      const sentBg = sentiment === "positive" ? "rgba(16,185,129,0.1)" : sentiment === "negative" ? "rgba(239,68,68,0.1)" : "rgba(100,116,139,0.08)";
                      return (
                        <div
                          key={item.id}
                          style={{
                            borderTop: `1px solid ${isExpanded ? "rgba(8,73,172,0.2)" : "rgba(0,0,0,0.07)"}`,
                            borderRight: `1px solid ${isExpanded ? "rgba(8,73,172,0.2)" : "rgba(0,0,0,0.07)"}`,
                            borderBottom: `1px solid ${isExpanded ? "rgba(8,73,172,0.2)" : "rgba(0,0,0,0.07)"}`,
                            borderLeft: `3px solid ${borderColor}`,
                            borderRadius: "0 8px 8px 0",
                            background: "var(--card)",
                            boxShadow: isExpanded ? "0 1px 6px rgba(8,73,172,0.07)" : "none",
                            cursor: "pointer",
                            transition: "box-shadow 0.15s, border-color 0.15s",
                          }}
                          onClick={() => {
                            const opening = !isExpanded;
                            setExpandedId(opening ? item.id : null);
                            if (opening) posthog.capture("article_expanded", {
                              source: item.source,
                              label: item.label,
                              impact_score: item.impact_score,
                              news_type: item.news_type,
                            });
                          }}
                        >
                          <div style={{ padding: "12px 14px" }}>
                            {/* Top meta row */}
                            <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 7 }}>
                              {/* Sentiment pill */}
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "2px 8px 2px 6px", borderRadius: 20,
                                background: sentBg, color: sentTextColor,
                                fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.03em",
                              }}>
                                <SentIcon style={{ width: 11, height: 11 }} />
                                {sentLabel}
                              </span>

                              {/* News type tag */}
                              {item.news_type && NEWS_TYPE_VI[item.news_type] && (
                                <span style={{
                                  padding: "2px 7px", borderRadius: 4,
                                  background: "rgba(8,73,172,0.07)", color: "#0849ac",
                                  fontSize: "0.625rem", fontWeight: 500,
                                }}>
                                  {NEWS_TYPE_VI[item.news_type]}
                                </span>
                              )}

                              {/* Source · Time */}
                              <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: 2 }}>
                                {getSourceLabel(item.source)}
                              </span>
                              <span style={{ fontSize: "0.6875rem", color: "#cbd5e1" }}>·</span>
                              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                                {formatTime(item.published_at)}
                              </span>

                              {/* Impact score */}
                              {item.impact_score !== null && (
                                <span style={{
                                  marginLeft: "auto",
                                  fontSize: "0.6875rem", fontWeight: 700,
                                  fontFamily: "'Montserrat', system-ui, sans-serif",
                                  color: sentTextColor,
                                }}>
                                  {item.impact_score > 0 ? "+" : ""}{item.impact_score.toFixed(1)}
                                </span>
                              )}

                              {/* Chevron */}
                              <div style={{ marginLeft: item.impact_score !== null ? 4 : "auto" }}>
                                {isExpanded
                                  ? <ChevronUp style={{ width: 15, height: 15, color: "#94a3b8" }} />
                                  : <ChevronDown style={{ width: 15, height: 15, color: "#94a3b8" }} />
                                }
                              </div>
                            </div>

                            {/* Title */}
                            <p style={{
                              fontSize: "0.875rem", fontWeight: 600,
                              lineHeight: 1.45, marginBottom: 8,
                              display: "-webkit-box", WebkitLineClamp: isExpanded ? undefined : 2,
                              WebkitBoxOrient: "vertical", overflow: isExpanded ? "visible" : "hidden",
                            }}>
                              {item.title}
                            </p>

                            {/* Ticker chips */}
                            {(item.affected_symbols ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {(item.affected_symbols ?? []).slice(0, 5).map((t) => (
                                  <span key={t} style={{
                                    padding: "1px 6px", borderRadius: 4,
                                    background: "rgba(8,73,172,0.08)", color: "#0849ac",
                                    fontSize: "0.6875rem", fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 600,
                                  }}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Expanded content */}
                            {isExpanded && (
                              <div style={{ marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
                                {(item.content_summary || item.content) && (
                                  <p style={{ fontSize: "0.8125rem", lineHeight: 1.65, color: "#475569", marginBottom: 12 }}>
                                    {item.content_summary
                                      ? item.content_summary
                                      : `${item.content!.slice(0, 400)}${item.content!.length > 400 ? "..." : ""}`}
                                  </p>
                                )}
                                {item.impact_reasoning && (
                                  <div style={{
                                    background: "rgba(8,73,172,0.04)", border: "1px solid rgba(8,73,172,0.1)",
                                    borderRadius: 8, padding: "10px 12px", marginBottom: 12,
                                  }}>
                                    <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                                      <Zap style={{ width: 13, height: 13, color: "#0849ac" }} />
                                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0849ac" }}>
                                        Phân Tích Tác Động AI
                                      </span>
                                    </div>
                                    <p style={{ fontSize: "0.8125rem", lineHeight: 1.6, color: "#334155" }}>
                                      {item.impact_reasoning}
                                    </p>
                                  </div>
                                )}
                                <a
                                  href={item.article_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 5,
                                    fontSize: "0.8125rem", fontWeight: 500,
                                    color: "#0849ac", textDecoration: "none",
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    posthog.capture("article_link_clicked", {
                                      source: item.source,
                                      label: item.label,
                                      article_url: item.article_url,
                                    });
                                  }}
                                >
                                  <ExternalLink style={{ width: 13, height: 13 }} />
                                  Đọc bài gốc tại {getSourceLabel(item.source)}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Top 5 tác động cao */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <h3>Top 5 tác động cao</h3>
            </div>
            <p className="text-muted-foreground mb-4" style={{ fontSize: "0.75rem" }}>
              Điểm tác động tuyệt đối lớn nhất trong {days === 1 ? "24h" : `${days} ngày`}
            </p>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-secondary/50 rounded-md animate-pulse" />
                ))}
              </div>
            ) : top5.length === 0 ? (
              <p className="text-muted-foreground text-center py-4" style={{ fontSize: "0.8125rem" }}>Không có dữ liệu</p>
            ) : (
              <div className="space-y-3">
                {top5.map((item, index) => {
                  const sentiment = getSentiment(item.label);
                  const absScore = Math.abs(item.impact_score!);
                  return (
                    <div
                      key={item.id}
                      className="border border-border rounded-md p-3 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(item.id)}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <span
                          className="shrink-0 w-5 h-5 rounded flex items-center justify-center bg-primary/10 text-primary"
                          style={{ fontSize: "0.6875rem", fontWeight: 700 }}
                        >
                          {index + 1}
                        </span>
                        <h4 className="line-clamp-2 leading-tight" style={{ fontSize: "0.8125rem" }}>
                          {item.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 ml-7 flex-wrap">
                        <span
                          style={{
                            fontSize: "0.625rem", fontWeight: 600,
                            padding: "2px 6px", borderRadius: 4,
                            background: sentiment === "positive" ? "rgba(16,185,129,0.1)" : sentiment === "negative" ? "rgba(239,68,68,0.1)" : "rgba(148,163,184,0.1)",
                            color: sentiment === "positive" ? "#10b981" : sentiment === "negative" ? "#ef4444" : "#6a7282",
                          }}
                        >
                          {sentiment === "positive" ? "TÍCH CỰC" : sentiment === "negative" ? "TIÊU CỰC" : "TRUNG LẬP"}
                        </span>
                        {(item.affected_symbols ?? []).slice(0, 2).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded" style={{ fontSize: "0.625rem", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="ml-7 mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-muted-foreground" style={{ fontSize: "0.625rem" }}>Điểm tác động</span>
                          <span
                            style={{
                              fontSize: "0.6875rem", fontWeight: 700,
                              fontFamily: "'Montserrat', system-ui, sans-serif",
                              color: sentiment === "positive" ? "#10b981" : sentiment === "negative" ? "#ef4444" : "#6a7282",
                            }}
                          >
                            {item.impact_score! > 0 ? "+" : ""}{item.impact_score!.toFixed(1)}
                          </span>
                        </div>
                        <div className="h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(absScore / Math.max(maxScore, 1)) * 100}%`,
                              background: sentiment === "positive" ? "#10b981" : sentiment === "negative" ? "#ef4444" : "#94a3b8",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top 3 tin tuần */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3>Top 3 tác động lớn nhất</h3>
            </div>
            <p className="text-muted-foreground mb-4" style={{ fontSize: "0.75rem" }}>
              Trong khoảng thời gian đã chọn
            </p>
            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-secondary/50 rounded-md animate-pulse" />
                ))}
              </div>
            ) : top3Week.length === 0 ? (
              <p className="text-muted-foreground text-center py-4" style={{ fontSize: "0.8125rem" }}>Không có dữ liệu</p>
            ) : (
              <div className="space-y-4">
                {top3Week.map((item, index) => {
                  const sentiment = getSentiment(item.label);
                  const rankColors = ["#ef4444", "#f59e0b", "#10b981"];
                  const rankBg = ["rgba(239,68,68,0.1)", "rgba(245,158,11,0.1)", "rgba(16,185,129,0.1)"];
                  return (
                    <div
                      key={item.id}
                      className="border-l-2 pl-3 cursor-pointer transition-colors"
                      style={{ borderLeftColor: rankColors[index] }}
                      onClick={() => setExpandedId(item.id)}
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        <span
                          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
                          style={{ fontSize: "0.75rem", fontWeight: 700, background: rankBg[index], color: rankColors[index] }}
                        >
                          #{index + 1}
                        </span>
                        <h4 className="line-clamp-2 leading-tight" style={{ fontSize: "0.8125rem" }}>
                          {item.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 ml-8 flex-wrap">
                        {(item.affected_symbols ?? []).slice(0, 3).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded" style={{ fontSize: "0.625rem", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                            {t}
                          </span>
                        ))}
                        <span className="text-muted-foreground ml-auto" style={{ fontSize: "0.625rem" }}>
                          {formatTime(item.published_at)}
                        </span>
                      </div>
                      <div className="ml-8 mt-1 flex items-center justify-between">
                        <span className="text-muted-foreground" style={{ fontSize: "0.625rem" }}>
                          {getSourceLabel(item.source)}
                        </span>
                        <span
                          style={{
                            fontSize: "0.6875rem", fontWeight: 700,
                            fontFamily: "'Montserrat', system-ui, sans-serif",
                            color: sentiment === "positive" ? "#10b981" : sentiment === "negative" ? "#ef4444" : "#6a7282",
                          }}
                        >
                          {item.impact_score! > 0 ? "+" : ""}{item.impact_score!.toFixed(1)}pt
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-3 w-16 bg-secondary rounded animate-pulse" />
            <div className="flex-1 h-px bg-secondary" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-md bg-secondary animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-secondary rounded animate-pulse" />
                    <div className="flex gap-2">
                      <div className="h-3 w-16 bg-secondary rounded animate-pulse" />
                      <div className="h-3 w-12 bg-secondary rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <AlertTriangle className="w-8 h-8 text-chart-5 mx-auto mb-3" />
      <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>Không thể tải tin tức</p>
      <p className="text-muted-foreground mt-1 mb-4" style={{ fontSize: "0.8125rem" }}>{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
        style={{ fontSize: "0.8125rem" }}
      >
        Thử lại
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <Newspaper className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
      <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>Không có tin tức</p>
      <p className="text-muted-foreground mt-1" style={{ fontSize: "0.8125rem" }}>
        Thử chọn khoảng thời gian dài hơn hoặc bỏ bộ lọc
      </p>
    </div>
  );
}
