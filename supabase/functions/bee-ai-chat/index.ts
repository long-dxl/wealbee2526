/**
 * BeeAI Chat — True agent với OpenAI tool-calling
 *
 * POST /functions/v1/bee-ai-chat
 * Headers: Authorization: Bearer <user_jwt>
 * Body: { message, session_id?, context_cards? }
 *
 * SSE events:
 *   {"type":"step","name":"...","status":"loading"|"done","label":"..."}
 *   {"type":"chunk","text":"..."}
 *   {"type":"done","session_id":"...","message_id":"...","tokens":N,"model":"..."}
 *   {"type":"error","message":"..."}
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { financialReport, insiderReport, TYPE_LABEL } from "../_shared/financial-report.ts";
import { valueChainReport } from "../_shared/value-chain.ts";
import { hasCredits, deduct } from "../_shared/credits.ts";
import { CORS_CHAT as CORS } from "../_shared/cors.ts";
import { getModelConfig, isProviderAvailable } from "../_shared/llm-adapter.ts";
import { ProviderLLMRuntime, type LLMMessage } from "../_shared/llm-runtime.ts";
import { AgentEngine } from "../_shared/agent-engine.ts";
import { registryFromOpenAIDefinitions } from "../_shared/tool-registry.ts";
import { TOOL_DEFINITIONS } from "../_shared/tool-catalog.ts";

// Model chính toàn hệ thống: gpt-4.1-mini (ổn định, output đúng giọng như bản cũ).
const CHAT_MODEL = "gpt-4o-mini";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") ?? "";
const BRAVE_SEARCH_KEY     = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const LLM_RUNTIME = new ProviderLLMRuntime();
const AGENT_ENGINE = new AgentEngine(LLM_RUNTIME);

// CORS imported from _shared/cors.ts as CORS_CHAT

// ─── SSE ─────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
function sse(data: Record<string, unknown>): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const CHAT_TOOL_IDS = ["get_market_data", "get_news", "get_financials", "get_insider_activity", "get_value_chain", "get_portfolio", "search_knowledge_base", "web_search"];
const TOOL_DEFS = CHAT_TOOL_IDS.map(id => TOOL_DEFINITIONS[id]);
const CHAT_TOOL_REGISTRY = registryFromOpenAIDefinitions(Object.fromEntries(CHAT_TOOL_IDS.map(id => [id, TOOL_DEFINITIONS[id]])));

// ─── Tool executors ───────────────────────────────────────────────────────────

async function toolGetMarketData(): Promise<string> {
  const lines: string[] = [];
  const todayStr = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push(`Ngày hôm nay: ${todayStr}`);

  // Indices
  try {
    const { data: indices } = await sb
      .from("market_indices")
      .select("index_code, date, close, change_pt, change_pct, volume")
      .in("index_code", ["VNINDEX", "HNX"])
      .order("date", { ascending: false })
      .limit(4);

    if (indices?.length) {
      const seen = new Set<string>();
      const idxRows = indices.filter(i => { if (seen.has(i.index_code)) return false; seen.add(i.index_code); return true; });
      const latestIdxDate = idxRows[0]?.date ?? "";
      const idxAgeDays = latestIdxDate ? Math.floor((Date.now() - new Date(latestIdxDate).getTime()) / 86400000) : 999;
      if (idxAgeDays > 3) {
        lines.push(`\n⚠️ **DỮ LIỆU CHỈ SỐ CŨ**: Dữ liệu mới nhất là phiên ${latestIdxDate} (${idxAgeDays} ngày trước). Pipeline cập nhật giá/chỉ số đang bị dừng. Không có dữ liệu thị trường hôm nay.`);
      } else {
        lines.push("\n### Chỉ số thị trường");
        for (const idx of idxRows) {
          const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
          const pct = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
          const pt  = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
          const vol = idx.volume ? ` | KL: ${(Number(idx.volume) / 1_000_000).toFixed(1)}M` : "";
          lines.push(`- **${idx.index_code}**: ${Number(idx.close).toLocaleString("vi-VN", { minimumFractionDigits: 2 })} điểm ${arrow} ${pt} (${pct})${vol} · phiên ${idx.date} · Nguồn: HOSE/HNX`);
        }
      }
    } else {
      lines.push("\n⚠️ Không có dữ liệu chỉ số thị trường trong database.");
    }
  } catch { /* skip */ }

  // VN30 prices
  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, open, high, low, close, volume")
      .order("date", { ascending: false })
      .limit(80);

    if (prices?.length) {
      const latestBySymbol: Record<string, { date: string; close: number; open: number; high: number; low: number; volume: number }> = {};
      for (const row of prices) {
        if (!latestBySymbol[row.symbol]) {
          latestBySymbol[row.symbol] = {
            date: row.date, close: Number(row.close), open: Number(row.open),
            high: Number(row.high), low: Number(row.low), volume: Number(row.volume),
          };
        }
      }
      const latestDate = Object.values(latestBySymbol)[0]?.date ?? "";
      const priceAgeDays = latestDate ? Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000) : 999;

      if (priceAgeDays > 3) {
        lines.push(`\n⚠️ **DỮ LIỆU GIÁ CŨ**: Dữ liệu giá VN30 mới nhất là phiên ${latestDate} (${priceAgeDays} ngày trước). Pipeline cập nhật giá đang bị dừng. Hãy thông báo người dùng rằng KHÔNG có giá thực tế hôm nay.`);
      } else {
        const movers = Object.entries(latestBySymbol)
          .map(([sym, r]) => ({ sym, ...r, pct: r.open > 0 ? ((r.close - r.open) / r.open) * 100 : 0 }))
          .sort((a, b) => b.pct - a.pct);
        const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
        const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();

        lines.push(`\n### Giá VN30 — phiên ${latestDate} · Nguồn: HSX`);
        for (const [sym, r] of Object.entries(latestBySymbol)) {
          const pct = r.open > 0 ? ((r.close - r.open) / r.open) * 100 : 0;
          lines.push(`- ${sym}: **${r.close.toLocaleString("vi-VN")}đ** (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) | KL: ${r.volume.toLocaleString("vi-VN")}`);
        }
        if (top5up.length) {
          lines.push("\n**Top tăng:**");
          for (const m of top5up) lines.push(`- ${m.sym}: ${m.close.toLocaleString("vi-VN")}đ (+${m.pct.toFixed(2)}%)`);
        }
        if (top5down.length) {
          lines.push("\n**Top giảm:**");
          for (const m of top5down) lines.push(`- ${m.sym}: ${m.close.toLocaleString("vi-VN")}đ (${m.pct.toFixed(2)}%)`);
        }
      }
    } else {
      lines.push("\n⚠️ Không có dữ liệu giá VN30 trong database.");
    }
  } catch { /* skip */ }

  return lines.join("\n") || "Chưa có dữ liệu thị trường trong database.";
}

