import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicAdapter, GeminiAdapter, OpenAIAdapter, ProviderLLMRuntime } from "./llm-runtime.ts";
import { MODEL_CONFIG } from "./llm-adapter.ts";

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: (name: string) => `${name}-test` } });
});

describe("ProviderLLMRuntime", () => {
  it("có adapter riêng cho từng provider và phát event contract", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: {} }), { status: 200 })) as any;
    const events = [];
    for await (const event of new OpenAIAdapter(fetcher).call({ model: MODEL_CONFIG["gpt-4o-mini"], messages: [{ role: "user", content: "hi" }] })) events.push(event);
    expect(events.map(e => e.type)).toEqual(["text", "usage", "done"]);
    expect(new AnthropicAdapter(fetcher)).toBeInstanceOf(AnthropicAdapter);
    expect(new GeminiAdapter(fetcher)).toBeInstanceOf(GeminiAdapter);
  });
  it("chuẩn hóa tool call và usage của OpenAI", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "financials", arguments: '{"symbol":"HPG"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }), { status: 200 })) as any;
    const result = await new ProviderLLMRuntime(fetcher).complete({ model: MODEL_CONFIG["gpt-4o-mini"], messages: [{ role: "user", content: "HPG" }] });
    expect(result.toolCalls[0]).toEqual({ id: "c1", name: "financials", arguments: { symbol: "HPG" } });
    expect(result.usage.inputTokens).toBe(10);
  });

  it("chuẩn hóa native tool_use của Anthropic", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "tool_use", id: "c2", name: "news_feed", input: { symbols: ["HPG"] } }], usage: { input_tokens: 8, output_tokens: 3 } }), { status: 200 })) as any;
    const result = await new ProviderLLMRuntime(fetcher).complete({ model: MODEL_CONFIG["claude-sonnet"], messages: [{ role: "user", content: "Tin HPG" }] });
    expect(result.toolCalls[0].name).toBe("news_feed");
    expect(result.provider).toBe("anthropic");
  });

  it("Anthropic gộp các tool_result song song vào một user message", async () => {
    let body: any;
    const fetcher = vi.fn(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], usage: {} }), { status: 200 });
    }) as any;
    await new ProviderLLMRuntime(fetcher).complete({ model: MODEL_CONFIG["claude-sonnet"], messages: [
      { role: "user", content: "x" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "financials", arguments: {} }, { id: "b", name: "news_feed", arguments: {} }] },
      { role: "tool", toolCallId: "a", toolName: "financials", content: "fa" },
      { role: "tool", toolCallId: "b", toolName: "news_feed", content: "nb" },
    ] });
    expect(body.messages.at(-1).content).toHaveLength(2);
  });

  it("chuẩn hóa functionCall của Gemini", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "price_feed", args: {} } }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } }), { status: 200 })) as any;
    const result = await new ProviderLLMRuntime(fetcher).complete({ model: MODEL_CONFIG["gemini-flash"], messages: [{ role: "user", content: "Giá" }] });
    expect(result.toolCalls[0].name).toBe("price_feed");
    expect(result.provider).toBe("gemini");
  });
});
