-- ============================================================
-- Phase 5: Knowledge Base — pgvector embeddings + RAG
-- ============================================================

-- Enable pgvector extension (if not already)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Storage bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kb-docs',
  'kb-docs',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf','text/plain','text/markdown','application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- ─── knowledge_documents ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  file_path     text,                    -- storage path in kb-docs bucket
  file_type     text        DEFAULT 'text',  -- 'pdf', 'markdown', 'text', 'manual'
  source_url    text,
  content_raw   text,                    -- full raw text (for small docs)
  chunk_count   int         DEFAULT 0,
  status        text        DEFAULT 'pending',  -- pending | processing | ready | error
  error_msg     text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own documents"
  ON public.knowledge_documents
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── knowledge_chunks ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id   uuid        NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index   int         NOT NULL,
  content       text        NOT NULL,
  tokens        int,
  embedding     vector(1536),           -- OpenAI text-embedding-3-small dim
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chunks"
  ON public.knowledge_chunks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast ANN search
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Index for lookups
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx
  ON public.knowledge_chunks (document_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_user_idx
  ON public.knowledge_chunks (user_id);

-- ─── RPC: match_chunks — semantic search ─────────────────────
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id   uuid,
  match_count     int DEFAULT 5,
  match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id          uuid,
  document_id uuid,
  chunk_index int,
  content     text,
  similarity  float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.chunk_index,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.user_id = match_user_id
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Storage RLS ─────────────────────────────────────────────
CREATE POLICY "Users upload to kb-docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kb-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own kb-docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kb-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own kb-docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'kb-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