async function toolGetNews(symbols?: string[], days = 3, source?: string): Promise<string> {
  const since = new Date(Date.now() - Math.min(days, 30) * 86400000).toISOString();
  const lines: string[] = [];

  try {
    let query = sb
      .from("market_news")
      .select("title, content_summary, affected_symbols, impact_score, published_at, source, article_url")
      .gte("published_at", since)
      .not("label", "is", null)
      .neq("label", "trash")
      .order("published_at", { ascending: false })
      .limit(12);

    if (symbols?.length) query = query.overlaps("affected_symbols", symbols);
    if (source) query = query.eq("source", source);

    const { data: news } = await query;
    if (!news?.length) return "Không tìm thấy tin tức phù hợp trong database.";

    const header = symbols?.length
      ? `Tin tức về ${symbols.join(", ")} (${days} ngày gần đây):`
      : `Tin tức thị trường (${days} ngày gần đây):`;
    lines.push(header);

    for (const n of news) {
      const dateStr = new Date(n.published_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
      const timeStr = new Date(n.published_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
      const score = n.impact_score != null ? ` | Tác động: ${n.impact_score > 0 ? "+" : ""}${n.impact_score}` : "";
      const syms = n.affected_symbols?.length ? ` | Mã: ${n.affected_symbols.slice(0, 4).join(", ")}` : "";
      const srcName = n.source ? n.source.charAt(0).toUpperCase() + n.source.slice(1) : "N/A";
      // Format URL as markdown link — LLM must preserve this in output
      const sourceLink = n.article_url
        ? `[📰 ${srcName} · ${dateStr} ${timeStr}](${n.article_url})`
        : `📰 ${srcName} · ${dateStr} ${timeStr}`;

      lines.push(`\n**${n.title}**`);
      if (n.content_summary) lines.push(n.content_summary.slice(0, 200));
      lines.push(`${sourceLink}${syms}${score}`);
    }
  } catch { return "Lỗi khi tải tin tức từ database."; }

  return lines.join("\n");
}

async function toolGetFinancials(symbol: string): Promise<string> {
  const sym = symbol.toUpperCase().trim();
  const lines: string[] = [`## BCTC & Phân tích tài chính: ${sym}`];
  let ctype = "normal";

  // Ticker info + loại hình
  try {
    const { data: ticker } = await sb
      .from("tickers")
      .select("name, exchange, sector, company_type")
      .eq("symbol", sym)
      .single();
    if (ticker) {
      ctype = ticker.company_type ?? "normal";
      lines.push(`**${sym}** — ${ticker.name}`);
      lines.push(`Sàn: **${ticker.exchange ?? "N/A"}** · Ngành: ${ticker.sector ?? "N/A"} · Loại hình: **${TYPE_LABEL[ctype] ?? ctype}**`);
    }
  } catch { /* skip */ }

  // 4 bảng IS/BS/CF/Chỉ số (theo loại hình, Năm + 5 Quý gần nhất) — module dùng chung
  lines.push(await financialReport(sb, sym, ctype));

  // Recent prices
  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("date, close, volume")
      .eq("symbol", sym)
      .order("date", { ascending: false })
      .limit(5);

    if (prices?.length) {
      const latest = prices[0];
      const prev   = prices[1];
      const chgPct = prev ? ((Number(latest.close) - Number(prev.close)) / Number(prev.close)) * 100 : null;
      lines.push(`\n### Giá gần nhất · Nguồn: HSX/HNX`);
      lines.push(`- Phiên **${latest.date}**: đóng **${Number(latest.close).toLocaleString("vi-VN")}đ**${chgPct != null ? ` (${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}% so phiên trước)` : ""}`);
      lines.push(`  Lịch sử 5 phiên: ${prices.map(p => `${p.date}: ${Number(p.close).toLocaleString("vi-VN")}đ`).join(" → ")}`);
    }
  } catch { /* skip */ }

  return lines.join("\n");
}

async function toolGetInsiderActivity(symbol: string): Promise<string> {
  const sym = symbol.toUpperCase().trim();
  const lines: string[] = [`## Cổ tức & Giao dịch nội bộ: ${sym}`];
  lines.push(await insiderReport(sb, sym));
  return lines.join("\n");
}

async function toolGetPortfolio(userId: string): Promise<string> {
  const lines: string[] = ["## Danh mục đầu tư của bạn"];

  try {
    const { data: holdings } = await sb
      .from("portfolio_holdings")
      .select("symbol, quantity, avg_cost")
      .eq("user_id", userId)
      .limit(30);

    if (!holdings?.length) return "Danh mục chưa có cổ phiếu nào. Hãy thêm holdings vào Portfolio.";

    const symbols = holdings.map(h => h.symbol);

    // Latest prices
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, close, date")
      .in("symbol", symbols)
      .order("date", { ascending: false })
      .limit(symbols.length * 3);

    const priceMap: Record<string, { close: number; date: string }> = {};
    for (const p of (prices ?? [])) {
      if (!priceMap[p.symbol]) priceMap[p.symbol] = { close: Number(p.close), date: p.date };
    }

    let totalCost = 0, totalValue = 0;
    for (const h of holdings) {
      const current = priceMap[h.symbol]?.close ?? Number(h.avg_cost);
      const cost    = Number(h.quantity) * Number(h.avg_cost);
      const value   = Number(h.quantity) * current;
      const pnlPct  = ((current - Number(h.avg_cost)) / Number(h.avg_cost)) * 100;
      totalCost  += cost;
      totalValue += value;
      const dateTag = priceMap[h.symbol]?.date ? ` · phiên ${priceMap[h.symbol].date}` : "";
      const pnlIcon = pnlPct >= 0 ? "📈" : "📉";
      lines.push(`\n**${h.symbol}** ${pnlIcon}`);
      lines.push(`- Số lượng: ${Number(h.quantity).toLocaleString("vi-VN")} CP`);
      lines.push(`- Giá vốn: ${Number(h.avg_cost).toLocaleString("vi-VN")}đ | Giá hiện tại: **${current.toLocaleString("vi-VN")}đ**${dateTag} · Nguồn: HSX/HNX`);
      lines.push(`- P&L: **${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%** (${(value - cost >= 0 ? "+" : "")}${((value - cost) / 1e6).toFixed(1)} triệu)`);
    }

    if (totalCost > 0) {
      const totalPnl = ((totalValue - totalCost) / totalCost) * 100;
      lines.push(`\n---\n**Tổng danh mục**: ${(totalValue / 1e9).toFixed(3)} tỷ | P&L tổng: **${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}%**`);
    }
  } catch { return "Lỗi khi tải danh mục đầu tư."; }

  return lines.join("\n");
}

async function toolSearchKB(query: string, userId: string): Promise<string> {
  if (!OPENAI_API_KEY) return "Knowledge Base search chưa có API key.";

  try {
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });
    if (!embedRes.ok) return "Không thể tạo embedding để tìm kiếm KB.";

    const embedJson = await embedRes.json();
    const embedding = embedJson.data?.[0]?.embedding;
    if (!embedding) return "Embedding rỗng.";

    const { data: chunks } = await sb.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_user_id: userId,
      match_count: 5,
      match_threshold: 0.60,
    });

    if (!chunks?.length) return "Không tìm thấy nội dung liên quan trong Knowledge Base.";

    const lines = [`## Kết quả từ Knowledge Base (truy vấn: "${query}")`];
    for (const c of chunks) {
      lines.push(`\n---\n${c.content.trim().slice(0, 500)}`);
      if (c.content.length > 500) lines.push("…");
    }
    return lines.join("\n");
  } catch { return "Lỗi khi tìm kiếm Knowledge Base."; }
}

