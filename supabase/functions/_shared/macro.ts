// Bối cảnh VĨ MÔ cho agent: chỉ số toàn cầu (macro_indicators, seed_macro.py) + VN-Index
// (market_indices) + top tin vĩ mô (market_news). Toàn bộ nguồn FREE, đọc từ Supabase (đã cron sẵn).
// deno-lint-ignore-file no-explicit-any

interface Reg { add(name: string, url: string): string }

// code → symbol Yahoo để tạo link nguồn [ref:N] cho từng chỉ số (khớp seed_macro.py).
const YF_SYMBOL: Record<string, string> = {
  usdvnd: "USDVND=X", dxy: "DX-Y.NYB", us10y: "%5ETNX", brent: "BZ=F",
  gold: "GC=F", sp500: "%5EGSPC", vix: "%5EVIX",
};

const fmtPct = (p: number | null | undefined) => p == null ? "" : ` (${p >= 0 ? "+" : ""}${Number(p).toFixed(1)}% YTD)`;
const fmtNum = (n: number, unit: string) =>
  unit === "VND" ? Math.round(n).toLocaleString("en-US")
  : unit === "%"  ? `${n}%`
  : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Trả bối cảnh vĩ mô (markdown). registry (tùy) → tin vĩ mô có [ref:N] click được. */
