import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Search, FileText, Trash2, CheckCircle, AlertCircle, Loader, X } from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: { str?: string }) => item.str ?? "").join(" "));
    }
    return pages.join("\n\n");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = reject;
    reader.readAsText(file, "UTF-8");
  });
}

type DocStatus = "pending" | "processing" | "ready" | "error";

interface KBDoc {
  id: string;
  title: string;
  file_path: string | null;
  file_type: string | null;
  status: DocStatus;
  error_msg: string | null;
  chunk_count: number | null;
  created_at: string;
}

const FILE_STYLE: Record<string, { color: string; bg: string; dBg: string }> = {
  pdf: { color: "#FF3B30", bg: "rgba(255,59,48,0.09)",  dBg: "rgba(255,59,48,0.15)" },
  txt: { color: "#0849AC", bg: "rgba(8,73,172,0.08)",   dBg: "rgba(77,143,232,0.15)" },
  md:  { color: "#6366F1", bg: "rgba(99,102,241,0.09)", dBg: "rgba(99,102,241,0.18)" },
  url: { color: "#FF9500", bg: "rgba(255,149,0,0.09)",  dBg: "rgba(255,149,0,0.18)" },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

function StatusBadge({ status, errorMsg, isDark }: { status: DocStatus; errorMsg: string | null; isDark: boolean }) {
  if (status === "ready") return (
    <span title="Đã sẵn sàng" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "#30D158" }}>
      <CheckCircle size={12} strokeWidth={2} /> Sẵn sàng
    </span>
  );
  if (status === "processing" || status === "pending") return (
    <span title="Đang xử lý" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: isDark ? "#4D8FE8" : "#0849AC" }}>
      <Loader size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> Đang xử lý
    </span>
  );
  return (
    <span title={errorMsg || "Lỗi"} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "#FF3B30" }}>
      <AlertCircle size={12} strokeWidth={2} /> Lỗi
    </span>
  );
}

