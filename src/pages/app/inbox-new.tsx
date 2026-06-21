import { useState, useEffect } from "react";
import {
  Sparkles, Clock, ChevronRight, BookOpen,
  RefreshCw, GripVertical, ArrowLeft, Download, Mail, Check,
} from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { ContextCard, DRAG_CARD_MIME } from "../../types/cards";
import { BriefRenderer, type BriefOutput } from "../../components/BriefRenderer";
import { RichContent } from "../../components/MdContent";

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

interface Brief {
  id: string;
  agentName: string;
  title: string;
  summary: string;
  rawContent: string;
  parsedBrief: BriefOutput | null;
  refs: Array<{ index: number; label: string; url: string }>;
  time: string;
  date: string;
  symbol?: string;
  read: boolean;
}

function parseBriefContent(content: string): BriefOutput | null {
  try {
    const parsed = JSON.parse(content);
    const candidate = (parsed.sections || parsed.time) ? parsed
      : Object.values(parsed).find((v) =>
          v !== null && typeof v === "object" && ("sections" in (v as object) || "time" in (v as object))
        ) ?? null;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const brief = candidate as BriefOutput;
    if (!Array.isArray(brief.sections)) return null;
    return brief;
  } catch {
    return null;
  }
}

// ── HTML export ──────────────────────────────────────────────────────────────

