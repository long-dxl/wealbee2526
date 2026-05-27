import { useState } from "react";
import { Upload, Search, FileText, Trash2 } from "lucide-react";

interface KBItem {
  id: string;
  name: string;
  type: "pdf" | "txt" | "md" | "url";
  size: string;
  addedAt: string;
  usedBy: string[];
}

const mockItems: KBItem[] = [
  { id: "1", name: "BCTC Q1 2026 - HPG.pdf",          type: "pdf", size: "2.3 MB", addedAt: "10/05/2026", usedBy: ["Deep Research", "Earnings Analyst"] },
  { id: "2", name: "Phân tích ngành thép VN 2026.md",  type: "md",  size: "45 KB",  addedAt: "08/05/2026", usedBy: ["Deep Research"] },
  { id: "3", name: "UBCK - Thông tư 96 hướng dẫn.pdf", type: "pdf", size: "1.1 MB", addedAt: "01/04/2026", usedBy: [] },
  { id: "4", name: "Portfolio strategy Q2 2026.txt",    type: "txt", size: "12 KB",  addedAt: "15/03/2026", usedBy: ["Portfolio Health"] },
];

const FILE_STYLE: Record<string, { color: string; bg: string; dBg: string }> = {
  pdf: { color: "#FF3B30", bg: "rgba(255,59,48,0.09)",  dBg: "rgba(255,59,48,0.15)" },
  txt: { color: "#0849AC", bg: "rgba(8,73,172,0.08)",   dBg: "rgba(77,143,232,0.15)" },
  md:  { color: "#6366F1", bg: "rgba(99,102,241,0.09)", dBg: "rgba(99,102,241,0.18)" },
  url: { color: "#FF9500", bg: "rgba(255,149,0,0.09)",  dBg: "rgba(255,149,0,0.18)" },
};

function FileRow({ item, isDark, fg, fgSubtle, divider, isLast, brand, onDelete }: {
  item: KBItem; isDark: boolean; fg: string; fgSubtle: string;
  divider: string; isLast: boolean; brand: string; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const fs = FILE_STYLE[item.type] || FILE_STYLE.txt;
  const fileBg = isDark ? fs.dBg : fs.bg;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
        borderBottom: isLast ? "none" : `1px solid ${divider}`,
        background: hovered ? (isDark ? "rgba(77,143,232,0.05)" : "rgba(8,73,172,0.03)") : "transparent",
        transition: "background 120ms",
      }}
    >
      {/* File type icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: fileBg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <FileText size={17} color={fs.color} strokeWidth={1.5} />
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: fg, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: fgSubtle }}>{item.size} · {item.addedAt}</span>
          {item.usedBy.map((agent) => (
            <span key={agent} style={{
              fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 20,
              background: isDark ? "rgba(77,143,232,0.10)" : "rgba(8,73,172,0.06)",
              color: brand,
            }}>
              {agent}
            </span>
          ))}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: 7, borderRadius: 8, display: "flex",
          color: fgSubtle, opacity: hovered ? 1 : 0,
          transition: "opacity 150ms, background 120ms",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,59,48,0.12)" : "rgba(255,59,48,0.08)"; (e.currentTarget as HTMLElement).style.color = "#FF3B30"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = fgSubtle; }}
        title="Xóa"
      >
        <Trash2 size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function KnowledgeBase({ isDark = false }: { isDark?: boolean }) {
  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
  const fgMuted  = isDark ? "rgba(240,242,255,0.55)" : "rgba(26,26,46,0.60)";
  const fgSubtle = isDark ? "rgba(240,242,255,0.35)" : "rgba(26,26,46,0.40)";
  const cardBg   = isDark ? "#131824" : "#ffffff";
  const brand    = isDark ? "#4D8FE8" : "#0849AC";
  const divider  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const [items, setItems]   = useState(mockItems);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em" }}>
          Knowledge Base
        </h1>
        <button
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 22, border: "none",
            background: brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Montserrat', system-ui, sans-serif",
            transition: "opacity 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          <Upload size={13} strokeWidth={2} />
          Upload
        </button>
      </div>

      <p style={{ margin: "0 0 24px", fontSize: 13, color: fgSubtle }}>
        {items.length} tài liệu · dùng trong Agent Studio
      </p>

      {/* ── Search ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: cardBg,
        border: `1px solid ${divider}`,
        borderRadius: 12, padding: "0 16px", height: 44, marginBottom: 12,
        boxShadow: isDark ? "0 1px 3px rgba(0,0,0,0.30)" : "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <Search size={15} strokeWidth={1.5} color={fgSubtle} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tài liệu..."
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontSize: 14, color: fg, fontFamily: "'Montserrat', system-ui, sans-serif",
          }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: fgSubtle, display: "flex", padding: 0 }}>
            ✕
          </button>
        )}
      </div>

      {/* ── Upload drop zone (compact) ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          height: 52, borderRadius: 12, marginBottom: 16, cursor: "pointer",
          border: `1.5px dashed ${dragOver
            ? (isDark ? "rgba(77,143,232,0.60)" : "rgba(8,73,172,0.50)")
            : (isDark ? "rgba(255,255,255,0.14)" : "rgba(8,73,172,0.20)")}`,
          background: dragOver
            ? (isDark ? "rgba(77,143,232,0.08)" : "rgba(8,73,172,0.04)")
            : "transparent",
          transition: "all 150ms ease",
        }}
        onMouseEnter={(e) => {
          if (!dragOver) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(77,143,232,0.05)" : "rgba(8,73,172,0.025)";
        }}
        onMouseLeave={(e) => {
          if (!dragOver) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <Upload size={14} color={isDark ? "rgba(77,143,232,0.55)" : "rgba(8,73,172,0.40)"} strokeWidth={1.5} />
        <span style={{ fontSize: 13, color: isDark ? "rgba(77,143,232,0.70)" : "rgba(8,73,172,0.55)", fontWeight: 500 }}>
          Kéo thả tài liệu vào đây
        </span>
        <span style={{ fontSize: 12, color: fgSubtle }}>· PDF, TXT, MD · tối đa 10MB</span>
      </div>

      {/* ── File list ── */}
      <div style={{
        background: cardBg, borderRadius: 16,
        border: `1px solid ${divider}`,
        boxShadow: isDark ? "0 1px 4px rgba(0,0,0,0.40)" : "0 1px 4px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 14, color: fgSubtle }}>
              {search ? `Không tìm thấy tài liệu cho "${search}"` : "Chưa có tài liệu nào"}
            </p>
          </div>
        ) : (
          filtered.map((item, i) => (
            <FileRow
              key={item.id}
              item={item}
              isDark={isDark}
              fg={fg}
              fgSubtle={fgSubtle}
              divider={divider}
              isLast={i === filtered.length - 1}
              brand={brand}
              onDelete={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
            />
          ))
        )}
      </div>

      {/* Footer note */}
      {items.length > 0 && (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: fgSubtle, textAlign: "center" }}>
          Tài liệu được mã hóa và chỉ dùng trong Agent Studio của bạn
        </p>
      )}
    </div>
  );
}
