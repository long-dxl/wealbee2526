import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderLLMRuntime } from "./llm-runtime.ts";
import { MODEL_CONFIG } from "./llm-adapter.ts";

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: (name: string) => `${name}-test` } });
});

describe("ProviderLLMRuntime", () => {
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

  it("chuẩn hóa functionCall của Gemini", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "price_feed", args: {} } }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } }), { status: 200 })) as any;
    const result = await new ProviderLLMRuntime(fetcher).complete({ model: MODEL_CONFIG["gemini-flash"], messages: [{ role: "user", content: "Giá" }] });
    expect(result.toolCalls[0].name).toBe("price_feed");
    expect(result.provider).toBe("gemini");
  });
});
