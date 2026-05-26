/**
 * run-agent — Execute a user agent, generate output, push to briefs inbox
 *
 * POST { agent_id: string }
 * Headers: Authorization: Bearer <user_jwt>
 *
 * Response: { ok: true, run_id, brief_id, title, tokens }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY  = Deno.env.get("OPENAI_API_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Build market context (reuse same logic as bee-ai-chat) ──────────────────

async function buildMarketContext(): Promise<string> {
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  lines.push(`Ngày: ${today}`);

  // Market indices
  try {
    const { data: indices } = await sb
      .from("market_indices")
      .select("index_code, date, close, change_pt, change_pct, volume")
      .in("index_code", ["VNINDEX", "HNX"])
      .order("date", { ascending: false })
      .limit(4);

    if (indices?.length) {
      lines.push("\n## Chỉ số thị trường");
      const seen = new Set<string>();
      for (const idx of indices) {
        if (seen.has(idx.index_code)) continue;
        seen.add(idx.index_code);
        const arrow = (idx.change_pct ?? 0) >= 0 ? "▲" : "▼";
        const pct = idx.change_pct != null ? `${idx.change_pct >= 0 ? "+" : ""}${Number(idx.change_pct).toFixed(2)}%` : "";
        const pt  = idx.change_pt  != null ? `${idx.change_pt  >= 0 ? "+" : ""}${Number(idx.change_pt).toFixed(2)} điểm` : "";
        lines.push(`- ${idx.index_code}: ${Number(idx.close).toLocaleString("vi-VN", { minimumFractionDigits: 2 })} ${arrow} ${pt} (${pct}) [${idx.date}]`);
      }
    }
  } catch { /* ignore */ }

  // VN30 prices + movers
  try {
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, date, close")
      .order("date", { ascending: false })
      .limit(75);

    if (prices?.length) {
      const bySymbol: Record<string, number[]> = {};
      for (const row of prices) {
        if (!bySymbol[row.symbol]) bySymbol[row.symbol] = [];
        if (bySymbol[row.symbol].length < 2) bySymbol[row.symbol].push(Number(row.close));
      }

      const movers = Object.entries(bySymbol)
        .filter(([, c]) => c.length === 2)
        .map(([sym, [today, yesterday]]) => ({
          sym, price: today, pct: ((today - yesterday) / yesterday) * 100,
        }))
        .sort((a, b) => b.pct - a.pct);

      lines.push("\n## Giá VN30 cuối phiên gần nhất");
      for (const [sym, closes] of Object.entries(bySymbol)) {
        lines.push(`- ${sym}: ${closes[0].toLocaleString("vi-VN")} đ`);
      }

      const top5up   = movers.filter(m => m.pct > 0).slice(0, 5);
      const top5down = movers.filter(m => m.pct < 0).slice(-5).reverse();
      if (top5up.length) {
        lines.push("\n### Top tăng");
        for (const m of top5up) lines.push(`- ${m.sym}: +${m.pct.toFixed(2)}%`);
      }
      if (top5down.length) {
        lines.push("\n### Top giảm");
        for (const m of top5down) lines.push(`- ${m.sym}: ${m.pct.toFixed(2)}%`);
      }
    }
  } catch { /* ignore */ }

  // Market news
  try {
    const { data: news } = await sb
      .from("market_news")
      .select("title, content_summary, label, impact_score, affected_symbols, published_at")
      .not("label", "is", null)
      .neq("label", "trash")
      .gte("published_at", new Date(Date.now() - 48 * 3600000).toISOString())
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(10);

    if (news?.length) {
      lines.push("\n## Tin tức thị trường (48h)");
      for (const n of news) {
        const syms = n.affected_symbols?.length ? ` [${n.affected_symbols.slice(0, 3).join(",")}]` : "";
        const score = n.impact_score != null ? ` [tác động:${n.impact_score}]` : "";
        lines.push(`- ${n.title}${syms}${score}`);
        if (n.content_summary) lines.push(`  ${n.content_summary.substring(0, 120)}`);
      }
    }
  } catch { /* ignore */ }

  return lines.join("\n");
}

// ─── Build portfolio context for user ────────────────────────────────────────

