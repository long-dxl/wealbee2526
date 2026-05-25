import { BookOpen, Upload, Search, FileText, Trash2, Plus, RefreshCw, CheckCircle, AlertCircle, Clock, Brain } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase/client";

interface KBDocument {
  id: string;
  title: string;
  file_path: string | null;
  file_type: string;
  chunk_count: number;
  status: "pending" | "processing" | "ready" | "error";
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callEmbedFunction(documentId: string, jwt: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/embed-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify({ document_id: documentId }),
  });
  return res.json();
}

export function KnowledgePage() {
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const processingRef = useRef<Set<string>>(new Set());

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        setAuthToken(session.access_token);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
      setAuthToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load documents ─────────────────────────────────────────────────────────
  const loadDocs = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("knowledge_documents")
      .select("id,title,file_path,file_type,chunk_count,status,error_msg,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setDocs((data as KBDocument[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (userId) loadDocs();
    else setLoading(false);
  }, [userId]);

  // ── Poll processing docs ───────────────────────────────────────────────────
  useEffect(() => {
    const processing = docs.filter(d => d.status === "processing");
    if (processing.length === 0) return;
    const interval = setInterval(async () => {
      if (!userId) return;
      const { data } = await supabase
        .from("knowledge_documents")
        .select("id,status,chunk_count,error_msg,updated_at")
        .eq("user_id", userId)
        .in("id", processing.map(d => d.id));
      if (!data) return;
      setDocs(prev => prev.map(d => {
        const updated = data.find((u: KBDocument) => u.id === d.id);
        if (!updated) return d;
        return { ...d, ...updated };
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [docs, userId]);

  // ── Upload file ────────────────────────────────────────────────────────────
  const handleFiles = async (files: File[]) => {
    if (!userId || !authToken) return;
    setUploading(true);
    for (const file of files) {
      try {
        const ext  = file.name.split(".").pop()?.toLowerCase() ?? "txt";
        const path = `${userId}/${Date.now()}_${file.name}`;

        // Upload to Storage
        const { error: storageErr } = await supabase.storage
          .from("kb-docs")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });

        if (storageErr) { console.error("Storage error:", storageErr); continue; }

        // Insert document record
        const { data: docRow, error: docErr } = await supabase
          .from("knowledge_documents")
          .insert({
            user_id: userId,
            title: file.name.replace(/\.[^/.]+$/, ""),
            file_path: path,
            file_type: ext === "pdf" ? "pdf" : ext === "md" ? "markdown" : "text",
            status: "processing",
          })
          .select("id")
          .single();

        if (docErr || !docRow) { console.error("Insert error:", docErr); continue; }

        // Trigger embedding (fire & forget, but track)
        processingRef.current.add(docRow.id);
        callEmbedFunction(docRow.id, authToken).catch(console.error);

        await loadDocs();
      } catch (err) {
        console.error("Upload error:", err);
      }
    }
    setUploading(false);
  };

  // ── Save manual text ───────────────────────────────────────────────────────
  const saveManual = async () => {
    if (!userId || !authToken || !manualTitle.trim() || !manualContent.trim()) return;
    setSavingManual(true);
    const { data: docRow, error } = await supabase
      .from("knowledge_documents")
      .insert({
        user_id: userId,
        title: manualTitle.trim(),
        file_type: "text",
        content_raw: manualContent.trim(),
        status: "processing",
      })
      .select("id")
      .single();

    if (!error && docRow) {
      callEmbedFunction(docRow.id, authToken).catch(console.error);
      setManualTitle("");
      setManualContent("");
      setShowManual(false);
      await loadDocs();
    }
    setSavingManual(false);
  };

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDoc = async (doc: KBDocument) => {
    if (!confirm(`Xóa "${doc.title}"?`)) return;
    if (doc.file_path) {
      await supabase.storage.from("kb-docs").remove([doc.file_path]);
    }
    await supabase.from("knowledge_documents").delete().eq("id", doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  // ── Re-embed ───────────────────────────────────────────────────────────────
  const reEmbed = async (doc: KBDocument) => {
    if (!authToken) return;
    await supabase.from("knowledge_documents").update({ status: "processing" }).eq("id", doc.id);
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: "processing" as const } : d));
    callEmbedFunction(doc.id, authToken).catch(console.error);
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const statusIcon = (status: KBDocument["status"]) => {
    switch (status) {
      case "ready":      return <CheckCircle style={{ width: 14, height: 14, color: "#10b981" }} />;
      case "processing": return <RefreshCw style={{ width: 14, height: 14, color: "#f59e0b", animation: "spin 1s linear infinite" }} />;
      case "error":      return <AlertCircle style={{ width: 14, height: 14, color: "#ef4444" }} />;
      default:           return <Clock style={{ width: 14, height: 14, color: "#99a1af" }} />;
    }
  };

  const statusBadge = (doc: KBDocument) => {
    const styles: Record<string, React.CSSProperties> = {
      ready:      { background: "rgba(16,185,129,0.1)", color: "#10b981" },
      processing: { background: "rgba(245,158,11,0.1)", color: "#f59e0b" },
      error:      { background: "rgba(239,68,68,0.1)",  color: "#ef4444" },
      pending:    { background: "rgba(153,161,175,0.1)", color: "#99a1af" },
    };
    const labels: Record<string, string> = {
      ready: `${doc.chunk_count} chunks`, processing: "Đang xử lý…", error: "Lỗi", pending: "Chờ xử lý",
    };
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: "0.6875rem", fontWeight: 700, ...styles[doc.status] }}>
        {statusIcon(doc.status)} {labels[doc.status]}
      </span>
    );
  };

  const fileIcon = (type: string) => {
    const isRed = type === "pdf";
    return (
      <div style={{ width: 36, height: 36, borderRadius: 9, background: isRed ? "rgba(239,68,68,0.1)" : "rgba(8,73,172,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText style={{ width: 16, height: 16, color: isRed ? "#ef4444" : "#0849ac" }} />
      </div>
    );
  };

  const filtered = docs.filter(d => !searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalChunks = docs.reduce((a, d) => a + (d.chunk_count ?? 0), 0);
  const readyDocs   = docs.filter(d => d.status === "ready").length;

  // Not logged in
  if (!userId && !loading) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <Brain style={{ width: 40, height: 40, color: "#d1d5db", marginBottom: 12 }} />
        <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>Vui lòng đăng nhập để dùng Knowledge Base</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "1.375rem", fontWeight: 700, color: "#1a1a2e" }}>Knowledge Base</h1>
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 4 }}>
            {readyDocs}/{docs.length} tài liệu sẵn sàng · {totalChunks.toLocaleString("vi-VN")} chunks đã index · AI sẽ tự tham chiếu khi bạn hỏi
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowManual(!showManual)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(8,73,172,0.08)", border: "1px solid rgba(8,73,172,0.15)", color: "#0849ac", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>
            <Plus style={{ width: 14, height: 14 }} />Nhập text
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, background: "#0849ac", color: "#fff", cursor: uploading ? "not-allowed" : "pointer", fontSize: "0.8125rem", fontWeight: 600, opacity: uploading ? 0.7 : 1 }}>
            {uploading ? <RefreshCw style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Upload style={{ width: 14, height: 14 }} />}
            {uploading ? "Đang upload…" : "Upload tài liệu"}
            <input type="file" accept=".pdf,.md,.txt" multiple disabled={uploading} style={{ display: "none" }}
              onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); }} />
          </label>
        </div>
      </div>

      {/* Manual text input panel */}
      {showManual && (
        <div style={{ background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.15)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e", marginBottom: 12 }}>Nhập kiến thức trực tiếp (note, chiến lược, ghi chú phân tích…)</p>
          <input
            type="text"
            placeholder="Tiêu đề tài liệu…"
            value={manualTitle}
            onChange={e => setManualTitle(e.target.value)}
            style={{ width: "100%", border: "1px solid rgba(8,73,172,0.15)", borderRadius: 8, padding: "8px 12px", fontSize: "0.875rem", fontFamily: "inherit", marginBottom: 10, outline: "none", boxSizing: "border-box" }}
          />
          <textarea
            placeholder="Nội dung (báo cáo, ghi chú phân tích, chiến lược đầu tư…)"
            value={manualContent}
            onChange={e => setManualContent(e.target.value)}
            rows={6}
            style={{ width: "100%", border: "1px solid rgba(8,73,172,0.15)", borderRadius: 8, padding: "8px 12px", fontSize: "0.8125rem", fontFamily: "inherit", marginBottom: 10, outline: "none", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowManual(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "0.8125rem", color: "#6a7282" }}>Hủy</button>
            <button onClick={saveManual} disabled={savingManual || !manualTitle.trim() || !manualContent.trim()}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#0849ac", color: "#fff", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, opacity: savingManual ? 0.7 : 1 }}>
              {savingManual ? "Đang lưu…" : "Lưu & Index"}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f8ff", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 9, padding: "8px 12px", marginBottom: 16, maxWidth: 400 }}>
        <Search style={{ width: 14, height: 14, color: "#99a1af", flexShrink: 0 }} />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm tài liệu…"
          style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.8125rem", color: "#1a1a2e", width: "100%", fontFamily: "inherit" }} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        style={{ border: `2px dashed ${dragOver ? "#0849ac" : "rgba(8,73,172,0.15)"}`, borderRadius: 12, padding: "20px", textAlign: "center", marginBottom: 20, background: dragOver ? "rgba(8,73,172,0.04)" : "transparent", transition: "all 0.15s", cursor: "default" }}
      >
        <Upload style={{ width: 22, height: 22, color: "#99a1af", margin: "0 auto 8px" }} />
        <p style={{ fontSize: "0.8125rem", color: "#6a7282" }}>Kéo thả file vào đây để upload</p>
        <p style={{ fontSize: "0.75rem", color: "#c4c9d4", marginTop: 4 }}>Hỗ trợ: .pdf, .md, .txt · Tối đa 10MB/file</p>
      </div>

      {/* Document list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <RefreshCw style={{ width: 24, height: 24, color: "#99a1af", animation: "spin 1s linear infinite", margin: "0 auto" }} />
          <p style={{ fontSize: "0.8125rem", color: "#99a1af", marginTop: 10 }}>Đang tải…</p>
        </div>
      ) : filtered.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(doc => (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#ffffff", border: "1px solid rgba(8,73,172,0.08)", borderRadius: 12, padding: "14px 16px" }}>
              {fileIcon(doc.file_type)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
                <p style={{ fontSize: "0.6875rem", color: "#99a1af", marginTop: 3 }}>
                  {doc.file_type.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                  {doc.error_msg ? <span style={{ color: "#ef4444" }}> · {doc.error_msg}</span> : null}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {statusBadge(doc)}
                {doc.status === "error" && (
                  <button onClick={() => reEmbed(doc)} title="Thử lại" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(8,73,172,0.15)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#0849ac" }}>
                    <RefreshCw style={{ width: 12, height: 12 }} />
                  </button>
                )}
                <button onClick={() => deleteDoc(doc)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(239,68,68,0.15)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <BookOpen style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "0.875rem", color: "#1a1a2e", fontWeight: 600 }}>
            {searchQuery ? "Không tìm thấy tài liệu phù hợp" : "Chưa có tài liệu"}
          </p>
          <p style={{ fontSize: "0.75rem", color: "#99a1af", marginTop: 4 }}>
            {searchQuery ? "Thử từ khóa khác" : "Upload báo cáo tài chính, phân tích ngành, chiến lược đầu tư để BeeAI tham chiếu"}
          </p>
        </div>
      )}

      {/* Info banner */}
      {readyDocs > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(8,73,172,0.04)", border: "1px solid rgba(8,73,172,0.1)", borderRadius: 10, padding: "12px 14px", marginTop: 20 }}>
          <Brain style={{ width: 16, height: 16, color: "#0849ac", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: "0.75rem", color: "#4b5563", lineHeight: 1.5 }}>
            <strong>BeeAI đã có thể tham chiếu {readyDocs} tài liệu.</strong> Khi bạn hỏi trong chat, AI sẽ tự động tìm kiếm các đoạn văn phù hợp từ knowledge base và đưa vào phân tích.
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
