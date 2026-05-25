/**
 * embed-document — Parse text → chunk → embed (OpenAI) → upsert knowledge_chunks
 * POST { document_id: string }  (user must own the document)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY  = Deno.env.get("OPENAI_API_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CHUNK_SIZE    = 800;   // ~tokens per chunk
const CHUNK_OVERLAP = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  const words  = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (slice.trim()) chunks.push(slice.trim());
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error: ${err}`);
  }
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Auth — get user from JWT
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const body = await req.json();
    const { document_id } = body;
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Fetch document (user must own it)
    const { data: doc, error: docErr } = await sb
      .from("knowledge_documents")
      .select("id, user_id, title, content_raw, file_path, file_type")
      .eq("id", document_id)
      .eq("user_id", user.id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Mark as processing
    await sb.from("knowledge_documents").update({ status: "processing" }).eq("id", document_id);

    let rawText = doc.content_raw || "";

    // If file_path exists, download from storage
    if (!rawText && doc.file_path) {
      const { data: fileData, error: fileErr } = await sb.storage
        .from("kb-docs")
        .download(doc.file_path);
      if (fileErr || !fileData) {
        await sb.from("knowledge_documents").update({ status: "error", error_msg: "Cannot download file" }).eq("id", document_id);
        return new Response(JSON.stringify({ error: "Cannot download file" }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      rawText = await fileData.text();
    }

    if (!rawText.trim()) {
      await sb.from("knowledge_documents").update({ status: "error", error_msg: "Empty content" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Empty content" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Delete old chunks
    await sb.from("knowledge_chunks").delete().eq("document_id", document_id);

    // Chunk text
    const chunks = chunkText(rawText);
    if (!chunks.length) {
      await sb.from("knowledge_documents").update({ status: "error", error_msg: "No chunks" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "No chunks" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // Embed in batches of 20
    const BATCH = 20;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await embedTexts(batch);
      allEmbeddings.push(...embeddings);
    }

    // Upsert chunks
    const rows = chunks.map((content, idx) => ({
      document_id,
      user_id: user.id,
      chunk_index: idx,
      content,
      tokens: content.split(/\s+/).length,
      embedding: JSON.stringify(allEmbeddings[idx]),
    }));

    const { error: insertErr } = await sb.from("knowledge_chunks").insert(rows);
    if (insertErr) {
      await sb.from("knowledge_documents").update({ status: "error", error_msg: insertErr.message }).eq("id", document_id);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Mark ready
    await sb.from("knowledge_documents").update({
      status: "ready",
      chunk_count: chunks.length,
      error_msg: null,
    }).eq("id", document_id);

    return new Response(JSON.stringify({ ok: true, chunks: chunks.length }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    console.error("embed-document error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
