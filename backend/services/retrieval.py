import os
from backend.supabase_client import get_supabase_client
from backend.services.embedder import Embedder

class RetrievalService:
    def __init__(self, embedder: Embedder = None):
        self.embedder = embedder or Embedder()
        self.client = get_supabase_client()

    def retrieve_relevant_chunks(
        self, 
        question: str, 
        top_k: int = None, 
        similarity_threshold: float = None
    ) -> list[dict]:
        """
        Generates embedding for the question and performs database-side similarity search.
        
        Args:
            question (str): The natural language user query.
            top_k (int, optional): Max number of chunks to return. Defaults to 5.
            similarity_threshold (float, optional): Cosine similarity threshold. Defaults to 0.4.
            
        Returns:
            list[dict]: List of retrieved document chunks matching requirements.
        """
        # Resolve parameters from environment defaults if not provided
        if top_k is None:
            top_k = int(os.environ.get("RAG_TOP_K", 5))
        if similarity_threshold is None:
            similarity_threshold = float(os.environ.get("RAG_SIMILARITY_THRESHOLD", 0.4))

        if not self.client:
            raise RuntimeError("Supabase client is uninitialized. Cannot perform retrieval.")

        # 1. Generate query embedding (dimension 3072)
        print(f"[INFO] Generating 3072-dimension query embedding for: '{question}'")
        query_embedding = self.embedder.embed_text(question)
        
        if not query_embedding:
            raise RuntimeError("Failed to generate query embedding.")

        # 2. Invoke database similarity search RPC
        print(f"[INFO] Running pgvector search (threshold: {similarity_threshold}, count: {top_k})...")
        try:
            response = self.client.rpc(
                "match_document_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": similarity_threshold,
                    "match_count": top_k
                }
            ).execute()
            
            return response.data or []
        except Exception as e:
            raise RuntimeError(f"Database vector similarity search failed: {e}")
