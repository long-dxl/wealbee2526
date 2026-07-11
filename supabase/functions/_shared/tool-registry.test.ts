import { describe, expect, it } from "vitest";
import { ToolRegistry, type ToolDefinition } from "./tool-registry.ts";

const financials: ToolDefinition = {
  type: "function",
  function: {
    name: "financials",
    description: "Lấy báo cáo tài chính",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
};

describe("ToolRegistry", () => {
  it("chỉ trả definition của tool đã đăng ký", () => {
    const registry = new ToolRegistry().register({ id: "financials", definition: financials });
    expect(registry.definitions(["unknown", "financials"])).toEqual([financials]);
  });

  it("chặn tool chưa được agent cấp quyền", () => {
    const registry = new ToolRegistry().register({ id: "financials", definition: financials });
    expect(() => registry.assertCallable("financials", { symbol: "HPG" }, {
      userId: "user-1",
      enabledToolIds: new Set(),
    })).toThrow("không được cấp quyền");
  });

  it("chặn lời gọi thiếu input bắt buộc", () => {
    const registry = new ToolRegistry().register({ id: "financials", definition: financials });
    expect(() => registry.assertCallable("financials", {}, {
      userId: "user-1",
      enabledToolIds: new Set(["financials"]),
    })).toThrow("thiếu tham số bắt buộc: symbol");
  });
});
