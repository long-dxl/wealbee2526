import { buildPriceContext, buildNewsContext } from "./market-context.ts";
import { buildFinancialsContext, buildInsiderContext } from "./context-builders.ts";
import { valueChainReport } from "./value-chain.ts";
import { macroContext } from "./macro.ts";
import { analystReportsContext } from "./analyst-reports.ts";
import { canonicalToolId, TOOL_DEFINITIONS } from "./tool-catalog.ts";
import type { ToolRegistry } from "./tool-registry.ts";
import type { SourceRegistry } from "./source-registry.ts";

interface ToolState {
  registry: SourceRegistry;
  sources: any[];
  kbDocIds: string[];
  newsFilter?: string[];
  financialsDepth?: "full" | "brief";
}

export interface RunAgentToolDependencies {
  sb: any;
  openaiApiKey: string;
  buildSymbolSources(symbol: string, sources: any[]): Promise<void>;
  buildInsiderSource(symbol: string, sources: any[]): Promise<void>;
  buildPortfolioContext(userId: string): Promise<string>;
}

const symbolArg = (args: Record<string, any>) => String(args.symbol ?? "").toUpperCase();

export function registerRunAgentTools(toolRegistry: ToolRegistry, deps: RunAgentToolDependencies): void {
  const handlers: Record<string, (args: Record<string, any>, userId: string, state: ToolState) => Promise<string>> = {
    price_feed: async (args, _user, s) => {
      const symbols = Array.isArray(args.symbols) ? args.symbols.map(String) : [];
      return await buildPriceContext(deps.sb, s.registry, symbols) || "Không có dữ liệu giá trong hệ thống";
    },
    news_feed: async (args, _user, s) => {
      const symbols = Array.isArray(args.symbols) ? args.symbols.map(String) : [];
      return await buildNewsContext(deps.sb, s.registry, symbols.length ? symbols : undefined, s.newsFilter, s.sources) || "Không có tin tức trong 48h gần nhất";
    },
    financials: async (args, _user, s) => {
      const symbol = symbolArg(args);
      const result = await buildFinancialsContext(deps.sb, symbol, s.registry, s.financialsDepth ?? "full");
      await deps.buildSymbolSources(symbol, s.sources);
      return result || `Không có dữ liệu tài chính cho ${symbol} trong hệ thống`;
    },
    insider_trades: async (args, _user, s) => {
      const symbol = symbolArg(args);
      const result = await buildInsiderContext(deps.sb, symbol, s.registry);
      await deps.buildInsiderSource(symbol, s.sources);
      return result || `Không có dữ liệu cổ tức/giao dịch nội bộ cho ${symbol} trong hệ thống`;
    },
    value_chain: async (args, _user, s) => {
      const symbol = symbolArg(args);
      let sectorName: string | undefined;
      try { const { data } = await deps.sb.from("stocks").select("sector_name").eq("symbol", symbol).single(); sectorName = data?.sector_name; } catch { /* optional */ }
      return await valueChainReport(deps.sb, symbol, sectorName, s.registry) || `Ngành của ${symbol} chưa gắn sơ đồ chuỗi giá trị hàng hóa.`;
    },
    portfolio_read: async (_args, userId) => await deps.buildPortfolioContext(userId) || "Chưa có danh mục đầu tư",
    macro: async (_args, _user, s) => await macroContext(deps.sb, s.registry) || "Chưa có dữ liệu vĩ mô",
    analyst_reports: async (args, _user, s) => {
      const symbol = symbolArg(args);
      return await analystReportsContext(deps.sb, symbol, s.registry) || `Chưa có báo cáo phân tích CTCK cho ${symbol}.`;
    },
    kb_search: async (args, userId, s) => searchKnowledgeBase(deps, String(args.query ?? ""), userId, s.kbDocIds),
  };

  for (const id of Object.keys(TOOL_DEFINITIONS)) {
    const handler = handlers[canonicalToolId(id)];
    if (handler) toolRegistry.setHandler(id, (args, context) => handler(args, context.userId, context.state as unknown as ToolState));
  }
}

async function searchKnowledgeBase(deps: RunAgentToolDependencies, query: string, userId: string, docIds: string[]): Promise<string> {
  if (!docIds.length) return "Knowledge Base chưa được cấu hình cho agent này";
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${deps.openaiApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input: query }) });
    if (!response.ok) return `Lỗi tạo embedding: HTTP ${response.status}`;
    const embedding = (await response.json()).data?.[0]?.embedding;
    if (!embedding) return "Lỗi tạo embedding";
    const { data: chunks } = await deps.sb.rpc("match_knowledge_chunks_by_docs", { query_embedding: embedding, match_user_id: userId, doc_ids: docIds, match_count: 6, match_threshold: 0.35 });
    if (chunks?.length) return "## Kết quả từ Knowledge Base\n" + chunks.map((c: any) => `---\n${c.content}`).join("\n");
    const { data: fallback } = await deps.sb.from("knowledge_chunks").select("content").in("document_id", docIds).eq("user_id", userId).order("chunk_index", { ascending: true }).limit(docIds.length * 2);
    return fallback?.length ? "## Kết quả từ Knowledge Base\n" + fallback.map((c: any) => `---\n${c.content}`).join("\n") : "Không tìm thấy nội dung liên quan trong Knowledge Base";
  } catch (error) { return `Lỗi KB search: ${String(error)}`; }
}
