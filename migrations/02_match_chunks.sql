-- Create or replace database function for matching document chunks using cosine similarity
CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding halfvec(3072),
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index integer,
  content TEXT,
  page_number integer,
  similarity double precision,
  metadata JSONB,
  filename TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER -- Explicitly runs with the privileges of the calling user to respect RLS
SET search_path = public -- Pre-binds search_path to prevent path hijacking
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.page_number,
    (1 - (dc.embedding <=> query_embedding))::double precision AS similarity,
    dc.metadata,
    d.filename
  FROM public.document_chunks dc
  JOIN public.documents d ON dc.document_id = d.id
  WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Revoke default public execution rights
REVOKE EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) FROM PUBLIC;

-- Grant execution permissions only to backend service role and authenticated employees
GRANT EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) TO service_role;
GRANT EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) TO authenticated;
