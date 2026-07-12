/**
 * Registry trung lập cho các tool mà Agent Core được phép gọi.
 * Provider-specific schema chỉ được tạo ở rìa hệ thống (OpenAI/Anthropic/Gemini).
 * deno-lint-ignore-file no-explicit-any
 */
import type { ToolDef } from "./contracts.ts";

export interface ToolFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunctionDefinition;
}

export interface ToolExecutionContext {
  userId: string;
  tenantId?: string;
  enabledToolIds: ReadonlySet<string>;
  state?: Record<string, unknown>;
}

export type ToolHandler = (
  args: Record<string, any>,
  context: ToolExecutionContext,
) => Promise<string>;

export interface RegisteredTool {
  id: string;
  definition: ToolDefinition;
  handler?: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): this {
    if (!tool.id || tool.id !== tool.definition.function.name) {
      throw new Error(`Tool id/name không khớp: ${tool.id}`);
    }
    if (this.tools.has(tool.id)) throw new Error(`Tool đã được đăng ký: ${tool.id}`);
    this.tools.set(tool.id, tool);
    return this;
  }

  get(id: string): RegisteredTool | undefined {
    return this.tools.get(id);
  }

  setHandler(id: string, handler: ToolHandler): this {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Tool không được hỗ trợ: ${id}`);
    tool.handler = handler;
    return this;
  }

  async execute(id: string, args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const tool = this.assertCallable(id, args, context);
    if (!tool.handler) throw new Error(`Tool chưa có handler: ${id}`);
    return tool.handler(args, context);
  }

  asToolDef(id: string): ToolDef {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Tool không được hỗ trợ: ${id}`);
    return {
      name: id,
      description: tool.definition.function.description,
      schema: tool.definition,
      execute: (args, context) => this.execute(id, args, context),
    };
  }

  definitions(ids: Iterable<string>): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const id of ids) {
      const tool = this.tools.get(id);
      if (tool) result.push(tool.definition);
    }
    return result;
  }

  assertCallable(id: string, args: Record<string, any>, context: ToolExecutionContext): RegisteredTool {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Tool không được hỗ trợ: ${id}`);
    if (!context.enabledToolIds.has(id)) throw new Error(`Tool không được cấp quyền cho agent: ${id}`);

    const required = tool.definition.function.parameters?.required ?? [];
    for (const field of required) {
      const value = args?.[field];
      if (value === undefined || value === null || value === "") {
        throw new Error(`Tool ${id} thiếu tham số bắt buộc: ${field}`);
      }
    }
    return tool;
  }
}

export function registryFromOpenAIDefinitions(
  definitions: Record<string, object>,
): ToolRegistry {
  const registry = new ToolRegistry();
  for (const [id, raw] of Object.entries(definitions)) {
    registry.register({ id, definition: raw as ToolDefinition });
  }
  return registry;
}
