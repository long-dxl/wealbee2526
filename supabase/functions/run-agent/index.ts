/**
 * run-agent — Execute a user agent, generate output, push to briefs inbox
 *
 * POST { agent_id: string }
 * Headers: Authorization: Bearer <user_jwt>
 *
 * Response: { ok: true, run_id, brief_id, title, tokens }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchNewsAndBuildData,
  buildSystemPrompt,
  generateBrief,
  DEFAULT_USER_PROMPT,
  type BriefOutput,
} from "../_shared/generate-brief.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY    = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM        = Deno.env.get("EMAIL_FROM") ?? "Wealbee <no-reply@wealbee.com>";

// Studio model ID → { provider, apiModel }
const MODEL_MAP: Record<string, { provider: "openai" | "anthropic"; apiModel: string }> = {
  "gpt-4o-mini":   { provider: "openai",    apiModel: "gpt-4o-mini"          },
  "gpt-4o":        { provider: "openai",    apiModel: "gpt-4o"               },
  "claude-sonnet": { provider: "anthropic", apiModel: "claude-sonnet-4-6"    },
  "claude-opus":   { provider: "anthropic", apiModel: "claude-opus-4-7"      },
  "gemini-pro":    { provider: "openai",    apiModel: "gpt-4.1-mini"         }, // fallback
  "gemini-flash":  { provider: "openai",    apiModel: "gpt-4.1-mini"         }, // fallback
};
const DEFAULT_MODEL = { provider: "openai" as const, apiModel: "gpt-4.1-mini" };

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Build financials context for a specific symbol ──────────────────────────

async function buildFinancialsContext(symbol: string, registry?: SourceRegistry): Promise<string> {
  const sym  = symbol.toUpperCase();
  const lines: string[] = [`\n## Dữ liệu tài chính: ${sym}`];

  // Financials annual
  try {
    const { data: fins } = await sb
      .from("financials_annual")
      .select("year,revenue,net_profit,eps,pe_ratio,pb_ratio,roe,roa,debt_to_equity")
      .eq("symbol", sym)
      .order("year", { ascending: false })
      .limit(4);

    if (fins?.length) {
      const countFields = (f: (typeof fins)[0]) =>
        [f.revenue, f.net_profit, f.eps, f.pe_ratio, f.pb_ratio, f.roe, f.roa, f.debt_to_equity]
          .filter(v => v != null).length;
      const qualifiedRows = fins.filter(f => countFields(f) >= 3);
      if (qualifiedRows.length === 0) {
        lines.push(`\n*Không có số liệu tài chính chi tiết cho ${sym} trong hệ thống. Không được tự ước tính các chỉ số tài chính.*`);
      } else {
        const ref = registry ? ` ${registry.add("BCTC", faUrl(sym))}` : "";
        lines.push(`\n### Kết quả tài chính theo năm${ref}`);
        lines.push("| Năm | Doanh thu (tỷ) | LNST (tỷ) | EPS | P/E | P/B | ROE | ROA | D/E |");
        lines.push("|-----|---------------|-----------|-----|-----|-----|-----|-----|-----|");
        for (const f of qualifiedRows) {
          const rev  = f.revenue        != null ? (Number(f.revenue)        / 1e9).toFixed(0) : "—";
          const np   = f.net_profit     != null ? (Number(f.net_profit)     / 1e9).toFixed(0) : "—";
          const eps  = f.eps            != null ? Number(f.eps).toLocaleString("vi-VN")        : "—";
          const pe   = f.pe_ratio       != null ? Number(f.pe_ratio).toFixed(1)                : "—";
          const pb   = f.pb_ratio       != null ? Number(f.pb_ratio).toFixed(2)                : "—";
          const roe  = f.roe            != null ? (Number(f.roe) * 100).toFixed(1) + "%"       : "—";
          const roa  = f.roa            != null ? (Number(f.roa) * 100).toFixed(2) + "%"       : "—";
          const de   = f.debt_to_equity != null ? Number(f.debt_to_equity).toFixed(2)          : "—";
          lines.push(`| ${f.year} | ${rev} | ${np} | ${eps} | ${pe} | ${pb} | ${roe} | ${roa} | ${de} |`);
        }
      }
    }
  } catch { /* ignore */ }

  // Dividends
  try {
    const { data: divs } = await sb
      .from("dividends")
      .select("ex_date,dividend_type,amount,payment_date")
      .eq("symbol", sym)
      .order("ex_date", { ascending: false })
      .limit(6);

    if (divs?.length) {
      const ref = registry ? ` ${registry.add("Cổ tức", faUrl(sym))}` : "";
      lines.push(`\n### Lịch sử cổ tức${ref}`);
      for (const d of divs) {
        const typeLabel = d.dividend_type === "cash" ? "tiền mặt" : "cổ phiếu";
        const amtLabel  = d.dividend_type === "cash"
          ? `${Number(d.amount).toLocaleString("vi-VN")} đ/CP`
          : `${(Number(d.amount) * 100).toFixed(1)}%`;
        lines.push(`- ${d.ex_date}: ${typeLabel} ${amtLabel}${d.payment_date ? ` (thanh toán ${d.payment_date})` : ""}`);
      }
    }
  } catch { /* ignore */ }

  // Insider transactions
  try {
    const { data: ins } = await sb
      .from("insider_transactions")
      .select("trade_date,insider_name,trade_type,volume")
      .eq("symbol", sym)
      .order("trade_date", { ascending: false })
      .limit(8);

    if (ins?.length) {
      const ref = registry ? ` ${registry.add("Insider", faUrl(sym))}` : "";
      lines.push(`\n### Giao dịch nội bộ gần đây${ref}`);
      for (const t of ins) {
        const vol = t.volume ? `${Number(t.volume).toLocaleString("vi-VN")} CP` : "";
        lines.push(`- ${t.trade_date}: ${t.insider_name} **${t.trade_type === "buy" ? "MUA" : "BÁN"}** ${vol}`);
      }
    }
  } catch { /* ignore */ }

  return lines.length > 1 ? lines.join("\n") : "";
}

// ─── Build price context (tool: price_feed) ──────────────────────────────────

// FireAnt — single URL pattern that works for all tickers AND indices
const faUrl = (sym: string) => `https://fireant.vn/ma-chung-khoan/${sym}`;
const VS_INDEX_URL: Record<string, string> = {
  VNINDEX: faUrl("VNINDEX"),
  HNX:     faUrl("HNXINDEX"),
};
const vsStockUrl = faUrl;

// Max age for price data: 5 calendar days (covers weekends + 1 holiday buffer)
const PRICE_MAX_AGE_DAYS = 5;

function daysSince(dateStr: string): number {
  const todayUtc = new Date().toISOString().substring(0, 10);
  return Math.round((new Date(todayUtc).getTime() - new Date(dateStr).getTime()) / 86400000);
}

