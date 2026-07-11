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
  normal: ["ROE","ROA","ROIC","GROSS_MARGIN","OPERATING_MARGIN","NET_MARGIN","ASSET_TURNOVER","INVENTORY_TURNOVER","RECEIVABLES_TURNOVER","CURRENT_RATIO","QUICK_RATIO","DEBT_TO_EQUITY","DEBT_TO_EQUITY_IB","INTEREST_COVERAGE","REVENUE_GROWTH","NET_PROFIT_GROWTH","OCF_TO_NI","EPS_DILUTED","BVPS","PE","PB","PS","DIVIDEND_YIELD"],
  bank: ["NIM","YOEA","COF","CIR","CASA","LDR","NPL","NPL_COVERAGE","CREDIT_COST","LAR","REVENUE_GROWTH","NET_PROFIT_GROWTH","ROE","ROA","BVPS","PE","PB"],
  securities: ["MARGIN_TO_EQUITY","ROE","ROA","ROIC","GROSS_MARGIN","OPERATING_MARGIN","NET_MARGIN","DEBT_TO_EQUITY","DEBT_TO_EQUITY_IB","REVENUE_GROWTH","NET_PROFIT_GROWTH","BVPS","PE","PB","PS"],
  insurance: ["COMBINED_RATIO","CLAIM_RATIO","ROE","ROA","NET_MARGIN","OPERATING_MARGIN","REVENUE_GROWTH","NET_PROFIT_GROWTH","BVPS","PE","PB"],
};
const RATIO_LABEL: Record<string, string> = {
  ROE:"ROE", ROA:"ROA", ROIC:"ROIC", GROSS_MARGIN:"Biên LN gộp", OPERATING_MARGIN:"Biên LN HĐKD", NET_MARGIN:"Biên LN ròng",
  ASSET_TURNOVER:"Vòng quay tài sản", INVENTORY_TURNOVER:"Vòng quay HTK", RECEIVABLES_TURNOVER:"Vòng quay phải thu",
  CURRENT_RATIO:"Thanh toán hiện hành", QUICK_RATIO:"Thanh toán nhanh", DEBT_TO_EQUITY:"Nợ phải trả/VCSH", DEBT_TO_EQUITY_IB:"Nợ vay/VCSH (D/E)", INTEREST_COVERAGE:"Khả năng trả lãi",
  REVENUE_GROWTH:"Tăng trưởng DT", NET_PROFIT_GROWTH:"Tăng trưởng LNST", OCF_TO_NI:"OCF/LNST (chất lượng LN)",
  EPS_DILUTED:"EPS pha loãng", BVPS:"Giá trị sổ sách/CP", PE:"P/E", PB:"P/B", PS:"P/S", DIVIDEND_YIELD:"Tỷ suất cổ tức",
  NIM:"NIM (biên lãi ròng)", YOEA:"Lợi suất TS sinh lãi", COF:"Chi phí vốn", CIR:"CIR (chi phí/thu nhập)", CASA:"CASA",
  LDR:"LDR (cho vay/huy động)", NPL:"Tỷ lệ nợ xấu (NPL)", NPL_COVERAGE:"Bao phủ nợ xấu", CREDIT_COST:"Chi phí tín dụng", LAR:"Dư nợ/Tổng TS",
  MARGIN_TO_EQUITY:"Dư nợ margin/VCSH", COMBINED_RATIO:"Combined ratio", CLAIM_RATIO:"Tỷ lệ bồi thường",
};

