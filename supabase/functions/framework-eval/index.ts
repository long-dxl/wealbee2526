import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS } from "../_shared/cors.ts";
import { getModelConfig, isProviderAvailable, MODEL_CONFIG } from "../_shared/llm-adapter.ts";
import { ProviderLLMRuntime } from "../_shared/llm-runtime.ts";
import { evaluateFrameworkOutput } from "../_shared/framework-eval.ts";
import { buildFrameworkPrompt, type FrameworkArtifact } from "../_shared/framework.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(url, serviceKey);
const runtime = new ProviderLLMRuntime();

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const auth = req.headers.get("authorization") ?? "";
  const client = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.app_metadata?.framework_role !== "expert") return json({ error: "framework expert required" }, 403);
  const { framework_version_id, model = "gpt-4o-mini" } = await req.json();
  const { data: version } = await service.from("framework_versions")
    .select("id,framework_id,version,status,system_rules,tool_policy,output_contract,checksum")
    .eq("id", framework_version_id).in("status", ["draft","review"]).maybeSingle();
  if (!version) return json({ error: "version must be draft/review" }, 400);
  const { data: framework } = await service.from("frameworks").select("framework_key").eq("id", version.framework_id).single();
  const { data: cases } = await service.from("framework_eval_cases").select("id,name,input,assertions").eq("framework_id", version.framework_id).eq("is_active", true);
  if (!cases?.length) return json({ error: "framework has no active eval cases" }, 400);
  if (!MODEL_CONFIG[model]) return json({ error: "unknown eval model" }, 400);
  const modelConfig = getModelConfig(model);
  if (!isProviderAvailable(modelConfig.provider)) return json({ error: `${modelConfig.provider} unavailable` }, 503);
  const { data: run } = await service.from("framework_eval_runs").insert({ framework_version_id, model, total: cases.length, created_by: user.id }).select("id").single();
  if (!run) return json({ error: "cannot create eval run" }, 500);

  let passed = 0;
  try {
    const artifact: FrameworkArtifact = {
      frameworkId: version.framework_id, versionId: version.id, key: framework.framework_key,
      version: version.version, label: `${framework.framework_key}@v${version.version}`,
      systemRules: version.system_rules, toolPolicy: version.tool_policy,
      outputContract: version.output_contract, checksum: version.checksum,
    };
    for (const testCase of cases) {
      const input = testCase.input ?? {};
      const result = await runtime.complete({
        model: modelConfig,
        messages: [
          { role: "system", content: buildFrameworkPrompt(artifact, input.system_prompt ?? "Bạn là trợ lý phân tích tài chính.") + `\n\nNGUỒN DỮ LIỆU:\n${input.data_context ?? ""}` },
          { role: "user", content: input.user_prompt ?? "Thực hiện phân tích." },
        ], maxTokens: input.max_tokens ?? 3000, temperature: 0,
      });
      const evaluation = evaluateFrameworkOutput(result.content, testCase.assertions ?? {});
      if (evaluation.passed) passed++;
      await service.from("framework_eval_results").insert({ eval_run_id: run.id, eval_case_id: testCase.id, passed: evaluation.passed, score: evaluation.score, output: result.content, details: evaluation.details });
    }
    const failed = cases.length - passed;
    const gatePassed = failed === 0;
    const summary = { passed: gatePassed, passed_cases: passed, failed_cases: failed, total: cases.length, eval_run_id: run.id, model, evaluated_at: new Date().toISOString() };
    await service.from("framework_eval_runs").update({ status: gatePassed ? "passed" : "failed", passed, failed, finished_at: new Date().toISOString() }).eq("id", run.id);
    await service.from("framework_versions").update({ eval_summary: summary }).eq("id", version.id);
    return json(summary);
  } catch (error) {
    await service.from("framework_eval_runs").update({ status: "error", error: String(error), finished_at: new Date().toISOString() }).eq("id", run.id);
    return json({ error: String(error), eval_run_id: run.id }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
