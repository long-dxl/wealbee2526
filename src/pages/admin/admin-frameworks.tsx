import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Shield, LogOut, Plus, ChevronRight, ChevronDown,
  Play, CheckCircle2, XCircle, Clock, AlertTriangle,
  GitBranch, RotateCcw, RefreshCw, Copy, Check,
  FileText, Wrench, ClipboardList, X, Loader2,
} from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import wealbeeLogo from "../../assets/Logo.svg";

// ── Types ──────────────────────────────────────────────────────────────────

interface Framework {
  id: string;
  framework_key: string;
  name: string;
  task_type: string;
  company_type: string;
  description: string | null;
}

interface FrameworkVersion {
  id: string;
  framework_id: string;
  version: number;
  status: "draft" | "review" | "published" | "deprecated";
  system_rules: string;
  tool_policy: Record<string, unknown>;
  output_contract: Record<string, unknown>;
  eval_summary: Record<string, unknown> | null;
  checksum: string;
  change_note: string | null;
  created_at: string;
  published_at: string | null;
}

interface EvalCase {
  id: string;
  framework_id: string;
  name: string;
  input: Record<string, unknown>;
  assertions: Record<string, unknown>;
  is_active: boolean;
}

type Toast = { id: number; type: "success" | "error" | "info"; msg: string };

// ── Palette ────────────────────────────────────────────────────────────────

const C = {
  bg: "#0B0D18",
  surface: "#131824",
  surfaceHover: "#1a2438",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.13)",
  fg: "rgba(240,242,255,0.95)",
  fgMuted: "rgba(240,242,255,0.60)",
  fgSubtle: "rgba(240,242,255,0.35)",
  brand: "#4D8FE8",
  brandMuted: "rgba(77,143,232,0.15)",
  green: "#34C759",
  greenMuted: "rgba(52,199,89,0.12)",
  red: "#FF3B30",
  redMuted: "rgba(255,59,48,0.12)",
  yellow: "#FFD60A",
  yellowMuted: "rgba(255,214,10,0.12)",
  purple: "#BF5AF2",
  purpleMuted: "rgba(191,90,242,0.12)",
};

// ── Status badge ───────────────────────────────────────────────────────────

const STATUS_CFG: Record<FrameworkVersion["status"], { label: string; color: string; bg: string }> = {
  draft:       { label: "Draft",       color: C.fgMuted,  bg: "rgba(255,255,255,0.07)" },
  review:      { label: "Review",      color: C.yellow,   bg: C.yellowMuted },
  published:   { label: "Published",   color: C.green,    bg: C.greenMuted },
  deprecated:  { label: "Deprecated",  color: C.fgSubtle, bg: "rgba(255,255,255,0.05)" },
};

