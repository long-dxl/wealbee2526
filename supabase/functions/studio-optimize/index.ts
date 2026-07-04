/**
 * studio-optimize — Use GPT-4o mini to improve a system prompt for finance agents.
 *
 * POST { prompt: string }
 * Response: { optimized_prompt: string }
 * No auth required.
 */

const OPENAI_API_KEY    = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPTIMIZER_SYSTEM = `Bạn là chuyên gia prompt engineering chuyên về các AI agent phân tích tài chính Việt Nam.

Nhiệm vụ: Nhận một system prompt thô và trả về phiên bản đã được tối ưu hóa đáng kể.

Nguyên tắc cải thiện:
1. **Cấu trúc rõ ràng**: Dùng các section: VAI TRÒ & CHUYÊN MÔN, NGỮ CẢNH ĐẦU VÀO, NHIỆM VỤ THEO THỨ TỰ ƯU TIÊN, ĐỊNH DẠNG ĐẦU RA, RÀNG BUỘC BẮT BUỘC
2. **Nhiệm vụ có thứ tự ưu tiên**: Đánh số và sắp xếp từ quan trọng nhất
3. **Định dạng output cụ thể**: Chỉ rõ cấu trúc markdown/template mong muốn
4. **Ràng buộc pháp lý đầy đủ**: Luôn có disclaimer Luật Chứng khoán 2019, NĐ 155/2020
5. **Anti-hallucination**: Thêm quy tắc "chỉ dùng dữ liệu được cung cấp"
6. **Ngắn gọn và có thể hành động**: Tối đa 400 từ, không lặp lại

Chỉ trả về prompt đã được tối ưu, không giải thích, không thêm lời dẫn.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { prompt?: string };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { prompt = "" } = body;
  if (!prompt.trim()) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    // Try Anthropic first (better at instruction-following), fall back to OpenAI
    let optimized = "";

    if (ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          temperature: 0.3,
          system: OPTIMIZER_SYSTEM,
          messages: [{ role: "user", content: `Tối ưu hóa prompt sau:\n\n${prompt}` }],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        optimized = json.content?.[0]?.text?.trim() ?? "";
      }
    }

    if (!optimized && OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: OPTIMIZER_SYSTEM },
            { role: "user",   content: `Tối ưu hóa prompt sau:\n\n${prompt}` },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        optimized = json.choices?.[0]?.message?.content?.trim() ?? "";
      }
    }

    if (!optimized) {
      return new Response(JSON.stringify({ error: "LLM không trả về kết quả" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ optimized_prompt: optimized }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
