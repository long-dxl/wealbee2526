/**
 * run-agent — Execute a user agent, generate output, push to briefs inbox
 *
 * POST { agent_id: string }
 * Headers: Authorization: Bearer <user_jwt>
 *
 * Response: { ok: true, run_id, brief_id, title, tokens }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function buildNewsContext(sources?: Source[], registry?: SourceRegistry, targetSyms?: string[], filterSources?: string[]): Promise<string> {
  try {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    const baseQuery = () => {
      let q = sb
        .from("market_news")
        .select("title, content_summary, label, impact_score, affected_symbols, published_at, article_url, source")
        .not("label", "is", null)
        .neq("label", "trash")
        .gte("published_at", since);
      if (filterSources && filterSources.length > 0) q = q.in("source", filterSources);
      return q;
    };

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


// ─── Tool definitions & execution (true function-calling) ────────────────────

const OPENAI_TOOL_DEFS: Record<string, object> = {
  price_feed: {
    type: "function",
    function: {
      name: "price_feed",
      description: "Lấy giá đóng cửa mới nhất của các cổ phiếu VN30 và chỉ số VNINDEX, HNX",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  news_feed: {
    type: "function",
    function: {
      name: "news_feed",
      description: "Lấy tin tức tài chính 48h gần nhất. Dùng symbols để lọc theo mã cổ phiếu cụ thể.",
      parameters: {
        type: "object",
        properties: {
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Danh sách mã cổ phiếu cần lọc tin (ví dụ: ['VCB','HPG']). Để trống để lấy tin thị trường chung.",
          },
        },
        required: [],
      },
    },
  },
  financials: {
    type: "function",
    function: {
      name: "financials",
      description: "Lấy báo cáo tài chính 4 năm (doanh thu, LNST, EPS, P/E, ROE...), lịch sử cổ tức và giao dịch insider của một mã cổ phiếu",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Mã cổ phiếu cần tra cứu, ví dụ: 'VCB'" },
        },
        required: ["symbol"],
      },
    },
  },
  portfolio_read: {
    type: "function",
    function: {
      name: "portfolio_read",
      description: "Lấy danh mục đầu tư hiện tại của người dùng: holdings, giá vốn, P&L",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  kb_search: {
    type: "function",
    function: {
      name: "kb_search",
      description: "Tìm kiếm thông tin trong Knowledge Base đã cấu hình của người dùng",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Câu hỏi hoặc từ khóa cần tìm trong Knowledge Base" },
        },
        required: ["query"],
      },
    },
  },
};

function getAgentToolDefs(enabled: string[], hasKb: boolean): object[] {
  const defs: object[] = [];
  for (const name of ["price_feed", "news_feed", "financials", "portfolio_read"]) {
    if (enabled.includes(name) && OPENAI_TOOL_DEFS[name]) defs.push(OPENAI_TOOL_DEFS[name]);
  }
  if (hasKb) defs.push(OPENAI_TOOL_DEFS.kb_search);
  return defs;
}

// Anthropic tool format (input_schema instead of parameters)
function toAnthropicToolDef(t: any) {
  const fn = t.function;
  return { name: fn.name, description: fn.description, input_schema: fn.parameters };
}

async function executeToolCall(
  name: string,
  args: Record<string, any>,
  registry: SourceRegistry,
  sources: Source[],
  userId: string,
  kbDocIds: string[],
  newsFilter?: string[],
): Promise<string> {
  if (name === "price_feed") {
    return (await buildPriceContext(registry)) || "Không có dữ liệu giá trong hệ thống";
  }
  if (name === "news_feed") {
    const syms: string[] = Array.isArray(args.symbols) ? args.symbols.map(String) : [];
    const ctx = await buildNewsContext(sources, registry, syms.length ? syms : undefined, newsFilter);
    return ctx || "Không có tin tức trong 48h gần nhất";
  }
  if (name === "financials") {
    const sym = String(args.symbol ?? "").toUpperCase();
    if (!sym) return "Lỗi: thiếu tham số symbol";
    const ctx = await buildFinancialsContext(sym, registry);
    await buildSymbolSources(sym, sources);
    return ctx || `Không có dữ liệu tài chính cho ${sym} trong hệ thống`;
  }
  if (name === "portfolio_read") {
    return (await buildPortfolioContext(userId)) || "Chưa có danh mục đầu tư";
  }
  if (name === "kb_search") {
    if (!kbDocIds.length) return "Knowledge Base chưa được cấu hình cho agent này";
    const query = String(args.query ?? "");
    try {
      const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
      });
      const embedJson = await embedRes.json();
      const embedding = embedJson.data?.[0]?.embedding;
      if (!embedding) return "Lỗi tạo embedding";
      const { data: chunks } = await sb.rpc("match_knowledge_chunks_by_docs", {
        query_embedding: embedding, match_user_id: userId,
        doc_ids: kbDocIds, match_count: 6, match_threshold: 0.35,
      });
      if (chunks?.length) {
        return "## Kết quả từ Knowledge Base\n(Dùng làm ngữ cảnh, không trích dẫn [ref:N])\n"
          + (chunks as any[]).map(c => `---\n${c.content}`).join("\n");
      }
      // Fallback: first chunks of each doc
      const { data: fallback } = await sb.from("knowledge_chunks")
        .select("content").in("document_id", kbDocIds).eq("user_id", userId)
        .order("chunk_index", { ascending: true }).limit(kbDocIds.length * 2);
      return fallback?.length
        ? "## Kết quả từ Knowledge Base\n" + (fallback as any[]).map(c => `---\n${c.content}`).join("\n")
        : "Không tìm thấy nội dung liên quan trong Knowledge Base";
    } catch (e) { return `Lỗi KB search: ${String(e)}`; }
  }
  return `Tool không được hỗ trợ: ${name}`;
}

function toolStepLabel(name: string, args: Record<string, any>): string {
  switch (name) {
    case "price_feed":     return "Giá cổ phiếu & chỉ số thị trường";
    case "news_feed": {
      const s: string[] = args.symbols ?? [];
      return s.length ? `Tin tức ${s.join(", ")} (48h)` : "Tin tức thị trường (48h)";
    }
    case "financials":     return `Báo cáo tài chính: ${args.symbol ?? ""}`;
    case "portfolio_read": return "Danh mục đầu tư";
    case "kb_search":      return `Knowledge Base: "${String(args.query ?? "").slice(0, 40)}"`;
    default: return name;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
    .select("id, user_id, template_id, name, description, system_prompt, tools, run_count, model, email_notify, kb_document_ids, target_symbols, news_sources")
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
        const enabledTools: string[] = agent.tools ?? [];

        const SYM_PREFIX  = "__TARGET_SYMBOL__: ";
        const rawPrompt   = agent.system_prompt ?? "";
        const firstLine   = rawPrompt.split("\n")[0] ?? "";
        const savedSym    = firstLine.startsWith(SYM_PREFIX) ? firstLine.slice(SYM_PREFIX.length).trim() : null;
        const cleanPrompt = savedSym ? rawPrompt.replace(/^__TARGET_SYMBOL__:[^\n]*\n\n?/, "") : rawPrompt;

        const syms: string[] = target_symbols.length > 0
          ? target_symbols
          : savedSym ? [savedSym] : [];

        // ── Sources & registry ────────────────────────────────────────────────

        const sources: Source[] = [];
        const registry = new SourceRegistry();

        // ── Build tool definitions based on agent's enabled tools ─────────────

        const kbDocIds: string[] = agent.kb_document_ids ?? [];
        const toolDefs = getAgentToolDefs(enabledTools, kbDocIds.length > 0);

        // For portfolio_health template: add portfolio_read automatically if not already
        if (agent.template_id === "portfolio_health" && !enabledTools.includes("portfolio_read")) {
          toolDefs.push(OPENAI_TOOL_DEFS.portfolio_read);
        }

        // For daily_digest: ensure news_feed and price_feed are always available
        if (agent.template_id === "daily_digest") {
          if (!enabledTools.includes("news_feed")) toolDefs.push(OPENAI_TOOL_DEFS.news_feed);
          if (!enabledTools.includes("price_feed")) toolDefs.push(OPENAI_TOOL_DEFS.price_feed);
        }

        // ── Build system prompt (no pre-fetched data — data comes from tools) ─

        const DEFAULT_DAILY_DIGEST_PROMPT = `Bạn là trợ lý phân tích chứng khoán Wealbee. Nhiệm vụ: tạo bản tin thị trường hàng ngày.

Cấu trúc bản tin:
1. **Tổng quan thị trường** — VN-Index, HNX, top tăng/giảm trong phiên gần nhất
2. **Tin tức nổi bật** — các tin có tác động cao nhất trong 24-48h, kèm nguồn và ngày đăng
3. **Danh mục đáng chú ý** — nếu có tin liên quan mã trong danh sách theo dõi
4. Disclaimer pháp lý

Nguyên tắc:
- Chỉ viết dữ liệu có trong kết quả tool, KHÔNG bịa số liệu
- Mỗi số liệu phải có [ref:N] liền sau
- Tin tức phải có tên nguồn và ngày đăng rõ ràng`;

        const basePrompt = cleanPrompt.trim()
          || (agent.template_id === "daily_digest" ? DEFAULT_DAILY_DIGEST_PROMPT : "")
          || template?.system_prompt
          || "Bạn là trợ lý phân tích chứng khoán Việt Nam.";
        console.log(`[run-agent] prompt source: ${cleanPrompt.trim() ? "custom" : template?.system_prompt ? "template" : "fallback"}, tools: [${enabledTools.join(",")}]`);

        const isDailyDigest = agent.template_id === "daily_digest";

        const GROUNDING_RULES_FORMAT = isDailyDigest
          ? `**ĐỊNH DẠNG MÀU SẮC — KHI NGƯỜI DÙNG YÊU CẦU TÔ MÀU**
- Dùng HTML inline: \`<span style="color:red">con số</span>\` cho màu đỏ
- Dùng \`<span style="color:green">con số</span>\` cho màu xanh, tương tự với các màu khác
- CHỈ wrap phần text cần tô màu, không wrap cả câu
`
          : `**ĐỊNH DẠNG OUTPUT — BẮT BUỘC**
- Chỉ dùng **Markdown thuần** (##, ###, -, **, *italic*)
- TUYỆT ĐỐI KHÔNG dùng HTML tags (<div>, <span>, <a>, <ul>, <li>, <br>, <style>, v.v.)
- Nếu muốn link: dùng [label](url) — KHÔNG dùng <a href="...">
`;

        const GROUNDING_RULES = `

## ══ QUY TẮC BẮT BUỘC TUYỆT ĐỐI ══
${GROUNDING_RULES_FORMAT}
**SỬ DỤNG TOOL — BẮT BUỘC${toolDefs.length === 0 ? " (không có tool nào được bật)" : ""}**
${toolDefs.length > 0
  ? `- Bắt buộc gọi tool để lấy dữ liệu TRƯỚC KHI viết phân tích
- Gọi đủ tool cần thiết: price_feed cho giá/chỉ số, news_feed cho tin tức, financials cho BCTC
- Chỉ sử dụng dữ liệu từ kết quả tool — KHÔNG dùng kiến thức nền hay số liệu từ training data`
  : `- Không có tool nào được bật — hãy thông báo người dùng bật tool trong Agent Studio để lấy dữ liệu thực tế`}

**CHỈ VIẾT NHỮNG GÌ CÓ TRONG DỮ LIỆU**
- Chỉ được đề cập thông tin, số liệu XUẤT HIỆN TRỰC TIẾP trong kết quả tool
- Nếu chủ đề KHÔNG có trong dữ liệu → bỏ qua hoàn toàn, không nhắc đến
- KHÔNG ước tính, KHÔNG nội suy từ training data

**BẢNG DỮ LIỆU — GIỮ ĐÚNG ĐỊNH DẠNG NGUỒN**
- KHÔNG transpose/pivot/reformat bảng từ nguồn dữ liệu
- Ô "—" trong bảng = không có data — KHÔNG điền số vào ô đó

**TRÍCH DẪN NGUỒN — BẮT BUỘC VỚI MỌI SỐ LIỆU**
- Mỗi con số, phần trăm, giá trị cụ thể PHẢI có token [ref:N] liền sau
- Token [ref:N] có sẵn trong kết quả tool — chỉ dùng những ref đó, KHÔNG tự bịa thêm

**THỜI GIAN — CHÍNH XÁC**
- Mỗi dòng giá có "phiên YYYY-MM-DD" — PHẢI dùng đúng ngày đó
- Nếu dữ liệu giá ghi "Chưa có dữ liệu trong DB" → bỏ qua mục giá hoàn toàn

**TUÂN THỦ PHÁP LÝ**
- KHÔNG khuyến nghị mua/bán bất kỳ cổ phiếu nào
- Cuối output PHẢI có: *"Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019"*`;

        const systemPrompt = basePrompt + GROUNDING_RULES;

        const symList = syms.length > 0 ? syms.join(", ") : null;

        // daily_digest without specific symbols → market overview prompt
        const userMessage = symList
          ? `Phân tích ${syms.length > 1 ? `các cổ phiếu **${symList}**` : `cổ phiếu **${symList}**`}.${toolDefs.length > 0 ? ` Hãy gọi tool để lấy dữ liệu giá, tin tức, tài chính cần thiết TRƯỚC KHI viết phân tích.${syms.length > 1 ? ` Gọi financials riêng cho từng mã: ${symList}.` : ""}` : ""} Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`
          : isDailyDigest
          ? `Tạo bản tin hàng ngày theo đúng yêu cầu đã cấu hình.${toolDefs.length > 0 ? " Gọi news_feed để lấy tin tức mới nhất, price_feed để lấy giá và chỉ số thị trường." : ""} Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`
          : `Thực hiện nhiệm vụ.${toolDefs.length > 0 ? " Hãy gọi tool để lấy dữ liệu cần thiết." : ""} Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

        // ── Model selection ───────────────────────────────────────────────────

        let { provider, apiModel } = MODEL_MAP[agent.model ?? ""] ?? DEFAULT_MODEL;
        if (provider === "anthropic" && !ANTHROPIC_API_KEY) {
          console.warn(`[run-agent] ANTHROPIC_API_KEY not set, falling back to gpt-4o-mini`);
          provider = "openai";
          apiModel  = "gpt-4o-mini";
          emit({ type: "step", step: "gpt", status: "loading", label: `⚠ ${agent.model} chưa có API key → dùng GPT-4o mini` });
        } else {
          emit({ type: "step", step: "gpt", status: "loading", label: `Đang phân tích với ${apiModel}...` });
        }

        // ── True tool-call loop ───────────────────────────────────────────────
        // LLM decides WHEN and WHICH tools to call. No pre-fetching.

        const messages: any[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ];

        let fullOutput = "";
        let tokens = 0;
        const MAX_TOOL_ITERS = 8; // max tool-call rounds before forcing final answer

        for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
          // ── OpenAI tool-calling (non-streaming for intermediate, streaming for final) ──
          if (provider === "openai" || (provider === "anthropic" && toolDefs.length > 0)) {
            const useOpenAI = provider === "openai" || !ANTHROPIC_API_KEY;
            const callModel = useOpenAI ? apiModel : "gpt-4o-mini"; // use OpenAI for tool loop even if final is Anthropic

            const callBody: Record<string, any> = {
              model: callModel,
              messages,
              temperature: 0,
              max_tokens: 2000,
            };
            if (toolDefs.length > 0) {
              callBody.tools = toolDefs;
              callBody.tool_choice = "auto";
            }

            const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify(callBody),
            });
            if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}: ${await aiRes.text()}`);

            const json = await aiRes.json();
            tokens += json.usage?.total_tokens ?? 0;
            const assistantMsg = json.choices?.[0]?.message;

            if (!assistantMsg?.tool_calls?.length) {
              // No tool calls → this is the final answer
              fullOutput = assistantMsg?.content ?? "";
              emit({ type: "chunk", text: fullOutput });
              break;
            }

            // Has tool calls → execute all in parallel
            messages.push(assistantMsg);

            const toolResults = await Promise.all(
              (assistantMsg.tool_calls as any[]).map(async (tc) => {
                const name: string = tc.function.name;
                let args: Record<string, any> = {};
                try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* ignore */ }

                const label = toolStepLabel(name, args);
                emit({ type: "step", step: name, status: "loading", label: `Đang lấy: ${label}...` });

                let content: string;
                try {
                  content = await executeToolCall(
                    name, args, registry, sources, user.id, kbDocIds,
                    (agent as any).news_sources ?? undefined,
                  );
                } catch (e) {
                  content = `Lỗi thực thi tool ${name}: ${String(e)}`;
                }

                emit({ type: "step", step: name, status: "done", label });
                return { role: "tool", tool_call_id: tc.id, content };
              })
            );

            messages.push(...toolResults);

          } else {
            // ── Anthropic streaming (no tools or Anthropic-native final answer) ──
            const anthropicMessages = messages
              .filter(m => m.role !== "system")
              .map(m => ({ role: m.role, content: m.content ?? "" }));

            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
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
                messages: anthropicMessages,
                stream: true,
              }),
            });
            if (!aiRes.ok) throw new Error(`Anthropic ${aiRes.status}: ${await aiRes.text()}`);

            const reader = aiRes.body!.getReader();
            const dec = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (value) buf += dec.decode(value, { stream: !done });
              const lines = buf.split("\n");
              buf = done ? "" : (lines.pop() ?? "");
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const parsed = JSON.parse(line.slice(6).trim());
                  if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                    const chunk = parsed.delta.text ?? "";
                    if (chunk) { fullOutput += chunk; emit({ type: "chunk", text: chunk }); }
                  }
                  if (parsed.type === "message_delta" && parsed.usage) {
                    tokens = (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0);
                  }
                } catch { /* ignore */ }
              }
              if (done) break;
            }
            break; // Anthropic streaming always produces final answer
          }
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
          // Collect source data from tool call results in messages array
          const toolResults = messages
            .filter(m => m.role === "tool")
            .map(m => (typeof m.content === "string" ? m.content : ""))
            .filter(Boolean);
          const sourceData = toolResults.join("\n").substring(0, 25000);

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