function StatusBadge({ status }: { status: FrameworkVersion["status"] }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
      background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────

function ToastList({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10,
          background: t.type === "success" ? C.greenMuted : t.type === "error" ? C.redMuted : C.brandMuted,
          border: `1px solid ${t.type === "success" ? "rgba(52,199,89,0.30)" : t.type === "error" ? "rgba(255,59,48,0.30)" : "rgba(77,143,232,0.30)"}`,
          color: t.type === "success" ? C.green : t.type === "error" ? C.red : C.brand,
          fontSize: 13, fontWeight: 600, minWidth: 280, maxWidth: 420,
          backdropFilter: "blur(10px)",
        }}>
          {t.type === "success" && <CheckCircle2 size={15} />}
          {t.type === "error" && <XCircle size={15} />}
          {t.type === "info" && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
          <span style={{ flex: 1, color: C.fg }}>{t.msg}</span>
          <button onClick={() => dismiss(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.fgSubtle, padding: 0, display: "flex" }}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── JSON viewer ────────────────────────────────────────────────────────────

function JsonBlock({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{ position: "relative" }}>
      <pre style={{
        background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: "12px 14px",
        fontSize: 11.5, lineHeight: 1.7, color: "rgba(200,210,255,0.80)",
        overflowX: "auto", margin: 0, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>{text}</pre>
      <button onClick={copy} style={{
        position: "absolute", top: 8, right: 8, padding: "3px 8px", borderRadius: 6,
        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
        cursor: "pointer", color: C.fgMuted, fontSize: 11, display: "flex", alignItems: "center", gap: 4,
      }}>
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ── Create Draft Modal ─────────────────────────────────────────────────────

function CreateDraftModal({
  framework, latestVersion, onClose, onCreated,
}: {
  framework: Framework;
  latestVersion: FrameworkVersion | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [rules, setRules] = useState(latestVersion?.system_rules ?? "");
  const [toolPolicy, setToolPolicy] = useState(
    latestVersion ? JSON.stringify(latestVersion.tool_policy, null, 2) : '{\n  "required": [],\n  "optional": [],\n  "denied": []\n}'
  );
  const [outputContract, setOutputContract] = useState(
    latestVersion ? JSON.stringify(latestVersion.output_contract, null, 2) : '{\n  "format": "markdown",\n  "citation_required": true,\n  "legal_disclaimer": true,\n  "unlinked_claim_policy": "warn"\n}'
  );
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    let tp: unknown, oc: unknown;
    try { tp = JSON.parse(toolPolicy); } catch { setErr("tool_policy: JSON không hợp lệ"); return; }
    try { oc = JSON.parse(outputContract); } catch { setErr("output_contract: JSON không hợp lệ"); return; }
    setSaving(true);
    try {
      const { data: latest } = await (supabase as any).from("framework_versions")
        .select("version").eq("framework_id", framework.id)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      const nextVersion = (latest?.version ?? 0) + 1;
      const { error } = await (supabase as any).from("framework_versions").insert({
        framework_id: framework.id, version: nextVersion, status: "review",
        system_rules: rules,
        tool_policy: tp,
        output_contract: oc,
        checksum: btoa(rules + JSON.stringify(tp) + JSON.stringify(oc)).slice(0, 32),
        change_note: changeNote || null,
      });
      if (error) throw error;
      onCreated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.70)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "#131824", borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)",
        width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto",
        padding: 28,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: C.fg }}>Tạo Version Mới</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: C.fgMuted }}>{framework.name} · sẽ tạo ở trạng thái <strong>review</strong></p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.fgMuted, padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* System Rules */}
        <Field label="System Rules" hint="Luật bất di bất dịch mà AI phải tuân theo">
          <textarea value={rules} onChange={e => setRules(e.target.value)} rows={6}
            style={{ ...textareaStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            placeholder="Chỉ sử dụng dữ liệu trong NGUỒN DỮ LIỆU. Mọi số liệu phải có [ref:N]..." />
        </Field>

        {/* Tool Policy */}
        <Field label="Tool Policy (JSON)" hint='required / optional / denied — array of tool IDs'>
          <textarea value={toolPolicy} onChange={e => setToolPolicy(e.target.value)} rows={5}
            style={{ ...textareaStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
        </Field>

        {/* Output Contract */}
        <Field label="Output Contract (JSON)" hint="format, citation_required, legal_disclaimer, unlinked_claim_policy">
          <textarea value={outputContract} onChange={e => setOutputContract(e.target.value)} rows={5}
            style={{ ...textareaStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
        </Field>

        {/* Change note */}
        <Field label="Ghi chú thay đổi" hint="Tùy chọn — ghi lại lý do cập nhật">
          <input value={changeNote} onChange={e => setChangeNote(e.target.value)}
            placeholder="VD: Thêm điều kiện phân tích ngân hàng"
            style={{ ...inputStyle }} />
        </Field>

        {err && (
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: 8, background: C.redMuted, border: `1px solid rgba(255,59,48,0.25)`, marginBottom: 16 }}>
            <AlertTriangle size={14} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: C.red }}>{err}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btnSecondary }}>Hủy</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Đang lưu…</> : <><Plus size={13} /> Tạo Version</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Version Detail Panel ───────────────────────────────────────────────────

function VersionDetail({
  version, framework, evalCases,
  onClose, onRefresh, toast,
}: {
  version: FrameworkVersion;
  framework: Framework;
  evalCases: EvalCase[];
  onClose: () => void;
  onRefresh: () => void;
  toast: (type: Toast["type"], msg: string) => void;
}) {
  const [tab, setTab] = useState<"rules" | "policy" | "contract" | "eval">("rules");
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const canEval = (version.status === "draft" || version.status === "review") && evalCases.length > 0;
  const canPublish = version.status === "review" && version.eval_summary?.passed === true;
  const canRollback = version.status === "deprecated";

  async function runEval() {
    setRunning(true);
    toast("info", `Đang chạy eval cho v${version.version}…`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/framework-eval`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ framework_version_id: version.id, model: "gpt-4o-mini" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Eval thất bại");
      toast("success", `Eval xong: ${json.passed_cases}/${json.total} case pass`);
      onRefresh();
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Eval lỗi");
    } finally { setRunning(false); }
  }

  async function publish() {
    setPublishing(true);
    try {
      const { error } = await (supabase as any).rpc("publish_framework_version", { p_version_id: version.id });
      if (error) throw error;
      toast("success", `v${version.version} đã publish thành công`);
      onRefresh(); onClose();
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Publish lỗi");
    } finally { setPublishing(false); }
  }

  async function rollback() {
    setRollingBack(true);
    try {
      const { error } = await (supabase as any).rpc("rollback_framework_version", { p_version_id: version.id });
      if (error) throw error;
      toast("success", `Đã rollback từ v${version.version} — version mới đang published`);
      onRefresh(); onClose();
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Rollback lỗi");
    } finally { setRollingBack(false); }
  }

  const TABS = [
    { id: "rules" as const, label: "Rules", icon: FileText },
    { id: "policy" as const, label: "Tool Policy", icon: Wrench },
    { id: "contract" as const, label: "Output Contract", icon: ClipboardList },
    { id: "eval" as const, label: "Eval", icon: CheckCircle2 },
  ];

  return (
    <div style={{
      width: 440, flexShrink: 0, borderLeft: `1px solid ${C.border}`,
      background: C.surface, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.fg }}>v{version.version}</span>
            <StatusBadge status={version.status} />
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: C.fgMuted }}>
            {framework.name} · {fmtDate(version.created_at)}
            {version.change_note && <> · <em>{version.change_note}</em></>}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 10, color: C.fgSubtle, fontFamily: "monospace" }}>
            checksum: {version.checksum.slice(0, 12)}…
          </p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.fgSubtle, padding: 4, display: "flex", flexShrink: 0 }}>
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 20px" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 12px", background: "none", border: "none", cursor: "pointer",
            borderBottom: `2px solid ${tab === t.id ? C.brand : "transparent"}`,
            color: tab === t.id ? C.brand : C.fgMuted,
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5,
            transition: "color 150ms",
          }}>
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {tab === "rules" && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.fgSubtle, letterSpacing: 0.5, marginBottom: 8 }}>SYSTEM RULES</p>
            <div style={{
              background: "rgba(0,0,0,0.30)", borderRadius: 8, padding: "14px 16px",
              fontSize: 12.5, lineHeight: 1.75, color: C.fgMuted, whiteSpace: "pre-wrap",
              border: `1px solid ${C.border}`,
            }}>
              {version.system_rules}
            </div>
          </div>
        )}
        {tab === "policy" && <JsonBlock data={version.tool_policy} />}
        {tab === "contract" && <JsonBlock data={version.output_contract} />}
        {tab === "eval" && (
          <EvalTab version={version} evalCases={evalCases} />
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        {canEval && (
          <button onClick={runEval} disabled={running} style={{
            ...btnFull, background: running ? "rgba(77,143,232,0.25)" : C.brandMuted,
            color: running ? C.fgMuted : C.brand, border: `1px solid ${running ? "transparent" : "rgba(77,143,232,0.30)"}`,
          }}>
            {running
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />  Đang chạy eval…</>
              : <><Play size={13} /> Chạy Eval ({evalCases.length} case)</>}
          </button>
        )}
        {canPublish && (
          <button onClick={publish} disabled={publishing} style={{
            ...btnFull, background: publishing ? C.greenMuted : C.greenMuted,
            color: C.green, border: `1px solid rgba(52,199,89,0.30)`,
            opacity: publishing ? 0.6 : 1,
          }}>
            {publishing
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Publishing…</>
              : <><CheckCircle2 size={13} /> Publish Version</>}
          </button>
        )}
        {!canPublish && version.status === "review" && (
          <div style={{ display: "flex", gap: 8, padding: "9px 12px", borderRadius: 8, background: C.yellowMuted, border: `1px solid rgba(255,214,10,0.25)` }}>
            <AlertTriangle size={13} color={C.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: C.yellow }}>Phải chạy eval và pass trước khi publish</span>
          </div>
        )}
        {canRollback && (
          <button onClick={rollback} disabled={rollingBack} style={{
            ...btnFull, background: "rgba(191,90,242,0.10)",
            color: C.purple, border: `1px solid rgba(191,90,242,0.25)`,
            opacity: rollingBack ? 0.6 : 1,
          }}>
            {rollingBack
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Đang rollback…</>
              : <><RotateCcw size={13} /> Rollback về Version này</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Eval Tab ───────────────────────────────────────────────────────────────

function EvalTab({ version, evalCases }: { version: FrameworkVersion; evalCases: EvalCase[] }) {
  const summary = version.eval_summary;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary card */}
      {summary ? (
        <div style={{
          borderRadius: 10, padding: "14px 16px",
          background: (summary.passed as boolean) ? C.greenMuted : C.redMuted,
          border: `1px solid ${(summary.passed as boolean) ? "rgba(52,199,89,0.25)" : "rgba(255,59,48,0.25)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {(summary.passed as boolean)
              ? <CheckCircle2 size={16} color={C.green} />
              : <XCircle size={16} color={C.red} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: (summary.passed as boolean) ? C.green : C.red }}>
              {(summary.passed as boolean) ? "Eval Passed" : "Eval Failed"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.fgMuted }}>
            <span>✓ {summary.passed_cases as number ?? "?"} pass</span>
            <span>✗ {summary.failed_cases as number ?? "?"} fail</span>
            <span>Model: {summary.model as string ?? "—"}</span>
          </div>
          {summary.evaluated_at && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: C.fgSubtle }}>
              {fmtDate(summary.evaluated_at as string)}
            </p>
          )}
        </div>
      ) : (
        <div style={{
          borderRadius: 10, padding: "14px 16px", background: "rgba(255,255,255,0.04)",
          border: `1px solid ${C.border}`, textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: 12, color: C.fgSubtle }}>Chưa có kết quả eval</p>
        </div>
      )}

      {/* Eval cases list */}
      <div>
        <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: C.fgSubtle, letterSpacing: 0.5 }}>
          EVAL CASES ({evalCases.length})
        </p>
        {evalCases.length === 0 ? (
          <p style={{ fontSize: 12, color: C.fgSubtle }}>Không có eval case active</p>
        ) : evalCases.map(ec => (
          <div key={ec.id} style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 6,
            background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardList size={12} color={C.fgSubtle} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>{ec.name}</span>
              {ec.is_active
                ? <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: C.greenMuted, color: C.green }}>active</span>
                : <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: "rgba(255,255,255,0.05)", color: C.fgSubtle }}>inactive</span>}
            </div>
            {(ec.assertions as Record<string, unknown>)?.required_strings && (
              <p style={{ margin: "4px 0 0 20px", fontSize: 11, color: C.fgSubtle }}>
                must include: {((ec.assertions as Record<string, string[]>).required_strings ?? []).join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function AdminFrameworks() {
  const navigate = useNavigate();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [versions, setVersions] = useState<Record<string, FrameworkVersion[]>>({});
  const [evalCases, setEvalCases] = useState<Record<string, EvalCase[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<FrameworkVersion | null>(null);
  const [expandedFw, setExpandedFw] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState<Framework | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastCounter = 0;

  function addToast(type: Toast["type"], msg: string) {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, type, msg }]);
    if (type !== "info") setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: fws } = await (supabase as any).from("frameworks").select("*").order("name");
      if (!fws) return;
      setFrameworks(fws);
      const vMap: Record<string, FrameworkVersion[]> = {};
      const ecMap: Record<string, EvalCase[]> = {};
      await Promise.all(fws.map(async (fw: Framework) => {
        const { data: vs } = await (supabase as any).from("framework_versions")
          .select("*").eq("framework_id", fw.id).order("version", { ascending: false });
        vMap[fw.id] = vs ?? [];
        const { data: cases } = await (supabase as any).from("framework_eval_cases")
          .select("*").eq("framework_id", fw.id).eq("is_active", true);
        ecMap[fw.id] = cases ?? [];
      }));
      setVersions(vMap);
      setEvalCases(ecMap);
      if (!selected && fws.length > 0) {
        setSelected(fws[0].id);
        setExpandedFw(new Set([fws[0].id]));
      }
    } finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function logout() {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  }

  const selectedFw = frameworks.find(f => f.id === selected);
  const selectedVersions = selected ? (versions[selected] ?? []) : [];

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, fontFamily: "'Montserrat', 'Inter', sans-serif",
      display: "flex", flexDirection: "column", color: C.fg,
    }}>
      {/* Top bar */}
      <div style={{
        height: 56, borderBottom: `1px solid ${C.border}`, display: "flex",
        alignItems: "center", padding: "0 20px", gap: 12,
        background: "rgba(11,13,24,0.96)", backdropFilter: "blur(10px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <img src={wealbeeLogo} alt="Wealbee" style={{ width: 24, height: 24 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: C.fg, letterSpacing: 0.3 }}>Wealbee</span>
        <span style={{ fontSize: 12, color: C.borderStrong }}>·</span>
        <Shield size={13} color={C.brand} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.brand }}>Framework Manager</span>
        <div style={{ flex: 1 }} />
        <button onClick={fetchAll} style={{ ...iconBtn }} title="Refresh">
          <RefreshCw size={14} style={{ color: C.fgMuted }} />
        </button>
        <button onClick={logout} style={{ ...iconBtn, display: "flex", alignItems: "center", gap: 6, paddingRight: 12 }}>
          <LogOut size={14} style={{ color: C.fgMuted }} />
          <span style={{ fontSize: 12, color: C.fgMuted }}>Đăng xuất</span>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar — framework list */}
        <div style={{
          width: 240, borderRight: `1px solid ${C.border}`, flexShrink: 0,
          background: "#0D1117", overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "16px 16px 10px", borderBottom: `1px solid ${C.border}` }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.fgSubtle }}>FRAMEWORKS</p>
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: C.fgSubtle, fontSize: 12 }}>Đang tải…</div>
          ) : frameworks.map(fw => {
            const fwVersions = versions[fw.id] ?? [];
            const published = fwVersions.find(v => v.status === "published");
            const isExpanded = expandedFw.has(fw.id);
            const isSelected = selected === fw.id;
            return (
              <div key={fw.id}>
                <div
                  onClick={() => {
                    setSelected(fw.id);
                    setSelectedVersion(null);
                    setExpandedFw(prev => {
                      const n = new Set(prev);
                      isExpanded ? n.delete(fw.id) : n.add(fw.id);
                      return n;
                    });
                  }}
                  style={{
                    padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8,
                    background: isSelected ? C.brandMuted : "transparent",
                    borderLeft: `3px solid ${isSelected ? C.brand : "transparent"}`,
                    transition: "background 120ms",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ marginTop: 1, color: C.fgSubtle }}>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: isSelected ? C.fg : "rgba(240,242,255,0.80)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {fw.name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: C.fgSubtle }}>
                      {fw.framework_key}
                    </p>
                    <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                      {published
                        ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: C.greenMuted, color: C.green, fontWeight: 700 }}>v{published.version} live</span>
                        : <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: "rgba(255,255,255,0.05)", color: C.fgSubtle }}>no live</span>}
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: "rgba(255,255,255,0.04)", color: C.fgSubtle }}>
                        {fwVersions.length}v
                      </span>
                    </div>
                  </div>
                </div>
                {isExpanded && fwVersions.slice(0, 4).map(v => (
                  <div
                    key={v.id}
                    onClick={() => { setSelected(fw.id); setSelectedVersion(v); }}
                    style={{
                      padding: "7px 14px 7px 34px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      background: selectedVersion?.id === v.id ? "rgba(77,143,232,0.10)" : "transparent",
                      transition: "background 100ms",
                    }}
                    onMouseEnter={e => { if (selectedVersion?.id !== v.id) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { if (selectedVersion?.id !== v.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <GitBranch size={10} color={C.fgSubtle} />
                    <span style={{ fontSize: 11, color: C.fgMuted }}>v{v.version}</span>
                    <div style={{ marginLeft: "auto" }}>
                      <StatusBadge status={v.status} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Center — version list */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {selectedFw ? (
            <>
              {/* Framework header */}
              <div style={{
                padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
              }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: C.fg }}>{selectedFw.name}</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: C.fgMuted }}>
                    <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 6px", borderRadius: 4 }}>{selectedFw.framework_key}</code>
                    {" · "}{selectedFw.description}
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Chip label={`task: ${selectedFw.task_type}`} />
                    <Chip label={`company: ${selectedFw.company_type}`} />
                    <Chip label={`${(evalCases[selectedFw.id] ?? []).length} eval cases`} />
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(selectedFw)}
                  style={{ ...btnPrimary, flexShrink: 0 }}
                >
                  <Plus size={13} /> New Draft
                </button>
              </div>

              {/* Versions table */}
              <div style={{ padding: "0 24px 24px" }}>
                {selectedVersions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", color: C.fgSubtle, fontSize: 13 }}>
                    Chưa có version nào. Bấm <strong>New Draft</strong> để tạo.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
                    <thead>
                      <tr>
                        {["Version", "Status", "Eval", "Thay đổi", "Ngày tạo", ""].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.fgSubtle, borderBottom: `1px solid ${C.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVersions.map((v, i) => (
                        <tr
                          key={v.id}
                          onClick={() => setSelectedVersion(v.id === selectedVersion?.id ? null : v)}
                          style={{
                            cursor: "pointer",
                            background: selectedVersion?.id === v.id
                              ? C.brandMuted
                              : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                            transition: "background 100ms",
                          }}
                          onMouseEnter={e => { if (selectedVersion?.id !== v.id) e.currentTarget.style.background = C.surfaceHover; }}
                          onMouseLeave={e => { if (selectedVersion?.id !== v.id) e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"; }}
                        >
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <GitBranch size={13} color={C.fgSubtle} />
                              <span style={{ fontWeight: 700, fontSize: 13 }}>v{v.version}</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}` }}>
                            <StatusBadge status={v.status} />
                          </td>
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}` }}>
                            {v.eval_summary == null
                              ? <span style={{ fontSize: 11, color: C.fgSubtle }}>—</span>
                              : (v.eval_summary.passed as boolean)
                                ? <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.green }}><CheckCircle2 size={12} /> {v.eval_summary.passed_cases as number}/{v.eval_summary.total as number}</span>
                                : <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.red }}><XCircle size={12} /> {v.eval_summary.passed_cases as number}/{v.eval_summary.total as number}</span>}
                          </td>
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}`, maxWidth: 200 }}>
                            <span style={{ fontSize: 12, color: C.fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                              {v.change_note ?? "—"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 11, color: C.fgSubtle }}>{fmtDate(v.created_at)}</span>
                          </td>
                          <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
                            <span style={{ fontSize: 11, color: selectedVersion?.id === v.id ? C.brand : C.fgSubtle }}>
                              {selectedVersion?.id === v.id ? "← đang xem" : "Xem →"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.fgSubtle, fontSize: 13 }}>
              Chọn framework bên trái để xem chi tiết
            </div>
          )}
        </div>

        {/* Right — version detail */}
        {selectedVersion && selectedFw && (
          <VersionDetail
            version={selectedVersion}
            framework={selectedFw}
            evalCases={evalCases[selectedFw.id] ?? []}
            onClose={() => setSelectedVersion(null)}
            onRefresh={fetchAll}
            toast={addToast}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateDraftModal
          framework={showCreateModal}
          latestVersion={(versions[showCreateModal.id] ?? [])[0] ?? null}
          onClose={() => setShowCreateModal(null)}
          onCreated={fetchAll}
        />
      )}

      <ToastList toasts={toasts} dismiss={dismissToast} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
      background: "rgba(255,255,255,0.06)", color: C.fgSubtle, letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(240,242,255,0.60)", marginBottom: 5, letterSpacing: 0.5 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: 6, color: "rgba(240,242,255,0.35)" }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const textareaStyle: React.CSSProperties = {
  width: "100%", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.6,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
  color: C.fg, resize: "vertical", outline: "none", boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 13, outline: "none",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
  color: C.fg, boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
  background: C.brand, color: "#fff", fontSize: 12, fontWeight: 700,
};

const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
  color: C.fgMuted, fontSize: 12, fontWeight: 600,
};

const btnFull: React.CSSProperties = {
  width: "100%", padding: "10px", borderRadius: 8, cursor: "pointer",
  fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  transition: "opacity 150ms",
};

const iconBtn: React.CSSProperties = {
  padding: "6px 8px", borderRadius: 8, cursor: "pointer",
  background: "none", border: "1px solid transparent", display: "flex", alignItems: "center",
  transition: "background 100ms",
};