async function toolWebSearch(query: string): Promise<string> {
  if (!BRAVE_SEARCH_KEY) {
    return "Web search chưa được cấu hình (thiếu BRAVE_SEARCH_API_KEY trong Supabase secrets). Hãy thêm key để bật tính năng này.";
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=vn&search_lang=vi&freshness=pw`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "X-Subscription-Token": BRAVE_SEARCH_KEY },
    });
    if (!res.ok) return `Web search thất bại (status ${res.status}).`;

    const json = await res.json();
    const results: any[] = json.web?.results ?? [];
    if (!results.length) return "Không tìm thấy kết quả phù hợp trên web.";

    const lines = [`## Kết quả web search: "${query}"`];
    for (const r of results.slice(0, 5)) {
      lines.push(`\n**${r.title}**`);
      if (r.description) lines.push(r.description);
      const age = r.age ? ` · ${r.age}` : "";
      const domain = new URL(r.url).hostname.replace("www.", "");
      lines.push(`📅 Nguồn: ${domain}${age} | 🔗 ${r.url}`);
    }
    return lines.join("\n");
  } catch (e) { return `Web search lỗi: ${String(e)}`; }
}

async function toolGetValueChain(symbol: string): Promise<string> {
  const sym = (symbol || "").toUpperCase().trim();
  if (!sym) return "Thiếu mã cổ phiếu.";
  let sectorName: string | undefined;
  try {
    const { data } = await sb.from("stocks").select("sector_name").eq("symbol", sym).single();
    sectorName = data?.sector_name ?? undefined;
  } catch { /* skip */ }
  const report = await valueChainReport(sb, sym, sectorName);
  return report || `Ngành của ${sym} chưa gắn sơ đồ chuỗi giá trị hàng hóa (vd ngân hàng/chứng khoán/công nghệ không có nguyên liệu đầu vào hàng hóa).`;
}

