-- RPC tìm kiếm KB chunks lọc theo document_ids cụ thể
-- Thay vì search toàn bộ KB rồi filter JS-side, search thẳng trong đúng tài liệu

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_by_docs(
  query_embedding vector(1536),
  match_user_id   uuid,
  doc_ids         uuid[],
  match_count     int     DEFAULT 6,
  match_threshold float   DEFAULT 0.35
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
  WHERE kc.user_id    = match_user_id
    AND kc.document_id = ANY(doc_ids)
    AND kc.embedding   IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;
