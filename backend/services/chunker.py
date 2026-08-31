import re

class Chunker:
    @staticmethod
    def clean_text(text: str) -> str:
        """Collapses excessive whitespaces and normalizes text structure."""
        # Replace multiple spaces/newlines with a single space or clean newline
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n\s*\n+', '\n\n', text)
        return text.strip()

    @staticmethod
    def chunk_document(
        pages: list[tuple[int, str]], 
        chunk_size: int = 1000, 
        overlap: int = 200,
        min_chunk_len: int = 150
    ) -> list[dict]:
        """
        Splits extracted page text into overlapping chunks.
        For PDFs, splits page-by-page to preserve accurate page mapping.
        """
        chunks = []
        global_idx = 0

        for page_num, text in pages:
            cleaned = Chunker.clean_text(text)
            if not cleaned:
                continue

            # If the entire page is smaller than the chunk size, keep it as one chunk
            if len(cleaned) <= chunk_size:
                chunks.append({
                    "chunk_index": global_idx,
                    "content": cleaned,
                    "page_number": page_num
                })
                global_idx += 1
                continue

            # Otherwise, apply a sliding window chunking algorithm
            start = 0
            while start < len(cleaned):
                end = start + chunk_size
                chunk_content = cleaned[start:end]
                
                # Adjust end to avoid splitting words in the middle
                if end < len(cleaned):
                    last_space = chunk_content.rfind(' ')
                    if last_space > (chunk_size * 0.7):  # Only backtrack if we don't lose too much content
                        end = start + last_space
                        chunk_content = cleaned[start:end]

                # Clean the chunk content
                chunk_content = chunk_content.strip()
                
                # Check for minimum chunk size to merge trailing fragments
                if len(chunk_content) < min_chunk_len and chunks and chunks[-1]["page_number"] == page_num:
                    # Append it to the previous chunk of the same page instead of creating a tiny fragment
                    chunks[-1]["content"] = (chunks[-1]["content"] + " " + chunk_content).strip()
                else:
                    chunks.append({
                        "chunk_index": global_idx,
                        "content": chunk_content,
                        "page_number": page_num
                    })
                    global_idx += 1

                # Slide the window forward by chunk_size - overlap
                start += len(chunk_content) - overlap
                if start >= len(cleaned) or (len(chunk_content) - overlap) <= 0:
                    break

        return chunks
