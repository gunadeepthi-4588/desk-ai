import threading
import traceback
from backend.supabase_client import get_supabase_client
from backend.services.text_extractor import TextExtractor
from backend.services.chunker import Chunker
from backend.services.embedder import Embedder

class IngestionPipeline:
    @classmethod
    def process_document(cls, document_id: str, file_bytes: bytes, file_type: str, filename: str) -> dict:
        """Synchronously coordinates text extraction, chunking, embedding, and storing in Supabase."""
        return cls._run_pipeline(document_id, file_bytes, file_type, filename)

    @classmethod
    def process_document_in_background(cls, document_id: str, file_bytes: bytes, file_type: str, filename: str):
        """Starts document ingestion pipeline in a background thread."""
        thread = threading.Thread(
            target=cls._run_pipeline,
            args=(document_id, file_bytes, file_type, filename)
        )
        thread.daemon = True
        thread.start()

    @classmethod
    def _run_pipeline(cls, document_id: str, file_bytes: bytes, file_type: str, filename: str) -> dict:
        """Coordinates text extraction, chunking, embedding, and storing in Supabase."""
        client = get_supabase_client()
        if not client:
            print(f"[ERROR] Pipeline aborted: Supabase client is uninitialized.")
            return {"status": "failed", "error": "Supabase client uninitialized"}

        try:
            # 1. Update status to 'processing'
            client.table("documents").update({"status": "processing"}).eq("id", document_id).execute()
            print(f"[INFO] Document {document_id} status updated to 'processing'.")

            # 2. Extract text page-by-page
            pages = TextExtractor.extract(file_bytes, file_type)
            page_count = len(pages)
            print(f"[INFO] Extracted {page_count} pages from {filename}.")

            # 3. Create chunks
            chunks = Chunker.chunk_document(pages)
            chunk_count = len(chunks)
            print(f"[INFO] Created {chunk_count} chunks from {filename}.")

            if chunk_count == 0:
                raise ValueError("No extractable text found in document.")

            # 4. Generate embeddings in batches to minimize roundtrips
            embedder = Embedder()
            contents = [c["content"] for c in chunks]
            
            print(f"[INFO] Generating embeddings for {chunk_count} chunks in batches...")
            embeddings = []
            batch_size = 50
            for i in range(0, chunk_count, batch_size):
                batch = contents[i:i + batch_size]
                batch_embeddings = embedder.embed_texts(batch)
                embeddings.extend(batch_embeddings)
            
            # 5. Prepare and insert chunks
            chunks_to_insert = []
            for idx, chunk in enumerate(chunks):
                chunks_to_insert.append({
                    "document_id": document_id,
                    "chunk_index": chunk["chunk_index"],
                    "content": chunk["content"],
                    "page_number": chunk["page_number"],
                    "embedding": embeddings[idx],
                    "metadata": {"filename": filename}
                })

            print(f"[INFO] Storing {chunk_count} chunks and embeddings in Supabase...")
            # Bulk insert into public.document_chunks
            client.table("document_chunks").insert(chunks_to_insert).execute()

            # 6. Update document stats and status to completed
            client.table("documents").update({
                "status": "completed",
                "page_count": page_count,
                "chunk_count": chunk_count,
                "error_message": None
            }).eq("id", document_id).execute()
            
            print(f"[SUCCESS] Document {filename} ingestion completed. {chunk_count} chunks stored.")
            return {
                "status": "completed",
                "document_id": document_id,
                "page_count": page_count,
                "chunk_count": chunk_count
            }

        except Exception as e:
            err_msg = f"{e}\n{traceback.format_exc()}"
            print(f"[ERROR] Document {filename} processing failed: {err_msg}")
            
            # Update status to failed and save error traceback
            try:
                client.table("documents").update({
                    "status": "failed",
                    "error_message": str(e)
                }).eq("id", document_id).execute()
            except Exception as db_err:
                print(f"[ERROR] Failed to save error status to documents table: {db_err}")
                
            return {
                "status": "failed",
                "document_id": document_id,
                "error": str(e)
            }
