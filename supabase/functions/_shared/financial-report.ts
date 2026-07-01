// Bộ khung "Analyst tài chính" dùng chung cho bee-ai-chat (ActionHub) + run-agent (Agent Studio).
// Đọc financial_statements + financial_ratios (long-form) → 4 bảng IS/BS/CF/Chỉ số theo loại hình
// + KQKD quý gần nhất (YoY). Trả về Markdown để LLM dựng bài phân tích.

export const TYPE_LABEL: Record<string, string> = {
  normal: "Doanh nghiệp thường", bank: "Ngân hàng", securities: "Chứng khoán", insurance: "Bảo hiểm",
};

const PRIORITY_IS = [
  "BANK_INT_INCOME","BANK_INT_EXPENSE","BANK_NII","BANK_FEE_INCOME","BANK_NET_FEE","BANK_TOI","BANK_OPEX","BANK_PREPROVISION","BANK_PROVISION",
  "IS_REVENUE","IS_COGS","IS_GROSS_PROFIT","IS_FIN_INCOME","IS_FIN_EXPENSE","IS_SELLING_EXP","IS_ADMIN_EXP","IS_OPERATING_PROFIT","IS_OTHER_INCOME","IS_OTHER_EXPENSE","IS_PRETAX","IS_TAX","IS_NET_PROFIT","IS_NET_PROFIT_PARENT","IS_EPS","IS_EPS_DILUTED",
];
const PRIORITY_BS = [
  "BS_TOTAL_ASSETS","BS_CURRENT_ASSETS","BS_LONG_ASSETS",
  "BANK_LOANS","BANK_LOAN_RESERVE","BANK_SEC_INVEST","BANK_SEC_TRADING","BANK_DEPOSITS","BANK_PAPER","BANK_BORROW_TCTD",
  "BS_TOTAL_DEBT","BS_CURRENT_DEBT","BS_EQUITY",
];
const PRIORITY_CF = ["CF_OPERATING","CF_INVESTING","CF_FINANCING","CF_CAPEX","CF_FCF","CF_NET"];

const RATIO_SET: Record<string, string[]> = {
  normal: ["ROE","ROA","ROIC","GROSS_MARGIN","OPERATING_MARGIN","NET_MARGIN","ASSET_TURNOVER","INVENTORY_TURNOVER","RECEIVABLES_TURNOVER","CURRENT_RATIO","QUICK_RATIO","DEBT_TO_EQUITY","INTEREST_COVERAGE","REVENUE_GROWTH","NET_PROFIT_GROWTH","OCF_TO_NI","EPS_DILUTED","BVPS","PE","PB","PS","DIVIDEND_YIELD"],
  bank: ["NIM","YOEA","COF","CIR","CASA","LDR","NPL","NPL_COVERAGE","CREDIT_COST","LAR","REVENUE_GROWTH","NET_PROFIT_GROWTH","ROE","ROA","BVPS","PE","PB"],
  securities: ["MARGIN_TO_EQUITY","ROE","ROA","ROIC","GROSS_MARGIN","OPERATING_MARGIN","NET_MARGIN","DEBT_TO_EQUITY","REVENUE_GROWTH","NET_PROFIT_GROWTH","BVPS","PE","PB","PS"],
  insurance: ["COMBINED_RATIO","CLAIM_RATIO","ROE","ROA","NET_MARGIN","OPERATING_MARGIN","REVENUE_GROWTH","NET_PROFIT_GROWTH","BVPS","PE","PB"],
};
const RATIO_LABEL: Record<string, string> = {
  ROE:"ROE", ROA:"ROA", ROIC:"ROIC", GROSS_MARGIN:"Biên LN gộp", OPERATING_MARGIN:"Biên LN HĐKD", NET_MARGIN:"Biên LN ròng",
  ASSET_TURNOVER:"Vòng quay tài sản", INVENTORY_TURNOVER:"Vòng quay HTK", RECEIVABLES_TURNOVER:"Vòng quay phải thu",
  CURRENT_RATIO:"Thanh toán hiện hành", QUICK_RATIO:"Thanh toán nhanh", DEBT_TO_EQUITY:"Nợ/Vốn CSH (D/E)", INTEREST_COVERAGE:"Khả năng trả lãi",
  REVENUE_GROWTH:"Tăng trưởng DT", NET_PROFIT_GROWTH:"Tăng trưởng LNST", OCF_TO_NI:"OCF/LNST (chất lượng LN)",
  EPS_DILUTED:"EPS pha loãng", BVPS:"Giá trị sổ sách/CP", PE:"P/E", PB:"P/B", PS:"P/S", DIVIDEND_YIELD:"Tỷ suất cổ tức",
  NIM:"NIM (biên lãi ròng)", YOEA:"Lợi suất TS sinh lãi", COF:"Chi phí vốn", CIR:"CIR (chi phí/thu nhập)", CASA:"CASA",
  LDR:"LDR (cho vay/huy động)", NPL:"Tỷ lệ nợ xấu (NPL)", NPL_COVERAGE:"Bao phủ nợ xấu", CREDIT_COST:"Chi phí tín dụng", LAR:"Dư nợ/Tổng TS",
  MARGIN_TO_EQUITY:"Dư nợ margin/VCSH", COMBINED_RATIO:"Combined ratio", CLAIM_RATIO:"Tỷ lệ bồi thường",
};

