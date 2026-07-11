import React from "react";
import { ExternalLink } from "lucide-react";
import { useTheme, type Theme } from "../lib/theme-context";

interface RefEntry { index: number; label: string; url: string; }

function renderInline(text: string, refs: RefEntry[] | undefined, t: Theme): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[ref:\d+\]|\[[^\]]+\]\([^)]+\)|<span[^>]*>[^<]*<\/span>)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{ fontWeight: 700, color: t.fg }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: "0.8em", background: t.bgAccent, padding: "1px 5px", borderRadius: 4, color: t.brand }}>{p.slice(1, -1)}</code>;
    // Inline color span: <span style="color:red">text</span>
    const spanMatch = p.match(/^<span[^>]*style="([^"]*)"[^>]*>([^<]*)<\/span>$/i);
    if (spanMatch) {
      const colorMatch = spanMatch[1].match(/color\s*:\s*([^;]+)/i);
      return <span key={i} style={colorMatch ? { color: colorMatch[1].trim(), fontWeight: 600 } : undefined}>{spanMatch[2]}</span>;
    }
    const refMatch = p.match(/^\[ref:(\d+)\]$/);
    if (refMatch) {
      if (refs) {
        const entry = refs.find(r => r.index === parseInt(refMatch[1]));
        if (entry) return (
          <a key={i} href={entry.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 6px", borderRadius: 4, marginLeft: 3, fontSize: "0.6875em", fontWeight: 600, color: t.brand, background: t.bgAccent, border: "1px solid " + t.border, textDecoration: "none", verticalAlign: "middle", lineHeight: 1.6, whiteSpace: "nowrap" }}>
            {entry.label}<ExternalLink style={{ width: 8, height: 8 }} />
          </a>
        );
      }
      return null;
    }
    const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      return (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 6px", borderRadius: 4, marginLeft: 3, fontSize: "0.6875em", fontWeight: 600, color: t.brand, background: t.bgAccent, border: "1px solid " + t.border, textDecoration: "none", verticalAlign: "middle", lineHeight: 1.6, whiteSpace: "nowrap" }}>
          {label}<ExternalLink style={{ width: 8, height: 8 }} />
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function MdTable({ lines, refs, t }: { lines: string[]; refs?: RefEntry[]; t: Theme }) {
  // Bỏ hàng phân cách markdown (chỉ gồm | : - khoảng trắng) → tránh hiện ":---" thô
  const dataRows = lines.filter(l => l.replace(/[\s|:-]/g, "") !== "");
  if (!dataRows.length) return null;
  const parseRow = (row: string) => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const [header, ...body] = dataRows;
  return (
    <div style={{ overflowX: "auto", margin: "14px 0", borderRadius: 10, border: "1px solid " + t.border, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
        <thead><tr>{parseRow(header).map((h, i) => (
          <th key={i} style={{ padding: "9px 14px", background: t.bgAccent, color: t.brand, fontWeight: 700, textAlign: "left", borderBottom: "2px solid " + t.border, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
            {renderInline(h, refs, t)}
          </th>
        ))}</tr></thead>
        <tbody>{body.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : t.bgMuted }}>
            {parseRow(row).map((cell, ci) => (
              <td key={ci} style={{ padding: "8px 14px", borderBottom: "1px solid " + t.border, color: t.fgMuted }}>{renderInline(cell, refs, t)}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function parseHtmlToMd(text: string): string {
  // Keep <span style="color:...">...</span> as-is for renderInline to handle.
  // Convert structural HTML to Markdown equivalents, strip the rest.
  return text
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(?!\/?(span)\b)[^>]+>/gi, "") // strip everything except <span> tags
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function MdContent({ text, refs }: { text: string; refs?: RefEntry[] }) {
  const { theme: t } = useTheme();
  let stripped = text.replace(/^```[^\n]*\n?([\s\S]*?)```\s*$/m, "$1").trim();
  if (stripped.includes("<div") || stripped.includes("<span") || stripped.includes("<a ")) {
    stripped = parseHtmlToMd(stripped);
  }
  const lines = stripped.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trim = raw.trim();
    if (trim.startsWith("|") && trim.endsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) { tbl.push(lines[i].trim()); i++; }
      nodes.push(<MdTable key={`t${i}`} lines={tbl} refs={refs} t={t} />); continue;
    }
    if (trim.startsWith("```")) {
      const fence = trim.slice(3); i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;
      nodes.push(
        <pre key={`code${i}`} style={{ background: t.bgAccent, border: "1px solid " + t.border, borderRadius: 10, padding: "12px 16px", overflowX: "auto", margin: "10px 0", fontSize: "0.8125rem", lineHeight: 1.7, color: t.fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {fence && <span style={{ fontSize: "0.625rem", fontWeight: 700, color: t.brand, textTransform: "uppercase", display: "block", marginBottom: 6 }}>{fence}</span>}
          {codeLines.join("\n")}
        </pre>
      ); continue;
    }
    if (/^---+$/.test(trim)) { nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid " + t.border, margin: "16px 0" }} />); i++; continue; }
    if (!trim) { nodes.push(<div key={i} style={{ height: 6 }} />); i++; continue; }
    if (trim.startsWith("# ") && !trim.startsWith("## ")) {
      nodes.push(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 10px", paddingBottom: 8, borderBottom: "2px solid " + t.border }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: t.brand, flexShrink: 0 }} />
          <h2 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: "1.0625rem", fontWeight: 800, color: t.fg }}>{trim.slice(2)}</h2>
        </div>
      ); i++; continue;
    }
    if (trim.startsWith("## ") && !trim.startsWith("### ")) {
      nodes.push(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: t.brand, flexShrink: 0 }} />
          <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: t.brand }}>{trim.slice(3)}</h3>
        </div>
      ); i++; continue;
    }
    if (trim.startsWith("### ") && !trim.startsWith("#### ")) {
      nodes.push(<h4 key={i} style={{ margin: "12px 0 5px", fontSize: "0.875rem", fontWeight: 700, color: t.fg, fontFamily: "'Montserrat',sans-serif", borderLeft: "3px solid " + t.border, paddingLeft: 8 }}>{trim.slice(4)}</h4>); i++; continue;
    }
    if (trim.startsWith("#### ")) {
      nodes.push(<h5 key={i} style={{ margin: "10px 0 4px", fontSize: "0.8125rem", fontWeight: 700, color: t.fgSubtle, fontFamily: "'Montserrat',sans-serif" }}>{trim.slice(5)}</h5>); i++; continue;
    }
    if (trim.startsWith("> ")) {
      nodes.push(
        <blockquote key={i} style={{ margin: "8px 0", padding: "8px 14px", borderLeft: "3px solid " + t.brand, background: t.bgAccent, borderRadius: "0 8px 8px 0", color: t.fgMuted, fontStyle: "italic" }}>
          {renderInline(trim.slice(2), refs, t)}
        </blockquote>
      ); i++; continue;
    }
    // Bullet: -, *, •, ·, → (yêu cầu có khoảng trắng sau marker để KHÔNG nuốt **bold** / *italic*)
    const bulletMatch = trim.match(/^([-*•·→])\s+(.*)$/);
    if (bulletMatch) {
      const marker = bulletMatch[1];
      const content = bulletMatch[2];
      const isArrow = marker === "→";
      const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
      const pad = indent >= 2 ? 20 : 0;   // bullet con (thụt lề) → chấm rỗng, lùi vào
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 9, marginBottom: 5, alignItems: "flex-start", marginLeft: pad }}>
          <span style={{ color: isArrow ? "#FF9500" : (pad ? t.fgSubtle : t.brand), flexShrink: 0, marginTop: pad ? 5 : 4, fontSize: isArrow ? "0.75rem" : (pad ? "0.6rem" : "0.5rem"), fontWeight: 700 }}>{isArrow ? "→" : (pad ? "◦" : "●")}</span>
          <span style={{ lineHeight: 1.7, color: t.fgMuted, fontSize: "0.875rem" }}>{renderInline(content, refs, t)}</span>
        </div>
      ); i++; continue;
    }
    if (/^\d+\.\s/.test(trim)) {
      const m = trim.match(/^(\d+)\.\s(.+)/);
      if (m) {
        nodes.push(
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
            <span style={{ color: t.brand, flexShrink: 0, fontWeight: 700, minWidth: 22, fontSize: "0.8125rem", lineHeight: 1.7 }}>{m[1]}.</span>
            <span style={{ lineHeight: 1.7, color: t.fgMuted, fontSize: "0.875rem" }}>{renderInline(m[2], refs, t)}</span>
          </div>
        ); i++; continue;
      }
    }
    if (trim.startsWith("*") && trim.endsWith("*") && !trim.startsWith("**")) {
      nodes.push(<p key={i} style={{ margin: "8px 0 0", fontSize: "0.75rem", color: t.fgDisabled, fontStyle: "italic", lineHeight: 1.6 }}>{trim.slice(1, -1)}</p>); i++; continue;
    }
    nodes.push(<p key={i} style={{ margin: "0 0 8px", lineHeight: 1.75, color: t.fgMuted, fontSize: "0.875rem" }}>{renderInline(trim, refs, t)}</p>);
    i++;
  }
  return <div style={{ fontFamily: "'Montserrat',system-ui,sans-serif" }}>{nodes}</div>;
}

// RichContent = MdContent with HTML color span support baked in via renderInline
export { MdContent as RichContent };
