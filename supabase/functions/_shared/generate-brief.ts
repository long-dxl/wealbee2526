/**
 * Shared brief generation logic.
 * GPT returns structured JSON sections — rendering is handled by the frontend.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NewsRow {
  id: string;
  title: string;
  content_summary: string | string[] | null;
  article_url: string;
  label: string;
  source: string;
  news_type: string | null;
  affected_symbols: string[] | null;
  impact_reasoning: string | string[] | null;
  impact_score: number | null;
  published_at: string;
}

export type SectionType =
  | "portfolio_chips"
  | "section_header"
  | "news_card"
  | "comparison_table"
  | "summary_list"
  | "text_block"
  | "alert_banner";


export interface SectionHeaderSection {
  type: "section_header";
  title: string;
}

export interface PortfolioChipsSection {
  type: "portfolio_chips";
  has_news: string[];
  no_news: string[];
}

export interface NewsCardSection {
  type: "news_card";
  label: string;
  news_type: string;
  source: string;
  url: string;
  title: string;
  affected_symbols: string[];
  summary: string[];
  reasoning: string[];
  impact_score: number | null;
}

export interface ComparisonTableSection {
  type: "comparison_table";
  caption?: string;
  columns: string[];
  rows: Record<string, string | number | null>[];
}

export interface SummaryListSection {
  type: "summary_list";
  title?: string;
  items: { symbol?: string; headline: string; label?: string; source?: string; url?: string }[];
}

export interface TextBlockSection {
  type: "text_block";
  content: string;
}

export interface AlertBannerSection {
  type: "alert_banner";
  level: "info" | "warning" | "critical";
  message: string;
}

export type BriefSection =
  | PortfolioChipsSection
  | SectionHeaderSection
  | NewsCardSection
  | ComparisonTableSection
  | SummaryListSection
  | TextBlockSection
  | AlertBannerSection;

export interface BriefOutput {
  time: string;
  date: string;
  sections: BriefSection[];
}

// ── Data fetching ──────────────────────────────────────────────────────────

const EMAIL_LABELS = new Set(["very_positive", "positive", "negative", "very_negative"]);

function toLines(val: string | string[] | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(s => s.trim()).filter(Boolean);
  return val.split("\n").map(s => s.trim()).filter(Boolean);
}

function articleToJson(a: NewsRow) {
  return {
    title: a.title,
    label: a.label,
    news_type: a.news_type,
    source: a.source,
    article_url: a.article_url,
    affected_symbols: a.affected_symbols ?? [],
    content_summary: toLines(a.content_summary).slice(0, 3),
    impact_reasoning: toLines(a.impact_reasoning).slice(0, 2),
    impact_score: a.impact_score,
  };
}

export async function fetchNewsAndBuildData(sb: ReturnType<typeof createClient>, watchSymbols: string[], filterSources?: string[]) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const watchSymbolSet = new Set(watchSymbols);

  let newsQuery = sb
    .from("market_news")
    .select("id,title,content_summary,article_url,label,source,news_type,affected_symbols,impact_reasoning,impact_score,published_at")
    .not("label", "is", null)
    .neq("label", "trash")
    .gte("published_at", since)
    .order("impact_score", { ascending: false, nullsFirst: false })
    .limit(100);
  if (filterSources && filterSources.length > 0) newsQuery = newsQuery.in("source", filterSources);
  const { data: allNews } = await newsQuery;

  const news: NewsRow[] = (allNews ?? []) as NewsRow[];
  const perSymbol: Record<string, NewsRow[]> = {};
  for (const sym of watchSymbols) perSymbol[sym] = [];

  const multiSymbol: NewsRow[] = [];
  const multiSeen = new Set<string>();

  for (const row of news) {
    if (!EMAIL_LABELS.has(row.label)) continue;
    const affected = (row.affected_symbols ?? []).filter(s => watchSymbolSet.has(s));
    const isMacro = row.news_type === "vi_mo" || row.news_type === "thi_truong";

    if (affected.length >= 2) {
      if (!multiSeen.has(row.id)) { multiSeen.add(row.id); multiSymbol.push(row); }
      for (const sym of affected) {
        if (!perSymbol[sym].some(r => r.id === row.id)) perSymbol[sym].push(row);
      }
    } else if (affected.length === 1) {
      const sym = affected[0];
      if (!perSymbol[sym].some(r => r.id === row.id)) perSymbol[sym].push(row);
    } else if (isMacro) {
      for (const sym of watchSymbols) {
        if (!perSymbol[sym].some(r => r.id === row.id)) perSymbol[sym].push(row);
      }
    }
  }

  for (const sym of watchSymbols) {
    perSymbol[sym].sort((a, b) => Math.abs(b.impact_score ?? 0) - Math.abs(a.impact_score ?? 0));
    perSymbol[sym] = perSymbol[sym].slice(0, 2);
  }

  const multiArticles = multiSymbol.slice(0, 3);
  const multiShownIds = new Set(multiArticles.map(r => r.id));

  return {
    dataForLLM: {
      time: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }),
      date: new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }),
      watchSymbols,
      hasNews: watchSymbols.filter(s => perSymbol[s]?.length > 0),
      noNews: watchSymbols.filter(s => !perSymbol[s]?.length),
      multiArticles: multiArticles.map(articleToJson),
      articles: Object.fromEntries(watchSymbols.map(s => [
        s,
        (perSymbol[s] ?? []).filter(r => !multiShownIds.has(r.id)).map(articleToJson),
      ])),
    },
    timeStr: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }),
  };
}

// ── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_BASE = `Bạn là AI phân tích tin tức chứng khoán Wealbee. Nhiệm vụ: đọc dữ liệu JSON và trả về JSON có cấu trúc sections[].
Dữ liệu tin tức được crawl trong 24 giờ gần nhất.

JSON đầu vào:
{
  "time": "HH:MM", "date": "Thứ X, DD/MM/YYYY",
  "watchSymbols": [],   // toàn bộ danh mục user
  "hasNews": [],        // mã CÓ tin trong 24h
  "noNews": [],         // mã KHÔNG có tin
  "multiArticles": [],  // bài ảnh hưởng ≥2 mã trong watchSymbols
  "articles": { "SYM": [...] }  // bài theo từng mã (đã loại bài trong multiArticles)
}
Mỗi article: { title, label, news_type, source, article_url, affected_symbols[], content_summary[], impact_reasoning[], impact_score }

Labels: very_positive | positive | negative | very_negative
News types: vi_mo | hoat_dong_kd | thi_truong | vi_mo_dn | phap_ly | du_bao

CÁC LOẠI SECTION:
- "portfolio_chips"  : { type, has_news[], no_news[] }
- "section_header"   : { type, title }  — dùng làm tiêu đề phân vùng (ví dụ tên mã "VHM", "VCB")
- "news_card"        : { type, label, news_type, source, url, title, affected_symbols[], summary[], reasoning[], impact_score }
- "comparison_table" : { type, caption?, columns[], rows[{col:val}] }
- "summary_list"     : { type, title?, items[{symbol?,headline,label?,source?,url?}] }
- "text_block"       : { type, content }
- "alert_banner"     : { type, level:"info"|"warning"|"critical", message }

QUY TẮC BẮT BUỘC:
- LUÔN bắt đầu bằng "portfolio_chips"
- Trong news_card: summary[] lấy từ content_summary[], reasoning[] lấy từ impact_reasoning[]
- Trong summary_list: mỗi item PHẢI có source = lấy đúng field "source" của article, url = lấy đúng field "article_url" của article. KHÔNG được bỏ trống cả hai field này.
- CHỈ dùng data từ JSON, KHÔNG bịa VN-Index, VN30, top tăng/giảm hay bất kỳ số liệu nào ngoài JSON
- alert_banner: CHỈ phát khi label trong dữ liệu THỰC SỰ là "very_negative" hoặc "very_positive". KHÔNG suy diễn từ nội dung bài. Nếu không có bài nào đúng label đó thì KHÔNG phát alert_banner.
- Sau mỗi alert_banner, PHẢI có ít nhất một news_card của bài tin gây ra alert đó ngay liền sau.
- Kết thúc bằng "text_block" disclaimer: "Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019, NĐ 155/2020/NĐ-CP"`;

export const DEFAULT_USER_PROMPT = `Tôi muốn xem bản phân tích danh mục đầy đủ theo thứ tự sau:

1. Đầu tiên cho tôi biết danh mục hôm nay: mã nào có tin tức, mã nào không có tin gì cả.

2. Nếu có bài báo ảnh hưởng đến từ 2 mã trở lên trong danh mục của tôi, hãy gom lại thành nhóm riêng. Đặt tiêu đề nhóm là "Tin ảnh hưởng nhiều cổ phiếu", rồi mỗi bài một card tin tức. Trong card đó nhớ hiển thị các mã cổ phiếu liên quan.

3. Sau đó, với từng mã có tin, tạo một tiêu đề là tên mã (ví dụ "VHM"), rồi liệt kê các tin của mã đó, mỗi tin một card. Những tin đã hiển thị ở nhóm trên thì không cần hiển thị lại.

4. Cuối cùng thêm dòng disclaimer pháp lý theo quy định.`;


export function buildSystemPrompt(userPrompt: string): string {
  return `${SYSTEM_BASE}\n\n## YÊU CẦU CỦA NGƯỜI DÙNG:\n${userPrompt}`;
}

// ── LLM call ───────────────────────────────────────────────────────────────

export async function generateBrief(
  openaiApiKey: string,
  systemPrompt: string,
  dataForLLM: object,
  model = "gpt-4.1-mini",
): Promise<{ brief: BriefOutput; tokensUsed: number }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Dữ liệu đầu vào:\n${JSON.stringify(dataForLLM)}\n\nHãy phân tích và trả về JSON hợp lệ theo đúng cấu trúc: {"time": "<lấy từ input>", "date": "<lấy từ input>", "sections": [...các section theo yêu cầu...]}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GPT API error: ${errText}`);
  }

  // Stream SSE chunks and accumulate content
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let tokensUsed = 0;
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = leftover + decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    leftover = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) accumulated += delta;
        if (parsed.usage?.total_tokens) tokensUsed = parsed.usage.total_tokens;
      } catch { /* skip malformed chunk */ }
    }
  }

  let brief: BriefOutput;
  try {
    const parsed = JSON.parse(accumulated);
    // GPT may wrap output in an arbitrary top-level key — unwrap to find the object with sections/time
    let candidate: unknown = (parsed.sections || parsed.time) ? parsed : undefined;
    if (!candidate) {
      candidate = Object.values(parsed).find(
        (v) => v !== null && typeof v === "object" && ("sections" in (v as object) || "time" in (v as object))
      ) ?? Object.values(parsed)[0] ?? parsed;
    }
    // Guard: must be a plain object, never a string/number
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      brief = { time: "", date: "", sections: [] };
    } else {
      brief = candidate as BriefOutput;
      if (!Array.isArray(brief.sections)) brief.sections = [];
    }
  } catch {
    brief = { time: "", date: "", sections: [] };
  }

  return { brief, tokensUsed };
}
