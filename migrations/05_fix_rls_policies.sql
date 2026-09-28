-- ==============================================================================
-- Migration 05: Fix Row Level Security (RLS) Policies for Company Documents
-- ==============================================================================
-- Description:
-- DeskAI authenticates users and enforces RBAC at the Flask backend layer using JWT.
-- Database operations (document ingestion, chunk storage, vector search, deletion)
-- are orchestrated server-side by the Flask backend.
--
-- This migration ensures that the backend (connecting via the configured Supabase
-- service-role or anon key) has the required permissions to insert, select, update,
-- and delete records in public.documents and public.document_chunks without hitting
-- Postgres error 42501 (RLS violation).
-- ==============================================================================

-- 1. Configure RLS Policies on public.documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow select on documents" ON public.documents;
DROP POLICY IF EXISTS "Allow insert on documents" ON public.documents;
DROP POLICY IF EXISTS "Allow update on documents" ON public.documents;
DROP POLICY IF EXISTS "Allow delete on documents" ON public.documents;
DROP POLICY IF EXISTS "Allow all operations on documents" ON public.documents;

CREATE POLICY "Allow all operations on documents"
ON public.documents
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 2. Configure RLS Policies on public.document_chunks
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Allow select on document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Allow insert on document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Allow update on document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Allow delete on document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Allow all operations on document_chunks" ON public.document_chunks;

CREATE POLICY "Allow all operations on document_chunks"
ON public.document_chunks
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 3. Grant execution permissions on match_document_chunks function
GRANT EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) TO anon;
GRANT EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION match_document_chunks(halfvec(3072), double precision, integer) TO service_role;
