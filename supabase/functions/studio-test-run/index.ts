/**
 * studio-test-run — Test agent config with REAL data + REAL LLM, no auth required.
 *
 * POST { system_prompt, tools, model, target_symbols }
 * Streams SSE: step | chunk | reset_output | done | error
 * Does NOT save to DB — this is a live preview before saving.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY    = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL_MAP: Record<string, { provider: "openai" | "anthropic"; apiModel: string }> = {
  "gpt-4o-mini":   { provider: "openai",    apiModel: "gpt-4o-mini"       },
  "gpt-4o":        { provider: "openai",    apiModel: "gpt-4o"            },
  "claude-sonnet": { provider: "anthropic", apiModel: "claude-sonnet-4-6" },
  "claude-opus":   { provider: "anthropic", apiModel: "claude-opus-4-7"   },
  "gemini-pro":    { provider: "openai",    apiModel: "gpt-4.1-mini"      },
  "gemini-flash":  { provider: "openai",    apiModel: "gpt-4.1-mini"      },
};
const DEFAULT_MODEL = { provider: "openai" as const, apiModel: "gpt-4.1-mini" };

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_MAX_AGE_DAYS = 5;
const faUrl = (sym: string) => `https://fireant.vn/ma-chung-khoan/${sym}`;

function daysSince(dateStr: string): number {
  const todayUtc = new Date().toISOString().substring(0, 10);
  return Math.round((new Date(todayUtc).getTime() - new Date(dateStr).getTime()) / 86400000);
}

// ── Source registry (numbered refs) ──────────────────────────────────────────

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

// ── RSI calculation (Wilder smoothing) ───────────────────────────────────────

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((p, i) => p - closes[i]);
  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// ── EMA + MACD ────────────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    emas.push(values[i] * k + emas[i - 1] * (1 - k));
  }
  return emas;
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  // MACD line starts from index 25 (need 26 bars for EMA26)
  const macdLine = ema12.slice(25).map((v, i) => v - ema26[i + 25]);
  if (macdLine.length < 9) return null;
  const signalLine = calcEMA(macdLine, 9);
  const last = macdLine.length - 1;
  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram: macdLine[last] - signalLine[last],
  };
}

// ── Technical indicators context (RSI + MACD) ─────────────────────────────────

async function buildTechnicalContext(symbols: string[], tools: string[], registry: SourceRegistry): Promise<string> {
  const needRsi  = tools.includes("rsi");
  const needMacd = tools.includes("macd");
  if (!needRsi && !needMacd) return "";
  if (!symbols.length) return "";

  // Fetch last 40 sessions per symbol (enough for MACD-26 + buffer)
  const { data: rows } = await sb
    .from("prices_daily")
    .select("symbol, date, close")
    .in("symbol", symbols)
    .order("date", { ascending: false })
    .limit(symbols.length * 40);

  // Group by symbol (rows come newest-first, so reverse for calculations)
  const bySymbol: Record<string, { dates: string[]; closes: number[] }> = {};
  for (const row of (rows ?? [])) {
    if (!bySymbol[row.symbol]) bySymbol[row.symbol] = { dates: [], closes: [] };
    bySymbol[row.symbol].dates.push(row.date);
    bySymbol[row.symbol].closes.push(Number(row.close));
  }

  const lines: string[] = ["\n## Chỉ số kỹ thuật"];
  let hasData = false;

  for (const sym of symbols) {
    const entry = bySymbol[sym];
    if (!entry || entry.closes.length < 15) continue;

    // Reverse to get oldest-first order needed for EMA/RSI calculations
    const closesAsc = [...entry.closes].reverse();
    const latestDate = entry.dates[0]; // newest date (index 0 after desc sort)

    if (daysSince(latestDate) > PRICE_MAX_AGE_DAYS) continue;

    const parts: string[] = [];

    if (needRsi) {
      const rsi = calculateRSI(closesAsc);
      if (rsi !== null) {
        const zone = rsi >= 70 ? " ⚠quá mua" : rsi <= 30 ? " ⚠quá bán" : "";
        parts.push(`RSI(14)=${rsi.toFixed(1)}${zone}`);
      }
    }

    if (needMacd) {
      const macd = calculateMACD(closesAsc);
      if (macd !== null) {
        const trend = macd.histogram >= 0 ? "↑" : "↓";
        parts.push(`MACD=${macd.macd.toFixed(2)} | Signal=${macd.signal.toFixed(2)} | Hist ${trend}${Math.abs(macd.histogram).toFixed(2)}`);
      }
    }

    if (parts.length) {
      hasData = true;
      const ref = ` ${registry.add(sym, faUrl(sym))}`;
      lines.push(`- **${sym}**${ref} (phiên ${latestDate}): ${parts.join(" | ")}`);
    }
  }

  return hasData ? lines.join("\n") : "";
}

// ── Market indices + price context ───────────────────────────────────────────

async function buildPriceContext(registry: SourceRegistry): Promise<string> {
  const lines: string[] = [];
  const todayVN = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push(`Ngày phân tích: ${todayVN}`);

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

    lines.push("\n## Chỉ số thị trường");
    if (fresh.length) {
      for (const idx of fresh) {
        const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
        const pct = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
        const pt  = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
        const refUrl = idx.index_code === "HNX" ? faUrl("HNXINDEX") : faUrl("VNINDEX");
        const ref = ` ${registry.add(idx.index_code, refUrl)}`;
        lines.push(`- ${idx.index_code}: ${Number(idx.close).toLocaleString("vi-VN", { minimumFractionDigits: 2 })} ${arrow} ${pt} (${pct}) · phiên ${idx.date}${ref}`);
      }
    } else {
      lines.push(`- Chưa có dữ liệu chỉ số mới trong DB (dữ liệu cuối: ${indices?.[0]?.date ?? "không rõ"}). Không được suy đoán.`);
    }
  } catch { /* ignore */ }

  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, close")
      .order("date", { ascending: false })
      .limit(75);

    const latestDate: Record<string, string> = {};
    const bySymbol: Record<string, number[]> = {};
    for (const row of (prices ?? [])) {
      if (!bySymbol[row.symbol]) { bySymbol[row.symbol] = []; latestDate[row.symbol] = row.date; }
      if (bySymbol[row.symbol].length < 2) bySymbol[row.symbol].push(Number(row.close));
    }

    const freshSymbols = Object.keys(bySymbol).filter(sym => daysSince(latestDate[sym]) <= PRICE_MAX_AGE_DAYS);
    if (freshSymbols.length) {
      const movers = freshSymbols
        .filter(sym => bySymbol[sym].length === 2)
        .map(sym => ({ sym, pct: ((bySymbol[sym][0] - bySymbol[sym][1]) / bySymbol[sym][1]) * 100 }))
        .sort((a, b) => b.pct - a.pct);

      lines.push("\n## Giá VN30");
      for (const sym of freshSymbols) {
        const ref = ` ${registry.add(sym, faUrl(sym))}`;
        lines.push(`- ${sym}: ${bySymbol[sym][0].toLocaleString("vi-VN")} đ · phiên ${latestDate[sym]}${ref}`);
      }
      const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
      const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();
      if (top5up.length)   { lines.push("\n### Top tăng");  for (const m of top5up)   lines.push(`- ${m.sym}: +${m.pct.toFixed(2)}%`); }
      if (top5down.length) { lines.push("\n### Top giảm");  for (const m of top5down) lines.push(`- ${m.sym}: ${m.pct.toFixed(2)}%`); }
    } else {
      lines.push("\n## Giá VN30");
      lines.push(`- Chưa có dữ liệu giá mới trong DB (dữ liệu cuối: ${prices?.[0]?.date ?? "không rõ"}). Không được suy đoán.`);
    }
  } catch { /* ignore */ }

  return lines.join("\n");
}