export async function macroContext(sb: any, registry?: Reg): Promise<string> {
  const out: string[] = ["## Bối cảnh vĩ mô hôm nay"];

  // 1) Chỉ số toàn cầu (global_macro_indicators)
  try {
    const { data } = await sb.from("global_macro_indicators")
      .select("code,name,value,unit,day_pct,ytd_pct,yoy_pct,as_of").order("code");
    if (data?.length) {
      out.push("### Chỉ số toàn cầu (cập nhật hằng ngày, Yahoo Finance)");
      for (const r of data) {
        const sym = YF_SYMBOL[r.code];
        const ref = (registry && sym) ? ` ${registry.add(`${r.name} (Yahoo Finance)`, `https://finance.yahoo.com/quote/${sym}`)}` : "";
        out.push(`- ${r.name}: **${fmtNum(Number(r.value), r.unit)}${r.unit && !["VND","%"].includes(r.unit) ? " " + r.unit : ""}**${fmtPct(r.ytd_pct)}${r.yoy_pct != null ? ` · YoY ${r.yoy_pct >= 0 ? "+" : ""}${Number(r.yoy_pct).toFixed(1)}%` : ""}${ref}`);
      }
    }
  } catch { /* bảng chưa có → bỏ qua */ }

  // 1b) VN macro dạng SỐ (vn_macro_indicators — GDP/CPI/PMI... theo tháng, cron seed_vn_macro.py)
  // Mỗi chỉ tiêu có độ trễ công bố khác nhau (GDP theo quý, lãi suất liên NH gần real-time)
  // nên lấy vài tháng gần nhất rồi chọn giá trị KHÔNG NULL mới nhất cho từng chỉ tiêu riêng.
  try {
    const { data } = await sb.from("vn_macro_indicators")
      .select("report_month,gdp_yoy,retail_sales_yoy,export_yoy,import_yoy,iip_yoy,pmi,cpi_mom,intl_visitors_yoy,fdi_implemented_yoy,total_social_investment_yoy,interbank_rate_on,interbank_rate_1y")
      .order("report_month", { ascending: false }).limit(6);
    if (data?.length) {
      const VN_MACRO_FIELDS: Array<[string, string, string]> = [
        ["gdp_yoy", "Tăng trưởng GDP (YoY)", "%"],
        ["retail_sales_yoy", "Tổng mức bán lẻ hàng hóa & DV tiêu dùng (YoY)", "%"],
        ["export_yoy", "Kim ngạch xuất khẩu (YoY)", "%"],
        ["import_yoy", "Kim ngạch nhập khẩu (YoY)", "%"],
        ["iip_yoy", "Chỉ số sản xuất công nghiệp - IIP (YoY)", "%"],
        ["pmi", "PMI (>50 = mở rộng sản xuất)", ""],
        ["cpi_mom", "CPI (MoM)", "%"],
        ["intl_visitors_yoy", "Khách quốc tế đến VN (YoY)", "%"],
        ["fdi_implemented_yoy", "FDI thực hiện (YoY)", "%"],
        ["total_social_investment_yoy", "Vốn đầu tư toàn xã hội (YoY)", "%"],
        ["interbank_rate_on", "Lãi suất liên NH Qua đêm", "%/năm"],
        ["interbank_rate_1y", "Lãi suất liên NH 1 năm", "%/năm"],
      ];
      const lines: string[] = [];
      for (const [key, label, unit] of VN_MACRO_FIELDS) {
        const row = data.find((d: any) => d[key] != null);
        if (!row) continue;
        const val = Number(row[key]);
        const isGrowth = key.endsWith("_yoy") || key.endsWith("_mom");
        const sign = isGrowth && val >= 0 ? "+" : "";
        lines.push(`- ${label}: **${sign}${val.toFixed(2)}${unit}** (${String(row.report_month).slice(0, 7)})`);
      }
      if (lines.length) {
        out.push("### Vĩ mô Việt Nam (số liệu mới nhất theo từng chỉ tiêu)");
        out.push(...lines);
      }
    }
  } catch { /* bảng chưa có → bỏ qua */ }

  // 1c) VN macro NỀN LỊCH SỬ (vn_macro_history — World Bank, chính chủ). Hiện 3 năm gần nhất/chỉ số.
  try {
    const { data } = await sb.from("vn_macro_history")
      .select("code,name,value,unit,year").order("year", { ascending: false });
    if (data?.length) {
      const byCode = new Map<string, { name: string; unit: string; pts: string[] }>();
      for (const r of data as any[]) {
        const g = byCode.get(r.code) ?? { name: r.name, unit: r.unit, pts: [] };
        if (g.pts.length < 3) g.pts.push(`${r.year}: ${r.value}${r.unit === "%" ? "%" : " " + r.unit}`);
        byCode.set(r.code, g);
      }
      if (byCode.size) {
        const ref = registry ? ` ${registry.add("World Bank (dữ liệu VN)", "https://data.worldbank.org/country/vietnam")}` : "";
        out.push(`### Vĩ mô Việt Nam — nền lịch sử theo năm (World Bank)${ref}`);
        for (const g of byCode.values()) out.push(`- ${g.name}: ${g.pts.join(" · ")}`);
      }
    }
  } catch { /* bảng chưa có → bỏ qua */ }

  // 2) VN-Index / HNX (market_indices — không lặp macro_indicators)
  try {
    const codes = ["VNINDEX", "HNX", "VN30"];
    const { data } = await sb.from("market_indices")
      .select("index_code,close,change_pct,date").in("index_code", codes)
      .order("date", { ascending: false }).limit(30);
    const seen = new Set<string>(); const lines: string[] = [];
    for (const r of data ?? []) {
      if (seen.has(r.index_code)) continue; seen.add(r.index_code);
      lines.push(`- ${r.index_code}: **${Number(r.close).toLocaleString("en-US", { maximumFractionDigits: 2 })}**${r.change_pct != null ? ` (${r.change_pct >= 0 ? "+" : ""}${Number(r.change_pct).toFixed(2)}%)` : ""} · ${r.date}`);
    }
    if (lines.length) { out.push("### Thị trường Việt Nam"); out.push(...lines); }
  } catch { /* skip */ }

  // 3) Top tin vĩ mô (market_news, 3 ngày, impact cao) — [ref:N]
  try {
    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data } = await sb.from("market_news")
      .select("title,source,article_url,impact_score,news_type,published_at")
      .in("news_type", ["vi_mo", "thi_truong", "vi_mo_dn", "phap_ly"])
      .gte("published_at", since)
      .order("published_at", { ascending: false }).limit(60);
    const top = (data ?? [])
      .sort((a: any, b: any) => Math.abs(b.impact_score ?? 0) - Math.abs(a.impact_score ?? 0))
      .slice(0, 5);
    if (top.length) {
      out.push("### Tin vĩ mô nổi bật (3 ngày gần nhất)");
      for (const n of top) {
        const ref = (registry && n.article_url) ? ` ${registry.add(n.source || "Tin vĩ mô", n.article_url)}` : "";
        const imp = n.impact_score != null ? ` [impact ${Number(n.impact_score) >= 0 ? "+" : ""}${n.impact_score}]` : "";
        out.push(`- ${n.title}${imp}${ref}`);
      }
    }
  } catch { /* skip */ }

  out.push("> Dùng bối cảnh vĩ mô này làm nền khi đánh giá thị trường/ngành/mã: tỷ giá & DXY tăng → áp lực khối ngoại/tỷ giá; lợi suất Mỹ tăng → dòng vốn; VIX cao → rủi ro; giá dầu → năng lượng/vận tải.");
  return out.join("\n");
}
