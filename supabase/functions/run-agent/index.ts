/**
 * run-agent — Execute a user agent, generate output, push to briefs inbox
 *
 * POST { agent_id: string }
 * Headers: Authorization: Bearer <user_jwt>
 *
 * Response: { ok: true, run_id, brief_id, title, tokens }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY  = Deno.env.get("OPENAI_API_KEY")!;
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM      = Deno.env.get("EMAIL_FROM") ?? "Wealbee <no-reply@wealbee.com>";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Build financials context for a specific symbol ──────────────────────────

async function buildFinancialsContext(symbol: string): Promise<string> {
  const lines: string[] = [`\n## Dữ liệu tài chính: ${symbol}`];

  // Financials annual (3 năm gần nhất)
  try {
    const { data: fins } = await sb
      .from("financials_annual")
      .select("year,revenue,net_profit,eps,pe_ratio,pb_ratio,roe,roa,debt_to_equity")
      .eq("symbol", symbol)
      .order("year", { ascending: false })
      .limit(4);

    if (fins?.length) {
      lines.push("\n### Kết quả tài chính theo năm");
      lines.push("| Năm | Doanh thu (tỷ) | LNST (tỷ) | EPS | P/E | P/B | ROE | ROA | D/E |");
      lines.push("|-----|---------------|-----------|-----|-----|-----|-----|-----|-----|");
      for (const f of fins) {
        const rev  = f.revenue   != null ? (Number(f.revenue)    / 1e9).toFixed(0) : "—";
        const np   = f.net_profit != null ? (Number(f.net_profit) / 1e9).toFixed(0) : "—";
        const eps  = f.eps        != null ? Number(f.eps).toLocaleString("vi-VN")   : "—";
        const pe   = f.pe_ratio   != null ? Number(f.pe_ratio).toFixed(1)           : "—";
        const pb   = f.pb_ratio   != null ? Number(f.pb_ratio).toFixed(2)           : "—";
        const roe  = f.roe        != null ? (Number(f.roe) * 100).toFixed(1) + "%" : "—";
        const roa  = f.roa        != null ? (Number(f.roa) * 100).toFixed(2) + "%" : "—";
        const de   = f.debt_to_equity != null ? Number(f.debt_to_equity).toFixed(2) : "—";
        lines.push(`| ${f.year} | ${rev} | ${np} | ${eps} | ${pe} | ${pb} | ${roe} | ${roa} | ${de} |`);
      }
    }
  } catch { /* ignore */ }

  // Dividends (5 kỳ gần nhất)
  try {
    const { data: divs } = await sb
      .from("dividends")
      .select("ex_date,dividend_type,amount,payment_date")
      .eq("symbol", symbol)
      .order("ex_date", { ascending: false })
      .limit(6);

    if (divs?.length) {
      lines.push("\n### Lịch sử cổ tức");
      for (const d of divs) {
        const typeLabel = d.dividend_type === "cash" ? "tiền mặt" : "cổ phiếu";
        const amtLabel  = d.dividend_type === "cash"
          ? `${Number(d.amount).toLocaleString("vi-VN")} đ/CP`
          : `${(Number(d.amount) * 100).toFixed(1)}%`;
        lines.push(`- ${d.ex_date}: ${typeLabel} ${amtLabel}${d.payment_date ? ` (thanh toán ${d.payment_date})` : ""}`);
      }
    }
  } catch { /* ignore */ }

  // Insider transactions (8 giao dịch gần nhất)
  try {
    const { data: ins } = await sb
      .from("insider_transactions")
      .select("trade_date,insider_name,trade_type,volume")
      .eq("symbol", symbol)
      .order("trade_date", { ascending: false })
      .limit(8);

    if (ins?.length) {
      lines.push("\n### Giao dịch nội bộ gần đây");
      for (const t of ins) {
        const vol = t.volume ? `${Number(t.volume).toLocaleString("vi-VN")} CP` : "";
        lines.push(`- ${t.trade_date}: ${t.insider_name} **${t.trade_type === "buy" ? "MUA" : "BÁN"}** ${vol}`);
      }
    }
  } catch { /* ignore */ }

  return lines.length > 1 ? lines.join("\n") : "";
}

// ─── Build price context (tool: price_feed) ──────────────────────────────────

