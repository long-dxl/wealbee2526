import { toAnthropicToolDef, type ModelConfig } from "./llm-adapter.ts";
import type { LLMAdapter, LLMEvent, LLMMessage, LLMRequest, LLMToolCall, LLMUsage } from "./contracts.ts";
export type { LLMEvent, LLMMessage, LLMRequest, LLMToolCall, LLMUsage } from "./contracts.ts";
export interface LLMResult { content: string; toolCalls: LLMToolCall[]; usage: LLMUsage; model: string; provider: ModelConfig["provider"]; }
export interface LLMRuntime { complete(request: LLMRequest): Promise<LLMResult>; }

const usage = (inputTokens = 0, outputTokens = 0, cachedInputTokens = 0): LLMUsage => ({ inputTokens, outputTokens, cachedInputTokens });
const args = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(String(raw || "{}")); } catch { return {}; }
};

export class ProviderLLMRuntime implements LLMRuntime, LLMAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  complete(req: LLMRequest): Promise<LLMResult> {
    if (req.model.provider === "openai") return this.openAI(req);
    if (req.model.provider === "anthropic") return this.anthropic(req);
    if (req.model.provider === "gemini") return this.gemini(req);
    throw new Error(`Provider không được hỗ trợ: ${String(req.model.provider)}`);
  }

  async *call(req: LLMRequest): AsyncIterable<LLMEvent> {
    const result = await this.complete(req);
    if (result.content) yield { type: "text", text: result.content };
    if (result.toolCalls.length) yield { type: "tool_calls", calls: result.toolCalls };
    yield { type: "usage", usage: result.usage };
    yield { type: "done", model: result.model, provider: result.provider };
  }

  private async openAI(req: LLMRequest): Promise<LLMResult> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY chưa được cấu hình");
    const messages = req.messages.map(m => m.role === "assistant" && m.toolCalls?.length
      ? { role: "assistant", content: m.content || null, tool_calls: m.toolCalls.map(t => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.arguments) } })) }
      : m.role === "tool" ? { role: "tool", tool_call_id: m.toolCallId, content: m.content }
      : { role: m.role, content: m.content });
    const res = await this.fetcher("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: req.model.apiModel, messages, tools: req.tools?.length ? req.tools : undefined, tool_choice: req.tools?.length ? "auto" : undefined, temperature: req.temperature ?? 0, max_tokens: req.maxTokens ?? 8000 }) });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const j = await res.json(); const m = j.choices?.[0]?.message ?? {};
    return { content: m.content ?? "", toolCalls: (m.tool_calls ?? []).map((t: any) => ({ id: t.id, name: t.function.name, arguments: args(t.function.arguments) })), usage: usage(j.usage?.prompt_tokens, j.usage?.completion_tokens, j.usage?.prompt_tokens_details?.cached_tokens), model: req.model.apiModel, provider: "openai" };
  }

  private async anthropic(req: LLMRequest): Promise<LLMResult> {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY chưa được cấu hình");
    const system = req.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const messages = req.messages.filter(m => m.role !== "system").map(m => {
      if (m.role === "assistant" && m.toolCalls?.length) return { role: "assistant", content: [{ type: "text", text: m.content }, ...m.toolCalls.map(t => ({ type: "tool_use", id: t.id, name: t.name, input: t.arguments }))] };
      if (m.role === "tool") return { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }] };
      return { role: m.role, content: m.content };
    });
    const res = await this.fetcher("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: req.model.apiModel, system, messages, tools: req.tools?.map(toAnthropicToolDef), max_tokens: req.maxTokens ?? 8000, temperature: req.temperature ?? 0 }) });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const j = await res.json(); const blocks = j.content ?? [];
    return { content: blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join(""), toolCalls: blocks.filter((b: any) => b.type === "tool_use").map((b: any) => ({ id: b.id, name: b.name, arguments: args(b.input) })), usage: usage(j.usage?.input_tokens, j.usage?.output_tokens, j.usage?.cache_read_input_tokens), model: req.model.apiModel, provider: "anthropic" };
  }

  private async gemini(req: LLMRequest): Promise<LLMResult> {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) throw new Error("GEMINI_API_KEY chưa được cấu hình");
    const systemInstruction = { parts: [{ text: req.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n") }] };
    const contents = req.messages.filter(m => m.role !== "system").map(m => {
      if (m.role === "tool") return { role: "user", parts: [{ functionResponse: { name: m.toolName, response: { result: m.content } } }] };
      return { role: m.role === "assistant" ? "model" : "user", parts: m.toolCalls?.length ? m.toolCalls.map(t => ({ functionCall: { name: t.name, args: t.arguments } })) : [{ text: m.content }] };
    });
    const declarations = req.tools?.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters }));
    const res = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${req.model.apiModel}:generateContent?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction, contents, tools: declarations?.length ? [{ functionDeclarations: declarations }] : undefined, generationConfig: { temperature: req.temperature ?? 0, maxOutputTokens: req.maxTokens ?? 8000 } }) });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const j = await res.json(); const parts = j.candidates?.[0]?.content?.parts ?? [];
    return { content: parts.map((p: any) => p.text ?? "").join(""), toolCalls: parts.filter((p: any) => p.functionCall).map((p: any, i: number) => ({ id: `gemini-${i}`, name: p.functionCall.name, arguments: args(p.functionCall.args) })), usage: usage(j.usageMetadata?.promptTokenCount, j.usageMetadata?.candidatesTokenCount, j.usageMetadata?.cachedContentTokenCount), model: req.model.apiModel, provider: "gemini" };
  }
}
