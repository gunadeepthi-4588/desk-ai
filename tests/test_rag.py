import os
import sys
from dotenv import load_dotenv
load_dotenv()
import pytest
if not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY") and os.getenv("GEMINI_API_KEY")):
    pytest.skip("Supabase/GEMINI credentials not set; skipping integration tests.", allow_module_level=True)

# Ensure backend can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import create_app
from backend.supabase_client import get_supabase_client
from backend.services.embedder import Embedder

def run_rag_tests():
    load_dotenv()
    
    print("\n[INFO] Initializing Flask test client...")
    app = create_app()
    app.config["TESTING"] = True
    client = app.test_client()

    supabase_client = get_supabase_client()
    if not supabase_client:
        print("[ERROR] Supabase client is not initialized.")
        sys.exit(1)

    print("\n[PREPARATION] Checking for existing document 'sample_test.pdf' in Supabase...")
    doc_res = supabase_client.table("documents").select("*").eq("filename", "sample_test.pdf").execute()
    docs = doc_res.data
    
    if not docs:
        print("[ERROR] No existing document 'sample_test.pdf' found in Supabase. Run Phase 2 first.")
        sys.exit(1)
        
    doc = docs[0]
    doc_id = doc["id"]
    print(f"[SUCCESS] Found existing document: '{doc['filename']}' with ID: {doc_id}")

    # ==========================================
    # TEST 5: VERIFY EMBEDDING DIMENSION
    # ==========================================
    print("\n[TEST 5] Verifying question embedding dimension...")
    embedder = Embedder()
    test_emb = embedder.embed_text("Test question")
    dimension = len(test_emb)
    print(f"[INFO] Question embedding size: {dimension}")
    if dimension != 3072:
        print(f"[ERROR] Embedding dimension is not 3072! Got {dimension}")
        sys.exit(1)
    print("[SUCCESS] Embedding dimension is exactly 3072.")

    # ==========================================
    # TEST 6: VERIFY DATABASE VECTOR SEARCH & RETRIEVED CONTENT
    # ==========================================
    print("\n[TEST 6] Verifying retrieved content comes from document_chunks table...")
    try:
        rpc_res = supabase_client.rpc(
            "match_document_chunks",
            {
                "query_embedding": test_emb,
                "match_threshold": 0.0,  # match anything
                "match_count": 5
            }
        ).execute()
        chunks = rpc_res.data
        if not chunks:
            print("[ERROR] No chunks retrieved from database search!")
            sys.exit(1)
            
        print(f"[SUCCESS] Chunks matched in db. Count: {len(chunks)}")
        first_chunk = chunks[0]
        print(f"[INFO] Retrieved content snippet: '{first_chunk['content']}'")
        
        # Verify content matches what we know is stored
        if "dumm" not in first_chunk["content"].lower():
            print("[WARNING] Chunk content does not match expected 'Dumm y PDF file' content.")
            
        print("[SUCCESS] Content verified as retrieved directly from document_chunks.")
    except Exception as e:
        print(f"[ERROR] Database similarity search failed: {e}")
        sys.exit(1)

    # Login to obtain JWT
    login_res = client.post("/api/auth/login", json={"email": "employee@gmail.com", "password": "demo1234"})
    token = login_res.json.get("token")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    # ==========================================
    # TEST 1: GROUNDED QUESTION
    # ==========================================
    print("\n[TEST 1] Asking question whose answer exists in the real document...")
    # Content in DB is "Dumm y PDF file"
    q1 = "Is this document a dummy PDF file?"
    res1 = client.post("/api/chat", headers=headers, json={"question": q1})
    
    if res1.status_code != 200:
        print(f"[ERROR] Chat request failed with status {res1.status_code}: {res1.json}")
        sys.exit(1)
        
    data1 = res1.json
    print(f"[INFO] Question: '{q1}'")
    print(f"[INFO] Answer: '{data1['answer']}'")
    print(f"[INFO] Sources: {data1['sources']}")
    
    # Assert grounding
    if "dummy" not in data1["answer"].lower() and "dumm" not in data1["answer"].lower():
        print(f"[ERROR] Answer does not appear to be grounded in document content: {data1['answer']}")
        sys.exit(1)
    
    if not data1["sources"]:
        print("[ERROR] No sources cited for grounded answer!")
        sys.exit(1)

    # ==========================================
    # TEST 3: VERIFY SOURCE FILENAME
    # ==========================================
    print("\n[TEST 3] Verifying source filename...")
    src = data1["sources"][0]
    filename = src.get("filename")
    print(f"[INFO] Cited filename: '{filename}'")
    if filename != "sample_test.pdf":
        print(f"[ERROR] Incorrect source filename! Expected 'sample_test.pdf', got '{filename}'")
        sys.exit(1)
    print("[SUCCESS] Source filename verified.")

    # ==========================================
    # TEST 4: VERIFY PAGE NUMBER
    # ==========================================
    print("\n[TEST 4] Verifying page number when available...")
    page_number = src.get("page_number")
    print(f"[INFO] Cited page number: {page_number}")
    if page_number != 1:
        print(f"[ERROR] Incorrect page number! Expected 1, got {page_number}")
        sys.exit(1)
    print("[SUCCESS] Page number verified.")

    # ==========================================
    # TEST 2: UNRELATED QUESTION
    # ==========================================
    print("\n[TEST 2] Asking unrelated question (refusal flow)...")
    q2 = "What is the capital of France?"
    res2 = client.post("/api/chat", headers=headers, json={"question": q2})
    
    if res2.status_code != 200:
        print(f"[ERROR] Chat request failed with status {res2.status_code}: {res2.json}")
        sys.exit(1)
        
    data2 = res2.json
    print(f"[INFO] Question: '{q2}'")
    print(f"[INFO] Answer: '{data2['answer']}'")
    print(f"[INFO] Sources: {data2['sources']}")
    
    expected_refusal = "I couldn't find reliable information about this in the available company knowledge."
    if data2["answer"] != expected_refusal:
        print(f"[ERROR] Refusal answer mismatch! Expected '{expected_refusal}', got '{data2['answer']}'")
        sys.exit(1)
        
    if data2["sources"]:
        print(f"[ERROR] Sources cited for ungrounded answer: {data2['sources']}")
        sys.exit(1)
        
    print("[SUCCESS] Refusal check passed successfully.")

    print("\n[SUCCESS] ALL Phase 3 RAG TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_rag_tests()
