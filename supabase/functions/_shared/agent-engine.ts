import type { LLMAdapter, LLMMessage, LLMRequest, LLMToolCall, LLMUsage, ToolContext } from "./contracts.ts";
import type { ToolRegistry } from "./tool-registry.ts";

export type AgentEngineEvent =
  | { type: "tool_start"; call: LLMToolCall }
  | { type: "tool_end"; call: LLMToolCall; content: string }
  | { type: "text"; text: string }
  | { type: "usage"; usage: LLMUsage }
  | { type: "done"; messages: LLMMessage[] };

export interface AgentEngineRequest extends LLMRequest {
  registry: ToolRegistry;
  toolContext: ToolContext;
  maxToolIterations?: number;
}

export class AgentEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async *run(request: AgentEngineRequest): AsyncIterable<AgentEngineEvent> {
    const messages = [...request.messages];
    const max = request.maxToolIterations ?? 8;
    for (let iteration = 0; iteration <= max; iteration++) {
      let text = "";
      let calls: LLMToolCall[] = [];
      const tools = iteration === max ? undefined : request.tools;
      for await (const event of this.adapter.call({ ...request, messages, tools })) {
        if (event.type === "text") text += event.text;
        if (event.type === "tool_calls") calls = event.calls;
        if (event.type === "usage") yield event;
      }
      if (!calls.length || iteration === max) {
        if (text) yield { type: "text", text };
        messages.push({ role: "assistant", content: text });
        yield { type: "done", messages };
        return;
      }

      messages.push({ role: "assistant", content: text, toolCalls: calls });
      for (const call of calls) yield { type: "tool_start", call };
      const results = await Promise.all(calls.map(async call => {
        let content: string;
        try { content = await request.registry.execute(call.name, call.arguments, request.toolContext); }
        catch (error) { content = `Lỗi thực thi tool ${call.name}: ${String(error)}`; }
        return { call, content };
      }));
      for (const { call, content } of results) {
        yield { type: "tool_end", call, content };
        messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content });
      }
    }
  }
}