async function buildPriceContext(): Promise<string> {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push(`Ngày: ${today}`);

  try {
    const { data: indices } = await sb
      .from("market_indices")
      .select("index_code, date, close, change_pt, change_pct, volume")
      .in("index_code", ["VNINDEX", "HNX"])
      .order("date", { ascending: false })
      .limit(4);

    if (indices?.length) {
      lines.push("\n## Chỉ số thị trường");
      const seen = new Set<string>();
      for (const idx of indices) {
        if (seen.has(idx.index_code)) continue;
        seen.add(idx.index_code);
        const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
        const pct = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
        const pt  = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
        lines.push(`- ${idx.index_code}: ${Number(idx.close).toLocaleString("vi-VN", { minimumFractionDigits: 2 })} ${arrow} ${pt} (${pct}) [${idx.date}]`);
      }
    }
  } catch { /* ignore */ }

  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, close")
      .order("date", { ascending: false })
      .limit(75);

    if (prices?.length) {
      const bySymbol: Record<string, number[]> = {};
      for (const row of prices) {
        if (!bySymbol[row.symbol]) bySymbol[row.symbol] = [];
        if (bySymbol[row.symbol].length < 2) bySymbol[row.symbol].push(Number(row.close));
      }

      const movers = Object.entries(bySymbol)
        .filter(([, c]) => c.length === 2)
        .map(([sym, [tod, yest]]) => ({
          sym, price: tod, pct: ((tod - yest) / yest) * 100,
        }))
        .sort((a, b) => b.pct - a.pct);

      lines.push("\n## Giá VN30 cuối phiên gần nhất");
      for (const [sym, closes] of Object.entries(bySymbol)) {
        lines.push(`- ${sym}: ${closes[0].toLocaleString("vi-VN")} đ`);
      }

      const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
      const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();
      if (top5up.length) {
        lines.push("\n### Top tăng");
        for (const m of top5up) lines.push(`- ${m.sym}: +${m.pct.toFixed(2)}%`);
      }
      if (top5down.length) {
        lines.push("\n### Top giảm");
        for (const m of top5down) lines.push(`- ${m.sym}: ${m.pct.toFixed(2)}%`);
      }
    }
  } catch { /* ignore */ }

  return lines.join("\n");
}

// ─── Build news context (tool: news_feed) ────────────────────────────────────

async function buildNewsContext(): Promise<string> {
  try {
    const { data: news } = await sb
      .from("market_news")
      .select("title, content_summary, label, impact_score, affected_symbols, published_at")
      .not("label", "is", null)
      .neq("label", "trash")
      .gte("published_at", new Date(Date.now() - 48 * 3600000).toISOString())
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(10);

    if (!news?.length) return "";
    const lines = ["\n## Tin tức thị trường (48h)"];
    for (const n of news) {
      const syms  = n.affected_symbols?.length ? ` [${n.affected_symbols.slice(0, 3).join(",")}]` : "";
      const score = n.impact_score != null ? ` [tác động:${n.impact_score}]` : "";
      lines.push(`- ${n.title}${syms}${score}`);
      if (n.content_summary) lines.push(`  ${n.content_summary.substring(0, 120)}`);
    }
    return lines.join("\n");
  } catch { return ""; }
}

// ─── Send brief email via Resend ─────────────────────────────────────────────

