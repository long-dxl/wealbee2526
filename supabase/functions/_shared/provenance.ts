export interface ToolExecutionRecord {
  callKey: string;
  toolId: string;
  arguments: Record<string, unknown>;
  output: string;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "error";
  error?: string;
}

export interface SourceRef { index: number; label: string; url: string; }

export function extractClaims(output: string, validRefs: Set<number>) {
  return output.split(/\n+|(?<=[.!?])\s+/).map(text => text.trim())
    .filter(text => text && !/^\*?Dữ liệu chốt đến:/i.test(text) && !/không phải tư vấn đầu tư theo Luật Chứng khoán 2019/i.test(text))
    .map((claimText, claimIndex) => {
      const refs = [...claimText.matchAll(/\[ref:(\d+)\]/g)].map(match => Number(match[1]));
      const withoutRefs = claimText.replace(/\[ref:\d+\]/g, "");
      const numbers = [...withoutRefs.matchAll(/-?\d+(?:[.,]\d+)?%?/g)].map(match => match[0]);
      const missingRef = refs.some(ref => !validRefs.has(ref));
      const status = missingRef ? "invalid" : numbers.length > 0 && refs.length === 0 ? "unlinked" : "grounded";
      return { claim_index: claimIndex, claim_text: claimText, numeric_values: numbers, ref_indices: refs, validation_status: status };
    }).filter(claim => claim.numeric_values.length > 0 || claim.ref_indices.length > 0);
}

export function deriveDataAsOf(records: ToolExecutionRecord[]): string {
  let latest = new Date(0);
  for (const record of records) for (const date of extractDates(record.output)) if (date > latest) latest = date;
  if (latest.getTime() === 0) for (const record of records) {
    const date = new Date(record.finishedAt); if (date > latest) latest = date;
  }
  return (latest.getTime() > 0 ? latest : new Date()).toISOString();
}

export async function persistRunProvenance(
  sb: any, runId: string, records: ToolExecutionRecord[], refs: SourceRef[], output: string,
): Promise<{ asOf: string; toolCalls: number; evidence: number; claims: number; grounded: number; unlinked: number }> {
  const callRows = await Promise.all(records.map(async record => ({
    agent_run_id: runId, call_key: record.callKey, tool_id: record.toolId,
    arguments: record.arguments, output_text: record.output, output_checksum: await sha256(record.output),
    started_at: record.startedAt, finished_at: record.finishedAt, status: record.status, error: record.error ?? null,
  })));
  const { data: insertedCalls, error: callError } = callRows.length
    ? await sb.from("agent_tool_calls").insert(callRows).select("id,call_key") : { data: [], error: null };
  if (callError) throw callError;
  const callIds = new Map((insertedCalls ?? []).map((row: any) => [row.call_key, row.id]));
  const refMap = new Map(refs.map(ref => [ref.index, ref]));
  const evidenceRows: any[] = [];
  let latestAsOf = new Date(0);
  for (const record of records) {
    const toolCallId = callIds.get(record.callKey);
    const usedRefs = [...record.output.matchAll(/\[ref:(\d+)\]/g)].map(match => Number(match[1]));
    const dates = extractDates(record.output);
    for (const date of dates) if (date > latestAsOf) latestAsOf = date;
    const asOf = dates.length ? dates.sort((a,b) => b.getTime()-a.getTime())[0].toISOString() : record.finishedAt;
    const indexes = usedRefs.length ? [...new Set(usedRefs)] : [null];
    const values = extractNumericValues(record.output);
    for (const index of indexes) {
      const source = index == null ? undefined : refMap.get(index);
      evidenceRows.push({ agent_run_id: runId, tool_call_id: toolCallId, ref_index: index,
        source_label: source?.label ?? null, source_url: source?.url ?? null, as_of: asOf,
        period_end: dates[0]?.toISOString().slice(0,10) ?? null,
        field_path: `${record.toolId}.output`, raw_value: { arguments: record.arguments, values },
        normalized_value: values.join(", ") || null,
        unit: values.some(value => value.endsWith("%")) ? "mixed_or_percent" : null,
        raw_excerpt: record.output.slice(0, 4000) });
    }
  }
  const { data: insertedEvidence, error: evidenceError } = evidenceRows.length
    ? await sb.from("evidence_items").insert(evidenceRows).select("id,ref_index") : { data: [], error: null };
  if (evidenceError) throw evidenceError;
  const evidenceByRef = new Map<number, string[]>();
  for (const row of insertedEvidence ?? []) if (row.ref_index != null) evidenceByRef.set(row.ref_index, [...(evidenceByRef.get(row.ref_index) ?? []), row.id]);
  const claims = extractClaims(output, new Set(refs.map(ref => ref.index))).map(claim => ({ ...claim, agent_run_id: runId }));
  const { data: insertedClaims, error: claimsError } = claims.length
    ? await sb.from("output_claims").insert(claims).select("id,claim_index,ref_indices,validation_status") : { data: [], error: null };
  if (claimsError) throw claimsError;
  const links: any[] = [];
  for (const claim of insertedClaims ?? []) for (const ref of claim.ref_indices ?? [])
    for (const evidenceId of evidenceByRef.get(ref) ?? []) links.push({ claim_id: claim.id, evidence_id: evidenceId });
  if (links.length) { const { error } = await sb.from("claim_evidence").insert(links); if (error) throw error; }
  const asOf = latestAsOf.getTime() > 0 ? latestAsOf.toISOString() : deriveDataAsOf(records);
  const grounded = claims.filter(claim => claim.validation_status === "grounded").length;
  const unlinked = claims.filter(claim => claim.validation_status !== "grounded").length;
  return { asOf, toolCalls: records.length, evidence: evidenceRows.length, claims: claims.length, grounded, unlinked };
}

export function extractNumericValues(text: string): string[] {
  return [...new Set([...text.replace(/\[ref:\d+\]/g, "").matchAll(/-?\d+(?:[.,]\d+)?%?/g)].map(match => match[0]))];
}

function extractDates(text: string): Date[] {
  const values = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map(match => new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`));
  return values.filter(date => !Number.isNaN(date.getTime()));
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,"0")).join("");
}
