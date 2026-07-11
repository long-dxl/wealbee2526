import type { ToolDefinition } from "./tool-registry.ts";

export type ToolCategory = "market" | "company" | "portfolio" | "knowledge";
export interface ToolCatalogEntry {
  id: string;
  canonicalId: string;
  label: string;
  category: ToolCategory;
  public: boolean;
  definition: ToolDefinition;
}

const schema = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ToolDefinition => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const symbol = { type: "string", description: "Mã cổ phiếu Việt Nam, ví dụ HPG" };
const symbols = { type: "array", items: { type: "string" }, description: "Danh sách mã cổ phiếu" };

const canonical: ToolCatalogEntry[] = [
  { id: "price_feed", canonicalId: "price_feed", label: "Giá & chỉ số", category: "market", public: true, definition: schema("price_feed", "Lấy giá cổ phiếu và chỉ số thị trường mới nhất", { symbols }) },
  { id: "news_feed", canonicalId: "news_feed", label: "Tin tức", category: "market", public: true, definition: schema("news_feed", "Lấy tin tức tài chính mới nhất, có thể lọc theo mã", { symbols, days: { type: "number" }, source: { type: "string" } }) },
  { id: "financials", canonicalId: "financials", label: "Báo cáo tài chính", category: "company", public: true, definition: schema("financials", "Lấy IS/BS/CF và chỉ số tài chính theo năm, quý", { symbol }, ["symbol"]) },
  { id: "insider_trades", canonicalId: "insider_trades", label: "Cổ tức & nội bộ", category: "company", public: true, definition: schema("insider_trades", "Lấy cổ tức và giao dịch nội bộ", { symbol }, ["symbol"]) },
  { id: "value_chain", canonicalId: "value_chain", label: "Chuỗi giá trị", category: "company", public: true, definition: schema("value_chain", "Lấy chuỗi giá trị, đầu vào, đầu ra và yếu tố tác động", { symbol }, ["symbol"]) },
  { id: "portfolio_read", canonicalId: "portfolio_read", label: "Danh mục", category: "portfolio", public: true, definition: schema("portfolio_read", "Đọc holdings, giá vốn và P&L của người dùng") },
  { id: "macro", canonicalId: "macro", label: "Vĩ mô", category: "market", public: true, definition: schema("macro", "Lấy tỷ giá, lãi suất, hàng hóa và chỉ số vĩ mô") },
  { id: "analyst_reports", canonicalId: "analyst_reports", label: "Báo cáo CTCK", category: "company", public: true, definition: schema("analyst_reports", "Lấy khuyến nghị và giá mục tiêu từ công ty chứng khoán", { symbol }, ["symbol"]) },
  { id: "kb_search", canonicalId: "kb_search", label: "Knowledge Base", category: "knowledge", public: true, definition: schema("kb_search", "Tìm kiếm trong tài liệu người dùng đã tải lên", { query: { type: "string" } }, ["query"]) },
  { id: "web_search", canonicalId: "web_search", label: "Tìm kiếm web", category: "knowledge", public: true, definition: schema("web_search", "Tìm thông tin mới nhất trên internet", { query: { type: "string" } }, ["query"]) },
];

const aliases: Record<string, string> = {
  get_market_data: "price_feed", get_news: "news_feed", get_financials: "financials",
  get_insider_activity: "insider_trades", get_value_chain: "value_chain",
  get_portfolio: "portfolio_read", search_knowledge_base: "kb_search",
};

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  ...canonical,
  ...Object.entries(aliases).map(([id, canonicalId]) => {
    const base = canonical.find(t => t.id === canonicalId)!;
    return { ...base, id, canonicalId, public: false, definition: { ...base.definition, function: { ...base.definition.function, name: id } } };
  }),
];

export const PUBLIC_TOOL_METADATA = canonical.map(({ id, label, category, definition }) => ({
  id, label, category, description: definition.function.description,
}));

export const TOOL_DEFINITIONS = Object.fromEntries(TOOL_CATALOG.map(t => [t.id, t.definition]));
export const canonicalToolId = (id: string): string => TOOL_CATALOG.find(t => t.id === id)?.canonicalId ?? id;
