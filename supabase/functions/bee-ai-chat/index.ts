/**
 * BeeAI Chat — Supabase Edge Function
 * Streaming chat với OpenAI GPT-4.1-mini (fallback sang Claude khi có ANTHROPIC_API_KEY)
 *
 * POST /functions/v1/bee-ai-chat
 * Headers: Authorization: Bearer <user_jwt>
 * Body: { message: string, session_id?: string, context_ticker?: string }
 *
 * Response: SSE stream
 *   data: {"type":"chunk","text":"..."}
 *   data: {"type":"done","session_id":"...","message_id":"...","tokens":123}
 *   data: {"type":"error","message":"..."}
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const USE_CLAUDE  = ANTHROPIC_API_KEY.length > 10;
const MODEL_LABEL = USE_CLAUDE ? "claude-sonnet-4-6" : "gpt-4.1-mini";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là BeeAI — trợ lý phân tích thị trường chứng khoán Việt Nam của Wealbee.

══════════════════════════════════════════════════
QUY TẮC TUYỆT ĐỐI — KHÔNG ĐƯỢC VI PHẠM
══════════════════════════════════════════════════

**1. CHỈ DÙNG SỐ LIỆU CÓ TRONG PHẦN "DỮ LIỆU XÁC NHẬN" BÊN DƯỚI**
- Mỗi con số, giá, tỷ lệ % bạn đề cập PHẢI xuất hiện trong phần dữ liệu đó
- KHÔNG được dùng kiến thức training của bạn để điền giá cổ phiếu, chỉ số, hay số tài chính
- Ví dụ SAI: "VCB thường giao dịch quanh vùng 80.000đ" (bạn tự bịa từ training)
- Ví dụ ĐÚNG: "VCB đóng cửa tại **62.200 đ** phiên 2026-06-01" (có trong dữ liệu)

**2. KHI KHÔNG CÓ DỮ LIỆU — NÓI THẲNG, KHÔNG ĐOÁN**
- Nếu user hỏi về điều gì không có trong phần dữ liệu → trả lời rõ:
  "Tôi chưa có dữ liệu về [X] trong hệ thống. Dữ liệu hiện có gồm: [liệt kê những gì có]"
- KHÔNG dùng các cụm: "thông thường", "lịch sử cho thấy", "về cơ bản", "theo xu hướng" khi không có data xác nhận

**3. GHI RÕ NGUỒN VÀ NGÀY CHO MỌI SỐ LIỆU**
- Luôn kèm ngày: "giá phiên 2026-06-01", "tin ngày X"
- Nếu dữ liệu đã cũ (>2 ngày): ghi rõ "⚠ dữ liệu cuối: [ngày]"

**4. PHÁP LÝ (Luật Chứng khoán 2019)**
- TUYỆT ĐỐI KHÔNG khuyến nghị mua/bán cụ thể
- KHÔNG đưa target price hay dự báo lợi nhuận
- Mọi câu trả lời kết thúc bằng: *Thông tin tham khảo · không phải tư vấn đầu tư*

══════════════════════════════════════════════════
ĐỊNH DẠNG
══════════════════════════════════════════════════
- Tiếng Việt, ngắn gọn, bullet points
- **In đậm** số liệu quan trọng
- Emoji phù hợp: 📈 📉 💰 📊
- Khi nói về mã CP: luôn kèm ngày của giá đó`;

// ─── Market context builder ───────────────────────────────────────────────────

interface ContextCardPayload { id?: string; type: string; label: string; badge?: string; summary?: string; }

// Trích symbol VN từ câu hỏi (2-5 ký tự IN HOA), validate với bảng tickers
async function extractTickersFromMessage(msg: string): Promise<string[]> {
  const candidates = [...new Set((msg.match(/\b([A-Z]{2,5})\b/g) ?? []))];
  if (!candidates.length) return [];
  try {
    const { data } = await sb.from("tickers").select("symbol").in("symbol", candidates);
    return (data ?? []).map((r: { symbol: string }) => r.symbol);
  } catch { return []; }
}

async function buildContextCardsSection(cards: ContextCardPayload[], userId: string, message = ""): Promise<string> {
  if (!cards.length) return "";
  const lines: string[] = ["\n## CONTEXT CARDS — Dữ liệu từ card bạn kéo vào"];

  const tickerSymbols: string[] = [];
  const newsCards: ContextCardPayload[] = [];
  const portfolioCards: ContextCardPayload[] = [];
  const reportCards: ContextCardPayload[] = [];
  const toolCards: ContextCardPayload[] = [];
  const knowledgeCards: ContextCardPayload[] = [];

  for (const card of cards) {
    if (card.type === "ticker" || card.type === "mover") {
      // label = symbol e.g. "VIC", "HPG"
      const sym = card.label.trim().toUpperCase().split(/\s+/)[0];
      if (sym && /^[A-Z0-9]{2,5}$/.test(sym)) tickerSymbols.push(sym);
    } else if (card.type === "index") {
      const code = /hnx/i.test(card.label) ? "HNX" : "VNINDEX";
      lines.push(`\n### Chỉ số: ${card.label} (${code})`);
      lines.push("(Xem dữ liệu chỉ số ở phần trên — Chỉ số thị trường)");
    } else if (card.type === "news") {
      newsCards.push(card);
    } else if (card.type === "portfolio") {
      portfolioCards.push(card);
    } else if (card.type === "report") {
      reportCards.push(card);
    } else if (card.type === "tool") {
      toolCards.push(card);
    } else if (card.type === "knowledge") {
      knowledgeCards.push(card);
    }
  }

  // ── Nếu không có ticker card, thử extract từ message hoặc portfolio ───────
  // Dùng bởi tool-financial-statements, tool-pe-pb, tool-insider, tool-dividend
  const hasToolNeedingSymbols = toolCards.some(c =>
    ["tool-financial-statements","tool-pe-pb-valuation","tool-insider-trades","tool-dividend-yield"].includes(c.id ?? "")
  );
  if (tickerSymbols.length === 0 && hasToolNeedingSymbols) {
    // 1. Extract từ câu hỏi ("FPT", "VCB"...)
    const fromMsg = await extractTickersFromMessage(message);
    tickerSymbols.push(...fromMsg);

    // 2. Fallback: dùng portfolio holdings
    if (tickerSymbols.length === 0 && portfolioCards.length > 0) {
      try {
        const { data: h } = await sb
          .from("portfolio_holdings").select("symbol").eq("user_id", userId).limit(10);
        if (h) tickerSymbols.push(...h.map((r: { symbol: string }) => r.symbol));
      } catch { /* ignore */ }
    }
  }

  // ── Ticker / Mover: query prices + info ──────────────────────────────────
  if (tickerSymbols.length > 0) {
    lines.push(`\n### Cổ phiếu: ${tickerSymbols.join(", ")}`);

    try {
      const [pricesRes, tickerInfoRes] = await Promise.all([
        sb.from("prices_daily")
          .select("symbol, date, open, high, low, close, volume")
          .in("symbol", tickerSymbols)
          .order("date", { ascending: false })
          .limit(tickerSymbols.length * 10),
        sb.from("tickers")
          .select("symbol, name, exchange, sector")
          .in("symbol", tickerSymbols),
      ]);

      const infoMap: Record<string, { name: string; sector?: string }> = {};
      for (const t of (tickerInfoRes.data ?? [])) {
        infoMap[t.symbol] = { name: t.name, sector: t.sector };
      }

      const bySymbol: Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>> = {};
      for (const row of (pricesRes.data ?? [])) {
        if (!bySymbol[row.symbol]) bySymbol[row.symbol] = [];
        bySymbol[row.symbol].push(row);
      }

      for (const sym of tickerSymbols) {
        const rows = bySymbol[sym] ?? [];
        const info = infoMap[sym];
        if (info) lines.push(`- **${sym}** — ${info.name}${info.sector ? ` (${info.sector})` : ""}`);
        if (!rows.length) { lines.push(`  Chưa có dữ liệu giá cho ${sym}`); continue; }

        const latest = rows[0];
        const prev   = rows[1];
        const close  = Number(latest.close);
        const open   = Number(latest.open);
        const chgVsOpen    = ((close - open) / open) * 100;
        const chgVsPrev    = prev ? ((close - Number(prev.close)) / Number(prev.close)) * 100 : null;

        lines.push(`  Phiên ${latest.date}: Đóng **${close.toLocaleString("vi-VN")} đ** | Thay đổi trong ngày: ${chgVsOpen >= 0 ? "+" : ""}${chgVsOpen.toFixed(2)}%${chgVsPrev !== null ? ` | So phiên trước: ${chgVsPrev >= 0 ? "+" : ""}${chgVsPrev.toFixed(2)}%` : ""}`);
        lines.push(`  OHLC: ${Number(latest.open).toLocaleString("vi-VN")} / ${Number(latest.high).toLocaleString("vi-VN")} / ${Number(latest.low).toLocaleString("vi-VN")} / ${close.toLocaleString("vi-VN")}`);
        lines.push(`  Khối lượng: ${Number(latest.volume).toLocaleString("vi-VN")} CP`);

        if (rows.length > 1) {
          const history = rows.slice(0, 5).map(r => `${r.date}: ${Number(r.close).toLocaleString("vi-VN")}`).join(" → ");
          lines.push(`  Lịch sử 5 phiên (gần → xa): ${history}`);
        }

        // News for this ticker (7 days)
        const { data: tickerNews } = await sb
          .from("market_news")
          .select("title, impact_score, published_at")
          .contains("affected_symbols", [sym])
          .gte("published_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("published_at", { ascending: false })
          .limit(3);

        if (tickerNews && tickerNews.length > 0) {
          lines.push(`  Tin liên quan: ${tickerNews.map(n => `"${n.title}"${n.impact_score != null ? ` [${n.impact_score >= 0 ? "+" : ""}${n.impact_score}]` : ""}`).join("; ")}`);
        }
      }
    } catch { /* ignore */ }
  }

  // ── News cards — re-fetch nội dung đầy đủ từ market_news ───────────────
  if (newsCards.length > 0) {
    lines.push("\n### Tin tức bạn đang quan tâm:");
    for (const card of newsCards) {
      lines.push(`- **${card.label.replace(/…$/, "")}**`);
      try {
        // Tìm bài báo theo tiêu đề (bỏ "…" cuối nếu bị cắt)
        const searchTitle = card.label.replace(/…$/, "").trim();
        const { data: found } = await sb
          .from("market_news")
          .select("title, content_summary, affected_symbols, impact_score, published_at, source, article_url")
          .ilike("title", `${searchTitle}%`)
          .limit(1);
        const n = found?.[0];
        if (n) {
          if (n.content_summary) lines.push(`  Tóm tắt: ${n.content_summary}`);
          if (n.affected_symbols?.length) lines.push(`  Mã liên quan: ${n.affected_symbols.slice(0, 5).join(", ")}`);
          if (n.impact_score != null) lines.push(`  Mức tác động: ${n.impact_score > 0 ? "+" : ""}${n.impact_score}`);
          if (n.published_at) lines.push(`  Thời gian: ${new Date(n.published_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`);
          if (n.source) lines.push(`  Nguồn: ${n.source}`);
        } else if (card.summary) {
          lines.push(`  ${card.summary}`);
        }
      } catch { if (card.summary) lines.push(`  ${card.summary}`); }
    }
  }

  // ── Report/Brief cards — re-fetch content đầy đủ từ briefs ─────────────
  if (reportCards.length > 0) {
    lines.push("\n### Báo cáo từ Inbox:");
    for (const card of reportCards) {
      lines.push(`- **${card.label}**`);
      try {
        const briefId = (card.id ?? "").replace(/^brief-|^inbox-/, "");
        const { data: brief } = await sb
          .from("briefs")
          .select("content, summary, tickers, created_at")
          .eq("id", briefId)
          .single();
        if (brief?.content) {
          // Đưa vào tối đa 800 ký tự để không làm phình context
          const excerpt = brief.content.replace(/```[\s\S]*?```/g, "").trim().slice(0, 800);
          lines.push(`  ${excerpt}${brief.content.length > 800 ? "…" : ""}`);
          if (brief.tickers?.length) lines.push(`  Mã liên quan: ${brief.tickers.join(", ")}`);
        } else if (brief?.summary) {
          lines.push(`  ${brief.summary}`);
        } else if (card.summary) {
          lines.push(`  ${card.summary}`);
        }
      } catch { if (card.summary) lines.push(`  ${card.summary}`); }
    }
  }

  // ── Portfolio cards — join với prices_daily để lấy giá hiện tại ─────────
  if (portfolioCards.length > 0) {
    try {
      const { data: holdings } = await sb
        .from("portfolio_holdings")
        .select("symbol, quantity, avg_cost")          // bỏ current_price (không tồn tại)
        .eq("user_id", userId)
        .limit(20);

      if (holdings && holdings.length > 0) {
        const symbols = holdings.map(h => h.symbol);

        // Lấy giá mới nhất từ prices_daily
        const { data: latestPrices } = await sb
          .from("prices_daily")
          .select("symbol, close, date")
          .in("symbol", symbols)
          .order("date", { ascending: false })
          .limit(symbols.length * 3);

        const priceMap: Record<string, { close: number; date: string }> = {};
        for (const p of (latestPrices ?? [])) {
          if (!priceMap[p.symbol]) priceMap[p.symbol] = { close: Number(p.close), date: p.date };
        }

        lines.push("\n### Danh mục đầu tư của bạn:");
        let totalCost = 0, totalValue = 0;
        for (const h of holdings) {
          const current  = priceMap[h.symbol]?.close ?? Number(h.avg_cost);
          const cost     = Number(h.quantity) * Number(h.avg_cost);
          const value    = Number(h.quantity) * current;
          const pnlPct   = ((current - Number(h.avg_cost)) / Number(h.avg_cost)) * 100;
          totalCost  += cost;
          totalValue += value;
          const dateTag = priceMap[h.symbol]?.date ? ` phiên ${priceMap[h.symbol].date}` : "";
          lines.push(`- **${h.symbol}**: ${Number(h.quantity).toLocaleString("vi-VN")} CP | Giá vốn: ${Number(h.avg_cost).toLocaleString("vi-VN")} đ | Giá hiện tại: ${current.toLocaleString("vi-VN")} đ${dateTag} | P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
        }
        if (totalCost > 0) {
          const totalPnl = ((totalValue - totalCost) / totalCost) * 100;
          lines.push(`\nTổng danh mục: ${(totalValue / 1e9).toFixed(3)} tỷ | P&L tổng: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}%`);
        }
      }
    } catch { /* ignore */ }
  }

  // ── Tool cards ────────────────────────────────────────────────────────────
  if (toolCards.length > 0) {
    lines.push("\n### Công cụ phân tích đang kích hoạt:");

    for (const card of toolCards) {
      const toolId = card.id ?? "";

      // ── Tools dùng lại data đã load trong buildMarketContext ─────────────
      if (["tool-realtime-price", "tool-market-indices", "tool-top-movers"].includes(toolId)) {
        lines.push(`\n**[${card.label}]** — ${card.summary ?? ""}`);
        if (toolId === "tool-realtime-price") {
          lines.push("→ Phân tích giá: dùng bảng 'Giá VN30 cuối phiên gần nhất' ở trên.");
        } else if (toolId === "tool-market-indices") {
          lines.push("→ Phân tích chỉ số: dùng bảng 'VN-Index / HNX' ở trên.");
        } else {
          lines.push("→ Phân tích top mover: dùng bảng 'Top tăng / Top giảm VN30' ở trên.");
        }
      }

      // ── Tin tức CafeF — filter theo source ───────────────────────────────
      else if (toolId === "tool-cafef-news") {
        lines.push(`\n**[${card.label}]** — ${card.summary ?? ""}`);
        try {
          const { data: news } = await sb
            .from("market_news")
            .select("title, content_summary, affected_symbols, impact_score, published_at")
            .eq("source", "cafef")
            .not("label", "is", null)
            .neq("label", "trash")
            .order("published_at", { ascending: false })
            .limit(6);
          if (news && news.length > 0) {
            lines.push("Tin tức mới nhất từ CafeF:");
            for (const n of news) {
              const syms = n.affected_symbols?.length ? ` — ${n.affected_symbols.slice(0, 3).join(", ")}` : "";
              const score = n.impact_score != null ? ` [${n.impact_score > 0 ? "+" : ""}${n.impact_score}]` : "";
              lines.push(`- ${n.title}${syms}${score}`);
              if (n.content_summary) lines.push(`  ${n.content_summary.slice(0, 120)}...`);
            }
          } else {
            lines.push("→ Dùng tin tức thị trường đã có ở trên (nguồn CafeF).");
          }
        } catch { lines.push("→ Dùng tin tức thị trường đã có ở trên."); }
      }

      // ── Tin tức Vietstock — filter theo source ────────────────────────────
      else if (toolId === "tool-vietstock-news") {
        lines.push(`\n**[${card.label}]** — ${card.summary ?? ""}`);
        try {
          const { data: news } = await sb
            .from("market_news")
            .select("title, content_summary, affected_symbols, impact_score, published_at")
            .eq("source", "vietstock")
            .not("label", "is", null)
            .neq("label", "trash")
            .order("published_at", { ascending: false })
            .limit(6);
          if (news && news.length > 0) {
            lines.push("Tin tức mới nhất từ Vietstock:");
            for (const n of news) {
              const syms = n.affected_symbols?.length ? ` — ${n.affected_symbols.slice(0, 3).join(", ")}` : "";
              const score = n.impact_score != null ? ` [${n.impact_score > 0 ? "+" : ""}${n.impact_score}]` : "";
              lines.push(`- ${n.title}${syms}${score}`);
              if (n.content_summary) lines.push(`  ${n.content_summary.slice(0, 120)}...`);
            }
          } else {
            lines.push("→ Dùng tin tức thị trường đã có ở trên (nguồn Vietstock).");
          }
        } catch { lines.push("→ Dùng tin tức thị trường đã có ở trên."); }
      }

      // ── Định giá P/E & P/B ───────────────────────────────────────────────
      else if (toolId === "tool-pe-pb-valuation") {
        lines.push(`\n**[${card.label}]**:`);
        if (tickerSymbols.length > 0) {
          try {
            // Lấy năm gần nhất cho mỗi symbol từ financials_annual
            const { data: funds } = await sb
              .from("financials_annual")
              .select("symbol, year, pe_ratio, pb_ratio, roe, roa, debt_to_equity")
              .in("symbol", tickerSymbols)
              .order("year", { ascending: false })
              .limit(tickerSymbols.length * 3);
            if (funds && funds.length > 0) {
              // Lấy row mới nhất cho mỗi symbol
              const latest: Record<string, typeof funds[0]> = {};
              for (const f of funds) { if (!latest[f.symbol]) latest[f.symbol] = f; }
              for (const sym of tickerSymbols) {
                const f = latest[sym];
                if (!f) { lines.push(`- ${sym}: Chưa có dữ liệu định giá`); continue; }
                const roe = f.roe != null ? `ROE = ${(Number(f.roe) * 100).toFixed(1)}%` : "";
                const roa = f.roa != null ? `ROA = ${(Number(f.roa) * 100).toFixed(1)}%` : "";
                const de = f.debt_to_equity != null ? `D/E = ${f.debt_to_equity}` : "";
                lines.push(`- **${sym}** (${f.year}): P/E = ${f.pe_ratio ?? "N/A"} | P/B = ${f.pb_ratio ?? "N/A"}${roe ? ` | ${roe}` : ""}${roa ? ` | ${roa}` : ""}${de ? ` | ${de}` : ""}`);
              }
            } else {
              lines.push("Chưa có dữ liệu định giá cho các mã này.");
            }
          } catch { lines.push("Không thể tải dữ liệu định giá."); }
        } else {
          lines.push("Kéo thêm card cổ phiếu vào context để xem định giá P/E & P/B.");
        }
      }

      // ── Tỷ suất cổ tức ──────────────────────────────────────────────────
      else if (toolId === "tool-dividend-yield") {
        lines.push(`\n**[${card.label}]**:`);
        let symsToCheck: string[] = tickerSymbols.length > 0 ? [...tickerSymbols] : [];
        if (symsToCheck.length === 0) {
          try {
            const { data: h } = await sb.from("portfolio_holdings")
              .select("symbol").eq("user_id", userId).limit(10);
            if (h) symsToCheck = h.map((r: { symbol: string }) => r.symbol);
          } catch { /* ignore */ }
        }
        if (symsToCheck.length > 0) {
          try {
            const { data: divs } = await sb
              .from("dividends")
              .select("symbol, ex_date, payment_date, dividend_type, amount")
              .in("symbol", symsToCheck)
              .order("ex_date", { ascending: false })
              .limit(symsToCheck.length * 5);
            if (divs && divs.length > 0) {
              const byDiv: Record<string, typeof divs> = {};
              for (const d of divs) { if (!byDiv[d.symbol]) byDiv[d.symbol] = []; byDiv[d.symbol].push(d); }
              for (const sym of symsToCheck) {
                const sdivs = byDiv[sym] ?? [];
                if (!sdivs.length) { lines.push(`- ${sym}: Chưa có dữ liệu cổ tức`); continue; }
                lines.push(`- **${sym}**: ${sdivs.slice(0, 3).map(d =>
                  `${d.ex_date} — ${Number(d.amount).toLocaleString("vi-VN")} đ (${d.dividend_type})`
                ).join(" | ")}`);
              }
            } else {
              lines.push("Chưa có dữ liệu cổ tức cho các mã này.");
            }
          } catch { lines.push("Không thể tải dữ liệu cổ tức."); }
        } else {
          lines.push("Kéo thêm card cổ phiếu hoặc card danh mục để tính tỷ suất cổ tức.");
        }
      }

      // ── Giao dịch nội bộ ─────────────────────────────────────────────────
      else if (toolId === "tool-insider-trades") {
        lines.push(`\n**[${card.label}]**:`);
        if (tickerSymbols.length > 0) {
          try {
            const { data: insiders } = await sb
              .from("insider_transactions")
              .select("symbol, insider_name, position, trade_type, volume, price, trade_date")
              .in("symbol", tickerSymbols)
              .order("trade_date", { ascending: false })
              .limit(15);
            if (insiders && insiders.length > 0) {
              for (const t of insiders) {
                const priceStr = t.price != null ? ` @ ${Number(t.price).toLocaleString("vi-VN")} đ` : "";
                lines.push(`- ${t.trade_date} · **${t.symbol}** · ${t.insider_name}${t.position ? ` (${t.position})` : ""}: ${t.trade_type} ${Number(t.volume).toLocaleString("vi-VN")} CP${priceStr}`);
              }
            } else {
              lines.push("Chưa có dữ liệu giao dịch nội bộ cho các mã này.");
            }
          } catch { lines.push("Dữ liệu giao dịch nội bộ chưa có trong hệ thống."); }
        } else {
          lines.push("Kéo thêm card cổ phiếu vào context để xem giao dịch nội bộ.");
        }
      }

      // ── Báo cáo tài chính ────────────────────────────────────────────────
      else if (toolId === "tool-financial-statements") {
        lines.push(`\n**[${card.label}]**:`);
        if (tickerSymbols.length > 0) {
          try {
            const { data: fins } = await sb
              .from("financials_annual")
              .select("symbol, year, revenue, net_profit, eps, pe_ratio, pb_ratio, roe, roa, debt_to_equity")
              .in("symbol", tickerSymbols)
              .order("year", { ascending: false })
              .limit(tickerSymbols.length * 5);
            if (fins && fins.length > 0) {
              const byFin: Record<string, typeof fins> = {};
              for (const f of fins) { if (!byFin[f.symbol]) byFin[f.symbol] = []; byFin[f.symbol].push(f); }
              for (const sym of tickerSymbols) {
                const sfins = byFin[sym] ?? [];
                if (!sfins.length) { lines.push(`- ${sym}: Chưa có dữ liệu BCTC`); continue; }
                lines.push(`- **${sym}** BCTC theo năm:`);
                for (const f of sfins.slice(0, 3)) {
                  const rev = f.revenue != null ? `DT ${(Number(f.revenue) / 1e9).toFixed(1)} tỷ` : "";
                  const lnst = f.net_profit != null ? `LNST ${(Number(f.net_profit) / 1e9).toFixed(1)} tỷ` : "";
                  const eps = f.eps != null ? `EPS ${Number(f.eps).toLocaleString("vi-VN")} đ` : "";
                  const pe = f.pe_ratio != null ? `P/E ${f.pe_ratio}` : "";
                  const roe = f.roe != null ? `ROE ${(Number(f.roe) * 100).toFixed(1)}%` : "";
                  lines.push(`  ${f.year}: ${[rev, lnst, eps, pe, roe].filter(Boolean).join(" | ")}`);
                }
              }
            } else {
              lines.push("Chưa có dữ liệu BCTC trong hệ thống.");
            }
          } catch { lines.push("Dữ liệu báo cáo tài chính chưa có trong hệ thống."); }
        } else {
          lines.push("Kéo thêm card cổ phiếu vào context để xem báo cáo tài chính.");
        }
      }
    }
  }

  // ── Knowledge Base cards — fetch chunks trực tiếp theo document_id ────────
  if (knowledgeCards.length > 0) {
    lines.push("\n## TÀI LIỆU KNOWLEDGE BASE (do người dùng kéo vào)");
    lines.push("Hãy trả lời DỰA TRÊN nội dung các tài liệu này. Trích dẫn tài liệu khi cần.");

    for (const card of knowledgeCards) {
      const docId = card.id ?? "";
      lines.push(`\n### Tài liệu: ${card.label} (${card.badge ?? ""})`);

      if (!docId) {
        lines.push("(Không có document_id)");
        continue;
      }

      try {
        // Fetch tất cả chunks của document theo thứ tự — không qua semantic threshold
        const { data: chunks, error } = await sb
          .from("knowledge_chunks")
          .select("chunk_index, content")
          .eq("document_id", docId)
          .eq("user_id", userId)
          .order("chunk_index", { ascending: true })
          .limit(10);

        if (error || !chunks || chunks.length === 0) {
          lines.push("(Tài liệu chưa được xử lý hoặc không tìm thấy chunks)");
          continue;
        }

        lines.push(`Tổng ${chunks.length} đoạn văn được trích xuất:`);
        for (const c of chunks) {
          // Trim mỗi chunk để không quá dài — lấy tối đa 600 ký tự/chunk
          const text = c.content.trim().slice(0, 600);
          lines.push(`\n[Đoạn ${c.chunk_index + 1}] ${text}${c.content.length > 600 ? "…" : ""}`);
        }
      } catch (err) {
        lines.push(`(Lỗi đọc tài liệu: ${String(err)})`);
      }
    }
  }

  return lines.join("\n");
}

async function buildMarketContext(contextTicker?: string): Promise<string> {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push("══════════════════════════════════════════════════");
  lines.push("DỮ LIỆU XÁC NHẬN — CHỈ ĐƯỢC DÙNG CÁC SỐ LIỆU NÀY");
  lines.push("Mọi số liệu ngoài phần này đều KHÔNG được phép sử dụng");
  lines.push("══════════════════════════════════════════════════");
  lines.push(`Ngày hôm nay: ${today} (múi giờ Việt Nam, UTC+7)`);

  // ── 1. Market indices (VN-Index, HNX) ──────────────────────────────────────
  try {
    const { data: indices } = await sb
      .from("market_indices")
      .select("index_code, date, close, change_pt, change_pct, volume")
      .in("index_code", ["VNINDEX", "HNX"])
      .order("date", { ascending: false })
      .limit(4);

    if (indices && indices.length > 0) {
      lines.push("\n## DỮ LIỆU THỊ TRƯỜNG THỰC — Chỉ số hôm nay");
      const seen = new Set<string>();
      for (const idx of indices) {
        if (seen.has(idx.index_code)) continue;
        seen.add(idx.index_code);
        const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
        const pct   = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
        const pt    = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
        const vol   = idx.volume ? ` | KL: ${(idx.volume / 1_000_000).toFixed(1)}M` : "";
        lines.push(`- **${idx.index_code}**: ${Number(idx.close).toLocaleString("vi-VN", { minimumFractionDigits: 2 })} điểm ${arrow} ${pt} (${pct})${vol} [ngày ${idx.date}]`);
      }
    }
  } catch { /* ignore */ }

  // ── 2. VN30 prices — top movers ────────────────────────────────────────────
  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, open, close")
      .order("date", { ascending: false })
      .limit(75); // 25 stocks × 3 days buffer

    if (prices && prices.length > 0) {
      // Use latest row per symbol, compute pct = (close-open)/open — same as Dashboard
      const latestBySymbol: Record<string, { close: number; open: number }> = {};
      for (const row of prices) {
        if (!latestBySymbol[row.symbol]) {
          latestBySymbol[row.symbol] = { close: Number(row.close), open: Number(row.open) };
        }
      }

      const movers = Object.entries(latestBySymbol)
        .map(([sym, { close, open }]) => ({
          sym,
          price: close,
          pct: open > 0 ? ((close - open) / open) * 100 : 0,
        }))
        .sort((a, b) => b.pct - a.pct);

      const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
      const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();

      lines.push("\n## DỮ LIỆU THỊ TRƯỜNG THỰC — Giá VN30 cuối phiên gần nhất");
      for (const [sym, { close }] of Object.entries(latestBySymbol)) {
        lines.push(`- ${sym}: **${close.toLocaleString("vi-VN")}** đ`);
      }

      if (top5up.length > 0) {
        lines.push("\n### Top tăng VN30");
        for (const m of top5up) {
          lines.push(`- **${m.sym}**: ${m.price.toLocaleString("vi-VN")} đ (+${m.pct.toFixed(2)}%)`);
        }
      }
      if (top5down.length > 0) {
        lines.push("\n### Top giảm VN30");
        for (const m of top5down) {
          lines.push(`- **${m.sym}**: ${m.price.toLocaleString("vi-VN")} đ (${m.pct.toFixed(2)}%)`);
        }
      }
    }
  } catch { /* ignore */ }

  // ── 3. High-impact news (48h) ──────────────────────────────────────────────
  try {
    const { data: news } = await sb
      .from("market_news")
      .select("title, content_summary, label, impact_score, affected_symbols, published_at")
      .not("label", "is", null)
      .neq("label", "trash")
      .not("impact_score", "is", null)
      .gte("published_at", new Date(Date.now() - 2 * 86400000).toISOString())
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(8);

    if (news && news.length > 0) {
      lines.push("\n## Tin tức thị trường nổi bật (48h gần nhất)");
      for (const n of news) {
        const score = n.impact_score !== null
          ? ` [tác động: ${n.impact_score > 0 ? "+" : ""}${n.impact_score}]`
          : "";
        const syms = n.affected_symbols?.length
          ? ` — ${n.affected_symbols.slice(0, 3).join(", ")}`
          : "";
        lines.push(`- ${n.title}${syms}${score}`);
        if (n.content_summary) {
          lines.push(`  ${n.content_summary.substring(0, 150)}...`);
        }
      }
    }
  } catch { /* ignore */ }

  // ── 4. Context ticker deep-dive ────────────────────────────────────────────
  if (contextTicker) {
    const sym = contextTicker.toUpperCase();
    try {
      const { data: ticker } = await sb
        .from("tickers")
        .select("symbol, name, exchange, sector")
        .eq("symbol", sym)
        .single();

      if (ticker) {
        lines.push(`\n## Mã CP đang xem: ${ticker.symbol} — ${ticker.name}`);
        lines.push(`Sàn: ${ticker.exchange} | Ngành: ${ticker.sector || "N/A"}`);

        // Price history 10 days
        const { data: ph } = await sb
          .from("prices_daily")
          .select("date, open, high, low, close, volume")
          .eq("symbol", sym)
          .order("date", { ascending: false })
          .limit(10);

        if (ph && ph.length > 0) {
          const latest = ph[0];
          const prev   = ph[1];
          const chg    = prev ? Number(latest.close) - Number(prev.close) : 0;
          const chgPct = prev ? (chg / Number(prev.close)) * 100 : 0;
          lines.push(`\nGiá ${sym} cuối phiên gần nhất (${latest.date}):`);
          lines.push(`- Đóng cửa: **${Number(latest.close).toLocaleString("vi-VN")} đ** (${chg >= 0 ? "+" : ""}${chg.toLocaleString("vi-VN")} / ${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%)`);
          lines.push(`- OHLC: ${Number(latest.open).toLocaleString("vi-VN")} / ${Number(latest.high).toLocaleString("vi-VN")} / ${Number(latest.low).toLocaleString("vi-VN")} / ${Number(latest.close).toLocaleString("vi-VN")}`);
          lines.push(`- Khối lượng: ${Number(latest.volume).toLocaleString("vi-VN")} CP`);
        }

        // News for this ticker
        const { data: tickerNews } = await sb
          .from("market_news")
          .select("title, impact_score, published_at")
          .contains("affected_symbols", [sym])
          .gte("published_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("published_at", { ascending: false })
          .limit(5);

        if (tickerNews && tickerNews.length > 0) {
          lines.push(`\nTin tức về ${sym} (7 ngày gần đây):`);
          for (const n of tickerNews) {
            const score = n.impact_score != null ? ` [${n.impact_score >= 0 ? "+" : ""}${n.impact_score}]` : "";
            lines.push(`- ${n.title}${score}`);
          }
        }
      }
    } catch { /* ignore */ }
  }

  lines.push("\n══════════════════════════════════════════════════");
  lines.push("HẾT DỮ LIỆU XÁC NHẬN — KHÔNG ĐƯỢC DÙNG SỐ LIỆU NÀO NGOÀI PHẦN TRÊN");
  lines.push("══════════════════════════════════════════════════");
  return lines.join("\n");
}

// ─── RAG: semantic search in user's knowledge base ───────────────────────────

async function buildRAGContext(query: string, userId: string): Promise<string> {
  try {
    // 1. Embed the query
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });
    if (!embedRes.ok) return "";
    const embedJson = await embedRes.json();
    const embedding = embedJson.data?.[0]?.embedding;
    if (!embedding) return "";

    // 2. Match chunks from user's knowledge base
    const { data: chunks } = await sb.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_user_id: userId,
      match_count: 4,
      match_threshold: 0.65,
    });

    if (!chunks || chunks.length === 0) return "";

    // 3. Format relevant chunks
    const lines: string[] = ["\n## KIẾN THỨC TỪ THƯ VIỆN CỦA BẠN (Knowledge Base)"];
    for (const chunk of chunks) {
      lines.push(`\n---\n${chunk.content}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─── Call OpenAI (streaming) ──────────────────────────────────────────────────

async function callOpenAIStream(
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }
  return res.body!;
}

// ─── Call Anthropic (streaming) ───────────────────────────────────────────────

async function callAnthropicStream(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.filter(m => m.role !== "system"),
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err}`);
  }
  return res.body!;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sseChunk(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const jwt = authHeader.replace("Bearer ", "");
  const anonSb = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
  const { data: { user }, error: authError } = await anonSb.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // ── Parse body ──
  let body: { message: string; session_id?: string; context_ticker?: string; context_cards?: ContextCardPayload[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { message, context_ticker, context_cards } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), { status: 400 });
  }

  // ── Get or create session ──
  let sessionId = body.session_id;
  if (!sessionId) {
    const { data: sess } = await sb
      .from("chat_sessions")
      .insert({ user_id: user.id, context_ticker: context_ticker || null })
      .select("id")
      .single();
    sessionId = sess?.id;
  }

  // ── Conversation history (last 12 messages) ──
  const { data: history } = await sb
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(12);

  // ── Save user message ──
  await sb.from("chat_messages")
    .insert({ session_id: sessionId, user_id: user.id, role: "user", content: message });

  // ── Build prompt with real market data + RAG + context cards ──
  const [marketContext, ragContext, cardsContext] = await Promise.all([
    buildMarketContext(context_ticker),
    buildRAGContext(message, user.id),
    context_cards?.length ? buildContextCardsSection(context_cards, user.id, message) : Promise.resolve(""),
  ]);
  const fullSystem = `${SYSTEM_PROMPT}\n\n---\n${marketContext}${cardsContext}${ragContext}`;

  const messages: Array<{ role: string; content: string }> = [
    ...(USE_CLAUDE ? [] : [{ role: "system", content: fullSystem }]),
    ...(history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role, content: m.content,
    })),
    { role: "user", content: message },
  ];

  // ── Stream ──
  const controller = new AbortController();

  const stream = new ReadableStream({
    async start(ctrl) {
      let fullText  = "";
      let inputTok  = 0;
      let outputTok = 0;

      try {
        const aiStream = USE_CLAUDE
          ? await callAnthropicStream(fullSystem, messages, controller.signal)
          : await callOpenAIStream(messages, controller.signal);

        const reader = aiStream.getReader();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += new TextDecoder().decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;

            try {
              const json = JSON.parse(raw);

              if (USE_CLAUDE) {
                if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
                  const text = json.delta.text ?? "";
                  fullText += text;
                  ctrl.enqueue(sseChunk({ type: "chunk", text }));
                }
                if (json.type === "message_delta" && json.usage) {
                  outputTok = json.usage.output_tokens ?? 0;
                }
                if (json.type === "message_start" && json.message?.usage) {
                  inputTok = json.message.usage.input_tokens ?? 0;
                }
              } else {
                // OpenAI
                const text = json.choices?.[0]?.delta?.content ?? "";
                if (text) {
                  fullText += text;
                  ctrl.enqueue(sseChunk({ type: "chunk", text }));
                }
                if (json.usage) {
                  inputTok  = json.usage.prompt_tokens ?? 0;
                  outputTok = json.usage.completion_tokens ?? 0;
                }
              }
            } catch { /* skip */ }
          }
        }

        // ── Save assistant response ──
        const totalTokens = inputTok + outputTok;
        const { data: assistantMsg } = await sb
          .from("chat_messages")
          .insert({
            session_id: sessionId,
            user_id: user.id,
            role: "assistant",
            content: fullText,
            tokens: totalTokens || null,
          })
          .select("id")
          .single();

        // Update session title on first message
        if (!body.session_id) {
          const title = message.length > 50 ? message.substring(0, 50) + "…" : message;
          await sb.from("chat_sessions")
            .update({ title, updated_at: new Date().toISOString() })
            .eq("id", sessionId);
        } else {
          await sb.from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId);
        }

        ctrl.enqueue(sseChunk({
          type: "done",
          session_id: sessionId,
          message_id: assistantMsg?.id,
          tokens: totalTokens,
          model: MODEL_LABEL,
        }));

      } catch (err) {
        ctrl.enqueue(sseChunk({ type: "error", message: String(err) }));
      } finally {
        ctrl.close();
      }
    },
    cancel() { controller.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Session-Id": sessionId ?? "",
    },
  });
});
