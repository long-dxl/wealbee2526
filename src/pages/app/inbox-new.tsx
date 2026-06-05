import { useState, useEffect } from "react";
import { Sparkles, Clock, AlertTriangle, ChevronRight, X, BookOpen, RefreshCw, GripVertical, ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";

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

interface BriefSource {
  type: "news" | "financial" | "insider" | "dividend" | "exchange";
  title: string;
  url: string | null;
  date?: string;
  source?: string;
}
interface RefEntry { index: number; label: string; url: string; }

interface Brief {
  id: string;
  type: "brief" | "alert";
  agentName: string;
  title: string;
  summary: string;
  body: string;
  time: string;
  symbol?: string;
  read: boolean;
  severity?: "info" | "warn" | "critical";
  refs?: RefEntry[];
  sources?: BriefSource[];
}


// ── Simple markdown renderer ─────────────────────────────────────────────────

function renderInline(text: string, refs?: RefEntry[]): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[ref:\d+\]|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;

    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} style={{ fontFamily: "monospace", fontSize: "0.85em", background: "rgba(8,73,172,0.07)", padding: "1px 5px", borderRadius: 4, color: "#0849ac" }}>{part.slice(1, -1)}</code>;

    const refMatch = part.match(/^\[ref:(\d+)\]$/);
    if (refMatch) {
      const entry = refs?.find(r => r.index === parseInt(refMatch[1]));
      if (entry) return (
        <a key={i} href={entry.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 7px", borderRadius: 4, marginLeft: 3, fontSize: "0.72em", fontWeight: 600, color: "#0849ac", background: "rgba(8,73,172,0.08)", border: "1px solid rgba(8,73,172,0.15)", textDecoration: "none", verticalAlign: "middle", lineHeight: 1.7, whiteSpace: "nowrap" }}>
          {entry.label}<ExternalLink style={{ width: 8, height: 8 }} />
        </a>
      );
      return null;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) return (
      <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 7px", borderRadius: 4, marginLeft: 3, fontSize: "0.72em", fontWeight: 600, color: "#0849ac", background: "rgba(8,73,172,0.08)", border: "1px solid rgba(8,73,172,0.15)", textDecoration: "none", verticalAlign: "middle", lineHeight: 1.7, whiteSpace: "nowrap" }}>
        {linkMatch[1]}<ExternalLink style={{ width: 8, height: 8 }} />
      </a>
    );

    return part;
  });
}

