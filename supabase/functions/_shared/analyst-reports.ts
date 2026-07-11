// Báo cáo phân tích CTCK (bảng analyst_reports, scraper Vietstock) → context cho agent.
// Quan điểm BÊN THỨ BA (môi giới) — mỗi khuyến nghị/giá mục tiêu kèm [CTCK · ngày · link].
// deno-lint-ignore-file no-explicit-any

interface Reg { add(name: string, url: string): string }

const fmtVnd = (n: number | null) => n == null ? null
  : n >= 1000 ? `${Math.round(n).toLocaleString("vi-VN")}đ` : `${n}`;

// MUA/Khả quan/Tích cực = tích cực; Bán/Kém khả quan = tiêu cực; còn lại trung lập.
function recoSign(r: string | null): 1 | -1 | 0 {
  const s = (r || "").toLowerCase();
  if (/mua|khả quan|tích cực|outperform|buy|add/.test(s)) return 1;
  if (/bán|kém khả quan|tiêu cực|underperform|sell|reduce/.test(s)) return -1;
  return 0;
}

/** Báo cáo phân tích gần nhất cho 1 mã. registry (tùy) → mỗi báo cáo có [ref:N] mở PDF gốc. "" nếu không có. */
export async function analystReportsContext(sb: any, symbol: string, registry?: Reg): Promise<string> {
  const sym = symbol.toUpperCase().trim();
  const { data } = await sb.from("analyst_reports")
    .select("title,source_firm,recommendation,target_price,report_date,pdf_url,full_text")
    .eq("ticker", sym)
    .order("report_date", { ascending: false })
    .limit(5);
  if (!data?.length) return "";

  const out: string[] = [`## Báo cáo phân tích CTCK: ${sym} (quan điểm BÊN THỨ BA — môi giới, KHÔNG phải khuyến nghị của hệ thống)`];

  let nPos = 0, nNeg = 0; const targets: number[] = [];
  for (const r of data) {
    const ref = (registry && r.pdf_url) ? ` ${registry.add(`${r.source_firm || "CTCK"} · ${r.report_date ?? ""}`, r.pdf_url)}` : "";
    const tp = fmtVnd(r.target_price);
    const sign = recoSign(r.recommendation);
    if (sign > 0) nPos++; else if (sign < 0) nNeg++;
    if (r.target_price) targets.push(Number(r.target_price));
    out.push(`- **${r.source_firm || "CTCK"}**${r.recommendation ? ` · Khuyến nghị **${r.recommendation}**` : ""}${tp ? ` · Giá mục tiêu **${tp}**` : ""}${r.report_date ? ` · ${r.report_date}` : ""}${ref}`);
    // trích 1 đoạn ngắn từ full_text để có ngữ cảnh (bỏ xuống dòng, cắt ~200 ký tự)
    const snip = (r.full_text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (snip) out.push(`  Trích: "${snip}…"`);
  }

  // Đồng thuận
  const avgTp = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null;
  out.push(`> Đồng thuận (${data.length} báo cáo gần nhất): ${nPos} tích cực · ${nNeg} tiêu cực${avgTp ? ` · giá mục tiêu trung bình ~${fmtVnd(avgTp)}` : ""}. Mỗi giá mục tiêu/khuyến nghị PHẢI dẫn kèm [CTCK · ngày · link]; đây là quan điểm môi giới, không phải khuyến nghị của Wealbee.`);
  return out.join("\n");
}