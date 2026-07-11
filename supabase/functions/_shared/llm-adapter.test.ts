import { beforeEach, describe, expect, it, vi } from "vitest";
import { beenyFromVnd, costVndForModel, getModelConfig, MODEL_CONFIG, toAnthropicToolDef } from "./llm-adapter.ts";

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: (k: string) => k === "OPENAI_API_KEY" ? "sk-test" : undefined } });
});

describe("getModelConfig", () => {
  it("trả đúng config cho model đã đăng ký", () => {
    expect(getModelConfig("gpt-4o").apiModel).toBe("gpt-4.1");
    expect(getModelConfig("claude-sonnet").provider).toBe("anthropic");
    expect(getModelConfig("gemini-pro").provider).toBe("gemini");
  });

  it("model không biết → fallback về gpt-4o-mini", () => {
    const cfg = getModelConfig("unknown-model-xyz");
    expect(cfg.apiModel).toBe(MODEL_CONFIG["gpt-4o-mini"].apiModel);
  });

  it("null / undefined → fallback về gpt-4o-mini", () => {
    expect(getModelConfig(null).apiModel).toBe(MODEL_CONFIG["gpt-4o-mini"].apiModel);
    expect(getModelConfig(undefined).apiModel).toBe(MODEL_CONFIG["gpt-4o-mini"].apiModel);
  });

  it("gpt-4o đắt hơn gpt-4o-mini", () => {
    expect(getModelConfig("gpt-4o").priceIn).toBeGreaterThan(getModelConfig("gpt-4o-mini").priceIn);
    expect(getModelConfig("gpt-4o").priceOut).toBeGreaterThan(getModelConfig("gpt-4o-mini").priceOut);
  });

  it("claude-sonnet đắt hơn gpt-4o", () => {
    expect(getModelConfig("claude-sonnet").priceOut).toBeGreaterThan(getModelConfig("gpt-4o").priceOut);
  });
});

describe("costVndForModel", () => {
  it("tính đúng VND với giá model cụ thể", () => {
    const cfg = MODEL_CONFIG["gpt-4o-mini"];
    // 1000 fresh input + 500 output, không cache
    const expected = (1000 * cfg.priceIn + 500 * cfg.priceOut) * 26000;
    expect(costVndForModel(cfg, 1000, 500, 0)).toBeCloseTo(expected, 4);
  });

  it("cachedIn giảm chi phí input", () => {
    const cfg = MODEL_CONFIG["gpt-4o"];
    const noCacheCost = costVndForModel(cfg, 1000, 500, 0);
    const withCacheCost = costVndForModel(cfg, 1000, 500, 800);
    expect(withCacheCost).toBeLessThan(noCacheCost);
  });

  it("zero tokens → 0", () => {
    expect(costVndForModel(MODEL_CONFIG["claude-opus"], 0, 0)).toBe(0);
  });

  it("claude-opus đắt hơn gpt-4o-mini cùng token", () => {
    const cheap = costVndForModel(MODEL_CONFIG["gpt-4o-mini"], 1000, 500);
    const expensive = costVndForModel(MODEL_CONFIG["claude-opus"], 1000, 500);
    expect(expensive).toBeGreaterThan(cheap * 10);
  });
});

describe("beenyFromVnd", () => {
  it("1000 VND → 25 Beeny (40đ/Beeny)", () => {
    expect(beenyFromVnd(1000)).toBeCloseTo(25, 4);
  });

  it("zero hoặc âm → 0", () => {
    expect(beenyFromVnd(0)).toBe(0);
    expect(beenyFromVnd(-100)).toBe(0);
  });

  it("làm tròn 4 chữ số thập phân", () => {
    const result = beenyFromVnd(1234.5678);
    expect(String(result).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe("toAnthropicToolDef", () => {
  it("chuyển OpenAI format → Anthropic format", () => {
    const openai = {
      type: "function",
      function: { name: "financials", description: "Lấy BCTC", parameters: { type: "object", properties: {} } },
    };
    const result = toAnthropicToolDef(openai);
    expect(result.name).toBe("financials");
    expect(result.description).toBe("Lấy BCTC");
    expect(result.input_schema).toEqual(openai.function.parameters);
    expect(result.type).toBeUndefined(); // Anthropic không dùng field "type"
  });

  it("fallback input_schema khi parameters thiếu", () => {
    const result = toAnthropicToolDef({ function: { name: "x", description: "y" } });
    expect(result.input_schema).toEqual({ type: "object", properties: {}, required: [] });
  });
});