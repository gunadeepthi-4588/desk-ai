-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table to store document metadata
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    page_count INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create document_chunks table using halfvec(3072) to support dimensions > 2000 in HNSW index
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_number INTEGER,
    embedding halfvec(3072), -- 16-bit float representation supporting up to 4000 dimensions in HNSW
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for foreign key lookups
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON public.document_chunks(document_id);

-- Create HNSW index using halfvec_cosine_ops for fast cosine distance matching
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
ON public.document_chunks 
USING hnsw (embedding halfvec_cosine_ops);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on both tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- 1. Documents: Allow backend operations
CREATE POLICY "Allow all operations on documents" 
ON public.documents 
FOR ALL 
TO public 
USING (true)
WITH CHECK (true);

-- 2. Document Chunks: Allow backend operations
CREATE POLICY "Allow all operations on document_chunks" 
ON public.document_chunks 
FOR ALL 
TO public 
USING (true)
WITH CHECK (true);

