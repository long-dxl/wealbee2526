export interface FrameworkArtifact {
  frameworkId: string;
  versionId: string;
  key: string;
  version: number;
  label: string;
  systemRules: string;
  toolPolicy: { required?: string[]; optional?: string[]; denied?: string[] };
  outputContract: { format?: string; citation_required?: boolean; legal_disclaimer?: boolean; unlinked_claim_policy?: "warn" | "block" };
  checksum: string;
}

export class FrameworkNotFoundError extends Error {}

export function frameworkKey(taskType?: string | null, companyType = "default"): string {
  const task = taskType?.trim() || "default";
  return `${task}.${companyType || "default"}`;
}

export async function resolveCompanyType(sb: any, symbols: string[]): Promise<string> {
  const normalized = [...new Set(symbols.map(symbol => symbol.toUpperCase()).filter(Boolean))];
  if (!normalized.length) return "default";
  const { data } = await sb.from("tickers").select("company_type").in("symbol", normalized);
  const types = [...new Set((data ?? []).map((row: any) => row.company_type).filter(Boolean))];
  return types.length === 1 ? String(types[0]) : "default";
}

export async function resolveFramework(
  sb: any,
  input: { frameworkId?: string | null; taskType?: string | null; companyType?: string | null },
): Promise<FrameworkArtifact> {
  let query = sb.from("frameworks").select("id,framework_key");
  query = input.frameworkId ? query.eq("id", input.frameworkId) : query.eq("framework_key", frameworkKey(input.taskType, input.companyType ?? "default"));
  let { data: framework } = await query.maybeSingle();
  if (!framework && !input.frameworkId && input.companyType && input.companyType !== "default") {
    const fallback = await sb.from("frameworks").select("id,framework_key").eq("framework_key", frameworkKey(input.taskType, "default")).maybeSingle();
    framework = fallback.data;
  }
  if (!framework && !input.frameworkId && input.taskType !== "default") {
    const fallback = await sb.from("frameworks").select("id,framework_key").eq("framework_key", "default.default").maybeSingle();
    framework = fallback.data;
  }
  if (!framework) throw new FrameworkNotFoundError(`Không tìm thấy framework published cho ${frameworkKey(input.taskType, input.companyType ?? "default")}`);

  const { data: version, error } = await sb.from("framework_versions")
    .select("id,version,system_rules,tool_policy,output_contract,checksum")
    .eq("framework_id", framework.id).eq("status", "published").maybeSingle();
  if (error || !version) throw new FrameworkNotFoundError(`Framework ${framework.framework_key} chưa có published version`);
  return {
    frameworkId: framework.id, versionId: version.id, key: framework.framework_key,
    version: version.version, label: `${framework.framework_key}@v${version.version}`,
    systemRules: version.system_rules, toolPolicy: version.tool_policy ?? {},
    outputContract: version.output_contract ?? {}, checksum: version.checksum,
  };
}

export function applyToolPolicy(enabled: string[], artifact: FrameworkArtifact): string[] {
  const required = artifact.toolPolicy.required ?? [];
  const optional = artifact.toolPolicy.optional ?? [];
  const denied = new Set(artifact.toolPolicy.denied ?? []);
  const allowed = optional.length ? new Set([...required, ...optional]) : null;
  return [...new Set([...required, ...enabled])].filter(id => !denied.has(id) && (!allowed || allowed.has(id)));
}

export function buildFrameworkPrompt(artifact: FrameworkArtifact, basePrompt: string): string {
  const contract = [
    artifact.outputContract.format === "markdown" ? "Chỉ dùng Markdown thuần; không dùng HTML." : "Chỉ dùng HTML inline khi cần tô màu.",
    artifact.outputContract.citation_required ? "Mọi số liệu phải có [ref:N] liền sau." : "",
    artifact.outputContract.legal_disclaimer ? 'Cuối output ghi: "Thông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019".' : "",
  ].filter(Boolean).join("\n");
  return `${basePrompt.trim()}\n\n## FRAMEWORK ${artifact.label}\n${artifact.systemRules}\n\n## OUTPUT CONTRACT\n${contract}`.trim();
}