async function buildPriceContext(registry?: SourceRegistry): Promise<string> {
  const lines: string[] = [];
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayVN  = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push(`Ngày phân tích: ${todayVN}`);

  // ── Market indices ──────────────────────────────────────────────────────────
  try {
    const { data: indices } = await sb
      .from("market_indices")
      .select("index_code, date, close, change_pt, change_pct")
      .in("index_code", ["VNINDEX", "HNX"])
      .order("date", { ascending: false })
      .limit(4);

    const seen = new Set<string>();
    const fresh: typeof indices = [];
    for (const idx of (indices ?? [])) {
      if (seen.has(idx.index_code)) continue;
      seen.add(idx.index_code);
      if (daysSince(idx.date) <= PRICE_MAX_AGE_DAYS) fresh.push(idx);
    }

    if (fresh.length) {
      lines.push("\n## Chỉ số thị trường");
      for (const idx of fresh) {
        const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
        const pct = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
        const pt  = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
        const ref = registry ? ` ${registry.add(idx.index_code, VS_INDEX_URL[idx.index_code] ?? VS_INDEX_URL.VNINDEX)}` : "";
        lines.push(`- ${idx.index_code}: ${Number(idx.close).toLocaleString("vi-VN", { minimumFractionDigits: 2 })} ${arrow} ${pt} (${pct}) · phiên ${idx.date}${ref}`);
      }
    } else {
      lines.push("\n## Chỉ số thị trường");
      lines.push(`- Chưa có dữ liệu chỉ số trong DB (dữ liệu cuối: ${indices?.[0]?.date ?? "không rõ"}, đã quá ${PRICE_MAX_AGE_DAYS} ngày). Không được suy đoán giá trị chỉ số.`);
    }
  } catch { /* ignore */ }

  // ── Stock prices ────────────────────────────────────────────────────────────
  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, close")
      .order("date", { ascending: false })
      .limit(75);

    const latestDate: Record<string, string> = {};
    const bySymbol: Record<string, number[]> = {};
    for (const row of (prices ?? [])) {
      if (!bySymbol[row.symbol]) {
        bySymbol[row.symbol] = [];
        latestDate[row.symbol] = row.date;
      }
      if (bySymbol[row.symbol].length < 2) bySymbol[row.symbol].push(Number(row.close));
    }

    // Only include symbols with fresh data
    const freshSymbols = Object.keys(bySymbol).filter(sym => daysSince(latestDate[sym]) <= PRICE_MAX_AGE_DAYS);

    if (freshSymbols.length) {
      const movers = freshSymbols
        .filter(sym => bySymbol[sym].length === 2)
        .map(sym => ({ sym, pct: ((bySymbol[sym][0] - bySymbol[sym][1]) / bySymbol[sym][1]) * 100 }))
        .sort((a, b) => b.pct - a.pct);

      lines.push("\n## Giá VN30");
      for (const sym of freshSymbols) {
        const ref = registry ? ` ${registry.add(sym, vsStockUrl(sym))}` : "";
        lines.push(`- ${sym}: ${bySymbol[sym][0].toLocaleString("vi-VN")} đ · phiên ${latestDate[sym]}${ref}`);
      }
      const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
      const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();
      if (top5up.length)   { lines.push("\n### Top tăng");  for (const m of top5up)   lines.push(`- ${m.sym}: +${m.pct.toFixed(2)}%`); }
      if (top5down.length) { lines.push("\n### Top giảm");  for (const m of top5down) lines.push(`- ${m.sym}: ${m.pct.toFixed(2)}%`); }
    } else {
      const lastDate = prices?.[0]?.date ?? "không rõ";
      lines.push("\n## Giá VN30");
      lines.push(`- Chưa có dữ liệu giá trong DB (dữ liệu cuối: ${lastDate}, đã quá ${PRICE_MAX_AGE_DAYS} ngày). Không được suy đoán giá cổ phiếu.`);
    }
  } catch { /* ignore */ }

  return lines.join("\n");
}

// ─── Source type ─────────────────────────────────────────────────────────────

interface Source {
  type: "news" | "financial" | "insider" | "dividend" | "exchange";
  title: string;
  url: string | null;
  date?: string;
  source?: string;
}

// ─── Source registry — numbered references ────────────────────────────────────
// Instead of embedding long URLs in context (LLM may corrupt them),
// use [ref:N] tokens and resolve to real URLs in the SSE sources event.

class SourceRegistry {
  private list: Array<{ label: string; url: string }> = [];

  add(label: string, url: string): string {
    const existing = this.list.findIndex(s => s.url === url);
    if (existing !== -1) return `[ref:${existing + 1}]`;
    this.list.push({ label, url });
    return `[ref:${this.list.length}]`;
  }

  toArray() { return this.list.map((s, i) => ({ index: i + 1, ...s })); }
}

// ─── Build news context (tool: news_feed) ────────────────────────────────────

async function buildNewsContext(sources?: Source[], registry?: SourceRegistry, targetSyms?: string[]): Promise<string> {
  try {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    const baseQuery = () => sb
      .from("market_news")
      .select("title, content_summary, label, impact_score, affected_symbols, published_at, article_url, source")
      .not("label", "is", null)
      .neq("label", "trash")
      .gte("published_at", since);

    // Fetch symbol-specific news first (if target symbols provided)
    const symNewsMap = new Map<string, typeof news>();
    const symNewsIds = new Set<string>();
    if (targetSyms && targetSyms.length > 0) {
      await Promise.all(targetSyms.map(async (sym) => {
        const { data } = await baseQuery()
          .contains("affected_symbols", [sym])
          .order("impact_score", { ascending: false, nullsFirst: false })
          .limit(5);
        if (data?.length) symNewsMap.set(sym, data);
      }));
      for (const rows of symNewsMap.values()) {
        for (const r of rows) { if (r.article_url) symNewsIds.add(r.article_url); }
      }
    }

    // Global top-10 (exclude already-fetched symbol news to avoid duplication)
    const { data: globalNews } = await baseQuery()
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(10);

    const news = [...Array.from(symNewsMap.values()).flat()];
    const seen = new Set(symNewsIds);
    for (const n of (globalNews ?? [])) {
      if (!seen.has(n.article_url ?? "")) {
        news.push(n);
        seen.add(n.article_url ?? "");
      }
    }

    if (!news.length) return "";

    const addItem = (n: any, lines: string[]) => {
      const syms  = n.affected_symbols?.length ? ` [${n.affected_symbols.slice(0, 3).join(",")}]` : "";
      const score = n.impact_score != null ? ` [tác động:${n.impact_score}]` : "";
      const srcLabel = n.source ?? "Báo";
      const ref = (registry && n.article_url) ? ` ${registry.add(srcLabel, n.article_url)}` : "";
      lines.push(`- ${n.title}${syms}${score}${ref}`);
      if (n.content_summary) lines.push(`  ${n.content_summary.substring(0, 120)}`);
      if (sources && (n.article_url || n.source)) {
        sources.push({
          type: "news",
          title: n.title,
          url: n.article_url ?? null,
          date: n.published_at ? n.published_at.substring(0, 10) : undefined,
          source: n.source ?? undefined,
        });
      }
    };

    const lines: string[] = [];

    // Symbol-specific section
    if (symNewsMap.size > 0) {
      lines.push("\n## Tin tức liên quan đến mã phân tích (48h)");
      for (const [sym, rows] of symNewsMap.entries()) {
        lines.push(`\n### ${sym}`);
        for (const n of rows) addItem(n, lines);
      }
    }

    // General market news
    const generalNews = (globalNews ?? []).filter(n => !symNewsIds.has(n.article_url ?? ""));
    if (generalNews.length > 0) {
      lines.push("\n## Tin tức thị trường chung (48h)");
      for (const n of generalNews.slice(0, 10)) addItem(n, lines);
    }

    return lines.join("\n");
  } catch { return ""; }
}

// ─── Build sources for a symbol (deep research) ──────────────────────────────