// ── News context ──────────────────────────────────────────────────────────────

async function buildNewsContext(registry: SourceRegistry): Promise<string> {
  try {
    const { data: news } = await sb
      .from("market_news")
      .select("title, content_summary, label, impact_score, affected_symbols, published_at, article_url, source")
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
      const srcLabel = n.source ?? "Báo";
      const ref = (n.article_url) ? ` ${registry.add(srcLabel, n.article_url)}` : "";
      lines.push(`- ${n.title}${syms}${score}${ref}`);
      if (n.content_summary) lines.push(`  ${n.content_summary.substring(0, 120)}`);
    }
    return lines.join("\n");
  } catch { return ""; }
}

// ── Financials context ────────────────────────────────────────────────────────

async function buildFinancialsContext(symbol: string, registry: SourceRegistry): Promise<string> {
  const sym = symbol.toUpperCase();
  const lines: string[] = [`\n## Dữ liệu tài chính: ${sym}`];

  try {
    const { data: fins } = await sb
      .from("financials_annual")
      .select("year,revenue,net_profit,eps,pe_ratio,pb_ratio,roe,roa,debt_to_equity")
      .eq("symbol", sym)
      .order("year", { ascending: false })
      .limit(4);

    if (fins?.length) {
      const ref = ` ${registry.add("BCTC", faUrl(sym))}`;
      lines.push(`\n### Kết quả tài chính theo năm${ref}`);
      lines.push("| Năm | Doanh thu (tỷ) | LNST (tỷ) | EPS | P/E | P/B | ROE | ROA | D/E |");
      lines.push("|-----|---------------|-----------|-----|-----|-----|-----|-----|-----|");
      for (const f of fins) {
        const rev = f.revenue     != null ? (Number(f.revenue)    / 1e9).toFixed(0) : "—";
        const np  = f.net_profit  != null ? (Number(f.net_profit) / 1e9).toFixed(0) : "—";
        const eps = f.eps         != null ? Number(f.eps).toLocaleString("vi-VN")    : "—";
        const pe  = f.pe_ratio    != null ? Number(f.pe_ratio).toFixed(1)            : "—";
        const pb  = f.pb_ratio    != null ? Number(f.pb_ratio).toFixed(2)            : "—";
        const roe = f.roe         != null ? (Number(f.roe) * 100).toFixed(1) + "%"   : "—";
        const roa = f.roa         != null ? (Number(f.roa) * 100).toFixed(2) + "%"   : "—";
        const de  = f.debt_to_equity != null ? Number(f.debt_to_equity).toFixed(2)   : "—";
        lines.push(`| ${f.year} | ${rev} | ${np} | ${eps} | ${pe} | ${pb} | ${roe} | ${roa} | ${de} |`);
      }
    }
  } catch { /* ignore */ }

  try {
    const { data: divs } = await sb
      .from("dividends")
      .select("ex_date,dividend_type,amount,payment_date")
      .eq("symbol", sym)
      .order("ex_date", { ascending: false })
      .limit(6);

    if (divs?.length) {
      const ref = ` ${registry.add("Cổ tức", faUrl(sym))}`;
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

  try {
    const { data: ins } = await sb
      .from("insider_transactions")
      .select("trade_date,insider_name,trade_type,volume")
      .eq("symbol", sym)
      .order("trade_date", { ascending: false })
      .limit(8);

    if (ins?.length) {
      const ref = ` ${registry.add("Insider", faUrl(sym))}`;
      lines.push(`\n### Giao dịch nội bộ gần đây${ref}`);
      for (const t of ins) {
        const vol = t.volume ? `${Number(t.volume).toLocaleString("vi-VN")} CP` : "";
        lines.push(`- ${t.trade_date}: ${t.insider_name} **${t.trade_type === "buy" ? "MUA" : "BÁN"}** ${vol}`);
      }
    }
  } catch { /* ignore */ }

  return lines.length > 1 ? lines.join("\n") : "";
}

// ── Grounding rules (anti-hallucination) ─────────────────────────────────────

const GROUNDING_RULES = `

## ══ QUY TẮC BẮT BUỘC TUYỆT ĐỐI ══

**ĐỊNH DẠNG OUTPUT — BẮT BUỘC**
- Chỉ dùng **Markdown thuần** (##, ###, -, **, *italic*)
- TUYỆT ĐỐI KHÔNG dùng HTML tags (<div>, <span>, <a>, <ul>, <li>, <br>, <style>, v.v.)
- Nếu muốn link: dùng [label](url) — KHÔNG dùng <a href="...">

**CHỈ VIẾT NHỮNG GÌ CÓ TRONG DỮ LIỆU — QUY TẮC CỐT LÕI**
- Chỉ được đề cập đến thông tin, số liệu, sự kiện XUẤT HIỆN TRỰC TIẾP trong phần "NGUỒN DỮ LIỆU" bên dưới
- Nếu một chủ đề KHÔNG có trong dữ liệu → **bỏ qua hoàn toàn**, không nhắc đến
- KHÔNG dùng kiến thức nền, KHÔNG ước tính, KHÔNG nội suy từ training data

**TRÍCH DẪN NGUỒN — BẮT BUỘC VỚI MỌI SỐ LIỆU**
- Mỗi con số, phần trăm, giá trị cụ thể PHẢI có token [ref:N] liền sau
- Token [ref:N] đã có sẵn trong NGUỒN DỮ LIỆU — chỉ được dùng những ref đó

**THỜI GIAN — CHÍNH XÁC**
- Mỗi dòng giá có "phiên YYYY-MM-DD" — PHẢI dùng đúng ngày đó
- Nếu dữ liệu giá ghi "Chưa có dữ liệu trong DB" → bỏ qua mục giá hoàn toàn

**TUÂN THỦ PHÁP LÝ**
- KHÔNG khuyến nghị mua/bán bất kỳ cổ phiếu nào
- Cuối output PHẢI có: *"Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019"*`;

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: {
    system_prompt?: string;
    tools?: string[];
    model?: string;
    target_symbols?: string[];
  };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const {
    system_prompt = "",
    tools = [],
    model = "gpt-4o-mini",
    target_symbols = [],
  } = body;

  const syms = target_symbols.map(s => s.toUpperCase().trim()).filter(Boolean);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const startedAt = Date.now();

      try {
        const registry = new SourceRegistry();

        // ── Fetch context based on selected tools ──────────────────────────

        let priceCtx = `Ngày: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}`;

        if (tools.includes("price") || tools.includes("index") || tools.includes("movers")) {
          emit({ type: "step", step: "price_feed", status: "loading", label: "Đang lấy giá & chỉ số thị trường..." });
          priceCtx = await buildPriceContext(registry);
          emit({ type: "step", step: "price_feed", status: "done", label: "Dữ liệu giá & chỉ số VN30" });
        }

        let newsCtx = "";
        if (tools.includes("news") || tools.includes("macro")) {
          emit({ type: "step", step: "news_feed", status: "loading", label: "Đang lấy tin tức thị trường (48h)..." });
          newsCtx = await buildNewsContext(registry);
          emit({ type: "step", step: "news_feed", status: "done", label: `Tin tức thị trường` });
        }

        let financialsCtx = "";
        if (syms.length > 0 && (tools.includes("financials") || tools.includes("pe"))) {
          emit({ type: "step", step: "financials", status: "loading", label: `Đang lấy BCTC ${syms.join(", ")}...` });
          const parts = await Promise.all(syms.map(s => buildFinancialsContext(s, registry)));
          financialsCtx = parts.filter(Boolean).join("\n\n");
          emit({ type: "step", step: "financials", status: "done", label: `BCTC: ${syms.join(", ")}` });
        }

        let insiderCtx = "";
        if (syms.length > 0 && tools.includes("insider") && !financialsCtx) {
          // Build minimal insider-only context when financials not selected
          emit({ type: "step", step: "insider", status: "loading", label: "Đang lấy giao dịch nội bộ..." });
          const parts = await Promise.all(syms.map(s => buildFinancialsContext(s, registry)));
          insiderCtx = parts.filter(Boolean).join("\n\n");
          emit({ type: "step", step: "insider", status: "done", label: "Giao dịch nội bộ" });
        }

        let technicalCtx = "";
        if (tools.includes("rsi") || tools.includes("macd")) {
          const targetSyms = syms.length > 0 ? syms : [];
          if (targetSyms.length > 0) {
            const toolNames = [tools.includes("rsi") && "RSI", tools.includes("macd") && "MACD"].filter(Boolean).join(" + ");
            emit({ type: "step", step: "technical", status: "loading", label: `Đang tính ${toolNames} cho ${targetSyms.join(", ")}...` });
            technicalCtx = await buildTechnicalContext(targetSyms, tools, registry);
            emit({ type: "step", step: "technical", status: "done", label: `${toolNames}: ${targetSyms.join(", ")}` });
          }
        }

        // ── Build system prompt with grounding rules ───────────────────────

        const basePrompt = system_prompt.trim() || "Bạn là trợ lý phân tích chứng khoán Việt Nam.";

        const systemPromptFull = basePrompt + GROUNDING_RULES + `

═══════════════════════════════════════
NGUỒN DỮ LIỆU XÁC NHẬN — CHỈ DÙNG CÁC SỐ LIỆU NÀY
Ngày phân tích: ${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}
Dữ liệu giá/chỉ số chỉ được hiển thị nếu ≤ ${PRICE_MAX_AGE_DAYS} ngày tuổi.
═══════════════════════════════════════
${priceCtx}${newsCtx}${financialsCtx}${insiderCtx}${technicalCtx}
═══════════════════════════════════════
HẾT NGUỒN DỮ LIỆU — KHÔNG ĐƯỢC DÙNG BẤT KỲ SỐ LIỆU NÀO NGOÀI PHẦN TRÊN
═══════════════════════════════════════`;

        const userMessage = syms.length > 0
          ? `Phân tích ${syms.length > 1 ? `các cổ phiếu **${syms.join(", ")}**` : `cổ phiếu **${syms[0]}**`} CHỈ dựa trên NGUỒN DỮ LIỆU XÁC NHẬN ở trên. Với chỉ tiêu nào KHÔNG có trong dữ liệu → bỏ qua hoàn toàn. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`
          : `Thực hiện nhiệm vụ CHỈ dựa trên NGUỒN DỮ LIỆU XÁC NHẬN ở trên. Thông tin nào không có trong dữ liệu → bỏ qua hoàn toàn. Mọi số liệu phải có [ref:N] liền sau. Trả lời tiếng Việt.`;

        // ── Call LLM (stream) ──────────────────────────────────────────────

        let { provider, apiModel } = MODEL_MAP[model] ?? DEFAULT_MODEL;
        if (provider === "anthropic" && !ANTHROPIC_API_KEY) {
          provider = "openai";
          apiModel = "gpt-4o-mini";
          emit({ type: "step", step: "llm", status: "loading", label: `⚠ ${model} chưa có API key → dùng GPT-4o mini` });
        } else {
          emit({ type: "step", step: "llm", status: "loading", label: `Đang phân tích với ${apiModel}...` });
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
              system: systemPromptFull,
              messages: [{ role: "user", content: userMessage }],
              stream: true,
            }),
          });
          if (!aiRes.ok) throw new Error(`Anthropic ${aiRes.status}: ${await aiRes.text()}`);
        } else {
          aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: apiModel,
              messages: [
                { role: "system", content: systemPromptFull },
                { role: "user", content: userMessage },
              ],
              max_tokens: 2000,
              temperature: 0,
              stream: true,
              stream_options: { include_usage: true },
            }),
          });
          if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}: ${await aiRes.text()}`);
        }

        const reader = aiRes.body!.getReader();
        const dec = new TextDecoder();
        let fullOutput = "";
        let buf = "";
        let tokens = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);
              if (provider === "anthropic") {
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  const chunk = parsed.delta.text ?? "";
                  if (chunk) { fullOutput += chunk; emit({ type: "chunk", text: chunk }); }
                }
                if (parsed.type === "message_delta" && parsed.usage) {
                  tokens = (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0);
                }
              } else {
                const chunk = parsed.choices?.[0]?.delta?.content ?? "";
                if (chunk) { fullOutput += chunk; emit({ type: "chunk", text: chunk }); }
                if (parsed.usage?.total_tokens) tokens = parsed.usage.total_tokens;
              }
            } catch { /* ignore */ }
          }
        }

        emit({ type: "step", step: "llm", status: "done", label: "Phân tích hoàn tất" });

        // Strip HTML if LLM ignored markdown-only instruction
        if (fullOutput.includes("<div") || fullOutput.includes("<span") || fullOutput.includes("<a ")) {
          fullOutput = fullOutput
            .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
            .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
            .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
            .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          emit({ type: "reset_output", output: fullOutput });
        }

        const durationMs = Date.now() - startedAt;
        const refs = registry.toArray().filter(r => fullOutput.includes(`[ref:${r.index}]`));

        if (refs.length > 0) emit({ type: "ref_registry", refs });

        emit({
          type: "done",
          tokens,
          duration_ms: durationMs,
          model: apiModel,
        });

      } catch (err) {
        emit({ type: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
