import os
from google import genai

class Embedder:
    def __init__(self, model_name: str = None):
        """
        Initializes the Embedder service.
        The model_name can be configured via initialization or falls back to
        the EMBEDDING_MODEL environment variable, defaulting to 'gemini-embedding-001'.
        """
        self.model_name = model_name or os.environ.get("EMBEDDING_MODEL", "gemini-embedding-001")
        # genai.Client() reads GEMINI_API_KEY from os.environ
        self.client = None  # Lazy client, will be created on first embed call

    def _ensure_client(self):
        """Create genai.Client if not already created. Raises clear error if API key missing."""
        if self.client is None:
            try:
                self.client = genai.Client()
            except Exception as e:
                raise RuntimeError("Google Gemini API client could not be created. Ensure GEMINI_API_KEY is set.")

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of text inputs."""
        self._ensure_client()
        """
        Generates embeddings for a list of text inputs.
        Sends a single batch request to the Google GenAI API.
        """
        if not texts:
            return []
            
        try:
            response = self.client.models.embed_content(
                model=self.model_name,
                contents=texts
            )
            # Extracts and returns list of float lists (embeddings)
            return [emb.values for emb in response.embeddings]
        except Exception as e:
            raise RuntimeError(f"Google GenAI Embedding generation failed: {e}")

    def embed_text(self, text: str) -> list[float]:
        """Convenience method to generate an embedding for a single text string."""
        embeddings = self.embed_texts([text])
        return embeddings[0] if embeddings else []