// Lý do 1 chỉ số bị bỏ trống (value=NULL) — để Agent hiểu "n/a" là tín hiệu, không phải thiếu data.
const REASON_LABEL: Record<string, string> = {
  negative_base: "kỳ gốc âm nên % tăng trưởng vô nghĩa",
  non_positive_revenue: "doanh thu ≤0",
  negative_equity: "vốn chủ sở hữu âm",
  revenue_not_representative: "doanh thu quá nhỏ, LN chủ yếu ngoài HĐKD",
  outlier_small_denominator: "mẫu số (VCSH/vốn đầu tư) gần 0 nên tỷ suất bị méo",
  data_anomaly: "số liệu bất thường",
  missing_data: "thiếu dữ liệu",
  not_applicable: "không áp dụng cho loại hình này",
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

// "Q4/2025" so với "Q1/2026" theo string thì Q4 > Q1 dù Q1/2026 mới hơn — phải so
// theo giá trị thời gian thật (năm*4 + quý), không dùng ORDER BY text của Postgres.
function quarterSortKey(period: string): number {
  const m = period.match(/^Q([1-4])\/(\d{4})$/);
  if (!m) return -1;
  return Number(m[2]) * 4 + Number(m[1]);
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
      // EPS=0 khi LNST cùng quý dương gần như luôn là nguồn chưa kịp cập nhật (Vietcap
      // thường công bố EPS trễ hơn các dòng khác 1 nhịp), không phải EPS thật bằng 0.
      if (v == null || (isEps && v === 0)) return "n/a";
      return isEps ? `${Math.round(v).toLocaleString("vi-VN")}đ` : fmtTy(v);
    });
    out.push(`| ${it.label} | ${cells.join(" | ")} |`);
  }
  return out;
}

// Item bắt buộc phải nạp cho chế độ "brief" (insider_buy/volume_spike): chỉ dòng
// doanh thu/lợi nhuận trọng yếu, KHÔNG toàn bộ P&L chi tiết — đủ để kể chuyện tăng
// trưởng gần nhất mà không kéo theo cả bảng IS 5 năm không dùng đến.
const BRIEF_IS_ITEMS = [
  "BANK_NII", "BANK_TOI", "BANK_PROVISION",
  "IS_REVENUE", "IS_GROSS_PROFIT", "IS_PRETAX", "IS_NET_PROFIT", "IS_NET_PROFIT_PARENT",
];
// Chỉ số cốt lõi cho "brief" — bỏ các chỉ số vòng quay/thanh khoản chi tiết, giữ lại
// đúng những gì insider_buy/volume_spike thực sự trích trong bài viết (ROE, biên LN, tăng trưởng).
const CORE_RATIOS: Record<string, string[]> = {
  normal: ["ROE", "GROSS_MARGIN", "NET_MARGIN", "DEBT_TO_EQUITY", "REVENUE_GROWTH", "NET_PROFIT_GROWTH"],
  bank: ["NIM", "CIR", "NPL", "ROE", "REVENUE_GROWTH", "NET_PROFIT_GROWTH"],
  securities: ["MARGIN_TO_EQUITY", "ROE", "NET_MARGIN", "REVENUE_GROWTH", "NET_PROFIT_GROWTH"],
  insurance: ["COMBINED_RATIO", "ROE", "NET_MARGIN", "REVENUE_GROWTH", "NET_PROFIT_GROWTH"],
};

/**
 * Dựng 4 bảng IS/BS/CF/Chỉ số (theo loại hình) + KQKD quý gần nhất cho 1 mã.
 * @param sb     Supabase client (service role)
 * @param sym    Mã đã uppercase
 * @param ctype  company_type (normal|bank|securities|insurance)
 * @param depth  "full" (Deep Research — 5 năm + 5 quý đầy đủ) hoặc "brief"
 *               (insider_buy/volume_spike — chỉ cần bối cảnh cơ bản, không cần
 *               phân tích BCTC sâu). Brief giảm ~70% kích thước context.
 */
