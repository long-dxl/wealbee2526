import { ExternalLink, TrendingUp, TrendingDown, Minus, Brain } from "lucide-react";

// ── Inline markdown: **bold** and *italic* ────────────────────────────────

function InlineMd({ text, style }: { text: string; style?: React.CSSProperties }) {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<em key={m.index}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span style={style}>{parts}</span>;
}

// ── Types (mirror edge function schema) ──────────────────────────────────

export interface PortfolioChipsSection { type: "portfolio_chips"; has_news: string[]; no_news: string[] }
export interface NewsCardSection { type: "news_card"; label: string; news_type: string; source: string; url: string; title: string; affected_symbols: string[]; summary: string[]; reasoning: string[]; impact_score: number | null }
export interface ComparisonTableSection { type: "comparison_table"; caption?: string; columns: string[]; rows: Record<string, string | number | null>[] }
export interface SummaryListSection { type: "summary_list"; title?: string; items: { symbol?: string; headline: string; label?: string; source?: string; url?: string }[] }
export interface TextBlockSection { type: "text_block"; content: string }
export interface AlertBannerSection { type: "alert_banner"; level: "info" | "warning" | "critical"; message: string }
export interface SectionHeaderSection { type: "section_header"; title: string }

export type BriefSection = PortfolioChipsSection | SectionHeaderSection | NewsCardSection | ComparisonTableSection | SummaryListSection | TextBlockSection | AlertBannerSection;

export interface BriefOutput { time?: string; date?: string; sections: BriefSection[] }

// ── Design tokens ─────────────────────────────────────────────────────────

const LABEL_CONFIG: Record<string, { bg: string; color: string; border: string; text: string; icon: React.ReactNode }> = {
  very_positive: { bg: "#C8E6C9", color: "#1B5E20", border: "#1B5E20", text: "RẤT TÍCH CỰC", icon: <TrendingUp size={11} strokeWidth={2.5} /> },
  positive:      { bg: "#E8F5E9", color: "#2E7D32", border: "#2E7D32", text: "TÍCH CỰC",     icon: <TrendingUp size={11} strokeWidth={2} /> },
  negative:      { bg: "#FDE8EC", color: "#D4183D", border: "#D4183D", text: "TIÊU CỰC",     icon: <TrendingDown size={11} strokeWidth={2} /> },
  very_negative: { bg: "#F8D7DA", color: "#7B0D1E", border: "#7B0D1E", text: "RẤT TIÊU CỰC", icon: <TrendingDown size={11} strokeWidth={2.5} /> },
};

const NEWS_TYPE_LABEL: Record<string, string> = {
  vi_mo: "Vĩ mô", hoat_dong_kd: "Hoạt động KD", thi_truong: "Thị trường",
  vi_mo_dn: "Vĩ mô ngành", phap_ly: "Pháp lý", du_bao: "Dự báo",
};

const ALERT_COLORS = {
  info:     { bg: "rgba(8,73,172,0.06)",  border: "#0849AC", color: "#0849AC" },
  warning:  { bg: "rgba(255,149,0,0.08)", border: "#FF9500", color: "#FF9500" },
  critical: { bg: "rgba(212,24,61,0.07)", border: "#D4183D", color: "#D4183D" },
};

// ── Sub-components ────────────────────────────────────────────────────────