async function sendBriefEmail(toEmail: string, userName: string, agentName: string, title: string, content: string): Promise<void> {
  if (!RESEND_API_KEY || !toEmail) return;

  const SF = "font-family:Helvetica,Arial,sans-serif;";
  const sp = (txt: string, extra = "") =>
    `<span style="${SF}${extra}">${txt}</span>`;

  // Convert markdown tables to HTML before escaping
  function convertTables(text: string): string {
    return text.replace(/((?:^\|.+\|\n?)+)/gm, (block) => {
      const rows = block.trim().split("\n").filter(r => !/^\|[-| :]+\|$/.test(r.trim()));
      if (rows.length < 1) return block;
      let html = `<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;${SF}font-size:13px;">`;
      rows.forEach((row, i) => {
        const cells = row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1);
        const tag = i === 0 ? "th" : "td";
        const style = i === 0
          ? `background:#0849ac;color:#fff;padding:7px 10px;text-align:left;${SF}`
          : `border-bottom:1px solid #e5e9f5;padding:6px 10px;color:#374151;${SF}`;
        html += "<tr>" + cells.map(c => `<${tag} style="${style}">${sp(c.trim())}</${tag}>`).join("") + "</tr>";
      });
      html += "</table>";
      return html;
    });
  }

  const tableConverted = convertTables(content);

  // Convert markdown to email-safe HTML
  const bodyHtml = tableConverted
    .replace(/\*\*(.+?)\*\*/g, `<strong><span style="${SF}">$1</span></strong>`)
    .replace(/^(\d+)\. \*\*(.+?)\*\*(.*)$/gm, `<div style="color:#064bb3;font-size:14px;font-weight:700;margin:16px 0 4px;${SF}">$1. $2$3</div>`)
    .replace(/^(\d+)\. (.+)$/gm,              `<div style="color:#064bb3;font-size:14px;font-weight:700;margin:16px 0 4px;${SF}">$1. $2</div>`)
    .replace(/^### (.+)$/gm, `<div style="color:#1a1a2e;font-size:14px;font-weight:700;margin:14px 0 6px;${SF}">$1</div>`)
    .replace(/^## (.+)$/gm,  `<div style="color:#064bb3;font-size:15px;font-weight:700;margin:16px 0 8px;${SF}">$1</div>`)
    .replace(/^# (.+)$/gm,   `<div style="color:#1a1a2e;font-size:16px;font-weight:700;margin:18px 0 8px;${SF}">$1</div>`)
    .replace(/^- (.+)$/gm,   `<li style="margin:4px 0;${SF}">${sp("$1")}</li>`)
    .replace(/(<li.*<\/li>\n?)+/g, `<ul style="padding-left:20px;margin:8px 0;">$&</ul>`)
    .replace(/\n{2,}/g, `</p><p style="margin:8px 0;${SF}">`)
    .replace(/\n/g, "<br>");

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
        <div style="font-size:18px;font-weight:700;color:#1a1a2e;margin:0 0 18px;font-family:Helvetica,Arial,sans-serif;line-height:1.3;">${title}</div>
        <div style="font-size:14px;line-height:1.8;color:#374151;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;">${bodyHtml}</p>
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
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [toEmail],
      subject: `[Wealbee Agent] ${title}`,
      html,
    }),
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

  let body: { agent_id: string; target_symbol?: string };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { agent_id, target_symbol } = body;
  if (!agent_id) {
    return new Response(JSON.stringify({ error: "agent_id required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Fetch agent + template
  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .select("id, user_id, template_id, name, description, system_prompt, tools, run_count")
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
        const sym         = (target_symbol || savedSym)?.toUpperCase().trim();

        // ── Tool steps ────────────────────────────────────────────────────────

        let priceCtx = `Ngày: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}`;
        if (enabledTools.includes("price_feed")) {
          emit({ type: "step", step: "price_feed", status: "loading", label: "Đang lấy dữ liệu giá..." });
          priceCtx = await buildPriceContext();
          emit({ type: "step", step: "price_feed", status: "done", label: "Dữ liệu giá & chỉ số" });
        }

        let newsCtx = "";
        if (enabledTools.includes("news_feed")) {
          emit({ type: "step", step: "news_feed", status: "loading", label: "Đang lấy tin tức thị trường..." });
          newsCtx = await buildNewsContext();
          emit({ type: "step", step: "news_feed", status: "done", label: "Tin tức thị trường (48h)" });
        }

        let portfolioCtx = "";
        if (agent.template_id === "portfolio_health") {
          emit({ type: "step", step: "portfolio", status: "loading", label: "Đang lấy danh mục đầu tư..." });
          portfolioCtx = await buildPortfolioContext(user.id);
          emit({ type: "step", step: "portfolio", status: "done", label: "Danh mục đầu tư" });
        }

        let financialsCtx = "";
        if (sym && enabledTools.includes("financials")) {
          emit({ type: "step", step: "financials", status: "loading", label: `Đang lấy tài chính ${sym}...` });
          financialsCtx = await buildFinancialsContext(sym);
          emit({ type: "step", step: "financials", status: "done", label: `Tài chính DN: ${sym}` });
        }

        // ── Build prompt ──────────────────────────────────────────────────────

        const basePrompt  = cleanPrompt || template?.system_prompt || "Bạn là trợ lý phân tích chứng khoán Việt Nam.";
        const systemPrompt = basePrompt
          + `\n\n## QUY TẮC BẮT BUỘC\n- KHÔNG khuyến nghị mua/bán cụ thể\n- CHỈ dùng số liệu từ dữ liệu được cung cấp\n- Trả lời bằng tiếng Việt\n\n---\n${priceCtx}${newsCtx}${portfolioCtx}${financialsCtx}`;

        const userMessage = sym
          ? `Hãy phân tích cổ phiếu **${sym}** theo đúng hướng dẫn trong system prompt. Dùng số liệu thực từ dữ liệu được cung cấp, viết bằng tiếng Việt.`
          : `Hãy thực hiện nhiệm vụ của agent theo đúng hướng dẫn trong system prompt, viết bằng tiếng Việt.`;

        // ── Stream OpenAI ─────────────────────────────────────────────────────

        emit({ type: "step", step: "gpt", status: "loading", label: "Đang phân tích..." });

        const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            max_tokens: 1800,
            temperature: 0.4,
            stream: true,
            stream_options: { include_usage: true },
          }),
        });

        if (!gptRes.ok) throw new Error(`OpenAI: ${await gptRes.text()}`);

        const gptReader = gptRes.body!.getReader();
        const gptDec    = new TextDecoder();
        let fullOutput = "";
        let gptBuf     = "";
        let tokens     = 0;

        while (true) {
          const { done, value } = await gptReader.read();
          if (done) break;
          gptBuf += gptDec.decode(value, { stream: true });
          const lines = gptBuf.split("\n");
          gptBuf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);
              const chunk  = parsed.choices?.[0]?.delta?.content ?? "";
              if (chunk) { fullOutput += chunk; emit({ type: "chunk", text: chunk }); }
              if (parsed.usage?.total_tokens) tokens = parsed.usage.total_tokens;
            } catch { /* ignore */ }
          }
        }

        emit({ type: "step", step: "gpt", status: "done", label: "Phân tích hoàn tất" });

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
        const tickers   = sym ? [sym, ...extracted.filter(t => t !== sym)].slice(0, 8) : extracted;
        const impact    = inferImpactScore(fullOutput, agent.template_id);

        // ── Persist ───────────────────────────────────────────────────────────

        emit({ type: "step", step: "save", status: "loading", label: "Đang lưu vào Inbox..." });

        await sb.from("agent_runs").update({
          status: "completed", output: fullOutput, tokens_used: tokens,
          duration_ms: durationMs, finished_at: new Date().toISOString(),
        }).eq("id", run.id);

        const { data: brief } = await sb.from("briefs").insert({
          user_id: user.id, agent_id, agent_run_id: run.id,
          type: agent.template_id, title, summary, content: fullOutput,
          impact_score: impact, tickers, is_read: false,
        }).select("id").single();

        try {
          await sb.from("agents").update({
            last_run_at: new Date().toISOString(),
            run_count: (agent.run_count ?? 0) + 1,
          }).eq("id", agent_id);
        } catch { /* non-critical */ }

        emit({ type: "step", step: "save", status: "done", label: "Đã lưu vào Inbox" });

        // Send email if user has email + RESEND configured + user_settings.email_digest = true
        if (RESEND_API_KEY && user.email) {
          try {
            const { data: userSettings } = await sb
              .from("user_settings")
              .select("email_digest")
              .eq("user_id", user.id)
              .single();

            const shouldEmail = userSettings?.email_digest !== false; // default true

            if (shouldEmail) {
              // Get user's display name
              const { data: userProfile } = await sb
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", user.id)
                .single();
              const userName = userProfile?.full_name ?? user.email?.split("@")[0] ?? "";

              emit({ type: "step", step: "email_send", status: "loading", label: "Đang gửi email..." });
              await sendBriefEmail(user.email, userName, agent.name, title, fullOutput);
              emit({ type: "step", step: "email_send", status: "done", label: `Email gửi tới ${user.email}` });
            }
          } catch { /* non-critical */ }
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