function MarkdownBody({ body, fg, fgMuted, fgSubtle, divider, isDark, refs }: {
  body: string; fg: string; fgMuted: string; fgSubtle: string; divider: string; isDark: boolean; refs?: RefEntry[];
}) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "") { i++; continue; }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800, color: fg, letterSpacing: "-0.02em" }}>
          {line.slice(3)}
        </h2>
      );
      i++; continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} style={{ margin: "18px 0 8px", fontSize: 13, fontWeight: 700, color: fgSubtle, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {line.slice(4)}
        </h3>
      );
      i++; continue;
    }

    // HR
    if (line === "---") {
      elements.push(<div key={key++} style={{ height: "0.5px", background: divider, margin: "16px 0" }} />);
      i++; continue;
    }

    // Italic paragraph (*text*)
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      elements.push(
        <p key={key++} style={{ margin: "10px 0 0", fontSize: 12, color: fgSubtle, fontStyle: "italic", lineHeight: 1.6 }}>
          {line.slice(1, -1)}
        </p>
      );
      i++; continue;
    }

    // Table
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().split("|").filter(Boolean).map((c) => c.trim());
        if (!cells.every((c) => /^[-:\s]+$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length > 0) {
        const thBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.04)";
        elements.push(
          <div key={key++} style={{ overflowX: "auto", margin: "12px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: thBg }}>
                  {rows[0].map((cell, j) => (
                    <th key={j} style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${divider}`, fontWeight: 700, color: fg, whiteSpace: "nowrap" }}>
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, j) => (
                  <tr key={j} style={{ borderBottom: `0.5px solid ${divider}` }}>
                    {row.map((cell, k) => (
                      <td key={k} style={{ padding: "8px 12px", color: fgMuted, verticalAlign: "middle" }}>
                        {renderInline(cell, refs)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Unordered list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} style={{ margin: "6px 0 10px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: 14, color: fgMuted, lineHeight: 1.65 }}>{renderInline(item, refs)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={key++} style={{ margin: "6px 0 10px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: 14, color: fgMuted, lineHeight: 1.65 }}>{renderInline(item, refs)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} style={{ margin: "0 0 10px", fontSize: 14, color: fgMuted, lineHeight: 1.75 }}>
        {renderInline(line, refs)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

// ── Main component ───────────────────────────────────────────────────────────

export function Inbox({ isDark = false, onSelectTicker }: { isDark?: boolean; onSelectTicker?: (sym: string) => void }) {
  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted  = isDark ? "rgba(240,242,255,0.60)" : "rgba(26,26,46,0.65)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.35)" : "rgba(26,26,46,0.40)";
  const cardBg   = isDark ? "#131824" : "#ffffff";
  const brand    = isDark ? "#4D8FE8" : "#0849AC";
  const divider  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const bgPage   = isDark ? "#0B0D18" : "#F5F5F7";
  const modalBg  = isDark ? "#1a2030" : "#ffffff";

  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loadingBriefs, setLoadingBriefs] = useState(true);
  const [selected, setSelected]  = useState<Brief | null>(null);
  const [filter, setFilter] = useState<"all" | "brief" | "alert">("all");

  // ── Load real briefs from Supabase ────────────────────────────────────────
  const fetchBriefs = async () => {
    setLoadingBriefs(true);
    const { data, error } = await supabase
      .from("briefs")
      .select("id, type, title, summary, content, is_read, created_at, tickers, impact_score, agent_id, refs, sources")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      const mapped: Brief[] = data.map(row => ({
        id: row.id,
        type: "brief" as const,
        agentName: row.type ?? "Agent",
        title: row.title ?? "Untitled",
        summary: row.summary ?? "",
        body: row.content ?? "",
        time: new Date(row.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        symbol: row.tickers?.[0],
        read: row.is_read ?? false,
        severity: row.impact_score != null && row.impact_score < -3 ? "warn" : "info",
        refs: row.refs ?? [],
        sources: row.sources ?? [],
      }));
      setBriefs(mapped);
    } else {
      setBriefs([]);
    }
    setLoadingBriefs(false);
  };

  useEffect(() => {
    fetchBriefs();

    // Real-time subscription for new briefs
    const ch = supabase.channel("inbox-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "briefs" }, () => {
        fetchBriefs();
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered    = briefs.filter((b) => filter === "all" || b.type === filter);
  const unreadCount = briefs.filter((b) => !b.read).length;

  const open = async (brief: Brief) => {
    setSelected(brief);
    setBriefs((prev) => prev.map((b) => b.id === brief.id ? { ...b, read: true } : b));
    // Mark as read in Supabase
    await supabase.from("briefs").update({ is_read: true }).eq("id", brief.id);
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em" }}>Inbox</h1>
          {loadingBriefs && <RefreshCw size={14} style={{ color: brand, animation: "spin 1s linear infinite" }} />}
          {unreadCount > 0 && !loadingBriefs && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 20, height: 20, borderRadius: 99, padding: "0 6px",
              background: "#FF3B30", color: "#fff", fontSize: 12, fontWeight: 700,
            }}>
              {unreadCount}
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["all", "brief", "alert"] as const).map((f) => {
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "7px 16px", borderRadius: 22, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: active ? 700 : 400,
                color: active ? brand : fgMuted,
                background: active ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)") : "transparent",
                fontFamily: "'Montserrat', system-ui, sans-serif",
                transition: "all 120ms",
              }}>
                {f === "all" ? "Tất cả" : f === "brief" ? "Briefs" : "Alerts"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subtitle */}
      <p style={{ margin: "0 0 20px", fontSize: 13, color: fgSubtle }}>
        {filtered.length} mục{unreadCount > 0 ? ` · ${unreadCount} chưa đọc` : ""}
      </p>

      {/* ── List surface ── */}
      <div style={{
        background: cardBg, borderRadius: 16,
        border: `1px solid ${divider}`,
        boxShadow: isDark ? "0 1px 4px rgba(0,0,0,0.40)" : "0 1px 4px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}>
        {!loadingBriefs && filtered.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={22} color={brand} strokeWidth={1.5} />
            </div>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                Chưa có brief nào
              </p>
              <p style={{ margin: 0, fontSize: 13, color: fgMuted, fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.6 }}>
                Kích hoạt agent để tự động nhận phân tích<br />và cảnh báo thị trường hàng ngày
              </p>
            </div>
          </div>
        )}
        {filtered.map((brief, idx) => {
          const isAlert = brief.type === "alert";
          const accentColor = isAlert ? "#FF9500" : brand;
          const dragCard: ContextCard = {
            id: `inbox-${brief.id}`,
            type: isAlert ? "news" : "report",
            label: brief.title.length > 40 ? brief.title.slice(0, 40) + "…" : brief.title,
            badge: isAlert ? "Alert" : brief.agentName,
            summary: brief.summary,
          };

          return (
            <div
              key={brief.id}
              {...makeDragHandlers(dragCard)}
              onClick={() => open(brief)}
              style={{
                display: "flex", alignItems: "stretch",
                borderBottom: idx < filtered.length - 1 ? `1px solid ${divider}` : "none",
                cursor: "grab", position: "relative",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.05)" : "rgba(8,73,172,0.03)";
                const hint = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(".drag-hint");
                if (hint) hint.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                const hint = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(".drag-hint");
                if (hint) hint.style.opacity = "0";
              }}
            >
              {/* Unread accent bar */}
              <div style={{
                width: 3, flexShrink: 0,
                background: brief.read ? "transparent" : accentColor,
                borderRadius: idx === 0 ? "16px 0 0 0" : idx === filtered.length - 1 ? "0 0 0 16px" : 0,
              }} />

              {/* Content */}
              <div style={{ flex: 1, padding: "16px 16px 16px 16px", minWidth: 0 }}>
                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {/* Type badge */}
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                      background: isAlert ? "rgba(255,149,0,0.10)" : (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)"),
                      color: accentColor,
                    }}>
                      {isAlert
                        ? <AlertTriangle size={10} strokeWidth={2} />
                        : <BookOpen size={10} strokeWidth={2} />}
                      {isAlert ? "Alert" : "Brief"}
                    </span>

                    <span style={{ fontSize: 12, color: fgSubtle }}>{brief.agentName}</span>

                    {brief.symbol && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onSelectTicker?.(brief.symbol!); }}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 5,
                          background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.07)",
                          color: brand,
                          cursor: onSelectTicker ? "pointer" : "default",
                          textDecoration: onSelectTicker ? "underline" : "none",
                        }}
                        title={onSelectTicker ? `Xem chi tiết ${brief.symbol}` : undefined}
                      >
                        {brief.symbol}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <Clock size={11} color={fgSubtle} strokeWidth={1.5} />
                    <span style={{ fontSize: 12, color: fgSubtle }}>{brief.time}</span>
                  </div>
                </div>

                {/* Title */}
                <div style={{
                  fontSize: 15, fontWeight: brief.read ? 500 : 700,
                  color: fg, marginBottom: 4, lineHeight: 1.4,
                  letterSpacing: brief.read ? 0 : "-0.01em",
                }}>
                  {brief.title}
                </div>

                {/* Summary */}
                <div style={{
                  fontSize: 13, color: fgSubtle, lineHeight: 1.5,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {brief.summary}
                </div>
              </div>

              {/* Drag hint + Chevron */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 16 }}>
                <div className="drag-hint" style={{
                  display: "flex", alignItems: "center", gap: 3,
                  background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)",
                  borderRadius: 6, padding: "3px 7px",
                  opacity: 0, transition: "opacity 150ms ease",
                  pointerEvents: "none",
                }}>
                  <GripVertical size={10} color={brand} strokeWidth={2} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: brand, fontFamily: "'Montserrat', system-ui, sans-serif" }}>Kéo vào AI</span>
                </div>
                <ChevronRight size={16} color={fgSubtle} strokeWidth={1.5} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: isDark ? "rgba(0,0,0,0.65)" : "rgba(26,26,46,0.40)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200, padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div style={{
            background: modalBg, borderRadius: 20, width: "100%", maxWidth: 660,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            boxShadow: isDark
              ? "0 24px 64px rgba(0,0,0,0.70)"
              : "0 24px 64px rgba(8,73,172,0.14), 0 4px 16px rgba(0,0,0,0.08)",
            border: `1px solid ${divider}`,
          }}>

            {/* Modal header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${divider}`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Meta */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                      background: selected.type === "alert" ? "rgba(255,149,0,0.10)" : (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)"),
                      color: selected.type === "alert" ? "#FF9500" : brand,
                    }}>
                      {selected.type === "alert"
                        ? <AlertTriangle size={10} strokeWidth={2} />
                        : <Sparkles size={10} strokeWidth={2} />}
                      {selected.type === "alert" ? "Alert" : "Brief"}
                    </span>
                    <span style={{ fontSize: 12, color: fgSubtle }}>{selected.agentName}</span>
                    <span style={{ fontSize: 12, color: fgSubtle }}>·</span>
                    <span style={{ fontSize: 12, color: fgSubtle }}>{selected.time}</span>
                  </div>
                  {/* Title */}
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: fg, letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                    {selected.title}
                  </h2>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    marginLeft: 16, flexShrink: 0, width: 32, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                    border: "none", borderRadius: 8, cursor: "pointer", color: fgSubtle,
                  }}
                >
                  <X size={16} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              <MarkdownBody
                body={selected.body}
                fg={fg} fgMuted={fgMuted} fgSubtle={fgSubtle}
                divider={divider} isDark={isDark}
                refs={selected.refs}
              />

              {/* Sources panel */}
              {selected.sources && selected.sources.length > 0 && (
                <div style={{ marginTop: 20, padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(8,73,172,0.03)", border: `1px solid ${divider}`, borderRadius: 10 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: fgSubtle, letterSpacing: "0.07em" }}>NGUỒN DỮ LIỆU</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {selected.sources.map((s, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: isDark ? "rgba(77,143,232,0.15)" : "rgba(8,73,172,0.07)", color: brand, fontWeight: 700, flexShrink: 0, marginTop: 1, whiteSpace: "nowrap" }}>
                          {s.type === "news" ? "Tin" : s.type === "financial" ? "BCTC" : s.type === "insider" ? "Nội bộ" : s.type === "dividend" ? "Cổ tức" : "Sàn"}
                        </span>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 13, color: fgMuted, textDecoration: "none", lineHeight: 1.4, flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>{s.title}{s.date && <span style={{ marginLeft: 5, fontSize: 11, color: fgSubtle }}>{s.date}</span>}</span>
                            <ExternalLink style={{ width: 10, height: 10, flexShrink: 0, color: fgSubtle }} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 13, color: fgMuted, lineHeight: 1.4 }}>{s.title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "12px 24px", borderTop: `1px solid ${divider}`,
              background: isDark ? "rgba(255,255,255,0.02)" : "rgba(8,73,172,0.02)",
              borderRadius: "0 0 20px 20px", flexShrink: 0,
            }}>
              <p style={{ margin: 0, fontSize: 11, color: fgSubtle, lineHeight: 1.6 }}>
                Wealbee AI tổng hợp từ dữ liệu công khai · Không phải tư vấn đầu tư theo Luật Chứng khoán 2019, NĐ 155/2020/NĐ-CP
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
