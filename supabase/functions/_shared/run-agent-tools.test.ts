import { expect, it, vi } from "vitest";
import { registerRunAgentTools } from "./run-agent-tools.ts";
import { registryFromOpenAIDefinitions } from "./tool-registry.ts";
import { TOOL_DEFINITIONS } from "./tool-catalog.ts";

it("bind toàn bộ canonical run-agent tools vào registry", async () => {
  const registry = registryFromOpenAIDefinitions(TOOL_DEFINITIONS);
  registerRunAgentTools(registry, {
    sb: {}, openaiApiKey: "test",
    buildSymbolSources: vi.fn(async () => {}),
    buildInsiderSource: vi.fn(async () => {}),
    buildPortfolioContext: vi.fn(async () => "portfolio-ok"),
  });
  await expect(registry.execute("portfolio_read", {}, {
    userId: "u", enabledToolIds: new Set(["portfolio_read"]),
    state: { registry: {}, sources: [], kbDocIds: [] },
  })).resolves.toBe("portfolio-ok");
  for (const id of ["price_feed", "news_feed", "financials", "insider_trades", "value_chain", "portfolio_read", "macro", "analyst_reports", "kb_search"])
    expect(registry.get(id)?.handler).toBeTypeOf("function");
});