function inlineHtml(text: string, refs?: Array<{ index: number; label: string; url: string }>): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;color:#1a1a2e;">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="font-family:monospace;font-size:0.85em;background:rgba(8,73,172,0.07);padding:1px 5px;border-radius:4px;color:#0849ac;">$1</code>')
    .replace(/\[ref:(\d+)\]/g, (_m, n) => {
      const entry = refs?.find(r => r.index === parseInt(n));
      if (!entry) return "";
      return `<a href="${entry.url}" target="_blank" style="display:inline;padding:1px 7px;border-radius:4px;margin-left:3px;font-size:0.7em;font-weight:700;color:#0849ac;background:rgba(8,73,172,0.08);border:1px solid rgba(8,73,172,0.2);text-decoration:none;white-space:nowrap;">${entry.label} ↗</a>`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="display:inline;padding:1px 7px;border-radius:4px;margin-left:3px;font-size:0.7em;font-weight:700;color:#0849ac;background:rgba(8,73,172,0.08);border:1px solid rgba(8,73,172,0.2);text-decoration:none;white-space:nowrap;">$1 ↗</a>');
}

function mdToHtmlBody(text: string, refs?: Array<{ index: number; label: string; url: string }>): string {
  let stripped = text.replace(/^```[^\n]*\n?([\s\S]*?)```\s*$/m, "$1").trim();
  const lines = stripped.split("\n");
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trim = lines[i].trim();
    // Table block
    if (trim.startsWith("|") && trim.endsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tbl.push(lines[i].trim()); i++;
      }
      const dataRows = tbl.filter(l => !l.replace(/[\s|:-]/g, "").match(/^-+$/));
      if (dataRows.length) {
        const parseRow = (row: string) => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const [header, ...body] = dataRows;
        let tblHtml = `<div style="overflow-x:auto;margin:14px 0;border-radius:10px;border:1px solid rgba(8,73,172,0.12);">`;
        tblHtml += `<table style="width:100%;border-collapse:collapse;font-size:13px;">`;
        tblHtml += `<thead><tr>${parseRow(header).map(h => `<th style="padding:9px 14px;background:rgba(8,73,172,0.06);color:#0849ac;font-weight:700;text-align:left;border-bottom:2px solid rgba(8,73,172,0.12);white-space:nowrap;">${inlineHtml(h, refs)}</th>`).join("")}</tr></thead>`;
        tblHtml += `<tbody>${body.map((row, ri) => `<tr style="background:${ri % 2 === 0 ? "#fff" : "rgba(8,73,172,0.018)"};">${parseRow(row).map(cell => `<td style="padding:8px 14px;border-bottom:1px solid rgba(8,73,172,0.06);color:#374151;">${inlineHtml(cell, refs)}</td>`).join("")}</tr>`).join("")}</tbody>`;
        tblHtml += `</table></div>`;
        parts.push(tblHtml);
      }
      continue;
    }
    if (/^---+$/.test(trim)) { parts.push(`<hr style="border:none;border-top:1px solid rgba(8,73,172,0.12);margin:16px 0;">`); i++; continue; }
    if (!trim) { parts.push(`<div style="height:6px;"></div>`); i++; continue; }
    if (trim.startsWith("# ") && !trim.startsWith("## ")) {
      parts.push(`<div style="display:flex;align-items:center;gap:10px;margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid rgba(8,73,172,0.12);"><div style="width:4px;height:20px;border-radius:2px;background:#0849ac;flex-shrink:0;"></div><h2 style="margin:0;font-family:'Segoe UI',system-ui,sans-serif;font-size:17px;font-weight:800;color:#1a1a2e;">${inlineHtml(trim.slice(2), refs)}</h2></div>`);
      i++; continue;
    }
    if (trim.startsWith("## ") && !trim.startsWith("### ")) {
      parts.push(`<div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px;"><div style="width:3px;height:16px;border-radius:2px;background:#0849ac;flex-shrink:0;"></div><h3 style="margin:0;font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;font-weight:700;color:#0849ac;">${inlineHtml(trim.slice(3), refs)}</h3></div>`);
      i++; continue;
    }
    if (trim.startsWith("### ") && !trim.startsWith("#### ")) {
      parts.push(`<h4 style="margin:12px 0 5px;font-size:14px;font-weight:700;color:#374151;border-left:3px solid rgba(8,73,172,0.2);padding-left:8px;">${inlineHtml(trim.slice(4), refs)}</h4>`);
      i++; continue;
    }
    if (trim.startsWith("> ")) {
      parts.push(`<blockquote style="margin:8px 0;padding:8px 14px;border-left:3px solid #0849ac;background:rgba(8,73,172,0.04);border-radius:0 8px 8px 0;color:#374151;font-style:italic;">${inlineHtml(trim.slice(2), refs)}</blockquote>`);
      i++; continue;
    }
    if (trim.startsWith("- ") || trim.startsWith("• ") || trim.startsWith("· ")) {
      parts.push(`<div style="display:flex;gap:10px;margin-bottom:6px;align-items:flex-start;"><span style="color:#0849ac;flex-shrink:0;margin-top:5px;font-size:8px;font-weight:700;">●</span><span style="line-height:1.7;color:#374151;font-size:13.5px;">${inlineHtml(trim.slice(2), refs)}</span></div>`);
      i++; continue;
    }
    const numMatch = trim.match(/^(\d+)\.\s(.+)/);
    if (numMatch) {
      parts.push(`<div style="display:flex;gap:10px;margin-bottom:6px;align-items:flex-start;"><span style="color:#0849ac;flex-shrink:0;font-weight:700;min-width:22px;font-size:13.5px;line-height:1.7;">${numMatch[1]}.</span><span style="line-height:1.7;color:#374151;font-size:13.5px;">${inlineHtml(numMatch[2], refs)}</span></div>`);
      i++; continue;
    }
    if (trim.startsWith("*") && trim.endsWith("*") && !trim.startsWith("**")) {
      parts.push(`<p style="margin:8px 0 0;font-size:12px;color:#99a1af;font-style:italic;line-height:1.6;">${inlineHtml(trim.slice(1, -1), refs)}</p>`);
      i++; continue;
    }
    parts.push(`<p style="margin:0 0 8px;line-height:1.75;color:#374151;font-size:13.5px;">${inlineHtml(trim, refs)}</p>`);
    i++;
  }
  return parts.join("\n");
}