// ─── Execute any tool call ────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, any>, userId: string): Promise<string> {
  switch (name) {
    case "get_market_data":      return toolGetMarketData();
    case "get_news":             return toolGetNews(args.symbols, args.days ?? 3, args.source);
    case "get_financials":       return toolGetFinancials(args.symbol ?? "");
    case "get_insider_activity": return toolGetInsiderActivity(args.symbol ?? "");
    case "get_value_chain":      return toolGetValueChain(args.symbol ?? "");
    case "get_portfolio":        return toolGetPortfolio(userId);
    case "search_knowledge_base":return toolSearchKB(args.query ?? "", userId);
    case "web_search":           return toolWebSearch(args.query ?? "");
    default:                     return `Tool "${name}" không tồn tại.`;
  }
}

for (const id of CHAT_TOOL_IDS) {
  CHAT_TOOL_REGISTRY.setHandler(id, (args, context) => executeTool(id, args, context.userId));
}

function toolLabel(name: string, args: Record<string, any>): { loading: string; done: string } {
  switch (name) {
    case "get_market_data":
      return { loading: "Đang lấy dữ liệu thị trường...", done: "Thị trường VN30 & chỉ số" };
    case "get_news": {
      const syms = args.symbols?.length ? `${args.symbols.join(", ")}` : "thị trường";
      const src  = args.source ? ` từ ${args.source}` : "";
      return { loading: `Đang tìm tin tức ${syms}${src}...`, done: `Tin tức ${syms}${src}` };
    }
    case "get_financials":
      return { loading: `Đang lấy BCTC ${args.symbol}...`, done: `BCTC & Tài chính ${args.symbol}` };
    case "get_insider_activity":
      return { loading: `Đang lấy cổ tức/giao dịch nội bộ ${args.symbol}...`, done: `Cổ tức & Giao dịch nội bộ ${args.symbol}` };
    case "get_value_chain":
      return { loading: `Đang phân tích chuỗi cung ứng ${args.symbol}...`, done: `Chuỗi cung ứng & yếu tố tác động ${args.symbol}` };
    case "get_portfolio":
      return { loading: "Đang lấy danh mục...", done: "Danh mục đầu tư" };
    case "search_knowledge_base":
      return { loading: "Đang tìm trong Knowledge Base...", done: "Kết quả Knowledge Base" };
    case "web_search":
      return { loading: `Đang tìm kiếm web: "${args.query}"...`, done: `Web search: "${args.query}"` };
    default:
      return { loading: "Đang xử lý...", done: name };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là BeeAI — trợ lý phân tích thị trường chứng khoán Việt Nam của Wealbee.

## CÁCH HOẠT ĐỘNG — BẮT BUỘC GỌI TOOL TRƯỚC KHI TRẢ LỜI

**Chiến lược gọi tool theo loại câu hỏi:**
- "Hôm nay có gì?", "thị trường?", "tin tức?" → gọi **CẢ HAI**: get_market_data VÀ get_news
- "VCB/HPG/FPT thế nào?" → gọi get_news(symbols=["VCB"]) VÀ get_financials("VCB")
- "Cổ tức/giao dịch nội bộ của VCB?" → gọi get_insider_activity("VCB") (KHÔNG cần gọi get_financials nếu câu hỏi chỉ về cổ tức/nội bộ)
- "Danh mục tôi?" → gọi get_portfolio VÀ get_market_data
- "Tìm tài liệu..." → gọi search_knowledge_base
- Cần tin mới nhất ngoài DB → gọi web_search

KHÔNG trả lời từ kiến thức training. KHÔNG bịa số liệu.

**Khi data stale (có cảnh báo ⚠️ trong kết quả tool):**
Thông báo rõ cho người dùng: "Pipeline cập nhật giá đang bị dừng, dữ liệu giá/chỉ số mới nhất là ngày X. Tôi có thể cung cấp tin tức hôm nay từ market_news."

## QUY TẮC LINK — BẮT BUỘC
Với tin tức: COPY NGUYÊN VĂN markdown link từ tool vào câu trả lời.
- Tool trả về dạng [Bao CafeF - 18/06/2026](https://cafef.vn/...) thi giu nguyen, KHONG thay bang "(Nguon: CafeF)"
- TUYET DOI KHONG viet "(Nguon: X)" dang text thuan khi tool da co link markdown

Voi so lieu gia/BCTC: kem ngay va nguon dang text: "phien 01/06/2026 - Nguon: HOSE"

## PHÁP LÝ
TUYỆT ĐỐI không khuyến nghị mua/bán cụ thể. Không đưa target price.
Kết thúc mọi câu trả lời: *Thông tin tham khảo · không phải tư vấn đầu tư theo Luật Chứng khoán 2019*

## ĐỊNH DẠNG
- Tiếng Việt, ngắn gọn, dùng bullet points
- **In đậm** số liệu quan trọng
- Emoji: 📈 📉 💰 📊 📅 📰`;

// ─── Main handler ─────────────────────────────────────────────────────────────

interface ContextCardPayload { id?: string; type: string; label: string; badge?: string; summary?: string; }

async function buildContextHint(cards: ContextCardPayload[]): Promise<string> {
  if (!cards.length) return "";
  const lines = ["\n## Người dùng đang xem (context cards):"];
  const reportBlocks: string[] = [];
  for (const c of cards) {
    // Báo cáo phân tích đính kèm → nạp TOÀN VĂN làm tài liệu nền (kiểu NotebookLM)
    if (c.type === "report" && c.id) {
      try {
        const { data: rp } = await sb
          .from("analyst_reports")
          .select("title,ticker,source_firm,recommendation,target_price,report_date,full_text")
          .eq("id", c.id)
          .maybeSingle();
        if (rp?.full_text) {
          reportBlocks.push(
            `\n## TÀI LIỆU BÁO CÁO PHÂN TÍCH (người dùng đính kèm — TRẢ LỜI DỰA TRÊN TÀI LIỆU NÀY)\n` +
            `Mã: ${rp.ticker ?? "?"} | Nguồn: ${rp.source_firm ?? "?"} | Khuyến nghị: ${rp.recommendation ?? "?"}` +
            `${rp.target_price ? " | Giá mục tiêu: " + rp.target_price : ""}${rp.report_date ? " | Ngày: " + rp.report_date : ""}\n` +
            `Tiêu đề: ${rp.title}\n\n=== NỘI DUNG BÁO CÁO ===\n${rp.full_text.slice(0, 40000)}\n=== HẾT BÁO CÁO ===`
          );
          continue;
        }
      } catch { /* fallback xuống dòng tóm tắt bên dưới */ }
    }
    const detail = c.badge ? ` (${c.badge})` : "";
    const summ   = c.summary ? ` — ${c.summary.slice(0, 80)}` : "";
    lines.push(`- ${c.type.toUpperCase()}: "${c.label}"${detail}${summ}`);
  }
  lines.push("\nNếu cần dữ liệu về các mục trên, hãy gọi tool phù hợp.");
  if (reportBlocks.length) {
    lines.push(
      "\nKhi có TÀI LIỆU BÁO CÁO PHÂN TÍCH đính kèm: ưu tiên trích dẫn & phân tích trực tiếp từ nội dung tài liệu đó " +
      "(luận điểm, số liệu, định giá, khuyến nghị, rủi ro). Có thể bổ sung dữ liệu mới qua tool, nhưng KHÔNG bịa số ngoài tài liệu."
    );
  }
  return lines.join("\n") + reportBlocks.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const jwt = authHeader.replace("Bearer ", "");
  const anonSb = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
  const { data: { user }, error: authError } = await anonSb.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  // ── CREDIT GATE: hết credit → chặn trước khi tốn token ──
  const { ok: hasCr } = await hasCredits(sb, user.id);
  if (!hasCr) {
    return new Response(JSON.stringify({
      error: "Bạn đã hết Beeny hôm nay. Beeny sẽ được nạp lại vào ngày mai, hoặc nâng cấp gói để có thêm.",
      code: "not_enough_credits",
    }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  let body: { message: string; session_id?: string; context_ticker?: string; context_cards?: ContextCardPayload[] };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { message, context_cards } = body;
  if (!message?.trim()) return new Response(JSON.stringify({ error: "message required" }), { status: 400 });

  // Session
  let sessionId = body.session_id;
  if (!sessionId) {
    const { data: sess } = await sb
      .from("chat_sessions")
      .insert({ user_id: user.id, context_ticker: body.context_ticker ?? null })
      .select("id")
      .single();
    sessionId = sess?.id;
  }

  // Conversation history
  const { data: history } = await sb
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(10);

  await sb.from("chat_messages")
    .insert({ session_id: sessionId, user_id: user.id, role: "user", content: message });

  // Build full system prompt
  const contextHint = await buildContextHint(context_cards ?? []);
  const fullSystem  = SYSTEM_PROMPT + contextHint;

  // Initial messages
  const chatMessages: any[] = [
    ...(history ?? []).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const modelConfig = getModelConfig(CHAT_MODEL);
  if (!isProviderAvailable(modelConfig.provider)) return new Response(JSON.stringify({ error: `${modelConfig.provider} chưa được cấu hình API key` }), { status: 503, headers: CORS });
  const finalModel = modelConfig.apiModel;

  const stream = new ReadableStream({
    async start(ctrl) {
      let fullText  = "";
      let totalToks = 0;
      let inputTok  = 0;
      let outputTok = 0;
      let cachedTok = 0;

      try {
        // ── Framework step 1: Observe ─────────────────────────────────────
        // Context, history, session đã được đọc từ DB trước khi stream bắt đầu
        ctrl.enqueue(sse({ type: "step", name: "_observe", status: "loading", label: "Đọc ngữ cảnh & lịch sử hội thoại..." }));
        ctrl.enqueue(sse({ type: "step", name: "_observe", status: "done",
          label: `Ngữ cảnh: ${history?.length ?? 0} tin nhắn cũ${context_cards?.length ? `, ${context_cards.length} card` : ""}` }));

        // ── Tool-call loop (always OpenAI for tool calls) ──────────────────
        const loopMessages: LLMMessage[] = [
          { role: "system", content: fullSystem },
          ...chatMessages,
        ];
        ctrl.enqueue(sse({ type: "step", name: "_reason", status: "loading", label: "Phân tích câu hỏi & lên kế hoạch gọi tool..." }));
        let reasonDone = false;
        for await (const event of AGENT_ENGINE.run({
          model: modelConfig, messages: loopMessages, tools: TOOL_DEFS as any, maxTokens: 4000, temperature: 0,
          registry: CHAT_TOOL_REGISTRY, maxToolIterations: 6,
          toolContext: { userId: user.id, enabledToolIds: new Set(CHAT_TOOL_IDS) },
        })) {
          if (event.type === "usage") {
            totalToks += event.usage.inputTokens + event.usage.outputTokens;
            inputTok += event.usage.inputTokens; outputTok += event.usage.outputTokens; cachedTok += event.usage.cachedInputTokens;
          } else if (event.type === "tool_start") {
            const labels = toolLabel(event.call.name, event.call.arguments);
            if (!reasonDone) { ctrl.enqueue(sse({ type: "step", name: "_reason", status: "done", label: `Kế hoạch: ${labels.done}` })); reasonDone = true; }
            ctrl.enqueue(sse({ type: "step", name: event.call.name, status: "loading", label: labels.loading }));
          } else if (event.type === "tool_end") {
            ctrl.enqueue(sse({ type: "step", name: event.call.name, status: "done", label: toolLabel(event.call.name, event.call.arguments).done }));
          } else if (event.type === "text") {
            if (!reasonDone) { ctrl.enqueue(sse({ type: "step", name: "_reason", status: "done", label: "Đã hoàn tất kế hoạch phân tích" })); reasonDone = true; }
            fullText = event.text; ctrl.enqueue(sse({ type: "chunk", text: fullText }));
          }
        }
        // ── Save assistant message ─────────────────────────────────────────
        const { data: assistantMsg } = await sb
          .from("chat_messages")
          .insert({ session_id: sessionId, user_id: user.id, role: "assistant", content: fullText, tokens: totalToks || null })
          .select("id")
          .single();

        // Update session
        if (!body.session_id) {
          const title = message.length > 50 ? message.slice(0, 50) + "…" : message;
          await sb.from("chat_sessions").update({ title, updated_at: new Date().toISOString() }).eq("id", sessionId);
        } else {
          await sb.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
        }

        // ── Trừ credit theo token thật (1 credit = 40đ giá trị API) ──
        const charge = await deduct(sb, user.id, inputTok, outputTok, "actionhub bee-ai-chat", cachedTok);

        ctrl.enqueue(sse({
          type: "done",
          session_id: sessionId,
          message_id: assistantMsg?.id,
          tokens: totalToks,
          model: finalModel,
          credits_used: charge.credits_used,
          balance: charge.balance,
        }));

      } catch (err) {
        ctrl.enqueue(sse({ type: "error", message: String(err) }));
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Session-Id": sessionId ?? "",
    },
  });
});