function SymbolChip({ sym, active, isDark }: { sym: string; active: boolean; isDark: boolean }) {
  return (
    <span style={{
      background: active ? (isDark ? "rgba(77,143,232,0.18)" : "#EBF3FF") : (isDark ? "rgba(255,255,255,0.07)" : "#F3F4F6"),
      color: active ? (isDark ? "#7BB8F5" : "#0849AC") : (isDark ? "rgba(240,242,255,0.85)" : "#9CA3AF"),
      fontSize: 12, fontWeight: active ? 700 : 600,
      padding: "4px 11px", borderRadius: 20,
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      {sym}
    </span>
  );
}

function Divider({ isDark }: { isDark: boolean }) {
  return <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", margin: "0 20px" }} />;
}

function SectionTitle({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <div style={{ padding: "14px 20px 6px" }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: isDark ? "rgba(240,242,255,0.92)" : "#030213", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        {title}
      </span>
    </div>
  );
}

function SectionHeader({ section, isDark }: { section: SectionHeaderSection; isDark: boolean }) {
  return (
    <div style={{ padding: "18px 20px 4px" }}>
      <span style={{
        fontSize: 18, fontWeight: 700,
        color: isDark ? "rgba(240,242,255,0.92)" : "#030213",
        fontFamily: "'Montserrat', system-ui, sans-serif",
        letterSpacing: "-0.2px",
      }}>
        {section.title}
      </span>
    </div>
  );
}

// ── Section renderers ─────────────────────────────────────────────────────

function PortfolioChips({ section, isDark }: { section: PortfolioChipsSection; isDark: boolean }) {
  const fgLabel = isDark ? "rgba(240,242,255,0.45)" : "#3D3D52";
  return (
    <div style={{ padding: "12px 20px 16px", background: isDark ? "transparent" : "transparent" }}>
      <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: fgLabel, letterSpacing: "0.5px", textTransform: "uppercase", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        Danh mục hôm nay
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {section.has_news.map(s => <SymbolChip key={s} sym={s} active isDark={isDark} />)}
        {section.no_news.map(s => <SymbolChip key={s} sym={s} active={false} isDark={isDark} />)}
      </div>
      {section.has_news.length > 0 && (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: fgLabel, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          <span style={{ color: "#2E7D32", fontWeight: 600 }}>{section.has_news.length} mã có tin</span>
          {section.no_news.length > 0 && <span> · {section.no_news.length} mã không có tin mới</span>}
        </p>
      )}
    </div>
  );
}

function NewsCard({ section, watchSymbols, isDark }: { section: NewsCardSection; watchSymbols: string[]; isDark: boolean }) {
  const lc = LABEL_CONFIG[section.label] ?? { bg: "#F3F4F6", color: "#374151", border: "#D1D5DB", text: section.label, icon: <Minus size={11} /> };
  const fgBody = isDark ? "rgba(240,242,255,0.75)" : "#374151";
  const fgReasoning = isDark ? "rgba(240,242,255,0.85)" : "#4A5568";
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#F8F9FB";
  const reasoningBg = isDark ? "rgba(77,143,232,0.10)" : "#ECF2FF";
  const reasoningColor = isDark ? "#7BB8F5" : "#0849AC";
  const watchSet = new Set(watchSymbols);

  const userAffected = (section.affected_symbols ?? []).filter(s => watchSet.has(s));
  const deepPrompt = [
    `Tóm tắt bài báo: ${section.url}`,
    `Phân tích tác động của tin này lên cổ phiếu ${userAffected.length ? userAffected.join(", ") : section.affected_symbols?.join(", ") || "danh mục"}.`,
    `Bạn hãy research các thông tin cần thiết liên quan để tự cung cấp đủ context nhằm phân tích tin tức và cho tôi biết:`,
    `- Tin ảnh hưởng trực tiếp hay gián tiếp?`,
    `- Mức độ tác động (mạnh / vừa / yếu)`,
    `- Ngắn hạn vs dài hạn`,
    `- Thị trường đã phản ánh chưa?`,
    `- Kết luận: bullish hay bearish (kèm reasoning)`,
  ].join("\n");
  const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(deepPrompt)}`;

  return (
    <div style={{ padding: "6px 20px" }}>
      <div style={{ background: cardBg, borderRadius: 10, borderLeft: `4px solid ${lc.border}`, padding: "14px 16px" }}>
        {/* Badge row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" as const }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, background: lc.bg, color: lc.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            {lc.icon}{lc.text}
          </span>
          {section.news_type && (
            <span style={{ background: isDark ? "rgba(255,255,255,0.07)" : "#F0F0F8", color: isDark ? "rgba(240,242,255,0.85)" : "#5A5A7A", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              {NEWS_TYPE_LABEL[section.news_type] ?? section.news_type}
            </span>
          )}
          {section.source && (
            <span style={{ color: isDark ? "rgba(240,242,255,0.35)" : "#717182", fontSize: 11, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{section.source}</span>
          )}
        </div>

        {/* Title */}
        <a href={section.url} target="_blank" rel="noopener noreferrer"
          style={{ color: isDark ? "rgba(240,242,255,0.92)" : "#030213", fontSize: 14, fontWeight: 600, textDecoration: "none", display: "block", lineHeight: 1.55, marginBottom: 8, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {section.title}
        </a>

        {/* Affected symbols */}
        {section.affected_symbols?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginBottom: 8 }}>
            {section.affected_symbols.map(s => (
              <span key={s} style={{
                background: watchSet.has(s) ? (isDark ? "rgba(77,143,232,0.18)" : "#EBF3FF") : (isDark ? "rgba(255,255,255,0.06)" : "#F3F4F6"),
                color: watchSet.has(s) ? (isDark ? "#7BB8F5" : "#0849AC") : (isDark ? "rgba(240,242,255,0.85)" : "#9CA3AF"),
                fontSize: 11, fontWeight: watchSet.has(s) ? 700 : 500,
                fontStyle: watchSet.has(s) ? "italic" : "normal",
                padding: "3px 10px", borderRadius: 20,
                fontFamily: "'Montserrat', system-ui, sans-serif",
              }}>{s}</span>
            ))}
          </div>
        )}

        {/* Summary bullets */}
        {section.summary?.length > 0 && (
          <ul style={{ margin: "0 0 8px", paddingLeft: 16 }}>
            {section.summary.map((b, i) => (
              <li key={i} style={{ color: fgBody, fontSize: 13, lineHeight: 1.65, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                <InlineMd text={b} />
              </li>
            ))}
          </ul>
        )}

        {/* Read more link */}
        <p style={{ margin: "0 0 10px" }}>
          <a href={section.url} target="_blank" rel="noopener noreferrer"
            style={{ color: isDark ? "#7BB8F5" : "#0849AC", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            Đọc bài báo gốc <ExternalLink size={11} strokeWidth={2} />
          </a>
        </p>

        {/* AI Reasoning */}
        <div style={{ background: section.reasoning?.length > 0 ? reasoningBg : (isDark ? "rgba(255,255,255,0.03)" : "#F8F9FB"), borderRadius: 8, padding: "10px 14px", border: section.reasoning?.length > 0 ? "none" : `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "#ECECF0"}` }}>
          {section.reasoning?.length > 0 ? (
            <>
              <p style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 5, color: reasoningColor, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                <Brain size={12} strokeWidth={2} /> AI REASONING
              </p>
              <ul style={{ margin: "0 0 10px", paddingLeft: 16 }}>
                {section.reasoning.map((r, i) => (
                  <li key={i} style={{ color: fgReasoning, fontSize: 12, lineHeight: 1.65, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                    <InlineMd text={r} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ margin: "0 0 8px", color: isDark ? "rgba(240,242,255,0.30)" : "#9CA3AF", fontSize: 12, fontStyle: "italic", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              Chưa có AI reasoning cho bài này.
            </p>
          )}
          <div>
            <a href={chatgptUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#0849AC", color: "#ffffff",
              fontSize: 11, fontWeight: 600, padding: "7px 14px",
              borderRadius: 20, textDecoration: "none",
              fontFamily: "'Montserrat', system-ui, sans-serif",
            }}>
              Research sâu hơn →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonTable({ section, isDark }: { section: ComparisonTableSection; isDark: boolean }) {
  const fg = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "rgba(26,26,46,0.65)";
  const thBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(8,73,172,0.04)";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";

  return (
    <div style={{ padding: "6px 20px 14px" }}>
      {section.caption && (
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{section.caption}</p>
      )}
      <div style={{ overflowX: "auto" as const, borderRadius: 10, border: `1px solid ${border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          <thead>
            <tr style={{ background: thBg }}>
              {section.columns.map(col => (
                <th key={col} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 700, color: brand, textAlign: "left", borderBottom: `1px solid ${border}`, letterSpacing: "0.4px", textTransform: "uppercase" as const }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: i < section.rows.length - 1 ? `1px solid ${border}` : "none" }}>
                {section.columns.map(col => {
                  const val = row[col];
                  const isLabel = typeof val === "string" && Object.keys(LABEL_CONFIG).includes(val);
                  const lc = isLabel ? LABEL_CONFIG[val as string] : null;
                  return (
                    <td key={col} style={{ padding: "9px 12px", fontSize: 13, color: fgMuted, verticalAlign: "middle" }}>
                      {lc ? (
                        <span style={{ background: lc.bg, color: lc.color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>{lc.text}</span>
                      ) : String(val ?? "—")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryList({ section, isDark }: { section: SummaryListSection; isDark: boolean }) {
  const fg = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted = isDark ? "rgba(240,242,255,0.85)" : "rgba(26,26,46,0.65)";
  const brand = isDark ? "#4D8FE8" : "#0849AC";

  return (
    <div style={{ padding: "6px 20px 12px" }}>
      {section.title && (
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>{section.title}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
        {section.items.map((item, i) => {
          const lc = item.label ? LABEL_CONFIG[item.label] : null;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              {item.symbol && (
                <span style={{ background: isDark ? "rgba(77,143,232,0.15)" : "#EBF3FF", color: brand, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12, whiteSpace: "nowrap", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                  {item.symbol}
                </span>
              )}
              {lc && (
                <span style={{ background: lc.bg, color: lc.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 12, whiteSpace: "nowrap", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
                  {lc.text}
                </span>
              )}
              <span style={{ fontSize: 13, color: fgMuted, lineHeight: 1.55, fontFamily: "'Montserrat', system-ui, sans-serif", flex: 1 }}><InlineMd text={item.headline} /></span>
              {item.source && (
                item.url
                  ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: isDark ? "#4D8FE8" : "#0849AC", whiteSpace: "nowrap", fontFamily: "'Montserrat', system-ui, sans-serif", flexShrink: 0, alignSelf: "center" as const, textDecoration: "none", borderBottom: "1px dashed currentColor" }}>
                      {item.source} ↗
                    </a>
                  : <span style={{ fontSize: 10, color: isDark ? "rgba(240,242,255,0.30)" : "rgba(26,26,46,0.38)", whiteSpace: "nowrap", fontFamily: "'Montserrat', system-ui, sans-serif", flexShrink: 0, alignSelf: "center" as const }}>
                      {item.source}
                    </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextBlock({ section, isDark }: { section: TextBlockSection; isDark: boolean }) {
  const isDisclaimer = section.content.includes("tư vấn đầu tư") || section.content.includes("Luật Chứng khoán");
  const fgMuted = isDark ? "rgba(240,242,255,0.35)" : "#3D3D52";
  const fgBody = isDark ? "rgba(240,242,255,0.85)" : "#374151";

  if (isDisclaimer) {
    return (
      <div style={{ padding: "10px 20px 20px", textAlign: "center" as const }}>
        <p style={{ margin: 0, fontSize: 11, color: fgMuted, fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.6 }}>{section.content}</p>
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 20px" }}>
      <p style={{ margin: 0, fontSize: 13, color: fgBody, lineHeight: 1.75, fontFamily: "'Montserrat', system-ui, sans-serif" }}><InlineMd text={section.content} /></p>
    </div>
  );
}

function AlertBanner({ section, isDark }: { section: AlertBannerSection; isDark: boolean }) {
  const c = ALERT_COLORS[section.level];
  return (
    <div style={{ margin: "6px 20px", padding: "12px 16px", background: c.bg, borderRadius: 10, borderLeft: `4px solid ${c.border}` }}>
      <p style={{ margin: 0, fontSize: 13, color: c.color, fontWeight: 600, fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.6 }}>{section.message}</p>
    </div>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────

export function BriefRenderer({
  brief,
  isDark = false,
  watchSymbols = [],
}: {
  brief: BriefOutput;
  isDark?: boolean;
  watchSymbols?: string[];
}) {
  const brand = isDark ? "#4D8FE8" : "#0849AC";
  const headerBg = isDark ? "rgba(77,143,232,0.10)" : "#ECF2FF";
  const fgHeader = isDark ? "#7BB8F5" : "#0849AC";
  const fgBody = isDark ? "rgba(240,242,255,0.85)" : "#374151";
  const dividerColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

  // Group sections: find multi-symbol news_cards vs per-symbol
  const sections = brief.sections ?? [];

  return (
    <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: headerBg, padding: "14px 20px", borderRadius: "10px 10px 0 0" }}>
        <span style={{ color: fgHeader, fontSize: 15, fontWeight: 700 }}>
          Bản tin hàng ngày · {brief.time || "—"}
        </span>
        {brief.date && (
          <span style={{ color: isDark ? "rgba(123,184,245,0.60)" : "rgba(8,73,172,0.55)", fontSize: 12, marginLeft: 10, fontWeight: 600 }}>
            {brief.date}
          </span>
        )}
      </div>
      <div style={{ padding: "10px 20px 8px" }}>
        <p style={{ margin: 0, fontSize: 13, color: fgBody, lineHeight: 1.65 }}>
          Dưới đây là những tin tức quan trọng ảnh hưởng đến danh mục của bạn hôm nay.
        </p>
      </div>

      <Divider isDark={isDark} />

      {/* Sections */}
      {sections.map((section, i) => {
        const isLast = i === sections.length - 1;

        let node: React.ReactNode = null;

        if (section.type === "portfolio_chips") {
          node = <PortfolioChips section={section} isDark={isDark} />;
        } else if (section.type === "section_header") {
          node = <SectionHeader section={section} isDark={isDark} />;
        } else if (section.type === "news_card") {
          node = <NewsCard section={section} watchSymbols={watchSymbols} isDark={isDark} />;
        } else if (section.type === "comparison_table") {
          node = <ComparisonTable section={section} isDark={isDark} />;
        } else if (section.type === "summary_list") {
          node = <SummaryList section={section} isDark={isDark} />;
        } else if (section.type === "text_block") {
          node = <TextBlock section={section} isDark={isDark} />;
        } else if (section.type === "alert_banner") {
          node = <AlertBanner section={section} isDark={isDark} />;
        }

        const nextSection = sections[i + 1];
        const showDivider = !isLast
          && section.type !== "text_block"
          && section.type !== "section_header"
          && nextSection?.type !== "section_header";

        return (
          <div key={i}>
            {node}
            {showDivider && <Divider isDark={isDark} />}
          </div>
        );
      })}

      {sections.length === 0 && (
        <div style={{ padding: "32px 20px", textAlign: "center" as const }}>
          <p style={{ margin: 0, fontSize: 13, color: isDark ? "rgba(240,242,255,0.35)" : "#3D3D52", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            Không có tin tức nổi bật trong 48h qua.
          </p>
        </div>
      )}
    </div>
  );
}
