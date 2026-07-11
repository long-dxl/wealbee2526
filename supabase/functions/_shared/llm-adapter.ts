/**
 * llm-adapter — MODEL_CONFIG + cost helpers + helper để build API call params.
 * Phase 1: OpenAI path hoạt động thật; Anthropic path ready, chờ ANTHROPIC_API_KEY.
 *
 * KHÔNG chứa streaming loop (quá khác nhau giữa run-agent / bee-ai-chat).
 * Chỉ export: MODEL_CONFIG, getModelConfig, costVndForModel, toAnthropicToolDef.
 * deno-lint-ignore-file no-explicit-any
 */

const USD_VND = 26000;

export interface ModelConfig {
  provider: "openai" | "anthropic";
  /** Model ID gửi tới API provider */
  apiModel: string;
  /** USD per token */
  priceIn: number;
  priceOut: number;
  priceCached: number;
}

export const MODEL_CONFIG: Record<string, ModelConfig> = {
  "gpt-4o-mini": {
    provider: "openai", apiModel: "gpt-4.1-mini",
    priceIn: 0.40 / 1e6, priceOut: 1.60 / 1e6, priceCached: 0.10 / 1e6,
  },
  "gpt-4o": {
    provider: "openai", apiModel: "gpt-4.1",
    priceIn: 2.00 / 1e6, priceOut: 8.00 / 1e6, priceCached: 0.50 / 1e6,
  },
  "claude-sonnet": {
    provider: "anthropic", apiModel: "claude-sonnet-4-6",
    priceIn: 3.00 / 1e6, priceOut: 15.00 / 1e6, priceCached: 0.30 / 1e6,
  },
  "claude-opus": {
    provider: "anthropic", apiModel: "claude-opus-4-8",
    priceIn: 15.00 / 1e6, priceOut: 75.00 / 1e6, priceCached: 1.50 / 1e6,
  },
  "gemini-pro": {
    provider: "openai", apiModel: "gpt-4.1-mini",  // placeholder — chưa có Gemini key
    priceIn: 0.40 / 1e6, priceOut: 1.60 / 1e6, priceCached: 0.10 / 1e6,
  },
  "gemini-flash": {
    provider: "openai", apiModel: "gpt-4.1-mini",  // placeholder
    priceIn: 0.40 / 1e6, priceOut: 1.60 / 1e6, priceCached: 0.10 / 1e6,
  },
};

const DEFAULT_CONFIG: ModelConfig = MODEL_CONFIG["gpt-4o-mini"];

/** Lấy config cho modelId từ Studio. Fallback về gpt-4o-mini nếu không tìm thấy. */
export function getModelConfig(studioModelId?: string | null): ModelConfig {
  return MODEL_CONFIG[studioModelId ?? ""] ?? DEFAULT_CONFIG;
}

/**
 * Tính phí VND theo bảng giá của model cụ thể.
 * cachedIn = số token input được prompt-cache (giá thấp hơn).
 */
export function costVndForModel(
  cfg: ModelConfig,
  tokensIn: number,
  tokensOut: number,
  cachedIn = 0,
): number {
  const fresh = Math.max(0, tokensIn - cachedIn);
  return (fresh * cfg.priceIn + cachedIn * cfg.priceCached + tokensOut * cfg.priceOut) * USD_VND;
}

/** Tính Beeny (4 chữ số thập phân) từ VND cost. */
export function beenyFromVnd(vnd: number, vndPerBeeny = 40): number {
  if (vnd <= 0) return 0;
  return Math.round((vnd / vndPerBeeny) * 10000) / 10000;
}

/**
 * Chuyển OpenAI tool def → Anthropic format.
 * OpenAI: { type:"function", function: { name, description, parameters } }
 * Anthropic: { name, description, input_schema }
 */
export function toAnthropicToolDef(tool: any): any {
  const fn = tool.function ?? tool;
  return {
    name: fn.name,
    description: fn.description ?? "",
    input_schema: fn.parameters ?? { type: "object", properties: {}, required: [] },
  };
}

/**
 * Kiểm tra provider có khả dụng không (key đã được set).
 * Dùng để disable model trong UI hoặc fallback khi chạy.
 */
export function isProviderAvailable(provider: "openai" | "anthropic"): boolean {
  if (provider === "openai") return !!(Deno.env.get("OPENAI_API_KEY"));
  if (provider === "anthropic") return !!(Deno.env.get("ANTHROPIC_API_KEY"));
  return false;
}
