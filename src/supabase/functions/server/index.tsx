import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Explicit OPTIONS handler — returns 204 with CORS headers for all preflight requests
app.options("/*", (c) => {
  return c.text("", 204);
});

// Health check endpoint
app.get("/make-server-aa51327d/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Helper: verify JWT and return {userId, supabase} ────────────────────────
async function verifyAuth(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { userId: null, supabase: null };
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { userId: null, supabase };
  return { userId: user.id, supabase };
}

// ─── Helper: build portfolio context ─────────────────────────────────────────
async function buildPortfolioContext(supabase: any, userId: string): Promise<string> {
  const lines: string[] = [];

  // Stocks
  try {
    const { data: stocks } = await supabase
      .from("stocks_assets")
      .select(`
        symbol, quantity, average_cost,
        market_data_stocks!inner(company_name, current_price)
      `)
      .eq("user_id", userId);

    if (stocks && stocks.length > 0) {
      lines.push("\n### Cổ phiếu đang nắm giữ:");
      for (const s of stocks) {
        const mds = s.market_data_stocks;
        const gainPct = mds?.current_price && s.average_cost
          ? (((mds.current_price - s.average_cost) / s.average_cost) * 100).toFixed(1)
          : "N/A";
        lines.push(
          `- ${s.symbol} (${mds?.company_name ?? ""}): ${s.quantity} cp, giá TB ${s.average_cost?.toLocaleString("vi-VN")} VND, hiện tại ${mds?.current_price?.toLocaleString("vi-VN")} VND (${gainPct}%)`
        );
      }
    }
  } catch (e) {
    console.log("stocks_assets query error:", e);
  }

  // Performance view
  try {
    const { data: perf } = await supabase
      .from("user_stocks_performance")
      .select("*")
      .eq("user_id", userId);

    if (perf && perf.length > 0) {
      const totalGain = perf.reduce((s: number, r: any) => s + (r.unrealized_gain_loss ?? 0), 0);
      lines.push(`\nTổng lãi/lỗ cổ phiếu chưa thực hiện: ${totalGain.toLocaleString("vi-VN")} VND`);
    }
  } catch (e) {
    console.log("user_stocks_performance query error:", e);
  }

  // Dividend summary
  try {
    const { data: divs } = await supabase
      .from("user_dividend_summary")
      .select("*")
      .eq("user_id", userId);

    if (divs && divs.length > 0) {
      const totalDiv = divs.reduce((s: number, r: any) => s + (r.annual_income ?? 0), 0);
      lines.push(`Thu nhập cổ tức dự kiến: ${totalDiv.toLocaleString("vi-VN")} VND/năm`);
    }
  } catch (e) {
    console.log("user_dividend_summary query error:", e);
  }

  // Gold
  try {
    const { data: gold } = await supabase
      .from("gold_assets")
      .select(`
        gold_type, quantity, average_cost,
        market_data_gold!inner(buy_price, sell_price)
      `)
      .eq("user_id", userId);

    if (gold && gold.length > 0) {
      lines.push("\n### Vàng:");
      for (const g of gold) {
        lines.push(
          `- ${g.gold_type}: ${g.quantity} lượng, giá mua TB ${g.average_cost?.toLocaleString("vi-VN")} VND/lượng, giá bán hiện tại ${g.market_data_gold?.sell_price?.toLocaleString("vi-VN")} VND/lượng`
        );
      }
    }
  } catch (e) {
    console.log("gold_assets query error:", e);
  }

  // Crypto
  try {
    const { data: crypto } = await supabase
      .from("crypto_assets")
      .select(`
        symbol, quantity, average_cost,
        market_data_crypto!inner(current_price)
      `)
      .eq("user_id", userId);

    if (crypto && crypto.length > 0) {
      lines.push("\n### Crypto:");
      for (const c of crypto) {
        lines.push(
          `- ${c.symbol}: ${c.quantity}, giá mua TB $${c.average_cost}, giá hiện tại $${c.market_data_crypto?.current_price}`
        );
      }
    }
  } catch (e) {
    console.log("crypto_assets query error:", e);
  }

  // Fixed income
  try {
    const { data: fi } = await supabase
      .from("fixed_income_assets")
      .select("institution_name, principal_amount, interest_rate, maturity_date")
      .eq("user_id", userId)
      .eq("status", "active");

    if (fi && fi.length > 0) {
      lines.push("\n### Thu nhập cố định:");
      for (const f of fi) {
        lines.push(
          `- ${f.institution_name}: ${f.principal_amount?.toLocaleString("vi-VN")} VND, lãi suất ${f.interest_rate}%/năm, đáo hạn ${f.maturity_date}`
        );
      }
    }
  } catch (e) {
    console.log("fixed_income_assets query error:", e);
  }

  if (lines.length === 0) return "";
  return "\n\n## DANH MỤC ĐẦU TƯ CỦA NGƯỜI DÙNG (Dữ liệu real-time)\n" + lines.join("\n") +
    "\n\nHãy cá nhân hóa câu trả lời dựa trên danh mục này. Nếu user hỏi về cổ phiếu họ đang nắm giữ, tham chiếu đến giá mua và lãi/lỗ thực tế của họ.";
}

// ─── Helper: build stock context ─────────────────────────────────────────────
async function buildStockContext(supabase: any, symbol: string): Promise<string> {
  const lines: string[] = [];
  try {
    const { data: mds } = await supabase
      .from("market_data_stocks")
      .select("*")
      .eq("symbol", symbol)
      .single();

    const { data: fund } = await supabase
      .from("market_stocks_fundamentals")
      .select("*")
      .eq("symbol", symbol)
      .single();

    const { data: divHistory } = await supabase
      .from("market_data_dividends")
      .select("ex_dividend_date, dividend_amount, dividend_type")
      .eq("symbol", symbol)
      .order("ex_dividend_date", { ascending: false })
      .limit(20);

    if (mds) {
      lines.push(`\n\n## DỮ LIỆU CỔ PHIẾU ${symbol} - ${mds.company_name}`);
      lines.push("\n### Giá & Định giá:");
      lines.push(`- Giá hiện tại: ${mds.current_price?.toLocaleString("vi-VN")} VND`);
      if (fund) {
        lines.push(`- P/E: ${fund.pe_ratio ?? "N/A"} | P/B: ${fund.pb_ratio ?? "N/A"}`);
        lines.push(`- ROE: ${fund.roe_pct ?? "N/A"}% | ROA: ${fund.roa_pct ?? "N/A"}%`);
        lines.push(`- Biên lợi nhuận ròng: ${fund.net_margin_pct ?? "N/A"}%`);
        lines.push(`- Debt/Equity: ${fund.debt_to_equity ?? "N/A"}`);
        lines.push(`- Dividend Safety Score: ${fund.dividend_safety_score ?? "N/A"}/100`);
      }
      if (mds.gross_margin_pct !== undefined) {
        lines.push("\n### Biên lợi nhuận:");
        lines.push(`- Gross Margin: ${mds.gross_margin_pct}% | Operating Margin: ${mds.operating_margin_pct}% | Net Margin: ${mds.net_margin_pct}%`);
      }
    }

    if (divHistory && divHistory.length > 0) {
      lines.push("\n### Lịch sử cổ tức gần đây:");
      for (const d of divHistory.slice(0, 5)) {
        lines.push(`- ${d.ex_dividend_date}: ${d.dividend_amount?.toLocaleString("vi-VN")} VND (${d.dividend_type})`);
      }
    }

    lines.push("\nHãy phân tích dựa trên dữ liệu thực này. So sánh các chỉ số với mức trung bình ngành nếu có thể.");
  } catch (e) {
    console.log("buildStockContext error:", e);
  }
  return lines.join("\n");
}

// ─── POST /make-server-aa51327d/pi-ai-chat ───────────────────────────────────
app.post("/make-server-aa51327d/pi-ai-chat", async (c) => {
  try {
    const { userId, supabase } = await verifyAuth(c.req.header("Authorization"));
    if (!userId || !supabase) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { message, conversationId, contextType = "general", contextSymbol } = await c.req.json();
    if (!message) return c.json({ error: "Message is required" }, 400);

    const apiKey = Deno.env.get("GOOGLE_AI_STUDIO_KEY");
    if (!apiKey) return c.json({ error: "AI API key not configured" }, 500);

    // B. Rate limiting
    const today = new Date().toISOString().split("T")[0];
    const { data: usageData } = await supabase
      .from("ai_usage")
      .select("message_count")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (usageData && usageData.message_count >= 50) {
      return c.json({ error: "Giới hạn 50 tin nhắn/ngày" }, 429);
    }

    // C. Conversation management
    let activeConversationId = conversationId ?? null;
    if (activeConversationId) {
      const { data: conv } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", activeConversationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!conv) return c.json({ error: "Conversation not found" }, 404);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          title: "Cuộc trò chuyện mới",
          context_type: contextType,
          context_symbol: contextSymbol ?? null,
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      activeConversationId = newConv.id;
    }

    // D. Portfolio context
    let portfolioContext = "";
    try {
      portfolioContext = await buildPortfolioContext(supabase, userId);
    } catch (e) {
      console.log("portfolioContext error:", e);
    }

    // E. Stock context
    let stockContext = "";
    if (contextType === "stock_analysis" && contextSymbol) {
      try {
        stockContext = await buildStockContext(supabase, contextSymbol);
      } catch (e) {
        console.log("stockContext error:", e);
      }
    }

    // F. Load conversation history
    const { data: historyRows } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", activeConversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    const conversationHistory = (historyRows ?? []).map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    // G. Build system prompt and call Gemini
    const systemPrompt = `Bạn là Bee AI - trợ lý đầu tư tài chính cá nhân của Wealthbee, nền tảng quản lý danh mục đầu tư hàng đầu Việt Nam.

## VAI TRÒ
Bạn là một chuyên gia tài chính với kiến thức sâu về thị trường chứng khoán Việt Nam (HOSE, HNX, UPCOM), vàng, crypto, trái phiếu và các kênh đầu tư khác. Bạn tư vấn dựa trên dữ liệu thực từ danh mục của người dùng.

## NGUYÊN TẮC BẮT BUỘC
1. LUÔN trả lời bằng tiếng Việt tự nhiên, thân thiện nhưng chuyên nghiệp
2. LUÔN sử dụng format VND cho tiền Việt (VD: 50.000 VND, 1.2 tỷ VND)
3. LUÔN đưa phân tích dựa trên số liệu cụ thể, không nói chung chung
4. LUÔN nhắc disclaimer: "Đây là phân tích tham khảo, không phải lời khuyên đầu tư chính thức"
5. KHÔNG khuyến khích đầu cơ ngắn hạn, margin, hoặc all-in vào 1 mã
6. KHÔNG bịa số liệu - nếu không biết, nói rõ "Tôi chưa có dữ liệu này"
7. SỬ DỤNG emoji vừa phải để tăng readability (📊 💰 📈 ⚠️ ✅)
8. TRẢ LỜI ngắn gọn (dưới 500 từ) trừ khi user yêu cầu phân tích chi tiết

## KHẢ NĂNG
- Phân tích cổ phiếu (fundamental & technical overview)
- Đánh giá sức khỏe danh mục đầu tư
- Tính toán và dự báo thu nhập cổ tức
- So sánh cổ phiếu cùng ngành
- Giải thích khái niệm tài chính đơn giản
- Đề xuất phân bổ tài sản (asset allocation)
- Phân tích rủi ro danh mục

## FORMAT TRẢ LỜI ƯU TIÊN
- Dùng bullet points thay vì đoạn văn dài
- Dùng headers (##) cho các phần chính
- Highlight số liệu quan trọng
- Kết thúc bằng tóm tắt hành động cụ thể`;

    const fullSystemText = systemPrompt + portfolioContext + stockContext;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: fullSystemText }],
          },
          contents: [
            ...conversationHistory,
            { role: "user", parts: [{ text: message }] },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.log(`Gemini API error: ${geminiRes.status} - ${errText}`);
      return c.json({ error: `Gemini API error: ${geminiRes.status}`, details: errText }, 500);
    }

    const geminiData = await geminiRes.json();
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      console.log("No candidates from Gemini:", JSON.stringify(geminiData));
      return c.json({ error: "No response from AI", details: geminiData }, 500);
    }

    const aiText: string = geminiData.candidates[0].content.parts[0].text;
    const tokensUsed: number = geminiData.usageMetadata?.totalTokenCount ?? 0;

    // H. Save to database (parallel)
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: convInfo } = await supabase
      .from("ai_conversations")
      .select("message_count, title")
      .eq("id", activeConversationId)
      .single();

    const isFirstMsg = (convInfo?.message_count ?? 0) === 0;
    const newTitle = isFirstMsg
      ? message.substring(0, 40) + (message.length > 40 ? "..." : "")
      : convInfo?.title ?? "Cuộc trò chuyện mới";

    await Promise.all([
      supabase.from("ai_messages").insert({
        id: userMsgId,
        conversation_id: activeConversationId,
        user_id: userId,
        role: "user",
        content: message,
        created_at: now,
      }),
      supabase.from("ai_messages").insert({
        id: assistantMsgId,
        conversation_id: activeConversationId,
        user_id: userId,
        role: "assistant",
        content: aiText,
        tokens_used: tokensUsed,
        model_used: "gemini-2.5-flash",
      }),
      supabase
        .from("ai_conversations")
        .update({
          message_count: (convInfo?.message_count ?? 0) + 2,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          title: newTitle,
        })
        .eq("id", activeConversationId),
      supabase.from("ai_usage").upsert(
        {
          user_id: userId,
          date: today,
          message_count: (usageData?.message_count ?? 0) + 1,
          total_tokens: tokensUsed,
        },
        { onConflict: "user_id,date" }
      ),
    ]);

    // I. Return
    return c.json({
      response: aiText,
      conversationId: activeConversationId,
      messageId: assistantMsgId,
      tokensUsed,
      remainingMessages: 50 - ((usageData?.message_count ?? 0) + 1),
    });
  } catch (error) {
    console.log("Bee AI Chat Error:", error);
    return c.json({
      error: "Failed to process chat request",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ─── GET /make-server-aa51327d/conversations ─────────────────────────────────
app.get("/make-server-aa51327d/conversations", async (c) => {
  try {
    const { userId, supabase } = await verifyAuth(c.req.header("Authorization"));
    if (!userId || !supabase) return c.json({ error: "Unauthorized" }, 401);

    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, title, context_type, context_symbol, message_count, last_message_at, created_at, updated_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return c.json({ conversations: data ?? [] });
  } catch (error) {
    console.log("GET conversations error:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// ─── GET /make-server-aa51327d/messages/:conversationId ──────────────────────
app.get("/make-server-aa51327d/messages/:conversationId", async (c) => {
  try {
    const { userId, supabase } = await verifyAuth(c.req.header("Authorization"));
    if (!userId || !supabase) return c.json({ error: "Unauthorized" }, 401);

    const conversationId = c.req.param("conversationId");

    // Verify ownership
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    const { data, error } = await supabase
      .from("ai_messages")
      .select("id, role, content, tokens_used, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return c.json({ messages: data ?? [] });
  } catch (error) {
    console.log("GET messages error:", error);
    return c.json({ error: "Failed to fetch messages" }, 500);
  }
});

// ─── DELETE /make-server-aa51327d/conversations/:id ──────────────────────────
app.delete("/make-server-aa51327d/conversations/:id", async (c) => {
  try {
    const { userId, supabase } = await verifyAuth(c.req.header("Authorization"));
    if (!userId || !supabase) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");

    // Verify ownership
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    const { error } = await supabase
      .from("ai_conversations")
      .update({ is_active: false })
      .eq("id", id);

    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    console.log("DELETE conversation error:", error);
    return c.json({ error: "Failed to delete conversation" }, 500);
  }
});

// ─── POST /make-server-aa51327d/agent-dry-run ────────────────────────────────
// Fetch real news from market_news → call OpenAI (gpt-4.1-mini) → return brief
app.post("/make-server-aa51327d/agent-dry-run", async (c) => {
  try {
    const { userId, supabase } = await verifyAuth(c.req.header("Authorization"));
    if (!userId || !supabase) return c.json({ error: "Unauthorized" }, 401);

    const { systemPrompt } = await c.req.json();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return c.json({ error: "OPENAI_API_KEY chưa được cấu hình." }, 500);

    // 1. Get user's watch_symbols
    const { data: sub } = await supabase
      .from("digest_subscribers")
      .select("watch_symbols")
      .eq("user_id", userId)
      .maybeSingle();

    const watchSymbols: string[] = sub?.watch_symbols ?? [];
    if (watchSymbols.length === 0) {
      return c.json({ error: "Chưa có mã cổ phiếu theo dõi nào." }, 400);
    }

    // 2. Fetch recent labeled news (48h, non-trash) — same as email_notifier
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: news } = await supabase
      .from("market_news")
      .select("title,content_summary,label,impact_score,impact_reasoning,symbol,affected_symbols,source,published_at,news_type")
      .in("label", ["very_positive", "positive", "negative", "very_negative"])
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(80);

    // 3. Filter relevant to watch_symbols (direct symbol OR in affected_symbols)
    const relevant = (news ?? []).filter((n: any) => {
      const sym: string = n.symbol ?? "";
      const affected: string[] = n.affected_symbols ?? [];
      return watchSymbols.includes(sym) || affected.some((s: string) => watchSymbols.includes(s));
    });

    // 4. Group by symbol, sort by |impact_score| desc (same as email_notifier)
    const bySymbol: Record<string, any[]> = {};
    for (const sym of watchSymbols) bySymbol[sym] = [];
    for (const item of relevant) {
      const sym: string = item.symbol ?? "";
      const affected: string[] = item.affected_symbols ?? [];
      const targets = watchSymbols.filter(s => s === sym || affected.includes(s));
      for (const t of targets) {
        if (!bySymbol[t]) bySymbol[t] = [];
        if (!bySymbol[t].find((x: any) => x.title === item.title)) bySymbol[t].push(item);
      }
    }
    for (const sym of watchSymbols) {
      bySymbol[sym].sort((a: any, b: any) => Math.abs(b.impact_score ?? 0) - Math.abs(a.impact_score ?? 0));
    }

    // 5. Build news context (same structure as pipeline_runner user_text)
    let newsContext = `Ngày: ${new Date().toLocaleDateString("vi-VN")}\nMã theo dõi: ${watchSymbols.join(", ")}\n\n`;
    newsContext += "=== TIN TỨC 48H (đã label bởi AI) ===\n\n";
    for (const sym of watchSymbols) {
      const items = bySymbol[sym] ?? [];
      if (items.length === 0) continue;
      newsContext += `## ${sym}\n`;
      for (const n of items.slice(0, 5)) {
        const score = n.impact_score != null ? ` [score: ${n.impact_score > 0 ? "+" : ""}${n.impact_score}]` : "";
        newsContext += `[${(n.label ?? "").toUpperCase()}${score}] ${n.title}\n`;
        if (n.content_summary) newsContext += `Tóm tắt: ${n.content_summary}\n`;
        if (n.impact_reasoning) newsContext += `Reasoning: ${n.impact_reasoning}\n`;
        newsContext += `Nguồn: ${n.source ?? "N/A"} | ${(n.published_at ?? "").slice(0, 10)}\n\n`;
      }
    }
    if (relevant.length === 0) newsContext += "(Không có tin tức liên quan trong 48h qua)\n";

    // 6. Call OpenAI gpt-4.1-mini (same model as pipeline_runner)
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: newsContext },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return c.json({ error: `OpenAI API error: ${openaiRes.status}`, details: errText }, 500);
    }

    const openaiData = await openaiRes.json();
    const brief: string = openaiData.choices?.[0]?.message?.content ?? "";
    const tokensUsed: number = openaiData.usage?.total_tokens ?? 0;

    return c.json({ brief, tokensUsed, newsCount: relevant.length, symbols: watchSymbols, model: "gpt-4.1-mini" });
  } catch (error) {
    console.log("agent-dry-run error:", error);
    return c.json({ error: "Failed to run agent", details: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