async function buildPortfolioContext(userId: string): Promise<string> {
  try {
    const { data: holdings } = await sb
      .from("portfolio_holdings")
      .select("symbol, quantity, avg_cost")
      .eq("user_id", userId);

    if (!holdings?.length) return "";

    const symbols = holdings.map(h => h.symbol);
    const { data: prices } = await sb
      .from("prices_daily")
      .select("symbol, close")
      .in("symbol", symbols)
      .order("date", { ascending: false })
      .limit(symbols.length * 2);

    const latestPrice: Record<string, number> = {};
    for (const p of (prices ?? [])) {
      if (!latestPrice[p.symbol]) latestPrice[p.symbol] = Number(p.close);
    }

    const lines: string[] = ["\n## Danh mục đầu tư hiện tại"];
    let totalCost = 0, totalValue = 0;
    for (const h of holdings) {
      const price = latestPrice[h.symbol] ?? h.avg_cost;
      const cost  = h.quantity * h.avg_cost;
      const value = h.quantity * price;
      const pnl   = value - cost;
      const pct   = (pnl / cost) * 100;
      totalCost  += cost;
      totalValue += value;
      lines.push(`- ${h.symbol}: ${h.quantity} CP @ ${h.avg_cost.toLocaleString("vi-VN")}đ | Giá hiện tại: ${price.toLocaleString("vi-VN")}đ | P&L: ${pnl >= 0 ? "+" : ""}${(pnl / 1000).toFixed(0)}K (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
    }
    const totalPnl = totalValue - totalCost;
    lines.push(`\nTổng: Vốn ${(totalCost / 1e9).toFixed(2)} tỷ → Giá trị ${(totalValue / 1e9).toFixed(2)} tỷ (${totalPnl >= 0 ? "+" : ""}${(totalPnl / 1e6).toFixed(1)}M VNĐ)`);
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─── Extract tickers from text ────────────────────────────────────────────────

function extractTickers(text: string): string[] {
  const VN30 = new Set(["ACB","BID","BVH","CTG","FPT","GAS","HDB","HPG","MBB","MSN","MWG","PLX","SAB","SSI","STB","TCB","TPB","VCB","VHM","VIB","VIC","VJC","VNM","VPB","VRE"]);
  const found = new Set<string>();
  const matches = text.matchAll(/\b([A-Z]{2,5})\b/g);
  for (const m of matches) {
    if (VN30.has(m[1])) found.add(m[1]);
  }
  return Array.from(found).slice(0, 8);
}

// ─── Infer impact score from output ──────────────────────────────────────────

function inferImpactScore(output: string, templateId: string): number {
  const positive = (output.match(/tăng|tích cực|hưởng lợi|cơ hội|khởi sắc|tốt/gi) ?? []).length;
  const negative = (output.match(/giảm|tiêu cực|rủi ro|lo ngại|áp lực|xấu/gi) ?? []).length;
  const net = positive - negative;
  if (templateId === "portfolio_health") return Math.min(10, Math.max(-10, net * 2));
  return Math.min(8, Math.max(-8, net));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Auth
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: { agent_id: string };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { agent_id } = body;
  if (!agent_id) {
    return new Response(JSON.stringify({ error: "agent_id required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Fetch agent + template
  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .select("id, user_id, template_id, name, description, system_prompt")
    .eq("id", agent_id)
    .eq("user_id", user.id)
    .single();

  if (agentErr || !agent) {
    return new Response(JSON.stringify({ error: "Agent not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: template } = await sb
    .from("agent_templates")
    .select("id, name, system_prompt, icon, color")
    .eq("id", agent.template_id)
    .single();

  // Create run record
  const { data: run, error: runErr } = await sb
    .from("agent_runs")
    .insert({ agent_id, user_id: user.id, status: "running" })
    .select("id")
    .single();

  if (runErr || !run) {
    return new Response(JSON.stringify({ error: "Cannot create run" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();

  try {
    // Build context
    const marketCtx = await buildMarketContext();
    const portfolioCtx = agent.template_id === "portfolio_health"
      ? await buildPortfolioContext(user.id)
      : "";

    const systemPrompt = (agent.system_prompt || template?.system_prompt || "Bạn là trợ lý phân tích chứng khoán.")
      + `\n\n## QUY TẮC BẮT BUỘC\n- KHÔNG khuyến nghị mua/bán cụ thể\n- CHỈ dùng số liệu từ dữ liệu được cung cấp\n\n---\n${marketCtx}${portfolioCtx}`;

    // Call OpenAI
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Hãy thực hiện nhiệm vụ của agent "${agent.name}". Tạo output đầy đủ và chuyên nghiệp.` },
        ],
        max_tokens: 1200,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI: ${err}`);
    }

    const json = await res.json();
    const output: string = json.choices?.[0]?.message?.content ?? "";
    const tokens: number = json.usage?.total_tokens ?? 0;
    const durationMs = Date.now() - startedAt;

    // Extract title — find first meaningful non-heading line or use heading content
    const lines = output.split("\n").map(l => l.trim()).filter(Boolean);
    let title = agent.name;
    for (const line of lines) {
      const cleaned = line.replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "").replace(/\*\*/g, "").trim();
      if (cleaned.length >= 10) { title = cleaned.substring(0, 100); break; }
    }
    const summary = output.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").split("\n").filter(l => l.trim()).slice(1, 4).join(" ").substring(0, 200);
    const tickers = extractTickers(output);
    const impact  = inferImpactScore(output, agent.template_id);

    // Update run to success
    await sb.from("agent_runs").update({
      status: "completed",
      output,
      tokens_used: tokens,
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);

    // Push to briefs inbox
    const { data: brief } = await sb.from("briefs").insert({
      user_id: user.id,
      agent_id,
      agent_run_id: run.id,
      type: agent.template_id,
      title,
      summary,
      content: output,
      impact_score: impact,
      tickers,
      is_read: false,
    }).select("id").single();

    // Update agent last_run_at + run_count
    try {
      await sb.from("agents")
        .update({
          last_run_at: new Date().toISOString(),
          run_count: (agent.run_count ?? 0) + 1,
        })
        .eq("id", agent_id);
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({
      ok: true,
      run_id: run.id,
      brief_id: brief?.id,
      title,
      tokens,
      duration_ms: durationMs,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await sb.from("agent_runs").update({
      status: "failed",
      error: String(err),
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
