import { CORS } from "../_shared/cors.ts";
import { MODEL_CONFIG, isProviderAvailable } from "../_shared/llm-adapter.ts";
import { PUBLIC_TOOL_METADATA } from "../_shared/tool-catalog.ts";

Deno.serve(() => new Response(JSON.stringify({
  models: Object.entries(MODEL_CONFIG).map(([id, config]) => ({
    id, provider: config.provider, available: isProviderAvailable(config.provider),
  })),
  tools: PUBLIC_TOOL_METADATA,
}), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } }));