async function buildSymbolSources(symbol: string, sources: Source[]): Promise<void> {
  const sym = symbol.toUpperCase();
  const url = faUrl(sym);

  // Financial reports
  try {
    const { data: fins } = await sb
      .from("financials_annual")
      .select("year")
      .eq("symbol", sym)
      .order("year", { ascending: false })
      .limit(1);
    if (fins?.length) {
      sources.push({ type: "financial", title: `Báo cáo tài chính ${sym} (${fins[0].year})`, url, source: "FireAnt" });
    }
  } catch { /* ignore */ }

  // Dividends
  try {
    const { data: divs } = await sb
      .from("dividends")
      .select("ex_date")
      .eq("symbol", sym)
      .order("ex_date", { ascending: false })
      .limit(1);
    if (divs?.length) {
      sources.push({ type: "dividend", title: `Lịch sử cổ tức ${sym}`, url, source: "FireAnt", date: divs[0].ex_date });
    }
  } catch { /* ignore */ }

  // Insider transactions
  try {
    const { data: ins } = await sb
      .from("insider_transactions")
      .select("trade_date, insider_name, trade_type")
      .eq("symbol", sym)
      .order("trade_date", { ascending: false })
      .limit(1);
    if (ins?.length) {
      const t = ins[0];
      sources.push({ type: "insider", title: `Giao dịch nội bộ ${sym} — ${t.insider_name ?? ""} ${t.trade_type === "buy" ? "MUA" : "BÁN"}`, url, source: "FireAnt", date: t.trade_date });
    }
  } catch { /* ignore */ }

  // News about this symbol (with article_url — keep original article links)
  try {
    const { data: newsRows } = await sb
      .from("market_news")
      .select("title, article_url, published_at, source")
      .contains("affected_symbols", [sym])
      .not("article_url", "is", null)
      .order("published_at", { ascending: false })
      .limit(5);
    for (const n of (newsRows ?? [])) {
      if (n.article_url) {
        sources.push({ type: "news", title: n.title, url: n.article_url, date: n.published_at?.substring(0, 10), source: n.source ?? undefined });
      }
    }
  } catch { /* ignore */ }

  // Main stock page on FireAnt
  sources.push({ type: "exchange", title: `${sym} — FireAnt`, url, source: "FireAnt" });
}

// ─── Send brief email via Resend ─────────────────────────────────────────────

async function sendBriefEmail(
  toEmail: string, userName: string, agentName: string, title: string,
  content: string, refs?: Array<{ index: number; label: string; url: string }>,
): Promise<void> {
  if (!RESEND_API_KEY || !toEmail) return;

  const SF = "font-family:Helvetica,Arial,sans-serif;";

  // ── Inline markdown: **bold**, [ref:N] → link badge, [label](url) → link ──
  function inline(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:700;color:#1a1a2e;${SF}">$1</strong>`)
      .replace(/\[ref:(\d+)\]/g, (_m, n) => {
        const entry = refs?.find(r => r.index === parseInt(n));
        if (!entry) return "";
        return `<a href="${entry.url}" style="display:inline;padding:1px 6px;border-radius:3px;margin-left:3px;font-size:11px;font-weight:600;color:#0849ac;background:#EBF0FA;text-decoration:none;" target="_blank">${entry.label} ↗</a>`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
        return `<a href="${url}" style="display:inline;padding:1px 6px;border-radius:3px;margin-left:3px;font-size:11px;font-weight:600;color:#0849ac;background:#EBF0FA;text-decoration:none;" target="_blank">${label} ↗</a>`;
      });
  }

  // ── Table block → HTML (mirrors MdTable) ─────────────────────────────────
  function buildTable(tblLines: string[]): string {
    const dataRows = tblLines.filter(l => !l.replace(/[\s|:-]/g, "").match(/^-+$/));
    if (!dataRows.length) return "";
    const parseRow = (row: string) => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const [header, ...body] = dataRows;
    let html = `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0;${SF}font-size:13px;border:1px solid #dde6f5;">`;
    html += "<tr>" + parseRow(header).map(h =>
      `<th style="background:#0849ac;color:#fff;padding:8px 12px;text-align:left;font-weight:700;white-space:nowrap;${SF}">${inline(h)}</th>`
    ).join("") + "</tr>";
    body.forEach((row, ri) => {
      const bg = ri % 2 === 0 ? "#ffffff" : "#f7f9fd";
      html += `<tr style="background:${bg};">` + parseRow(row).map(cell =>
        `<td style="padding:7px 12px;border-bottom:1px solid #e5e9f5;color:#374151;${SF}">${inline(cell)}</td>`
      ).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  }

  // ── Line-by-line markdown → HTML (mirrors MdContent) ─────────────────────
  const lines = content.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trim = raw.trim();

    // Table block
    if (trim.startsWith("|") && trim.endsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tbl.push(lines[i].trim()); i++;
      }
      parts.push(buildTable(tbl));
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trim)) {
      parts.push(`<hr style="border:none;border-top:1px solid #e5e9f5;margin:16px 0;" />`);
      i++; continue;
    }

    // Empty line
    if (!trim) { parts.push(`<div style="height:6px;"></div>`); i++; continue; }

    // H1 (# )
    if (trim.startsWith("# ") && !trim.startsWith("## ")) {
      parts.push(`<div style="margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid rgba(8,73,172,0.12);">` +
        `<span style="font-size:16px;font-weight:800;color:#1a1a2e;${SF}">${inline(trim.slice(2))}</span></div>`);
      i++; continue;
    }

    // H2 (## )
    if (trim.startsWith("## ") && !trim.startsWith("### ")) {
      parts.push(`<div style="margin:16px 0 8px;padding-left:10px;border-left:3px solid #0849ac;">` +
        `<span style="font-size:15px;font-weight:700;color:#0849ac;${SF}">${inline(trim.slice(3))}</span></div>`);
      i++; continue;
    }

    // H3 (### )
    if (trim.startsWith("### ") && !trim.startsWith("#### ")) {
      parts.push(`<div style="margin:12px 0 5px;padding-left:8px;border-left:3px solid #cbd5e0;">` +
        `<span style="font-size:13.5px;font-weight:700;color:#374151;${SF}">${inline(trim.slice(4))}</span></div>`);
      i++; continue;
    }

    // Bullet (- / • / ·)
    if (trim.startsWith("- ") || trim.startsWith("• ") || trim.startsWith("· ")) {
      parts.push(
        `<table cellpadding="0" cellspacing="0" style="margin-bottom:5px;"><tr>` +
        `<td style="width:14px;vertical-align:top;padding-top:4px;color:#0849ac;font-size:8px;font-weight:700;">●</td>` +
        `<td style="line-height:1.7;color:#374151;font-size:13.5px;${SF}">${inline(trim.slice(2))}</td>` +
        `</tr></table>`
      );
      i++; continue;
    }

    // Numbered list
    const numMatch = trim.match(/^(\d+)\.\s(.+)/);
    if (numMatch) {
      parts.push(
        `<table cellpadding="0" cellspacing="0" style="margin-bottom:5px;"><tr>` +
        `<td style="width:24px;vertical-align:top;color:#0849ac;font-weight:700;font-size:13.5px;${SF}">${numMatch[1]}.</td>` +
        `<td style="line-height:1.7;color:#374151;font-size:13.5px;${SF}">${inline(numMatch[2])}</td>` +
        `</tr></table>`
      );
      i++; continue;
    }

    // Blockquote (> )
    if (trim.startsWith("> ")) {
      parts.push(`<div style="margin:8px 0;padding:8px 14px;border-left:3px solid #0849ac;background:#f0f4fc;">` +
        `<span style="font-style:italic;color:#374151;font-size:13.5px;${SF}">${inline(trim.slice(2))}</span></div>`);
      i++; continue;
    }

    // *italic footnote* — single asterisk wrapping entire line
    if (trim.startsWith("*") && trim.endsWith("*") && !trim.startsWith("**")) {
      parts.push(`<p style="margin:8px 0 0;font-size:12px;color:#99a1af;font-style:italic;line-height:1.6;${SF}">${trim.slice(1, -1)}</p>`);
      i++; continue;
    }

    // Regular paragraph
    parts.push(`<p style="margin:0 0 8px;line-height:1.75;color:#374151;font-size:13.5px;${SF}">${inline(trim)}</p>`);
    i++;
  }

  const bodyHtml = parts.join("\n");
  const logoSvg = `<img src="https://fkwsvyzguehtsjpwmttb.supabase.co/storage/v1/object/public/assets/logo-white.svg" width="44" height="44" alt="Wealbee" style="display:block;"/>`;
  const greeting = userName ? `Xin chào ${userName},` : "Xin chào,";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f0f4fa;font-family:Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4fa;padding:24px 0;">
  <tr><td align="center">
    <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">
      <!-- HEADER -->
      <tr><td style="background:#0849ac;border-radius:12px 12px 0 0;padding:20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:8px;width:44px;">${logoSvg}</td>
          <td style="vertical-align:middle;">
            <span style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.3px;font-family:Helvetica,Arial,sans-serif;">Wealbee</span>
          </td>
          <td align="right" style="vertical-align:middle;">
            <span style="color:rgba(255,255,255,0.65);font-size:12px;font-family:Helvetica,Arial,sans-serif;">${agentName}</span>
          </td>
        </tr></table>
      </td></tr>
      <!-- BODY -->
      <tr><td style="background:#ffffff;border:1px solid #e5e9f5;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
        <p style="margin:0 0 16px;font-size:14px;color:#374151;font-family:Helvetica,Arial,sans-serif;">${greeting}</p>
        <div style="font-size:18px;font-weight:700;color:#1a1a2e;margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;line-height:1.3;">${title}</div>
        <div style="font-size:13.5px;line-height:1.75;color:#374151;font-family:Helvetica,Arial,sans-serif;">
          ${bodyHtml}
        </div>
      </td></tr>
      <!-- FOOTER -->
      <tr><td style="padding:16px 0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#99a1af;font-family:Helvetica,Arial,sans-serif;">Wealbee Agent · Chỉ mang tính thông tin, không phải khuyến nghị đầu tư</p>
        <p style="margin:4px 0 0;font-size:11px;color:#99a1af;font-family:Helvetica,Arial,sans-serif;">Email gửi tới: ${toEmail}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [toEmail], subject: `[Wealbee Agent] ${title}`, html }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("Resend error:", res.status, errText);
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
}

