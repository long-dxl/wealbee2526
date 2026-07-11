import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_METADATA, TOOL_CATALOG, TOOL_DEFINITIONS, canonicalToolId } from "./tool-catalog.ts";

describe("tool catalog", () => {
  it("không trùng id và definition name luôn khớp id", () => {
    const ids = TOOL_CATALOG.map(tool => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tool of TOOL_CATALOG) expect(tool.definition.function.name).toBe(tool.id);
  });

  it("public metadata chỉ chứa canonical tools có definition", () => {
    for (const tool of PUBLIC_TOOL_METADATA) {
      expect(canonicalToolId(tool.id)).toBe(tool.id);
      expect(TOOL_DEFINITIONS[tool.id]).toBeTruthy();
    }
  });

  it("alias chat map về canonical id", () => {
    expect(canonicalToolId("get_financials")).toBe("financials");
    expect(canonicalToolId("get_news")).toBe("news_feed");
  });
});
