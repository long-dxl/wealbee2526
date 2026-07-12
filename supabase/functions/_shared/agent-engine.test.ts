import { describe, expect, it } from "vitest";
import { AgentEngine, type AgentEngineEvent } from "./agent-engine.ts";
import { ToolRegistry, type ToolDefinition } from "./tool-registry.ts";
import type { LLMAdapter, LLMEvent } from "./contracts.ts";

const def: ToolDefinition = { type: "function", function: { name: "financials", description: "BCTC", parameters: { type: "object", properties: {}, required: [] } } };
const makeRegistry = (handler = async () => "doanh thu HPG") =>
  new ToolRegistry().register({ id: "financials", definition: def, handler });
const baseReq = (_adapter: LLMAdapter, registry: ToolRegistry) => ({
  model: { provider: "openai" as const, apiModel: "test", priceIn: 0, priceOut: 0, priceCached: 0 },
  messages: [{ role: "user" as const, content: "HPG" }], tools: [def], registry,
  toolContext: { userId: "u", enabledToolIds: new Set(["financials"]) },
});

it("AgentEngine chạy nhiều vòng tool-call rồi tổng hợp", async () => {
  let round = 0;
  const adapter: LLMAdapter = { async *call(): AsyncIterable<LLMEvent> {
    if (round++ === 0) yield { type: "tool_calls", calls: [{ id: "1", name: "financials", arguments: { symbol: "HPG" } }] };
    else yield { type: "text", text: "Kết quả HPG" };
    yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
    yield { type: "done", model: "test", provider: "openai" };
  }};
  const events: AgentEngineEvent[] = [];
  for await (const e of new AgentEngine(adapter).run(baseReq(adapter, makeRegistry()))) events.push(e);
  expect(events.some(e => e.type === "tool_end" && e.content === "doanh thu HPG")).toBe(true);
  expect(events.some(e => e.type === "text" && e.text === "Kết quả HPG")).toBe(true);
  expect(round).toBe(2);
});

describe("AgentEngine edge cases", () => {
  it("không có tools → gọi LLM 1 lần và xong ngay", async () => {
    let callCount = 0;
    const adapter: LLMAdapter = { async *call(): AsyncIterable<LLMEvent> {
      callCount++;
      yield { type: "text", text: "Xin chào" };
      yield { type: "usage", usage: { inputTokens: 5, outputTokens: 3, cachedInputTokens: 0 } };
      yield { type: "done", model: "test", provider: "openai" };
    }};
    const registry = new ToolRegistry();
    const events: AgentEngineEvent[] = [];
    for await (const e of new AgentEngine(adapter).run({
      ...baseReq(adapter, registry), tools: [], registry,
      toolContext: { userId: "u", enabledToolIds: new Set() },
    })) events.push(e);
    expect(callCount).toBe(1);
    expect(events.some(e => e.type === "text" && e.text === "Xin chào")).toBe(true);
    expect(events.some(e => e.type === "done")).toBe(true);
  });

  it("dừng đúng tại maxToolIterations — gọi LLM không tools ở vòng cuối", async () => {
    let round = 0;
    const adapter: LLMAdapter = { async *call(req): AsyncIterable<LLMEvent> {
      // Mỗi vòng đều trả về tool_call → agent sẽ bị cắt tại max
      if (req.tools?.length) yield { type: "tool_calls", calls: [{ id: String(round), name: "financials", arguments: {} }] };
      else yield { type: "text", text: "Đã đến giới hạn" };
      round++;
      yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
      yield { type: "done", model: "test", provider: "openai" };
    }};
    const events: AgentEngineEvent[] = [];
    for await (const e of new AgentEngine(adapter).run({ ...baseReq(adapter, makeRegistry()), maxToolIterations: 2 })) events.push(e);
    // round phải là 3: 2 tool iterations + 1 final call without tools
    expect(round).toBe(3);
    expect(events.some(e => e.type === "text")).toBe(true);
  });

  it("tool execute ném lỗi → trả error string, không crash engine", async () => {
    let round = 0;
    const adapter: LLMAdapter = { async *call(): AsyncIterable<LLMEvent> {
      if (round++ === 0) yield { type: "tool_calls", calls: [{ id: "1", name: "financials", arguments: {} }] };
      else yield { type: "text", text: "Xử lý xong dù có lỗi" };
      yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
      yield { type: "done", model: "test", provider: "openai" };
    }};
    const badRegistry = new ToolRegistry().register({
      id: "financials", definition: def,
      handler: async () => { throw new Error("DB timeout"); },
    });
    const events: any[] = [];
    for await (const e of new AgentEngine(adapter).run(baseReq(adapter, badRegistry))) events.push(e);
    const toolEnd = events.find(e => e.type === "tool_end");
    expect(toolEnd).toBeDefined();
    expect(toolEnd.content).toContain("Lỗi thực thi tool");
    expect(toolEnd.content).toContain("DB timeout");
  });

  it("nhiều tool calls song song trong 1 response đều được thực thi", async () => {
    const def2: ToolDefinition = { type: "function", function: { name: "news_feed", description: "Tin", parameters: { type: "object", properties: {}, required: [] } } };
    let round = 0;
    const adapter: LLMAdapter = { async *call(): AsyncIterable<LLMEvent> {
      if (round++ === 0) yield { type: "tool_calls", calls: [
        { id: "1", name: "financials", arguments: {} },
        { id: "2", name: "news_feed", arguments: {} },
      ]};
      else yield { type: "text", text: "Tổng hợp" };
      yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
      yield { type: "done", model: "test", provider: "openai" };
    }};
    const registry = new ToolRegistry()
      .register({ id: "financials", definition: def, handler: async () => "BCTC" })
      .register({ id: "news_feed", definition: def2, handler: async () => "Tin tức" });
    const events: AgentEngineEvent[] = [];
    for await (const e of new AgentEngine(adapter).run({
      ...baseReq(adapter, registry), tools: [def, def2],
      toolContext: { userId: "u", enabledToolIds: new Set(["financials", "news_feed"]) },
    })) events.push(e);
    const toolEnds = events.filter(e => e.type === "tool_end");
    expect(toolEnds).toHaveLength(2);
    expect(toolEnds.some((e: any) => e.content === "BCTC")).toBe(true);
    expect(toolEnds.some((e: any) => e.content === "Tin tức")).toBe(true);
  });
});