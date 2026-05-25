import { BookOpen, Upload, Search, FileText, Trash2, Plus } from "lucide-react";
import { useState } from "react";

interface KBFile {
  id: string;
  name: string;
  type: "pdf" | "md" | "txt";
  size: string;
  chunks: number;
  uploaded_at: string;
}

const DEMO_FILES: KBFile[] = [
  { id: "kb1", name: "Báo cáo thường niên VCB 2025.pdf", type: "pdf", size: "4.2 MB", chunks: 142, uploaded_at: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: "kb2", name: "Phân tích ngành ngân hàng Q1-2026.pdf", type: "pdf", size: "2.8 MB", chunks: 87, uploaded_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: "kb3", name: "Chiến lược đầu tư giá trị.md", type: "md", size: "48 KB", chunks: 12, uploaded_at: new Date(Date.now() - 7 * 86400000).toISOString() },
];

export function KnowledgePage() {
  const [files, setFiles] = useState<KBFile[]>(DEMO_FILES);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles = droppedFiles.map(f => ({
      id: crypto.randomUUID(),
      name: f.name,
      type: (f.name.endsWith(".pdf") ? "pdf" : f.name.endsWith(".md") ? "md" : "txt") as KBFile["type"],
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      chunks: 0,
      uploaded_at: new Date().toISOString(),
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Knowledge Base</h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>{files.length} tài liệu · {files.reduce((a, f) => a + f.chunks, 0)} chunks đã index</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>
          <Plus style={{ width: 15, height: 15 }} />Upload tài liệu
          <input type="file" accept=".pdf,.md,.txt" multiple style={{ display: "none" }} onChange={e => { if (e.target.files) { const nf = Array.from(e.target.files).map(f => ({ id: crypto.randomUUID(), name: f.name, type: (f.name.endsWith(".pdf") ? "pdf" : f.name.endsWith(".md") ? "md" : "txt") as KBFile["type"], size: `${(f.size/1024/1024).toFixed(1)} MB`, chunks: 0, uploaded_at: new Date().toISOString() })); setFiles(p => [...p, ...nf]); }}} />
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 9, padding: "8px 12px", marginBottom: 20, maxWidth: 400 }}>
        <Search style={{ width: 14, height: 14, color: "#99a1af" }} />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm kiếm trong Knowledge Base..." style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.8125rem", color: "#1a1a2e", width: "100%", fontFamily: "inherit" }} />
      </div>
      <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} style={{ border: `2px dashed ${dragOver ? "#0849ac" : "rgba(8,73,172,0.15)"}`, borderRadius: 12, padding: "20px", textAlign: "center", marginBottom: 20, background: dragOver ? "rgba(8,73,172,0.04)" : "transparent", transition: "all 0.15s" }}>
        <Upload style={{ width: 24, height: 24, color: "#99a1af", margin: "0 auto 8px" }} />
        <p style={{ fontSize: "0.8125rem", color: "#6a7282" }}>Kéo thả file PDF, Markdown vào đây</p>
        <p style={{ fontSize: "0.75rem", color: "#c4c9d4", marginTop: 4 }}>Hỗ trợ: .pdf, .md, .txt (tối đa 50MB)</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {files.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
          <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: file.type === "pdf" ? "rgba(239,68,68,0.1)" : "rgba(8,73,172,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText style={{ width: 16, height: 16, color: file.type === "pdf" ? "#ef4444" : "#0849ac" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: "0.6875rem", color: "#99a1af", marginTop: 3 }}>{file.size} · {file.chunks > 0 ? `${file.chunks} chunks` : "Đang xử lý..."} · {new Date(file.uploaded_at).toLocaleDateString("vi-VN")}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {file.chunks > 0 ? (
                <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(14,165,160,0.1)", color: "#0ea5a0", fontSize: "0.625rem", fontWeight: 700 }}>✓ Đã index</span>
              ) : (
                <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontSize: "0.625rem", fontWeight: 700 }}>Đang xử lý</span>
              )}
              <button onClick={() => setFiles(p => p.filter(f => f.id !== file.id))} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(239,68,68,0.15)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                <Trash2 style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {files.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <BookOpen style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Chưa có tài liệu</p>
          <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>Upload báo cáo tài chính, phân tích để AI tham chiếu</p>
        </div>
      )}
    </div>
  );
}