function fmtRatioVal(code: string, value: number | null, unit?: string): string {
  if (value == null) return "n/a";
  if (unit === "pct") return `${(value * 100).toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "vnd" || code === "BVPS" || code === "EPS_DILUTED" || code === "PRICE") return `${Math.round(value).toLocaleString("vi-VN")}đ`;
  return value.toFixed(2);
}
function fmtTy(v: number | null): string {
  if (v == null) return "n/a";
  return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}`;
}

interface FSRow { statement: string; period: string; item_code: string; item_label_vi: string; value: number }

function buildStatementTable(rows: FSRow[], priority: string[], periods: string[]): string[] {
  const byItem = new Map<string, { label: string; vals: Record<string, number> }>();
  for (const r of rows) {
    if (!byItem.has(r.item_code)) byItem.set(r.item_code, { label: r.item_label_vi.replace(/^\(derived\)\s*/, ""), vals: {} });
    byItem.get(r.item_code)!.vals[r.period] = r.value;
  }
  const codes = [...byItem.keys()].sort((a, b) => {
    const ia = priority.indexOf(a), ib = priority.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  if (!codes.length) return [];
  const out = [`| Chỉ tiêu (tỷ đồng) | ${periods.join(" | ")} |`, `|${"---|".repeat(periods.length + 1)}`];
  for (const c of codes) {
    const it = byItem.get(c)!;
    const isEps = c.includes("EPS");
    const cells = periods.map(p => {
      const v = it.vals[p];
      if (v == null) return "n/a";
      return isEps ? `${Math.round(v).toLocaleString("vi-VN")}đ` : fmtTy(v);
    });
    out.push(`| ${it.label} | ${cells.join(" | ")} |`);
  }
  return out;
}

/**
 * Dựng 4 bảng IS/BS/CF/Chỉ số (theo loại hình) + KQKD quý gần nhất cho 1 mã.
 * @param sb     Supabase client (service role)
 * @param sym    Mã đã uppercase
 * @param ctype  company_type (normal|bank|securities|insurance)
 */
export async function financialReport(sb: any, sym: string, ctype: string): Promise<string> {
  const lines: string[] = [];
  const type = RATIO_SET[ctype] ? ctype : "normal";

  // IS / BS / CF theo năm
  try {
    const { data: fs } = await sb
      .from("financial_statements")
      .select("statement, period, item_code, item_label_vi, value")
      .eq("symbol", sym).eq("period_type", "FY")
      .order("period", { ascending: false });
    if (fs?.length) {
      const fy = [...new Set((fs as FSRow[]).map(r => r.period))].sort().reverse().slice(0, 5).sort();
      const pick = (st: string) => (fs as FSRow[]).filter(r => r.statement === st && fy.includes(r.period));
      const isT = buildStatementTable(pick("IS"), PRIORITY_IS, fy);
      const bsT = buildStatementTable(pick("BS"), PRIORITY_BS, fy);
      const cfT = buildStatementTable(pick("CF"), PRIORITY_CF, fy);
      if (isT.length) { lines.push(`\n### 1) Kết quả kinh doanh (IS) · FY ${fy[0]}–${fy[fy.length - 1]}`); lines.push(...isT); }
      if (bsT.length) { lines.push(`\n### 2) Cân đối kế toán (BS)`); lines.push(...bsT); }
      if (cfT.length) { lines.push(`\n### 3) Lưu chuyển tiền tệ (CF)`); lines.push(...cfT); }
    } else {
      lines.push("\n*Chưa có dữ liệu IS/BS/CF chi tiết trong database.*");
    }
  } catch { /* skip */ }

  // Chỉ số theo loại hình
  try {
    const { data: rt } = await sb
      .from("financial_ratios")
      .select("period, ratio_code, value, unit")
      .eq("symbol", sym).eq("period_type", "FY")
      .order("period", { ascending: false });
    if (rt?.length) {
      const periods = [...new Set((rt as any[]).map(r => r.period))].sort().reverse().slice(0, 5).sort();
      const byCode = new Map<string, { unit?: string; vals: Record<string, number> }>();
      for (const r of rt as any[]) {
        if (!byCode.has(r.ratio_code)) byCode.set(r.ratio_code, { unit: r.unit, vals: {} });
        byCode.get(r.ratio_code)!.vals[r.period] = r.value;
      }
      const shown = (RATIO_SET[type]).filter(c => byCode.has(c));
      if (shown.length) {
        lines.push(`\n### 4) Chỉ số tài chính (${TYPE_LABEL[type]}) · FY ${periods[0]}–${periods[periods.length - 1]}`);
        lines.push(`| Chỉ số | ${periods.join(" | ")} |`, `|${"---|".repeat(periods.length + 1)}`);
        for (const c of shown) {
          const it = byCode.get(c)!;
          lines.push(`| ${RATIO_LABEL[c] ?? c} | ${periods.map(p => fmtRatioVal(c, it.vals[p] ?? null, it.unit)).join(" | ")} |`);
        }
      }
    }
  } catch { /* skip */ }

  // KQKD quý gần nhất (2026 chưa có → quý mới nhất) + YoY
  try {
    const { data: q } = await sb
      .from("financial_statements")
      .select("period, item_code, item_label_vi, value")
      .eq("symbol", sym).eq("period_type", "QUARTER").eq("statement", "IS")
      .order("period", { ascending: false });
    if (q?.length) {
      const latest = (q as any[])[0].period as string;
      const m = latest.match(/^(Q\d)\/(\d{4})$/);
      const prevYoY = m ? `${m[1]}/${Number(m[2]) - 1}` : null;
      const keyCodes = ["BANK_TOI", "IS_REVENUE", "BANK_NII", "IS_OPERATING_PROFIT", "BANK_PREPROVISION", "IS_NET_PROFIT", "IS_EPS"];
      const cur = new Map<string, { label: string; v: number }>();
      const prv = new Map<string, number>();
      for (const r of q as any[]) {
        if (r.period === latest) cur.set(r.item_code, { label: r.item_label_vi.replace(/^\(derived\)\s*/, ""), v: r.value });
        if (prevYoY && r.period === prevYoY) prv.set(r.item_code, r.value);
      }
      const rows = keyCodes.filter(c => cur.has(c));
      if (rows.length) {
        const hasYoY = !!prevYoY && prv.size > 0;
        lines.push(`\n### ★ KQKD quý gần nhất: **${latest}**${hasYoY ? ` (so cùng kỳ ${prevYoY})` : ""}`);
        lines.push(`| Chỉ tiêu (tỷ đồng) | ${latest} |${hasYoY ? ` ${prevYoY} | YoY |` : ""}`);
        lines.push(`|---|---|${hasYoY ? "---|---|" : ""}`);
        for (const c of rows) {
          const it = cur.get(c)!;
          const isEps = c.includes("EPS");
          const curS = isEps ? `${Math.round(it.v).toLocaleString("vi-VN")}đ` : fmtTy(it.v);
          if (hasYoY && prv.has(c)) {
            const pv = prv.get(c)!;
            const prvS = isEps ? `${Math.round(pv).toLocaleString("vi-VN")}đ` : fmtTy(pv);
            const yoy = pv ? `${(((it.v - pv) / Math.abs(pv)) * 100).toFixed(1)}%` : "n/a";
            lines.push(`| ${it.label} | ${curS} | ${prvS} | ${yoy} |`);
          } else {
            lines.push(`| ${it.label} | ${curS} |`);
          }
        }
      }
    }
  } catch { /* skip */ }

  return lines.join("\n");
}
