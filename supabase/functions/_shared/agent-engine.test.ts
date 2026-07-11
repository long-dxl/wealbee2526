import { describe, expect, it } from "vitest";
import { AgentEngine } from "./agent-engine.ts";
import { ToolRegistry, type ToolDefinition } from "./tool-registry.ts";
import type { LLMAdapter, LLMEvent } from "./contracts.ts";

const def: ToolDefinition = { type: "function", function: { name: "financials", description: "BCTC", parameters: { type: "object", properties: {}, required: [] } } };

it("AgentEngine chạy nhiều vòng tool-call rồi tổng hợp", async () => {
  let round = 0;
  const adapter: LLMAdapter = { async *call(): AsyncIterable<LLMEvent> {
    if (round++ === 0) yield { type: "tool_calls", calls: [{ id: "1", name: "financials", arguments: { symbol: "HPG" } }] };
    else yield { type: "text", text: "Kết quả HPG" };
    yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
    yield { type: "done", model: "test", provider: "openai" };
  }};
  const registry = new ToolRegistry().register({ id: "financials", definition: def, handler: async () => "doanh thu" });
  const events = [];
  for await (const event of new AgentEngine(adapter).run({
    model: { provider: "openai", apiModel: "test", priceIn: 0, priceOut: 0, priceCached: 0 },
    messages: [{ role: "user", content: "HPG" }], tools: [def], registry,
    toolContext: { userId: "u", enabledToolIds: new Set(["financials"]) },
  })) events.push(event);
  expect(events.some(e => e.type === "tool_end" && e.content === "doanh thu")).toBe(true);
  expect(events.some(e => e.type === "text" && e.text === "Kết quả HPG")).toBe(true);
  expect(round).toBe(2);
});
