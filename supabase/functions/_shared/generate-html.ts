/**
 * Shared HTML generation logic used by both agent-dry-run and run-agent.
 * Any change here applies to both — dry-run and actual run produce identical output.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

export interface GenerateResult {
  html: string;
  tokensUsed: number;
  dataForLLM: ReturnType<typeof buildDataPayload>["dataForLLM"];
  timeStr: string;
}

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
    content_summary: toLines(a.content_summary),
    impact_reasoning: toLines(a.impact_reasoning),
    impact_score: a.impact_score,
  };
}

function buildDataPayload(news: NewsRow[], watchSymbols: string[]) {
  const watchSymbolSet = new Set(watchSymbols);
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
    perSymbol[sym] = perSymbol[sym].slice(0, 3);
  }

  const multiArticles = multiSymbol.slice(0, 5);
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

export async function fetchNewsAndBuildData(sb: ReturnType<typeof createClient>, watchSymbols: string[]) {
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();

  const { data: allNews } = await sb
    .from("market_news")
    .select("id,title,content_summary,article_url,label,source,news_type,affected_symbols,impact_reasoning,impact_score,published_at")
    .not("label", "is", null)
    .neq("label", "trash")
    .gte("published_at", since)
    .order("impact_score", { ascending: false, nullsFirst: false })
    .limit(100);

  return buildDataPayload((allNews ?? []) as NewsRow[], watchSymbols);
}

const HIDDEN_BASE = `Bạn là AI render HTML cho bản tin chứng khoán Wealbee. Output PHẢI là HTML thuần với inline styles, KHÔNG markdown, KHÔNG \`\`\`html wrapper.

## DỮ LIỆU JSON ĐẦU VÀO
{
  "time": "HH:MM",
  "date": "Thứ X, DD/MM/YYYY",
  "watchSymbols": ["VHM","BID"],
  "hasNews": ["VHM"],       // mã có tin trong 48h
  "noNews": ["BID"],        // mã không có tin
  "multiArticles": [...],   // bài ảnh hưởng ≥2 mã trong watchSymbols
  "articles": { "VHM": [...], "BID": [] }
}
Mỗi article: { title, label, news_type, source, article_url, affected_symbols[], content_summary[], impact_reasoning[], impact_score }

## LABEL COLORS
very_positive → bg:#C8E6C9, color:#1B5E20, border:#1B5E20, text:"RẤT TÍCH CỰC"
positive      → bg:#E8F5E9, color:#2E7D32, border:#2E7D32, text:"TÍCH CỰC"
negative      → bg:#FDE8EC, color:#D4183D, border:#D4183D, text:"TIÊU CỰC"
very_negative → bg:#F8D7DA, color:#7B0D1E, border:#7B0D1E, text:"RẤT TIÊU CỰC"

## NEWS_TYPE LABELS
vi_mo="Vĩ mô" | hoat_dong_kd="Hoạt động KD" | thi_truong="Thị trường" | vi_mo_dn="Vĩ mô ngành" | phap_ly="Pháp lý" | du_bao="Dự báo"

## HTML STRUCTURE (bắt buộc dùng chính xác template này)

### HEADER
<div style="background:#ECF2FF;padding:14px 20px;">
  <span style="color:#0849AC;font-size:15px;font-weight:700;">Bản tin buổi sáng · {time}</span>
</div>
<div style="background:#fff;padding:12px 20px 10px;">
  <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">{intro text theo yêu cầu người dùng}</p>
</div>

### DANH MỤC HÔM NAY
<div style="background:#fff;padding:10px 20px 14px;">
  <p style="margin:0 0 8px;color:#030213;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Danh mục hôm nay</p>
  <div style="display:flex;flex-wrap:wrap;gap:6px;">
    <!-- mỗi symbol trong watchSymbols: -->
    <!-- nếu trong hasNews: -->
    <span style="background:#E8F5E9;color:#2E7D32;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;">{SYM}</span>
    <!-- nếu trong noNews: -->
    <span style="background:#F3F4F6;color:#9CA3AF;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">{SYM}</span>
  </div>
</div>
<div style="background:#fff;padding:0 20px 8px;"><div style="border-top:1px solid #ECECF0;"></div></div>

### SECTION HEADER (dùng cho "Tin ảnh hưởng nhiều cổ phiếu" và từng mã)
<div style="background:#fff;padding:14px 20px 6px;">
  <span style="color:#030213;font-size:16px;font-weight:700;">{section title}</span>
</div>

### ARTICLE CARD (dùng cho mỗi bài báo)
<div style="background:#fff;padding:6px 20px;">
  <div style="background:#F8F9FB;border-radius:10px;border-left:4px solid {LABEL_BORDER};padding:14px 16px;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
      <span style="background:{LABEL_BG};color:{LABEL_COLOR};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">{LABEL_TEXT}</span>
      <span style="background:#F0F0F8;color:#5A5A7A;font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;">{NEWS_TYPE}</span>
      <span style="color:#717182;font-size:11px;">{source}</span>
    </div>
    <a href="{article_url}" style="color:#030213;font-size:14px;font-weight:600;text-decoration:none;display:block;line-height:1.5;margin-bottom:8px;">{title}</a>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">
      <!-- affected_symbols: nếu trong watchSymbols → xanh, ngược lại → xám -->
      <span style="background:#EBF3FF;color:#0849AC;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;">{SYM}</span>
      <span style="background:#F3F4F6;color:#9CA3AF;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;">{SYM}</span>
    </div>
    <ul style="margin:0 0 8px;padding-left:16px;">
      <!-- content_summary bullets -->
      <li style="color:#374151;font-size:13px;line-height:1.6;">{bullet}</li>
    </ul>
    <p style="margin:0 0 10px;"><a href="{article_url}" style="color:#0849AC;font-size:12px;font-weight:600;text-decoration:none;">Đọc bài báo gốc →</a></p>
    <!-- chỉ render nếu impact_reasoning có data -->
    <div style="background:#ECF2FF;border-radius:8px;padding:10px 14px;">
      <p style="margin:0 0 5px;color:#0849AC;font-size:11px;font-weight:700;letter-spacing:0.5px;">AI REASONING</p>
      <ul style="margin:0;padding-left:16px;">
        <li style="color:#4A5568;font-size:12px;line-height:1.6;">{reasoning bullet}</li>
      </ul>
    </div>
  </div>
</div>
<div style="background:#fff;padding:0 20px 4px;"><div style="border-top:1px solid #F0F0F5;"></div></div>

### FOOTER
<div style="background:#fff;padding:10px 20px 20px;">
  <p style="margin:0;color:#9CA3AF;font-size:11px;text-align:center;">Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019, NĐ 155/2020/NĐ-CP</p>
</div>`;

const HIDDEN_RULES = `## QUY TẮC BẮT BUỘC
- Output là HTML thuần, KHÔNG \`\`\`html wrapper, KHÔNG markdown, KHÔNG text giải thích
- Inline styles 100%, không class, không id
- CHỈ dùng dữ liệu từ JSON. KHÔNG bịa VN-Index, VN30, top tăng/giảm hay bất kỳ số liệu nào ngoài JSON
- multiArticles → section "Tin ảnh hưởng nhiều cổ phiếu" TRƯỚC, KHÔNG lặp ở per-symbol
- Nếu multiArticles rỗng → bỏ qua section đó hoàn toàn
- Nếu articles[sym] rỗng → bỏ qua mã đó, không hiển thị "không có tin"
- Nếu TẤT CẢ rỗng → 1 card: "Không có tin tức nổi bật trong 48h qua"
- Mỗi symbol chỉ xuất hiện MỘT lần trong danh mục hôm nay`;

export const DEFAULT_USER_PROMPT = `Hiển thị bản tin buổi sáng theo format sau:

Header:
- Tiêu đề "Bản tin buổi sáng · {giờ}" nền xanh nhạt
- Mô tả: "Dưới đây là những tin tức quan trọng ảnh hưởng đến danh mục của bạn hôm nay."

Danh mục hôm nay:
- Mã có tin tức → chip xanh lá
- Mã không có tin → chip xám

Tin ảnh hưởng nhiều cổ phiếu (nếu có):
- Mỗi bài là 1 card, gồm: nhãn tin (pill màu theo mức độ), loại tin (pill xám), tên nguồn
- Tiêu đề bài báo có thể click
- Chip mã cổ phiếu bị ảnh hưởng (mã trong danh mục tôi = xanh đậm, mã khác = xám)
- Tóm tắt nội dung dạng bullet points
- Link "Đọc bài báo gốc →"
- Hộp AI REASONING nền xanh nhạt: bullet points lý luận AI

Tin theo từng mã: format card tương tự như trên

Footer:
- Disclaimer không phải tư vấn đầu tư`;

export function buildFullSystemPrompt(userPrompt: string): string {
  return `${HIDDEN_BASE}\n\n## YÊU CẦU HIỂN THỊ CỦA NGƯỜI DÙNG:\n${userPrompt}\n\n${HIDDEN_RULES}`;
}

export async function generateHtml(
  openaiApiKey: string,
  systemPrompt: string,
  dataForLLM: object,
  model = "gpt-4.1-mini",
): Promise<{ html: string; tokensUsed: number }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(dataForLLM) },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GPT API error: ${errText}`);
  }

  const data = await res.json();
  return {
    html: data.choices?.[0]?.message?.content ?? "",
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}
