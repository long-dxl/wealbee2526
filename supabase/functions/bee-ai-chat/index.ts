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

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY          = Deno.env.get("OPENAI_API_KEY") ?? "";
const ANTHROPIC_API_KEY       = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// Dùng Claude nếu có key, fallback OpenAI
const USE_CLAUDE = ANTHROPIC_API_KEY.length > 10;
const MODEL_LABEL = USE_CLAUDE ? "claude-sonnet-4-6" : "gpt-4.1-mini";

// Supabase client với service role (để bypass RLS khi đọc market data)
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Compliance system prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là BeeAI — trợ lý phân tích thị trường chứng khoán Việt Nam của Wealbee.

## Vai trò
- Cung cấp thông tin thị trường, tin tức, và dữ liệu tài chính chính xác
- Trả lời bằng tiếng Việt, ngắn gọn và rõ ràng
- Sử dụng số liệu cụ thể khi có thể

## Quy tắc bắt buộc (Luật Chứng khoán 2019)
- TUYỆT ĐỐI KHÔNG đưa ra khuyến nghị mua/bán cổ phiếu cụ thể
- KHÔNG dự đoán giá cụ thể hoặc đưa ra target price
- KHÔNG hứa hẹn lợi nhuận
- Thay vào đó: mô tả dữ liệu, nêu các yếu tố ảnh hưởng, cung cấp thông tin để người dùng tự quyết định

## Định dạng
- Dùng bullet points cho danh sách
- In đậm số liệu quan trọng: **1,247.68**
- Dùng emoji phù hợp: 📈 📉 💰 📊`;

// ─── Market context builder ───────────────────────────────────────────────────

async function buildMarketContext(contextTicker?: string): Promise<string> {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh"
  });
  lines.push(`Ngày hôm nay: ${today} (múi giờ Việt Nam, UTC+7)`);

  // Fetch recent high-impact news
  try {
    const { data: news } = await sb
      .from("market_news")
      .select("title, content_summary, label, impact_score, affected_symbols, published_at")
      .not("label", "is", null)
      .neq("label", "trash")
      .not("impact_score", "is", null)
      .gte("published_at", new Date(Date.now() - 2 * 86400000).toISOString())
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(6);

    if (news && news.length > 0) {
      lines.push("\n## Tin tức thị trường nổi bật (48h gần nhất)");
      for (const n of news) {
        const score = n.impact_score !== null ? ` [impact: ${n.impact_score > 0 ? "+" : ""}${n.impact_score}]` : "";
        const syms = n.affected_symbols?.length ? ` — ${n.affected_symbols.slice(0, 3).join(", ")}` : "";
        lines.push(`- ${n.title}${syms}${score}`);
        if (n.content_summary) lines.push(`  ${n.content_summary.substring(0, 120)}...`);
      }
    }
  } catch { /* ignore */ }

  // Fetch context ticker info if provided
  if (contextTicker) {
    try {
      const { data: ticker } = await sb
        .from("tickers")
        .select("symbol, name, exchange, sector")
        .eq("symbol", contextTicker.toUpperCase())
        .single();

      if (ticker) {
        lines.push(`\n## Mã CP đang xem: ${ticker.symbol} — ${ticker.name}`);
        lines.push(`Sàn: ${ticker.exchange} | Ngành: ${ticker.sector || "N/A"}`);

        // Recent news for this ticker
        const { data: tickerNews } = await sb
          .from("market_news")
          .select("title, impact_score, published_at")
          .contains("affected_symbols", [contextTicker.toUpperCase()])
          .gte("published_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("published_at", { ascending: false })
          .limit(3);

        if (tickerNews && tickerNews.length > 0) {
          lines.push(`\nTin gần đây về ${contextTicker}:`);
          for (const n of tickerNews) {
            lines.push(`- ${n.title}`);
          }
        }
      }
    } catch { /* ignore */ }
  }

  return lines.join("\n");
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
      temperature: 0.3,
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

// ─── SSE parser helpers ───────────────────────────────────────────────────────

function sseChunk(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
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

  // Verify user with anon client
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
  let body: { message: string; session_id?: string; context_ticker?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { message, context_ticker } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), { status: 400 });
  }

  // ── Get or create chat session ──
  let sessionId = body.session_id;
  if (!sessionId) {
    const { data: sess } = await sb
      .from("chat_sessions")
      .insert({ user_id: user.id, context_ticker: context_ticker || null })
      .select("id")
      .single();
    sessionId = sess?.id;
  }

  // ── Fetch conversation history (last 10 messages) ──
  const { data: history } = await sb
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(10);

  // ── Save user message ──
  const { data: userMsg } = await sb
    .from("chat_messages")
    .insert({ session_id: sessionId, user_id: user.id, role: "user", content: message })
    .select("id")
    .single();

  // ── Build messages array ──
  const marketContext = await buildMarketContext(context_ticker);
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n---\n${marketContext}`;

  const messages: Array<{ role: string; content: string }> = [
    ...(USE_CLAUDE ? [] : [{ role: "system", content: fullSystemPrompt }]),
    ...(history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  // ── Stream response ──
  const controller = new AbortController();
  const { signal } = controller;

  const stream = new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder();
      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const aiStream = USE_CLAUDE
          ? await callAnthropicStream(fullSystemPrompt, messages, signal)
          : await callOpenAIStream(messages, signal);

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
                // Anthropic SSE format
                if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
                  const text = json.delta.text ?? "";
                  fullText += text;
                  ctrl.enqueue(sseChunk({ type: "chunk", text }));
                }
                if (json.type === "message_delta" && json.usage) {
                  outputTokens = json.usage.output_tokens ?? 0;
                }
                if (json.type === "message_start" && json.message?.usage) {
                  inputTokens = json.message.usage.input_tokens ?? 0;
                }
              } else {
                // OpenAI SSE format
                const text = json.choices?.[0]?.delta?.content ?? "";
                if (text) {
                  fullText += text;
                  ctrl.enqueue(sseChunk({ type: "chunk", text }));
                }
                if (json.usage) {
                  inputTokens = json.usage.prompt_tokens ?? 0;
                  outputTokens = json.usage.completion_tokens ?? 0;
                }
              }
            } catch { /* skip malformed SSE */ }
          }
        }

        // Save assistant message
        const totalTokens = inputTokens + outputTokens;
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

        // Update session title if first exchange
        if (!body.session_id) {
          const title = message.length > 40 ? message.substring(0, 40) + "…" : message;
          await sb.from("chat_sessions").update({ title }).eq("id", sessionId);
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
    cancel() {
      controller.abort();
    },
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
