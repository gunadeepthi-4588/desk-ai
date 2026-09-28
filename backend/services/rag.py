import os
import time
from google import genai
from google.genai import types
from backend.services.retrieval import RetrievalService

class RAGService:
    def __init__(self, retrieval_service: RetrievalService = None):
        self.retrieval_service = retrieval_service or RetrievalService()
        self.client = None  # Lazy client, will be created on first call
        # Default generative model
        self.model_name = os.environ.get("GEMINI_GENERATIVE_MODEL", "gemini-3.1-flash-lite")

    def _ensure_client(self):
        """Create genai.Client if not already created. Raises clear error if API key missing."""
        if self.client is None:
            try:
                self.client = genai.Client()
            except Exception as e:
                raise RuntimeError("Google Gemini API client could not be created. Ensure GEMINI_API_KEY is set.")

    def answer_question(self, question: str) -> dict:
        """
        Retrieves relevant company knowledge chunks, checks thresholds,
        calls Gemini using system instructions with temperature=0.0, and returns answer + sources.
        """
        # 1. Retrieve most relevant chunks from database
        try:
            chunks = self.retrieval_service.retrieve_relevant_chunks(question)
        except Exception as e:
            print(f"[ERROR] Context retrieval failed: {e}")
            return {
                "error": f"Context retrieval failed: {str(e)}",
                "answer": "I encountered an error querying the company knowledge base.",
                "sources": [],
                "is_answerable": False,
                "is_error": True
            }

        # 2. Check if context is completely empty (no-answer threshold)
        refusal_msg = "I couldn't find reliable information about this in the available company knowledge."
        if not chunks:
            print("[INFO] No relevant context chunks passed the similarity threshold. Bypassing Gemini call.")
            return {
                "answer": refusal_msg,
                "sources": [],
                "is_answerable": False,
                "is_error": False
            }

        # 3. Formulate context block
        context_parts = []
        sources = []
        
        for chunk in chunks:
            filename = chunk.get("filename") or "Unknown Document"
            page_num = chunk.get("page_number")
            score = chunk.get("similarity")
            
            # Format single chunk text
            page_str = f", Page: {page_num}" if page_num else ""
            context_parts.append(
                f"Source Document: {filename}{page_str}\n"
                f"Similarity Score: {score:.4f}\n"
                f"Content: {chunk.get('content')}\n"
                f"---"
            )
            
            # Build clean source dictionary
            sources.append({
                "document_id": chunk.get("document_id"),
                "filename": filename,
                "page_number": page_num,
                "similarity": round(score, 4) if score is not None else 0.0
            })

        context_text = "\n\n".join(context_parts)

        # 4. System Instruction for strict grounding
        system_instruction = (
            "You are DeskAI, a helpful, strict Enterprise Knowledge Assistant.\n"
            "Your sole task is to answer the user's question using ONLY the provided company document context.\n\n"
            "CRITICAL RULES:\n"
            "1. Answer the question using ONLY facts explicitly stated in the context.\n"
            "2. Do NOT invent policies, dates, details, or assumptions.\n"
            "3. If the context does not contain enough information to answer the question, state exactly: "
            f"\"{refusal_msg}\"\n"
            "4. Do NOT answer from general knowledge or extrapolate beyond the text.\n"
            "5. Cite information facts truthfully. Never fabricate a policy.\n"
        )

        user_content = (
            f"Context:\n{context_text}\n\n"
            f"Question: {question}"
        )

        # 5. Execute Gemini content generation with retry for transient API spikes
        print(f"[INFO] Invoking generative model '{self.model_name}' with temperature=0.0...")
        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            try:
                self._ensure_client()
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=user_content,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.0
                    )
                )
                
                answer = response.text.strip()
                
                # 6. Post-process no-answer cases
                # If the model itself decided it didn't find the answer (or replied with refusal)
                if refusal_msg.lower() in answer.lower():
                    return {
                        "answer": refusal_msg,
                        "sources": [],
                        "is_answerable": False,
                        "is_error": False
                    }
                    
                return {
                    "answer": answer,
                    "sources": sources,
                    "is_answerable": True,
                    "is_error": False
                }

            except Exception as e:
                err_str = str(e)
                if attempt < max_attempts and ("503" in err_str or "unavailable" in err_str.lower() or "resource" in err_str.lower()):
                    print(f"[WARN] Gemini generation attempt {attempt} hit transient error ({e}). Retrying in 1s...")
                    time.sleep(1.0)
                    continue
                print(f"[ERROR] Gemini generation failed: {e}")
                return {
                    "error": f"Gemini generation failed: {str(e)}",
                    "answer": "An error occurred while generating the answer. Please try again shortly.",
                    "sources": [],
                    "is_answerable": False,
                    "is_error": True
                }
