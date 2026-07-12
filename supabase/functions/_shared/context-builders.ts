/**
 * context-builders — Build tài chính/insider context cho agent functions.
 * Tách ra để run-agent và agent-dry-run không duplicate code.
 * deno-lint-ignore-file no-explicit-any
 */
import { financialReport, insiderReport, TYPE_LABEL } from "./financial-report.ts";
import { faUrl } from "./market-context.ts";
import { SourceRegistry } from "./source-registry.ts";

/**
 * Build financials context cho một mã (IS/BS/CF + ratios).
 * @param includeNews nếu true → thêm tin tức 48h gần nhất (dùng trong dry-run)
 */
export async function buildFinancialsContext(
  sb: any,
  symbol: string,
  registry?: SourceRegistry,
  depth: "full" | "brief" = "full",
  includeNews = false,
): Promise<string> {
  const sym = symbol.toUpperCase();
  const lines: string[] = [`\n## Dữ liệu tài chính: ${sym}`];

  try {
    const { data: tk } = await sb.from("tickers").select("company_type").eq("symbol", sym).single();
    const ctype = tk?.company_type ?? "normal";
    const report = await financialReport(sb, sym, ctype, depth);
    if (report.trim()) {
      const ref = registry ? ` ${registry.add("BCTC", faUrl(sym))}` : "";
      lines.push(`\n### Báo cáo tài chính (${TYPE_LABEL[ctype] ?? ctype})${ref}`);
      lines.push(report);
    } else {
      lines.push(`\n*Không có số liệu tài chính chi tiết cho ${sym} trong hệ thống. Không được tự ước tính các chỉ số tài chính.*`);
    }
  } catch { /* ignore */ }

  if (includeNews && registry) {
    try {
      const since = new Date(Date.now() - 48 * 3600000).toISOString();
      const { data: newsRows } = await sb
        .from("market_news")
        .select("title,article_url,published_at,source,content_summary,impact_score,label")
        .contains("affected_symbols", [sym])
        .gte("published_at", since)
        .not("label", "is", null)
        .neq("label", "trash")
        .order("impact_score", { ascending: false, nullsFirst: false })
        .limit(5);

      if (newsRows?.length) {
        lines.push(`\n### Tin tức gần đây (48h)`);
        for (const n of newsRows) {
          const ref = n.article_url ? ` ${registry.add(n.source ?? "Tin tức", n.article_url)}` : "";
          lines.push(`- **${n.title}**${ref} (${n.label}) — ${n.published_at?.substring(0, 10)}`);
          const summary = n.content_summary;
          const summaryText = Array.isArray(summary) ? summary[0] : (typeof summary === "string" ? summary.split("\n")[0] : "");
          if (summaryText) lines.push(`  ${summaryText}`);
        }
      }
    } catch { /* ignore */ }
  }

  return lines.length > 1 ? lines.join("\n") : (includeNews ? `\nKhông có dữ liệu tài chính cho ${sym} trong DB.` : "");
}

/** Build insider context (cổ tức + giao dịch nội bộ) cho một mã */
export async function buildInsiderContext(
  sb: any,
  symbol: string,
  registry?: SourceRegistry,
): Promise<string> {
  const sym = symbol.toUpperCase();
  const lines: string[] = [`\n## Cổ tức & Giao dịch nội bộ: ${sym}`];

  const report = await insiderReport(sb, sym);
  if (report.trim()) {
    const ref = registry ? ` ${registry.add("Nội bộ", faUrl(sym))}` : "";
    lines.push(`${ref}`);
    lines.push(report);
  } else {
    lines.push(`\n*Không có dữ liệu cổ tức/giao dịch nội bộ cho ${sym}.*`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}