export async function financialReport(sb: any, sym: string, ctype: string, depth: "full" | "brief" = "full"): Promise<string> {
  const lines: string[] = [];
  const type = RATIO_SET[ctype] ? ctype : "normal";

  // Định giá hiện tại (period_type=CURRENT: giá, vốn hóa, P/E, P/B... snapshot gần nhất)
  // — thiếu mục này thì Deep Research không thể đặt định giá cạnh hiệu quả vốn (ROE).
  try {
    const { data: cur } = await sb
      .from("financial_ratios")
      .select("period, ratio_code, value, unit")
      .eq("symbol", sym).eq("period_type", "CURRENT");
    if (cur?.length) {
      const val = new Map<string, { value: number; unit?: string }>();
      for (const r of cur as any[]) val.set(r.ratio_code, { value: r.value, unit: r.unit });
      const asOf = (cur as any[])[0]?.period ?? "";
      const fmtD = (v?: { value: number }) => v == null ? "n/a" : `${Math.round(v.value).toLocaleString("vi-VN")} đ`;
      const fmtX = (v?: { value: number }) => v == null ? "n/a" : `${v.value.toFixed(2)}x`;
      const rows: Array<[string, string]> = [
        ["Giá cổ phiếu", fmtD(val.get("PRICE"))],
        ["Vốn hóa", val.has("MARKET_CAP") ? `${(val.get("MARKET_CAP")!.value / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ đ` : "n/a"],
        ["P/E (TTM)", fmtX(val.get("PE"))],
        ["P/E (FY gần nhất)", fmtX(val.get("PE_FY"))],
        ["P/B", fmtX(val.get("PB"))],
        ["P/S", fmtX(val.get("PS"))],
        ["Giá trị sổ sách/CP (BVPS)", fmtD(val.get("BVPS"))],
        ["Tỷ suất cổ tức", val.has("DIVIDEND_YIELD") ? `${(val.get("DIVIDEND_YIELD")!.value * 100).toFixed(1)}%` : "n/a"],
      ].filter(([, v]) => v !== "n/a") as Array<[string, string]>;
      if (rows.length) {
        lines.push(`\n### 0) Định giá hiện tại (tại ngày ${asOf})`);
        lines.push("| Chỉ tiêu | Giá trị |", "|---|---|");
        for (const [k, v] of rows) lines.push(`| ${k} | ${v} |`);
      }
    }
  } catch { /* skip */ }

  if (depth === "brief") {
    // KQKD 2 năm gần nhất (chỉ dòng doanh thu/lợi nhuận trọng yếu)
    try {
      const { data: fs } = await sb
        .from("financial_statements")
        .select("period, item_code, item_label_vi, value")
        .eq("symbol", sym).eq("period_type", "FY").eq("statement", "IS")
        .in("item_code", BRIEF_IS_ITEMS)
        .order("period", { ascending: false });
      if (fs?.length) {
        const fy = [...new Set((fs as any[]).map(r => r.period))].sort().reverse().slice(0, 2).sort();
        const rows: FSRow[] = (fs as any[]).filter(r => fy.includes(r.period)).map(r => ({ ...r, statement: "IS" }));
        const isT = buildStatementTable(rows, BRIEF_IS_ITEMS, fy);
        if (isT.length) { lines.push(`\n### 1) KQKD 2 năm gần nhất (tóm tắt)`); lines.push(...isT); }
      }
    } catch { /* skip */ }

    // KQKD quý gần nhất so cùng kỳ năm trước (YoY) — đúng 2 quý, không rolling 5 quý
    try {
      const { data: qAll } = await sb
        .from("financial_statements")
        .select("period")
        .eq("symbol", sym).eq("period_type", "QUARTER").eq("statement", "IS")
        .order("period", { ascending: false }).limit(20);
      const latestQ = qAll?.length
        ? [...new Set((qAll as any[]).map(r => r.period))].sort((a, b) => quarterSortKey(b) - quarterSortKey(a))[0]
        : null;
      if (latestQ) {
        const m = latestQ.match(/^Q([1-4])\/(\d{4})$/);
        const sameQLastYear = m ? `Q${m[1]}/${Number(m[2]) - 1}` : null;
        const qPeriods = [sameQLastYear, latestQ].filter(Boolean) as string[];
        const { data: fsq } = await sb
          .from("financial_statements")
          .select("period, item_code, item_label_vi, value")
          .eq("symbol", sym).eq("period_type", "QUARTER").eq("statement", "IS")
          .in("item_code", BRIEF_IS_ITEMS)
          .in("period", qPeriods);
        if (fsq?.length) {
          const rows: FSRow[] = (fsq as any[]).map(r => ({ ...r, statement: "IS" }));
          const sortedQ = qPeriods.sort((a, b) => quarterSortKey(a) - quarterSortKey(b));
          const isQ = buildStatementTable(rows, BRIEF_IS_ITEMS, sortedQ);
          if (isQ.length) { lines.push(`\n### 2) KQKD quý gần nhất so cùng kỳ (YoY)`); lines.push(...isQ); }
        }
      }
    } catch { /* skip */ }

    // Chỉ số cốt lõi — chỉ FY gần nhất, không bảng đa kỳ
    try {
      const { data: rt } = await sb
        .from("financial_ratios")
        .select("period, ratio_code, value, unit")
        .eq("symbol", sym).eq("period_type", "FY")
        .in("ratio_code", CORE_RATIOS[type])
        .order("period", { ascending: false })
        .limit(CORE_RATIOS[type].length);
      if (rt?.length) {
        const latestPeriod = (rt as any[])[0]?.period;
        const rows = (rt as any[]).filter(r => r.period === latestPeriod);
        if (rows.length) {
          lines.push(`\n### 3) Chỉ số tài chính cốt lõi (${TYPE_LABEL[type]}) · FY ${latestPeriod}`);
          for (const r of rows) lines.push(`- ${RATIO_LABEL[r.ratio_code] ?? r.ratio_code}: ${fmtRatioVal(r.ratio_code, r.value, r.unit)}`);
        }
      }
    } catch { /* skip */ }

    return lines.join("\n");
  }

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
      .select("period, ratio_code, value, unit, na_reason")
      .eq("symbol", sym).eq("period_type", "FY")
      .order("period", { ascending: false });
    if (rt?.length) {
      const periods = [...new Set((rt as any[]).map(r => r.period))].sort().reverse().slice(0, 5).sort();
      const latest = periods[periods.length - 1];
      const byCode = new Map<string, { unit?: string; vals: Record<string, number>; reasons: Record<string, string> }>();
      for (const r of rt as any[]) {
        if (!byCode.has(r.ratio_code)) byCode.set(r.ratio_code, { unit: r.unit, vals: {}, reasons: {} });
        byCode.get(r.ratio_code)!.vals[r.period] = r.value;
        if (r.na_reason) byCode.get(r.ratio_code)!.reasons[r.period] = r.na_reason;
      }
      const shown = (RATIO_SET[type]).filter(c => byCode.has(c));
      if (shown.length) {
        lines.push(`\n### 4) Chỉ số tài chính (${TYPE_LABEL[type]}) · FY ${periods[0]}–${periods[periods.length - 1]}`);
        lines.push(`| Chỉ số | ${periods.join(" | ")} |`, `|${"---|".repeat(periods.length + 1)}`);
        for (const c of shown) {
          const it = byCode.get(c)!;
          lines.push(`| ${RATIO_LABEL[c] ?? c} | ${periods.map(p => fmtRatioVal(c, it.vals[p] ?? null, it.unit)).join(" | ")} |`);
        }
        // Ghi chú lý do các chỉ số bị bỏ trống ở kỳ gần nhất (để Agent không hiểu nhầm là thiếu data)
        const notes = shown
          .filter(c => byCode.get(c)!.reasons[latest])
          .map(c => `${RATIO_LABEL[c] ?? c}: ${REASON_LABEL[byCode.get(c)!.reasons[latest]] ?? byCode.get(c)!.reasons[latest]}`);
        if (notes.length) lines.push(`\n> *Chỉ số n/a (FY ${latest}): ${notes.join("; ")}.*`);
      }
    }
  } catch { /* skip */ }

  // IS / BS / CF theo quý — 5 quý gần nhất (rolling theo dữ liệu thật có, sort theo
  // quarterSortKey chứ không theo thứ tự chữ cái của cột period)
  try {
    const { data: fsq } = await sb
      .from("financial_statements")
      .select("statement, period, item_code, item_label_vi, value")
      .eq("symbol", sym).eq("period_type", "QUARTER");
    if (fsq?.length) {
      const qPeriods = [...new Set((fsq as FSRow[]).map(r => r.period))]
        .sort((a, b) => quarterSortKey(b) - quarterSortKey(a))
        .slice(0, 5)
        .sort((a, b) => quarterSortKey(a) - quarterSortKey(b));
      const pickQ = (st: string) => (fsq as FSRow[]).filter(r => r.statement === st && qPeriods.includes(r.period));
      const isQ = buildStatementTable(pickQ("IS"), PRIORITY_IS, qPeriods);
      const bsQ = buildStatementTable(pickQ("BS"), PRIORITY_BS, qPeriods);
      const cfQ = buildStatementTable(pickQ("CF"), PRIORITY_CF, qPeriods);
      if (isQ.length) { lines.push(`\n### 5) Kết quả kinh doanh (IS) · ${qPeriods[0]}–${qPeriods[qPeriods.length - 1]}`); lines.push(...isQ); }
      if (bsQ.length) { lines.push(`\n### 6) Cân đối kế toán (BS) · theo quý`); lines.push(...bsQ); }
      if (cfQ.length) { lines.push(`\n### 7) Lưu chuyển tiền tệ (CF) · theo quý`); lines.push(...cfQ); }

      // Chỉ số theo quý (margin/growth — xem etl_bctc_quarterly.py để biết phạm vi)
      try {
        const { data: rtq } = await sb
          .from("financial_ratios")
          .select("period, ratio_code, value, unit")
          .eq("symbol", sym).eq("period_type", "QUARTER")
          .in("period", qPeriods);
        if (rtq?.length) {
          const byCodeQ = new Map<string, { unit?: string; vals: Record<string, number> }>();
          for (const r of rtq as any[]) {
            if (!byCodeQ.has(r.ratio_code)) byCodeQ.set(r.ratio_code, { unit: r.unit, vals: {} });
            byCodeQ.get(r.ratio_code)!.vals[r.period] = r.value;
          }
          const shownQ = RATIO_SET[type].filter(c => byCodeQ.has(c));
          if (shownQ.length) {
            lines.push(`\n### 8) Chỉ số tài chính theo quý (${TYPE_LABEL[type]})`);
            lines.push(`| Chỉ số | ${qPeriods.join(" | ")} |`, `|${"---|".repeat(qPeriods.length + 1)}`);
            for (const c of shownQ) {
              const it = byCodeQ.get(c)!;
              lines.push(`| ${RATIO_LABEL[c] ?? c} | ${qPeriods.map(p => fmtRatioVal(c, it.vals[p] ?? null, it.unit)).join(" | ")} |`);
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return lines.join("\n");
}

/**
 * Cổ tức + Giao dịch nội bộ cho 1 mã — tool "Nội bộ" (tách riêng khỏi BCTC theo
 * yêu cầu: mỗi tool 1 mục đích, Agent chọn độc lập).
 */
export async function insiderReport(sb: any, sym: string): Promise<string> {
  const lines: string[] = [];

  try {
    const { data: divs } = await sb
      .from("dividends")
      .select("ex_date, payment_date, dividend_type, amount")
      .eq("symbol", sym)
      .order("ex_date", { ascending: false })
      .limit(6);
    if (divs?.length) {
      lines.push(`\n### Lịch sử cổ tức`);
      for (const d of divs as any[]) {
        const typeLabel = d.dividend_type === "cash" ? "tiền mặt" : d.dividend_type === "rights" ? "quyền mua (trả tiền)" : "cổ phiếu thưởng";
        const amtLabel = d.dividend_type === "cash"
          ? `${Number(d.amount).toLocaleString("vi-VN")} đ/CP`
          : `${(Number(d.amount) * 100).toFixed(1)}%`;
        lines.push(`- ${d.ex_date}: ${typeLabel} ${amtLabel}${d.payment_date ? ` (thanh toán ${d.payment_date})` : ""}`);
      }
    }
  } catch { /* skip */ }

  try {
    const { data: ins } = await sb
      .from("insider_transactions")
      .select("trade_date, insider_name, position, trade_type, volume, price")
      .eq("symbol", sym)
      .order("trade_date", { ascending: false })
      .limit(8);
    if (ins?.length) {
      lines.push(`\n### Giao dịch nội bộ gần đây`);
      for (const t of ins as any[]) {
        const vol = t.volume ? `${Number(t.volume).toLocaleString("vi-VN")} CP` : "";
        const priceStr = t.price != null ? ` @ ${Number(t.price).toLocaleString("vi-VN")}đ` : "";
        lines.push(`- ${t.trade_date}: ${t.insider_name}${t.position ? ` (${t.position})` : ""} **${t.trade_type === "buy" ? "MUA" : "BÁN"}** ${vol}${priceStr}`);
      }
    }
  } catch { /* skip */ }

  return lines.join("\n");
}