// ─── Build portfolio context for user ────────────────────────────────────────

async function buildPortfolioContext(userId: string): Promise<string> {
  try {
    const { data: holdings } = await sb
      .from("portfolio_holdings")
      .select("symbol, quantity, avg_cost")
      .eq("user_id", userId);

    if (!holdings?.length) return "";

    const symbols = holdings.map(h => h.symbol);
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, close")
      .in("symbol", symbols)
      .order("date", { ascending: false })
      .limit(symbols.length * 2);

    const latestPrice: Record<string, number> = {};
    for (const p of (prices ?? [])) {
      if (!latestPrice[p.symbol]) latestPrice[p.symbol] = Number(p.close);
    }

    const lines: string[] = ["\n## Danh mục đầu tư hiện tại"];
    let totalCost = 0, totalValue = 0;
    for (const h of holdings) {
      const price = latestPrice[h.symbol] ?? h.avg_cost;
      const cost  = h.quantity * h.avg_cost;
      const value = h.quantity * price;
      const pnl   = value - cost;
      const pct   = (pnl / cost) * 100;
      totalCost  += cost;
      totalValue += value;
      lines.push(`- ${h.symbol}: ${h.quantity} CP @ ${h.avg_cost.toLocaleString("vi-VN")}đ | Giá hiện tại: ${price.toLocaleString("vi-VN")}đ | P&L: ${pnl >= 0 ? "+" : ""}${(pnl / 1000).toFixed(0)}K (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
    }
    const totalPnl = totalValue - totalCost;
    lines.push(`\nTổng: Vốn ${(totalCost / 1e9).toFixed(2)} tỷ → Giá trị ${(totalValue / 1e9).toFixed(2)} tỷ (${totalPnl >= 0 ? "+" : ""}${(totalPnl / 1e6).toFixed(1)}M VNĐ)`);
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─── Extract tickers from text ────────────────────────────────────────────────

function extractTickers(text: string): string[] {
  const VN30 = new Set(["ACB","BID","BVH","CTG","FPT","GAS","HDB","HPG","MBB","MSN","MWG","PLX","SAB","SSI","STB","TCB","TPB","VCB","VHM","VIB","VIC","VJC","VNM","VPB","VRE"]);
  const found = new Set<string>();
  const matches = text.matchAll(/\b([A-Z]{2,5})\b/g);
  for (const m of matches) {
    if (VN30.has(m[1])) found.add(m[1]);
  }
  return Array.from(found).slice(0, 8);
}

// ─── Infer impact score from output ──────────────────────────────────────────

// ── Daily Market Digest: email HTML builder ───────────────────────────────────

function briefToEmailHtml(brief: BriefOutput): string {
  const labelMap: Record<string, { bg: string; color: string; text: string }> = {
    very_positive: { bg: "#C8E6C9", color: "#1B5E20", text: "RẤT TÍCH CỰC" },
    positive:      { bg: "#E8F5E9", color: "#2E7D32", text: "TÍCH CỰC" },
    negative:      { bg: "#FDE8EC", color: "#D4183D", text: "TIÊU CỰC" },
    very_negative: { bg: "#F8D7DA", color: "#7B0D1E", text: "RẤT TIÊU CỰC" },
  };
  const typeMap: Record<string, string> = {
    vi_mo: "Vĩ mô", hoat_dong_kd: "Hoạt động KD", thi_truong: "Thị trường",
    vi_mo_dn: "Vĩ mô ngành", phap_ly: "Pháp lý", du_bao: "Dự báo",
  };
  let html = `<div style="background:#ECF2FF;padding:14px 20px;"><span style="color:#0849AC;font-size:15px;font-weight:700;">Bản tin hàng ngày · ${brief.time}</span></div>`;
  for (const section of brief.sections ?? []) {
    if (section.type === "portfolio_chips") {
      html += `<div style="background:#fff;padding:10px 20px 14px;"><p style="margin:0 0 8px;color:#030213;font-size:11px;font-weight:700;text-transform:uppercase;">Danh mục hôm nay</p><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
      for (const s of section.has_news) html += `<span style="background:#E8F5E9;color:#2E7D32;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;">${s}</span>`;
      for (const s of section.no_news) html += `<span style="background:#F3F4F6;color:#9CA3AF;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">${s}</span>`;
      html += `</div></div>`;
    } else if (section.type === "news_card") {
      const lc = labelMap[section.label] ?? { bg: "#F3F4F6", color: "#374151", text: section.label };
      html += `<div style="background:#fff;padding:6px 20px;"><div style="background:#F8F9FB;border-radius:10px;border-left:4px solid ${lc.color};padding:14px 16px;">`;
      html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;"><span style="background:${lc.bg};color:${lc.color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${lc.text}</span>`;
      if (section.news_type) html += `<span style="background:#F0F0F8;color:#5A5A7A;font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;">${typeMap[section.news_type] ?? section.news_type}</span>`;
      if (section.source) html += `<span style="color:#717182;font-size:11px;">${section.source}</span>`;
      html += `</div><a href="${section.url}" style="color:#030213;font-size:14px;font-weight:600;text-decoration:none;display:block;line-height:1.5;margin-bottom:8px;">${section.title}</a>`;
      if (section.summary?.length) html += `<ul style="margin:0 0 8px;padding-left:16px;">${section.summary.map(b => `<li style="color:#374151;font-size:13px;line-height:1.6;">${b}</li>`).join("")}</ul>`;
      html += `<p style="margin:0 0 10px;"><a href="${section.url}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">Đọc bài báo gốc →</a></p>`;
      if (section.reasoning?.length) html += `<div style="background:#ECF2FF;border-radius:8px;padding:10px 14px;"><ul style="margin:0;padding-left:16px;">${section.reasoning.map(r => `<li style="color:#4A5568;font-size:12px;line-height:1.6;">${r}</li>`).join("")}</ul></div>`;
      html += `</div></div>`;
    } else if (section.type === "text_block") {
      html += `<div style="background:#fff;padding:10px 20px;"><p style="margin:0;color:#374151;font-size:13px;line-height:1.7;">${section.content}</p></div>`;
    }
  }
  return html;
}

async function sendDigestEmail(to: string, subject: string, brief: BriefOutput): Promise<void> {
  if (!RESEND_API_KEY) return;
  const bodyHtml = briefToEmailHtml(brief);
  const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="background:#0849AC;padding:16px 24px;text-align:center;"><span style="color:#fff;font-size:20px;font-weight:800;">Wealbee</span></div>
  <div style="max-width:680px;margin:0 auto;padding:16px 0;">${bodyHtml}</div>
  <div style="background:#E8EDF5;padding:16px 24px;text-align:center;margin-top:8px;">
    <p style="margin:0;color:#9CA3AF;font-size:11px;">Wealbee · Phân tích chứng khoán thông minh</p>
    <p style="margin:4px 0 0;color:#9CA3AF;font-size:10px;">Không phải tư vấn đầu tư theo Luật Chứng khoán 2019</p>
  </div>
</body></html>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html: emailHtml }),
  });
}

// ── Daily Market Digest runner (template_id: "daily_digest") ─────────────────

async function runDailyDigest(
  agent: { id: string; template_id: string; system_prompt: string | null; tools: string[] | null; run_count: number | null; email_notify?: boolean | null; target_symbols?: string[] | null },
  user: { id: string; email?: string | null },
  run: { id: string },
  emit: (data: object) => void,
  requestSymbols: string[] = [],
): Promise<void> {
  emit({ type: "step", step: "news_feed", status: "loading", label: "Đang lấy danh sách theo dõi..." });

  let watchSymbols: string[] = [];

  // Priority: request override > agent.target_symbols > digest_subscribers (legacy fallback)
  if (requestSymbols.length > 0) {
    watchSymbols = requestSymbols;
  } else if (agent.target_symbols?.length) {
    watchSymbols = agent.target_symbols;
  } else {
    let { data: sub } = await sb.from("digest_subscribers").select("watch_symbols").eq("user_id", user.id).maybeSingle();
    if (!sub && user.email) {
      const r = await sb.from("digest_subscribers").select("watch_symbols").eq("email", user.email).maybeSingle();
      sub = r.data;
    }
    watchSymbols = sub?.watch_symbols ?? [];
  }

  emit({ type: "step", step: "news_feed", status: "done", label: `Theo dõi: ${watchSymbols.join(", ") || "(chưa cấu hình)"}` });

  if (!watchSymbols.length) throw new Error("Chưa có mã theo dõi. Vui lòng thêm mã vào watchlist.");

  emit({ type: "step", step: "build", status: "loading", label: "Đang đọc tin tức từ thị trường..." });
  const { dataForLLM, timeStr } = await fetchNewsAndBuildData(sb, watchSymbols);
  emit({ type: "step", step: "build", status: "done", label: "Tin tức thị trường (24h)" });

  emit({ type: "step", step: "llm", status: "loading", label: "Đang tổng hợp với AI..." });
  const userPrompt = agent.system_prompt ?? DEFAULT_USER_PROMPT;
  const fullPrompt = buildSystemPrompt(userPrompt);
  const { brief, tokensUsed } = await generateBrief(OPENAI_API_KEY, fullPrompt, dataForLLM);
  emit({ type: "step", step: "llm", status: "done", label: `AI tổng hợp xong · ${tokensUsed} tokens` });

  const title = `Bản tin hàng ngày · ${timeStr}`;
  const startedAt = Date.now();

  emit({ type: "step", step: "save", status: "loading", label: "Đang lưu vào Inbox..." });
  await sb.from("agent_runs").update({
    status: "completed", output: JSON.stringify(brief),
    duration_ms: Date.now() - startedAt, finished_at: new Date().toISOString(),
  }).eq("id", run.id);

  const symbolsWithNews = (dataForLLM as { hasNews: string[] }).hasNews;
  const summary = symbolsWithNews.length ? `Có tin cho: ${symbolsWithNews.join(", ")}` : "Không có tin nổi bật hôm nay";

  const { data: savedBrief, error: briefErr } = await sb.from("briefs").insert({
    user_id: user.id, agent_id: agent.id, agent_run_id: run.id,
    type: "daily_digest", title, summary, content: JSON.stringify(brief), is_read: false,
  }).select("id").single();
  if (briefErr) throw new Error(`Lưu brief thất bại: ${briefErr.message}`);

  await sb.from("agents").update({
    last_run_at: new Date().toISOString(),
    run_count: (agent.run_count ?? 0) + 1,
  }).eq("id", agent.id);

  emit({ type: "step", step: "save", status: "done", label: "Đã lưu vào Inbox" });

  if (agent.email_notify && user.email) {
    emit({ type: "step", step: "email_send", status: "loading", label: "Đang gửi email..." });
    try {
      await sendDigestEmail(user.email, `[Wealbee] ${title}`, brief);
      emit({ type: "step", step: "email_send", status: "done", label: `Email đã gửi tới ${user.email}` });
    } catch (emailErr) {
      emit({ type: "step", step: "email_send", status: "error", label: `Lỗi gửi email: ${String(emailErr)}` });
    }
  }

  emit({ type: "done", title, brief_id: savedBrief?.id, run_id: run.id, tokens: tokensUsed, duration_ms: Date.now() - startedAt, brief });
}

function inferImpactScore(output: string, templateId: string): number {
  const positive = (output.match(/tăng|tích cực|hưởng lợi|cơ hội|khởi sắc|tốt/gi) ?? []).length;
  const negative = (output.match(/giảm|tiêu cực|rủi ro|lo ngại|áp lực|xấu/gi) ?? []).length;
  const net = positive - negative;
  if (templateId === "portfolio_health") return Math.min(10, Math.max(-10, net * 2));
  return Math.min(8, Math.max(-8, net));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Auth
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: { agent_id: string; target_symbol?: string; target_symbols?: string[] };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { agent_id } = body;
  // Support both single (legacy) and multi-symbol
  const target_symbols: string[] = body.target_symbols?.length
    ? body.target_symbols.map(s => s.toUpperCase().trim()).filter(Boolean)
    : body.target_symbol
    ? [body.target_symbol.toUpperCase().trim()]
    : [];
  const target_symbol = target_symbols[0]; // backward compat for single-symbol code paths
  if (!agent_id) {
    return new Response(JSON.stringify({ error: "agent_id required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Fetch agent + template
  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .select("id, user_id, template_id, name, description, system_prompt, tools, run_count, model, email_notify, kb_document_ids, target_symbols")
    .eq("id", agent_id)
    .eq("user_id", user.id)
    .single();

  if (agentErr || !agent) {
    return new Response(JSON.stringify({ error: "Agent not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: template } = await sb
    .from("agent_templates")
    .select("id, name, system_prompt, icon, color")
    .eq("id", agent.template_id)
    .single();

  // Create run record
  const { data: run, error: runErr } = await sb
    .from("agent_runs")
    .insert({ agent_id, user_id: user.id, status: "running" })
    .select("id")
    .single();

  if (runErr || !run) {
    return new Response(JSON.stringify({ error: "Cannot create run" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Stream SSE response
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const startedAt = Date.now();

      try {
        // ── Daily Market Digest: separate pipeline ────────────────────────────
        if (agent.template_id === "daily_digest") {
          await runDailyDigest(agent, user, run, emit, target_symbols);
          return;
        }

        const enabledTools: string[] = agent.tools ?? [];

        const SYM_PREFIX  = "__TARGET_SYMBOL__: ";
        const rawPrompt   = agent.system_prompt ?? "";
        const firstLine   = rawPrompt.split("\n")[0] ?? "";
        const savedSym    = firstLine.startsWith(SYM_PREFIX) ? firstLine.slice(SYM_PREFIX.length).trim() : null;
        const cleanPrompt = savedSym ? rawPrompt.replace(/^__TARGET_SYMBOL__:[^\n]*\n\n?/, "") : rawPrompt;

        // Resolve final symbols list (request > saved > none)
        const syms: string[] = target_symbols.length > 0
          ? target_symbols
          : savedSym ? [savedSym] : [];
        const sym = syms[0]; // keep for backward-compat single-symbol checks

        // ── Tool steps ────────────────────────────────────────────────────────

        const sources: Source[] = [];
        const registry = new SourceRegistry();

        let priceCtx = `Ngày: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}`;
        if (enabledTools.includes("price_feed")) {
          emit({ type: "step", step: "price_feed", status: "loading", label: "Đang lấy dữ liệu giá..." });
          priceCtx = await buildPriceContext(registry);
          emit({ type: "step", step: "price_feed", status: "done", label: "Dữ liệu giá & chỉ số" });
          sources.push({ type: "exchange", title: "VN-Index — FireAnt", url: VS_INDEX_URL.VNINDEX, source: "FireAnt" });
          sources.push({ type: "exchange", title: "HNX-Index — FireAnt", url: VS_INDEX_URL.HNX, source: "FireAnt" });
        }

        let newsCtx = "";
        if (enabledTools.includes("news_feed")) {
          emit({ type: "step", step: "news_feed", status: "loading", label: "Đang lấy tin tức thị trường..." });
          newsCtx = await buildNewsContext(sources, registry, syms.length > 0 ? syms : undefined);
          const newsLabel = syms.length > 0 ? `Tin tức ${syms.join(", ")} + thị trường (48h)` : "Tin tức thị trường (48h)";
          emit({ type: "step", step: "news_feed", status: "done", label: newsLabel });
        }

        let portfolioCtx = "";
        if (agent.template_id === "portfolio_health" || enabledTools.includes("portfolio_read")) {
          emit({ type: "step", step: "portfolio", status: "loading", label: "Đang lấy danh mục đầu tư..." });
          portfolioCtx = await buildPortfolioContext(user.id);
          emit({ type: "step", step: "portfolio", status: "done", label: "Danh mục đầu tư" });
        }

        // ── KB RAG (if agent has selected KB docs) ────────────────────────────
        let kbCtx = "";
        const kbDocIds: string[] = agent.kb_document_ids ?? [];
        if (kbDocIds.length > 0 && OPENAI_API_KEY) {
          emit({ type: "step", step: "kb", status: "loading", label: `Đang tìm kiếm trong Knowledge Base (${kbDocIds.length} tài liệu)...` });
          try {
            const kbQuery = syms.length > 0
              ? `Phân tích cổ phiếu ${syms.join(", ")} — tiêu chí định giá, ngành, rủi ro`
              : agent.description ?? agent.name ?? "phân tích chứng khoán Việt Nam";

            const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
              method: "POST",
              headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "text-embedding-3-small", input: kbQuery }),
            });
            if (embedRes.ok) {
              const embedJson = await embedRes.json();
              const embedding = embedJson.data?.[0]?.embedding;
              if (embedding) {
                // Dùng RPC mới — search thẳng trong doc_ids đã chọn, không filter JS-side
                const { data: chunks } = await sb.rpc("match_knowledge_chunks_by_docs", {
                  query_embedding: embedding,
                  match_user_id:   user.id,
                  doc_ids:         kbDocIds,
                  match_count:     6,
                  match_threshold: 0.35,
                });

                if (chunks && chunks.length > 0) {
                  kbCtx = "\n\n## KIẾN THỨC NỀN TỪ KNOWLEDGE BASE\n"
                    + "(Dùng làm ngữ cảnh phân tích, không trích dẫn [ref:N] cho phần này)\n"
                    + (chunks as any[]).map((c) => `---\n${c.content}`).join("\n");
                  emit({ type: "step", step: "kb", status: "done", label: `Tìm thấy ${chunks.length} đoạn liên quan trong KB` });
                } else {
                  // Fallback: nếu semantic không tìm thấy gì, lấy chunks đầu tiên của từng doc
                  const { data: fallback } = await sb
                    .from("knowledge_chunks")
                    .select("document_id, chunk_index, content")
                    .in("document_id", kbDocIds)
                    .eq("user_id", user.id)
                    .order("chunk_index", { ascending: true })
                    .limit(kbDocIds.length * 2);

                  if (fallback && fallback.length > 0) {
                    kbCtx = "\n\n## KIẾN THỨC NỀN TỪ KNOWLEDGE BASE\n"
                      + "(Dùng làm ngữ cảnh phân tích, không trích dẫn [ref:N] cho phần này)\n"
                      + (fallback as any[]).map((c) => `---\n${c.content}`).join("\n");
                    emit({ type: "step", step: "kb", status: "done", label: `Đã tải ${fallback.length} đoạn từ KB (fallback)` });
                  } else {
                    emit({ type: "step", step: "kb", status: "done", label: "Không tìm thấy nội dung trong KB" });
                  }
                }
              }
            }
          } catch { emit({ type: "step", step: "kb", status: "error", label: "Lỗi khi truy vấn Knowledge Base" }); }
        }

        let financialsCtx = "";
        if (syms.length > 0 && enabledTools.includes("financials")) {
          emit({ type: "step", step: "financials", status: "loading", label: `Đang lấy tài chính ${syms.join(", ")}...` });
          const parts = await Promise.all(syms.map(s => buildFinancialsContext(s, registry)));
          financialsCtx = parts.join("\n\n");
          await Promise.all(syms.map(s => buildSymbolSources(s, sources)));
          emit({ type: "step", step: "financials", status: "done", label: `Tài chính: ${syms.join(", ")}` });
        }

        // ── Build grounded system prompt ─────────────────────────────────────

        const basePrompt = cleanPrompt.trim()
          || template?.system_prompt
          || "Bạn là trợ lý phân tích chứng khoán Việt Nam.";
        console.log(`[run-agent] prompt source: ${cleanPrompt.trim() ? "custom" : template?.system_prompt ? "template" : "fallback"}`);

        // Anti-hallucination grounding rules — injected after user prompt, before data
        const GROUNDING_RULES = `

## ══ QUY TẮC BẮT BUỘC TUYỆT ĐỐI ══

**ĐỊNH DẠNG OUTPUT — BẮT BUỘC**
- Chỉ dùng **Markdown thuần** (##, ###, -, **, *italic*)
- TUYỆT ĐỐI KHÔNG dùng HTML tags (<div>, <span>, <a>, <ul>, <li>, <br>, <style>, v.v.)
- TUYỆT ĐỐI KHÔNG dùng inline CSS hay style attributes
- Nếu muốn link: dùng [label](url) — KHÔNG dùng <a href="...">

**CHỈ VIẾT NHỮNG GÌ CÓ TRONG DỮ LIỆU — QUY TẮC CỐT LÕI**
- Chỉ được đề cập đến thông tin, số liệu, sự kiện XUẤT HIỆN TRỰC TIẾP trong phần "NGUỒN DỮ LIỆU" bên dưới
- Nếu một chủ đề KHÔNG có trong dữ liệu → **bỏ qua hoàn toàn**, không nhắc đến, không viết "Chưa có dữ liệu về X"
- KHÔNG dùng kiến thức nền, KHÔNG ước tính, KHÔNG nội suy từ training data
- Ví dụ: nếu không có dữ liệu insider VCB → không viết gì về insider VCB, bỏ hẳn mục đó
- Nếu NGUỒN DỮ LIỆU ghi "*Không có số liệu tài chính*" → KHÔNG tạo bảng tài chính, bỏ hẳn mục đó

**BẢNG DỮ LIỆU — GIỮ ĐÚNG ĐỊNH DẠNG NGUỒN**
- KHÔNG được transpose, pivot, hay reformat lại bảng từ nguồn dữ liệu sang cấu trúc khác
- Nếu nguồn có bảng "Năm | Doanh thu | LNST | ..." thì dùng ĐÚNG cấu trúc đó, không chuyển thành "Chỉ tiêu | 2023 | 2024 | ..."
- Ô "—" trong bảng nghĩa là không có data — KHÔNG được điền số vào ô đó

**TRÍCH DẪN NGUỒN — BẮT BUỘC VỚI MỌI SỐ LIỆU**
- Mỗi con số, phần trăm, giá trị cụ thể PHẢI có token [ref:N] liền sau
- Token [ref:N] đã có sẵn trong NGUỒN DỮ LIỆU — chỉ được dùng những ref đó, KHÔNG tự bịa thêm
- Ví dụ đúng: "VCB đóng cửa tại **64,200đ** phiên 2026-05-28 [ref:3]"
- Ví dụ SAI: "VCB đóng cửa tại **64,200đ**" (thiếu ref) hoặc "ROE khoảng 20%" (không có trong data)

**THỜI GIAN — CHÍNH XÁC**
- Mỗi dòng giá có "phiên YYYY-MM-DD" — PHẢI dùng đúng ngày đó, không được viết "phiên gần nhất" hay "hôm nay"
- Nếu dữ liệu giá ghi "Chưa có dữ liệu trong DB" → bỏ qua mục giá hoàn toàn

**TUÂN THỦ PHÁP LÝ**
- KHÔNG khuyến nghị mua/bán bất kỳ cổ phiếu nào
- Cuối output PHẢI có: *"Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019"*`;

        const systemPrompt = basePrompt + GROUNDING_RULES + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN — CHỈ DÙNG CÁC SỐ LIỆU NÀY
Ngày phân tích: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}
Dữ liệu giá/chỉ số chỉ được hiển thị nếu ≤ ${PRICE_MAX_AGE_DAYS} ngày tuổi. Nếu ghi "Chưa có dữ liệu" → không suy đoán.
═══════════════════════════════════════
${priceCtx}${newsCtx}${portfolioCtx}${financialsCtx}${kbCtx}
═══════════════════════════════════════
HẾT NGUỒN DỮ LIỆU — KHÔNG ĐƯỢC DÙNG BẤT KỲ SỐ LIỆU NÀO NGOÀI PHẦN TRÊN
═══════════════════════════════════════`;

        const symList = syms.length > 0 ? syms.join(", ") : null;
        const userMessage = symList
          ? `Phân tích ${syms.length > 1 ? `các cổ phiếu **${symList}**` : `cổ phiếu **${symList}**`} CHỈ dựa trên NGUỒN DỮ LIỆU XÁC NHẬN ở trên.${syms.length > 1 ? ` Phân tích từng mã riêng biệt theo thứ tự: ${symList}.` : ""} Với chỉ tiêu nào KHÔNG có trong dữ liệu → bỏ qua hoàn toàn, không đề cập. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`
          : `Thực hiện nhiệm vụ CHỈ dựa trên NGUỒN DỮ LIỆU XÁC NHẬN ở trên. Thông tin nào không có trong dữ liệu → bỏ qua hoàn toàn. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

        // ── Stream LLM (OpenAI or Anthropic based on agent.model) ───────────

        let { provider, apiModel } = MODEL_MAP[agent.model ?? ""] ?? DEFAULT_MODEL;

        // Check API key availability — fall back to gpt-4o-mini if key missing
        if (provider === "anthropic" && !ANTHROPIC_API_KEY) {
          console.warn(`[run-agent] ANTHROPIC_API_KEY not set, falling back to gpt-4o-mini`);
          provider = "openai";
          apiModel  = "gpt-4o-mini";
          emit({ type: "step", step: "gpt", status: "loading", label: `⚠ ${agent.model} chưa có API key → dùng GPT-4o mini` });
        } else {
          emit({ type: "step", step: "gpt", status: "loading", label: `Đang phân tích với ${apiModel}...` });
        }

        let aiRes: Response;
        if (provider === "anthropic" && ANTHROPIC_API_KEY) {
          aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: apiModel,
              max_tokens: 2000,
              temperature: 0,
              system: systemPrompt,
              messages: [{ role: "user", content: userMessage }],
              stream: true,
            }),
          });
          if (!aiRes.ok) throw new Error(`Anthropic ${aiRes.status}: ${await aiRes.text()}`);
        } else {
          // OpenAI (default fallback for Gemini too)
          aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: apiModel,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
              ],
              max_tokens: 2000,
              temperature: 0,      // 0 = deterministic, no hallucination
              stream: true,
              stream_options: { include_usage: true },
            }),
          });
          if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}: ${await aiRes.text()}`);
        }

        const gptReader = aiRes.body!.getReader();
        const gptDec    = new TextDecoder();
        let fullOutput = "";
        let gptBuf     = "";
        let tokens     = 0;

        while (true) {
          const { done, value } = await gptReader.read();
          // Decode kể cả khi done=true để flush byte cuối cùng
          if (value) gptBuf += gptDec.decode(value, { stream: !done });
          const lines = gptBuf.split("\n");
          // Nếu stream chưa kết thúc, giữ lại dòng cuối chưa hoàn chỉnh
          gptBuf = done ? "" : (lines.pop() ?? "");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);
              // Anthropic SSE format
              if (provider === "anthropic") {
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  const chunk = parsed.delta.text ?? "";
                  if (chunk) { fullOutput += chunk; emit({ type: "chunk", text: chunk }); }
                }
                if (parsed.type === "message_delta" && parsed.usage) {
                  tokens = (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0);
                }
              } else {
                // OpenAI SSE format
                const chunk = parsed.choices?.[0]?.delta?.content ?? "";
                if (chunk) { fullOutput += chunk; emit({ type: "chunk", text: chunk }); }
                if (parsed.usage?.total_tokens) tokens = parsed.usage.total_tokens;
              }
            } catch { /* ignore */ }
          }
          if (done) break;
        }

        emit({ type: "step", step: "gpt", status: "done", label: "Phân tích hoàn tất" });

        // Strip HTML if LLM ignored markdown-only instruction
        if (fullOutput.includes("<div") || fullOutput.includes("<span") || fullOutput.includes("<a ")) {
          fullOutput = fullOutput
            // Convert <a href="url">text</a> → [text](url)
            .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
            // Convert <strong>text</strong> / <b>text</b> → **text**
            .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
            // Convert <em>text</em> / <i>text</i> → *text*
            .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
            // Convert <li> → bullet
            .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1")
            // Convert <br> → newline
            .replace(/<br\s*\/?>/gi, "\n")
            // Strip remaining HTML tags
            .replace(/<[^>]+>/g, "")
            // Clean up extra whitespace
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          // Re-emit cleaned output as a correction chunk
          emit({ type: "reset_output", output: fullOutput });
        }

        // Scan refs from pre-validation output — must happen before validation
        // because the validation pass may strip [ref:N] tokens from text
        const preValidationRefs = new Set<number>();
        for (const m of fullOutput.matchAll(/\[ref:(\d+)\]/g)) {
          preValidationRefs.add(parseInt(m[1]));
        }

        // ── Pass 2: Validation — strip claims not grounded in source data ─────
        emit({ type: "step", step: "validate", status: "loading", label: "Đang xác minh nguồn dữ liệu..." });
        try {
          // financialsCtx first so it's never truncated — it contains the exact numbers
          // the LLM used; without it the validator would blank out valid financial rows.
          const sourceData = [financialsCtx, portfolioCtx, priceCtx, newsCtx]
            .filter(Boolean).join("\n").substring(0, 25000);

          // Protect [ref:N] tokens from validator by replacing with unique placeholders
          // LLM tends to strip or reformat [ref:N] even when instructed not to
          const refPlaceholders: Record<string, string> = {};
          const protectedOutput = fullOutput.replace(/\[ref:(\d+)\]/g, (_m, n) => {
            const ph = `REFTOKEN${n}END`;
            refPlaceholders[ph] = `[ref:${n}]`;
            return ph;
          });

          const valSystem = `Bạn là công cụ kiểm tra tính xác thực của báo cáo phân tích tài chính.
Nhiệm vụ duy nhất: nhận OUTPUT và NGUỒN DỮ LIỆU, trả về OUTPUT đã loại bỏ mọi câu chứa con số hoặc thông tin cụ thể KHÔNG xuất hiện trong NGUỒN DỮ LIỆU.

QUY TẮC:
1. Giữ nguyên 100% các token dạng REFTOKENxEND — không xóa, không sửa
2. Xóa toàn bộ câu/mệnh đề chứa số liệu cụ thể (giá, %, tỷ đồng, điểm số) nếu số đó KHÔNG có trong NGUỒN DỮ LIỆU
3. Giữ nguyên câu phân tích định tính thuần túy (không chứa số cụ thể)
4. Giữ nguyên cấu trúc Markdown (##, ###, -, **)
5. Nếu một mục (##, ###) bị xóa hết nội dung → xóa luôn tiêu đề mục đó
6. KHÔNG thêm nội dung mới, KHÔNG giải thích — chỉ trả về text đã làm sạch
7. TUYỆT ĐỐI KHÔNG thay đổi bất kỳ dòng nào trong bảng Markdown (dòng bắt đầu bằng |) — kể cả dòng header, dòng separator (|---|), và dòng dữ liệu. Giữ nguyên 100% cấu trúc và nội dung của toàn bộ bảng.
8. KHÔNG thay thế nội dung ô bảng bằng "---" hay dấu gạch ngang — nếu muốn loại bỏ, xóa cả dòng, không bao giờ thay thế từng ô`;

          const valUser = `NGUỒN DỮ LIỆU:\n${sourceData}\n\nOUTPUT CẦN KIỂM TRA:\n${protectedOutput}`;

          const valRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{ role: "system", content: valSystem }, { role: "user", content: valUser }],
              temperature: 0,
              max_tokens: 2000,
            }),
          });

          if (valRes.ok) {
            const valJson = await valRes.json();
            let validated = valJson.choices?.[0]?.message?.content?.trim() ?? "";
            // Restore [ref:N] tokens from placeholders
            for (const [ph, ref] of Object.entries(refPlaceholders)) {
              validated = validated.replaceAll(ph, ref);
            }
            const minLen = Math.max(50, fullOutput.length * 0.10);
            if (validated && validated.length >= minLen && validated !== fullOutput) {
              fullOutput = validated;
              emit({ type: "reset_output", output: fullOutput });
            }
          }
          emit({ type: "step", step: "validate", status: "done", label: "Đã xác minh nguồn dữ liệu" });
        } catch {
          emit({ type: "step", step: "validate", status: "done", label: "Xác minh (bỏ qua lỗi)" });
        }

        const durationMs = Date.now() - startedAt;

        // ── Extract metadata ──────────────────────────────────────────────────

        const outLines = fullOutput.split("\n").map(l => l.trim()).filter(Boolean);
        let title = agent.name;
        for (const line of outLines) {
          const cleaned = line.replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "").replace(/\*\*/g, "").trim();
          if (cleaned.length >= 10) { title = cleaned.substring(0, 100); break; }
        }
        const summary   = fullOutput.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").split("\n").filter(l => l.trim()).slice(1, 4).join(" ").substring(0, 200);
        const extracted = extractTickers(fullOutput);
        const tickers = [
          ...syms,
          ...extracted.filter(t => !syms.includes(t)),
        ].slice(0, 8);
        const impact    = inferImpactScore(fullOutput, agent.template_id);

        // ── Persist ───────────────────────────────────────────────────────────

        emit({ type: "step", step: "save", status: "loading", label: "Đang lưu vào Inbox..." });

        await sb.from("agent_runs").update({
          status: "completed", output: fullOutput, tokens_used: tokens,
          duration_ms: durationMs, finished_at: new Date().toISOString(),
        }).eq("id", run.id);

        // Use pre-validation refs (scanned before validation pass may have stripped them)
        const regArray = registry.toArray().filter(r => preValidationRefs.has(r.index));

        // Keep sources that are either cited via [ref:N] OR are news articles (always show)
        const usedUrls = new Set(regArray.map(r => r.url));
        const seenUrlsPersist = new Set<string>();
        const uniqueSourcesPersist: Source[] = sources.filter(s => {
          if (!s.url) return false;
          if (s.type !== "news" && !usedUrls.has(s.url)) return false; // non-news: must be cited
          if (seenUrlsPersist.has(s.url)) return false;                 // duplicate → drop
          seenUrlsPersist.add(s.url);
          return true;
        });

        // Fill gaps: for any used ref that has no source entry yet, auto-add from registry
        for (const ref of regArray) {
          if (!seenUrlsPersist.has(ref.url)) {
            uniqueSourcesPersist.push({ type: "exchange", title: ref.label, url: ref.url, source: "FireAnt" });
            seenUrlsPersist.add(ref.url);
          }
        }

        // Ensure summary is never empty (NOT NULL constraint)
        const safeSummary = summary.trim() || fullOutput.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").replace(/\n/g, " ").trim().substring(0, 200);

        const { data: brief, error: briefErr } = await sb.from("briefs").insert({
          user_id: user.id, agent_id, agent_run_id: run.id,
          type: agent.template_id, title, summary: safeSummary, content: fullOutput,
          impact_score: impact, tickers, is_read: false,
          sources: uniqueSourcesPersist,
          refs: regArray,
        }).select("id").single();

        if (briefErr) {
          console.error("[run-agent] briefs.insert error:", JSON.stringify(briefErr));
        }

        try {
          await sb.from("agents").update({
            last_run_at: new Date().toISOString(),
            run_count: (agent.run_count ?? 0) + 1,
          }).eq("id", agent_id);
        } catch { /* non-critical */ }

        emit({ type: "step", step: "save", status: "done", label: "Đã lưu vào Inbox" });

        // Send email only if agent.email_notify = true (set in Agent Studio)
        if (RESEND_API_KEY && user.email && agent.email_notify === true) {
          try {
            const { data: userProfile } = await sb
              .from("user_profiles")
              .select("full_name")
              .eq("user_id", user.id)
              .single();
            const userName = userProfile?.full_name ?? user.email?.split("@")[0] ?? "";

            emit({ type: "step", step: "email_send", status: "loading", label: "Đang gửi email..." });
            await sendBriefEmail(user.email, userName, agent.name, title, fullOutput, regArray);
            emit({ type: "step", step: "email_send", status: "done", label: `Email gửi tới ${user.email}` });
          } catch (emailErr) {
            console.error("Email send failed:", emailErr);
            emit({ type: "step", step: "email_send", status: "error", label: `Lỗi gửi email: ${String(emailErr)}` });
          }
        }
        // Emit registry (numbered refs) + sources list (reuse already-deduplicated arrays)
        if (regArray.length > 0) {
          emit({ type: "ref_registry", refs: regArray });
        }
        if (uniqueSourcesPersist.length > 0) {
          emit({ type: "sources", sources: uniqueSourcesPersist });
        }

        emit({ type: "done", title, brief_id: brief?.id, run_id: run.id, tokens, duration_ms: durationMs });

      } catch (err) {
        const durationMs = Date.now() - startedAt;
        try {
          await sb.from("agent_runs").update({
            status: "failed", error: String(err),
            duration_ms: durationMs, finished_at: new Date().toISOString(),
          }).eq("id", run.id);
        } catch { /* ignore */ }
        emit({ type: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
});