function briefToHtml(brief: Brief): string {
  const LABEL_MAP: Record<string, string> = {
    very_positive: "Rất tích cực", positive: "Tích cực",
    negative: "Tiêu cực", very_negative: "Rất tiêu cực",
  };
  let body = "";
  if (brief.parsedBrief) {
    for (const sec of brief.parsedBrief.sections) {
      if (sec.type === "portfolio_chips") {
        body += `<div class="chips-row"><b>Có tin:</b> ${sec.has_news.map(s => `<span class="chip green">${s}</span>`).join("")}`;
        if (sec.no_news.length) body += ` &nbsp;<b>Không tin:</b> ${sec.no_news.map(s => `<span class="chip gray">${s}</span>`).join("")}`;
        body += `</div>`;
      } else if (sec.type === "section_header") {
        body += `<h2 class="sec-header">${sec.title}</h2>`;
      } else if (sec.type === "text_block") {
        body += `<p class="text-block">${sec.content}</p>`;
      } else if (sec.type === "alert_banner") {
        const cls = sec.level === "critical" ? "alert-red" : sec.level === "warning" ? "alert-orange" : "alert-blue";
        body += `<div class="alert ${cls}">${sec.message}</div>`;
      } else if (sec.type === "news_card") {
        const label = LABEL_MAP[sec.label] ?? sec.label;
        body += `<div class="card">
          <div class="card-meta"><span class="badge ${sec.label}">${label}</span> <span class="src">${sec.source}</span> ${sec.affected_symbols.map(s => `<span class="sym">${s}</span>`).join("")}</div>
          <div class="card-title">${sec.title}</div>
          ${sec.url ? `<a href="${sec.url}" class="card-link">Đọc bài báo gốc →</a>` : ""}
          ${sec.summary.length ? `<ul>${sec.summary.map(l => `<li>${l}</li>`).join("")}</ul>` : ""}
          ${sec.reasoning.length ? `<div class="reasoning-hd">AI REASONING</div><ul>${sec.reasoning.map(l => `<li>${l}</li>`).join("")}</ul>` : ""}
        </div>`;
      } else if (sec.type === "summary_list") {
        body += `<div class="sum-list">`;
        if (sec.title) body += `<div class="sum-title">${sec.title}</div>`;
        for (const item of sec.items) {
          body += `<div class="sum-item">${item.symbol ? `<span class="sym">${item.symbol}</span>` : ""}${item.label ? `<span class="lbl">${LABEL_MAP[item.label] ?? item.label}</span>` : ""}<span>${item.headline}</span>${item.source ? `<span class="src-sm">${item.source}</span>` : ""}</div>`;
        }
        body += `</div>`;
      } else if (sec.type === "comparison_table") {
        body += `<table><thead><tr>${sec.columns.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${sec.rows.map(r => `<tr>${sec.columns.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }
    }
  } else {
    body = mdToHtmlBody(brief.rawContent, brief.refs);
  }

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>${brief.title}</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#1a1a2e;line-height:1.6;background:#f5f7fb;}
  .wrapper{background:#fff;border-radius:14px;padding:32px;box-shadow:0 2px 12px rgba(8,73,172,0.07);}
  h1{font-size:22px;font-weight:800;margin:0 0 4px;color:#1a1a2e;}
  .meta{color:#99a1af;font-size:13px;margin-bottom:24px;}
  .chips-row{margin-bottom:16px}.chip{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700;margin:2px}
  .chip.green{background:#e6f9ed;color:#1a7a3a}.chip.gray{background:#f0f0f0;color:#888}
  h2.sec-header{font-size:17px;font-weight:800;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #eef}
  .card{border:1px solid #e5e9f5;border-radius:12px;padding:16px;margin-bottom:14px}
  .card-meta{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
  .badge{padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}
  .badge.positive,.badge.very_positive{background:#e6f9ed;color:#1a7a3a}
  .badge.negative,.badge.very_negative{background:#feeaea;color:#c0392b}
  .card-title{font-size:15px;font-weight:700;margin-bottom:8px}
  .card-link{font-size:13px;color:#0849ac;text-decoration:none}
  ul{margin:8px 0;padding-left:18px}li{font-size:13px;margin-bottom:4px}
  .reasoning-hd{font-size:10px;font-weight:700;color:#0849ac;letter-spacing:.06em;margin:10px 0 4px}
  .src{font-size:11px;color:#888}.sym{background:#ebf3ff;color:#0849ac;font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px}
  .sum-list{border:1px solid #e5e9f5;border-radius:10px;overflow:hidden;margin-bottom:16px}
  .sum-title{padding:8px 14px;font-weight:700;font-size:13px;background:#f7f9ff;border-bottom:1px solid #e5e9f5}
  .sum-item{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;flex-wrap:wrap}
  .lbl{font-size:10px;font-weight:700;padding:2px 6px;border-radius:99px;background:#e6f9ed;color:#1a7a3a}
  .src-sm{margin-left:auto;color:#aaa;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
  th{text-align:left;padding:8px 12px;background:rgba(8,73,172,0.06);color:#0849ac;border-bottom:2px solid rgba(8,73,172,0.12);font-weight:700}
  td{padding:8px 12px;border-bottom:1px solid rgba(8,73,172,0.06)}
  .alert{padding:12px 16px;border-radius:10px;margin-bottom:14px;font-size:14px;font-weight:600}
  .alert-blue{background:#ebf3ff;color:#0849ac}.alert-orange{background:#fff4e6;color:#c05000}.alert-red{background:#feeaea;color:#c0392b}
  .text-block{font-size:12px;color:#888;text-align:center;margin-top:24px}
</style></head><body>
<div class="wrapper">
<h1>${brief.title}</h1>
<div class="meta">${brief.date} · ${brief.time} · ${brief.agentName}</div>
${body}
</div>
</body></html>`;
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

  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loadingBriefs, setLoadingBriefs] = useState(true);
  const [selected, setSelected] = useState<Brief | null>(null);
  const [filter, setFilter] = useState<"all" | "brief" | "alert">("all");
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; brief: Brief } | null>(null);

  const fetchBriefs = async () => {
    setLoadingBriefs(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingBriefs(false); return; }
    const { data, error } = await supabase
      .from("briefs")
      .select("id, type, title, summary, content, is_read, created_at, tickers, agent_id, refs")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      const mapped: Brief[] = data.map(row => {
        const rawContent = row.content ?? "";
        const parsedBrief = parseBriefContent(rawContent);
        const createdAt = new Date(row.created_at);
        return {
          id: row.id,
          agentName: row.type ?? "Agent",
          title: row.title ?? "Untitled",
          summary: row.summary ?? "",
          rawContent,
          parsedBrief,
          refs: Array.isArray(row.refs) ? row.refs : [],
          time: createdAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          date: createdAt.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
          symbol: row.tickers?.[0],
          read: row.is_read ?? false,
        };
      });
      setBriefs(mapped);
    } else {
      setBriefs([]);
    }
    setLoadingBriefs(false);
  };

  useEffect(() => {
    fetchBriefs();
    const ch = supabase.channel("inbox-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "briefs" }, () => fetchBriefs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered    = filter === "all" ? briefs : briefs.filter(b => b.agentName === filter);
  const unreadCount = briefs.filter(b => !b.read).length;

  const handleDeleteBrief = async (brief: Brief) => {
    setCtxMenu(null);
    if (selected?.id === brief.id) setSelected(null);
    setBriefs(prev => prev.filter(b => b.id !== brief.id));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("briefs").delete().eq("id", brief.id).eq("user_id", user.id);
    }
  };

  const open = async (brief: Brief) => {
    setSelected(brief);
    setEmailSent(false);
    if (!brief.read) {
      setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, read: true } : b));
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("briefs").update({ is_read: true }).eq("id", brief.id).eq("user_id", user.id);
      }
    }
  };

  const handleDownload = () => {
    if (!selected) return;
    const html = briefToHtml(selected);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.title.replace(/[^a-zA-Z0-9À-ɏ]/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = async () => {
    if (!selected || sendingEmail) return;
    setSendingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token ?? "";
      await fetch(
        `https://${(await import("../../utils/supabase/info")).projectId}.supabase.co/functions/v1/resend-brief`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
          body: JSON.stringify({ briefId: selected.id }),
        }
      );
      setEmailSent(true);
    } catch { /* ignore */ } finally {
      setSendingEmail(false);
    }
  };

  // ── Detail page view ─────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div style={{ minHeight: "100vh", background: bgPage, fontFamily: "'Montserrat', system-ui, sans-serif" }}>

        {/* Detail top bar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: isDark ? "#131824" : "#fff",
          borderBottom: `0.5px solid ${divider}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", height: 52,
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: fgMuted, fontSize: 13, fontFamily: "'Montserrat', system-ui, sans-serif" }}
          >
            <ArrowLeft size={16} strokeWidth={1.5} /> Inbox
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Download HTML */}
            <button
              onClick={handleDownload}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                borderRadius: 8, border: `0.5px solid ${divider}`,
                background: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                color: fgMuted, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "'Montserrat', system-ui, sans-serif",
              }}
            >
              <Download size={13} strokeWidth={1.5} /> Tải về HTML
            </button>

            {/* Send email */}
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail || emailSent}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                borderRadius: 8, border: "none",
                background: emailSent ? "#34C759" : brand,
                color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: sendingEmail || emailSent ? "not-allowed" : "pointer",
                opacity: sendingEmail ? 0.7 : 1,
                fontFamily: "'Montserrat', system-ui, sans-serif",
                transition: "background 200ms ease",
              }}
            >
              {emailSent
                ? <><Check size={13} strokeWidth={2} /> Đã gửi!</>
                : sendingEmail
                ? "Đang gửi..."
                : <><Mail size={13} strokeWidth={1.5} /> Gửi về mail</>
              }
            </button>
          </div>
        </div>

        {/* Detail content */}
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
          {/* Meta */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
              background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)", color: brand,
            }}>
              <BookOpen size={10} strokeWidth={2} /> {selected.agentName}
            </span>
            <span style={{ fontSize: 12, color: fgSubtle }}>{selected.date}</span>
            <span style={{ fontSize: 12, color: fgSubtle }}>·</span>
            <span style={{ fontSize: 12, color: fgSubtle }}>{selected.time}</span>
          </div>

          {/* Title */}
          <h1 style={{ margin: "0 0 28px", fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em", lineHeight: 1.3 }}>
            {selected.title}
          </h1>

          {/* Brief content */}
          {selected.parsedBrief ? (
            <div style={{ background: isDark ? "#131824" : "#fff", borderRadius: 16, border: `1px solid ${divider}`, overflow: "hidden" }}>
              <BriefRenderer brief={selected.parsedBrief} isDark={isDark} />
            </div>
          ) : (
            <div style={{ background: isDark ? "#131824" : "#fff", borderRadius: 16, border: `1px solid ${divider}`, padding: "20px 24px" }}>
              <RichContent text={selected.rawContent} refs={selected.refs} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

      {/* Header */}
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
          {(["all", "daily_digest"] as const).map((f) => {
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f as any)} style={{
                padding: "7px 16px", borderRadius: 22, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: active ? 700 : 400,
                color: active ? brand : fgMuted,
                background: active ? (isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)") : "transparent",
                fontFamily: "'Montserrat', system-ui, sans-serif",
                transition: "all 120ms",
              }}>
                {f === "all" ? "Tất cả" : "Daily Digest"}
              </button>
            );
          })}
        </div>
      </div>

      <p style={{ margin: "0 0 20px", fontSize: 13, color: fgSubtle }}>
        {filtered.length} mục{unreadCount > 0 ? ` · ${unreadCount} chưa đọc` : ""}
      </p>

      {/* List */}
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
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>Chưa có brief nào</p>
              <p style={{ margin: 0, fontSize: 13, color: fgMuted, fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.6 }}>
                Kích hoạt agent để tự động nhận phân tích<br />và cảnh báo thị trường hàng ngày
              </p>
            </div>
          </div>
        )}

        {filtered.map((brief, idx) => {
          const dragCard: ContextCard = {
            id: `inbox-${brief.id}`,
            type: "report",
            label: brief.title.length > 40 ? brief.title.slice(0, 40) + "…" : brief.title,
            badge: brief.agentName,
            summary: brief.summary,
          };

          return (
            <div
              key={brief.id}
              {...makeDragHandlers(dragCard)}
              onClick={() => { setCtxMenu(null); open(brief); }}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, brief });
              }}
              style={{
                display: "flex", alignItems: "stretch",
                borderBottom: idx < filtered.length - 1 ? `1px solid ${divider}` : "none",
                cursor: "pointer", position: "relative",
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
                background: brief.read ? "transparent" : brand,
                borderRadius: idx === 0 ? "16px 0 0 0" : idx === filtered.length - 1 ? "0 0 0 16px" : 0,
              }} />

              {/* Content */}
              <div style={{ flex: 1, padding: "16px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                      background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.07)",
                      color: brand,
                    }}>
                      <BookOpen size={10} strokeWidth={2} />
                      {brief.agentName === "daily_digest" ? "Daily Digest" : brief.agentName}
                    </span>
                    {brief.symbol && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onSelectTicker?.(brief.symbol!); }}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 5,
                          background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.07)",
                          color: brand, cursor: onSelectTicker ? "pointer" : "default",
                        }}
                      >
                        {brief.symbol}
                      </span>
                    )}
                    {!brief.read && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: brand, flexShrink: 0 }} />
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <Clock size={11} color={fgSubtle} strokeWidth={1.5} />
                    <span style={{ fontSize: 12, color: fgSubtle }}>{brief.time}</span>
                  </div>
                </div>

                <div style={{ fontSize: 15, fontWeight: brief.read ? 500 : 700, color: fg, marginBottom: 4, lineHeight: 1.4, letterSpacing: brief.read ? 0 : "-0.01em" }}>
                  {brief.title}
                </div>
                <div style={{ fontSize: 13, color: fgSubtle, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {brief.summary}
                </div>
              </div>

              {/* Drag hint + Chevron */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 16 }}>
                <div className="drag-hint" style={{
                  display: "flex", alignItems: "center", gap: 3,
                  background: isDark ? "rgba(77,143,232,0.12)" : "rgba(8,73,172,0.08)",
                  borderRadius: 6, padding: "3px 7px",
                  opacity: 0, transition: "opacity 150ms ease", pointerEvents: "none",
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

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div
            onClick={() => setCtxMenu(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 1000,
            background: isDark ? "#1a2035" : "#ffffff",
            border: `1px solid ${divider}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            minWidth: 180,
            overflow: "hidden",
            fontFamily: "'Montserrat', system-ui, sans-serif",
          }}>
            <div style={{
              padding: "8px 12px",
              fontSize: 11,
              color: fgSubtle,
              borderBottom: `1px solid ${divider}`,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}>
              {ctxMenu.brief.title.length > 32 ? ctxMenu.brief.title.slice(0, 32) + "…" : ctxMenu.brief.title}
            </div>
            <button
              onClick={() => handleDeleteBrief(ctxMenu.brief)}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                width: "100%", padding: "10px 14px",
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                color: "#dc2626",
                fontFamily: "'Montserrat', system-ui, sans-serif",
                textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Xoá
            </button>
          </div>
        </>
      )}
    </div>
  );
}