function FileRow({
  doc, isDark, fg, fgSubtle, divider, isLast, onDelete,
}: {
  doc: KBDoc; isDark: boolean; fg: string; fgSubtle: string;
  divider: string; isLast: boolean; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const ext = doc.file_type || "txt";
  const fs = FILE_STYLE[ext] || FILE_STYLE.txt;
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
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: fileBg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <FileText size={17} color={fs.color} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: fg, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: fgSubtle }}>{formatDate(doc.created_at)}</span>
          {doc.status === "ready" && doc.chunk_count != null && (
            <span style={{ fontSize: 11, color: fgSubtle }}>{doc.chunk_count} đoạn văn</span>
          )}
          <StatusBadge status={doc.status} errorMsg={doc.error_msg} isDark={isDark} />
        </div>
      </div>

      <button
        onClick={onDelete}
        disabled={doc.status === "processing" || doc.status === "pending"}
        style={{
          background: "none", border: "none",
          cursor: doc.status === "processing" || doc.status === "pending" ? "not-allowed" : "pointer",
          padding: 7, borderRadius: 8, display: "flex",
          color: fgSubtle, opacity: hovered && doc.status === "ready" ? 1 : 0,
          transition: "opacity 150ms, background 120ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,59,48,0.12)" : "rgba(255,59,48,0.08)";
          (e.currentTarget as HTMLElement).style.color = "#FF3B30";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = fgSubtle;
        }}
        title="Xóa"
      >
        <Trash2 size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function KnowledgeBase({ isDark = false }: { isDark?: boolean }) {
  const fg       = isDark ? "rgba(240,242,255,0.92)" : "#1A1A2E";
const fgSubtle = isDark ? "rgba(240,242,255,0.35)" : "rgba(26,26,46,0.40)";
  const cardBg   = isDark ? "#131824" : "#ffffff";
  const brand    = isDark ? "#4D8FE8" : "#0849AC";
  const divider  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const [docs, setDocs]       = useState<KBDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDocs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, file_path, file_type, status, error_msg, chunk_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) setDocs(data as KBDoc[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Poll for status updates on processing docs
  useEffect(() => {
    const hasPending = docs.some(d => d.status === "processing" || d.status === "pending");
    if (hasPending && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const pendingIds = docs
          .filter(d => d.status === "processing" || d.status === "pending")
          .map(d => d.id);

        if (pendingIds.length === 0) {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          return;
        }

        const { data } = await supabase
          .from("knowledge_documents")
          .select("id, status, error_msg, chunk_count")
          .in("id", pendingIds);

        if (data && data.length > 0) {
          setDocs(prev => prev.map(d => {
            const updated = data.find(u => u.id === d.id);
            return updated ? { ...d, ...updated } : d;
          }));
        }
      }, 2000);
    } else if (!hasPending && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {};
  }, [docs]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  async function uploadFile(file: File) {
    setUploadError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
    const allowed = ["txt", "md", "pdf"];
    if (!allowed.includes(ext)) {
      setUploadError("Chỉ hỗ trợ định dạng TXT, MD, PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File tối đa 10MB");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      // Extract text client-side so edge function gets clean text (not binary)
      const contentRaw = await extractText(file);
      if (!contentRaw.trim()) throw new Error("Không đọc được nội dung file");

      const safeFilename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `${user.id}/${safeFilename}`;

      const { error: uploadErr } = await supabase.storage
        .from("kb-docs")
        .upload(storagePath, file, { contentType: file.type || "text/plain", upsert: false });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: docData, error: insertErr } = await supabase
        .from("knowledge_documents")
        .insert({
          user_id: user.id,
          title: file.name,
          file_path: storagePath,
          file_type: ext,
          content_raw: contentRaw,
          status: "pending",
        })
        .select("id, title, file_path, file_type, status, error_msg, chunk_count, created_at")
        .single();

      if (insertErr || !docData) throw new Error(insertErr?.message || "Không thể tạo document");

      setDocs(prev => [docData as KBDoc, ...prev]);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.functions.invoke("embed-document", {
          body: { document_id: docData.id },
        }).catch(() => {});
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: KBDoc) {
    if (doc.status === "processing" || doc.status === "pending") return;
    const ok = window.confirm(`Xóa "${doc.title}"? Hành động này không thể hoàn tác.`);
    if (!ok) return;

    if (doc.file_path) {
      await supabase.storage.from("kb-docs").remove([doc.file_path]);
    }
    await supabase.from("knowledge_documents").delete().eq("id", doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  const filtered = docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", fontFamily: "'Montserrat', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: fg, letterSpacing: "-0.025em" }}>
            Knowledge Base
          </h1>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 22, border: "none",
              background: uploading ? (isDark ? "rgba(77,143,232,0.4)" : "rgba(8,73,172,0.4)") : brand,
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
              fontFamily: "'Montserrat', system-ui, sans-serif", transition: "opacity 150ms",
            }}
            onMouseEnter={(e) => { if (!uploading) (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {uploading
              ? <><Loader size={13} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> Đang tải lên…</>
              : <><Upload size={13} strokeWidth={2} /> Upload</>
            }
          </button>
          <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf" style={{ display: "none" }} onChange={handleFileInput} />
        </div>

        <p style={{ margin: "0 0 24px", fontSize: 13, color: fgSubtle }}>
          {loading ? "Đang tải…" : `${docs.length} tài liệu · dùng trong Agent Studio`}
        </p>

        {/* Upload error */}
        {uploadError && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderRadius: 10, marginBottom: 12,
            background: isDark ? "rgba(255,59,48,0.12)" : "rgba(255,59,48,0.07)",
            border: `1px solid rgba(255,59,48,0.25)`,
          }}>
            <span style={{ fontSize: 13, color: "#FF3B30", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={14} strokeWidth={2} /> {uploadError}
            </span>
            <button onClick={() => setUploadError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#FF3B30", display: "flex", padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: cardBg, border: `1px solid ${divider}`,
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
              <X size={14} />
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
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

        {/* File list */}
        <div style={{
          background: cardBg, borderRadius: 16,
          border: `1px solid ${divider}`,
          boxShadow: isDark ? "0 1px 4px rgba(0,0,0,0.40)" : "0 1px 4px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Loader size={20} color={fgSubtle} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
              <p style={{ margin: 0, fontSize: 14, color: fgSubtle }}>Đang tải tài liệu...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, color: fgSubtle }}>
                {search ? `Không tìm thấy tài liệu cho "${search}"` : "Chưa có tài liệu nào. Upload file TXT, MD hoặc PDF để bắt đầu."}
              </p>
            </div>
          ) : (
            filtered.map((doc, i) => (
              <FileRow
                key={doc.id}
                doc={doc}
                isDark={isDark}
                fg={fg}
                fgSubtle={fgSubtle}
                divider={divider}
                isLast={i === filtered.length - 1}
                onDelete={() => handleDelete(doc)}
              />
            ))
          )}
        </div>

        {/* RAG info footer */}
        {docs.length > 0 && (
          <div style={{ margin: "12px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: fgSubtle }}>
              Tài liệu được mã hóa và chỉ dùng trong Agent Studio của bạn
            </p>
            {docs.filter(d => d.status === "ready").length > 0 && (
              <p style={{ margin: 0, fontSize: 12, color: isDark ? "rgba(48,209,88,0.7)" : "rgba(30,130,55,0.8)", fontWeight: 600 }}>
                ✓ {docs.filter(d => d.status === "ready").reduce((acc, d) => acc + (d.chunk_count || 0), 0)} đoạn văn đã sẵn sàng cho RAG
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
