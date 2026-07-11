import type { ModelConfig } from "./llm-adapter.ts";

export type LLMRole = "system" | "user" | "assistant" | "tool";
export interface LLMToolCall { id: string; name: string; arguments: Record<string, unknown>; }
export interface LLMMessage { role: LLMRole; content: string; toolCallId?: string; toolName?: string; toolCalls?: LLMToolCall[]; }
export interface LLMUsage { inputTokens: number; outputTokens: number; cachedInputTokens: number; }
export interface LLMRequest { model: ModelConfig; messages: LLMMessage[]; tools?: ToolSchema[]; maxTokens?: number; temperature?: number; }

export type LLMEvent =
  | { type: "text"; text: string }
  | { type: "tool_calls"; calls: LLMToolCall[] }
  | { type: "usage"; usage: LLMUsage }
  | { type: "done"; model: string; provider: ModelConfig["provider"] };

export interface LLMAdapter {
  call(request: LLMRequest): AsyncIterable<LLMEvent>;
}

export interface ToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolContext {
  userId: string;
  tenantId?: string;
  enabledToolIds: ReadonlySet<string>;
  state?: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  description: string;
  schema: ToolSchema;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<string>;
}
