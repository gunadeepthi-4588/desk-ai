import os
import pytest
if not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY") and os.getenv("GEMINI_API_KEY")):
    pytest.skip("Supabase/GEMINI credentials not set; skipping integration tests.", allow_module_level=True)
import sys
import time
import requests
from dotenv import load_dotenv

# Ensure backend can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import create_app
from backend.supabase_client import get_supabase_client

# Download a small public sample PDF from W3C
SAMPLE_PDF_URL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
LOCAL_SAMPLE_PDF = "sample_test.pdf"

def setup_test_file():
    """Downloads a small test PDF if not already present."""
    if not os.path.exists(LOCAL_SAMPLE_PDF):
        print(f"[INFO] Downloading sample PDF from {SAMPLE_PDF_URL}...")
        r = requests.get(SAMPLE_PDF_URL)
        r.raise_for_status()
        with open(LOCAL_SAMPLE_PDF, "wb") as f:
            f.write(r.content)
        print("[SUCCESS] Sample PDF downloaded.")

def run_integration_test():
    load_dotenv()
    setup_test_file()
    
    print("\n[INFO] Initializing Flask test client...")
    app = create_app()
    app.config["TESTING"] = True
    client = app.test_client()

    supabase_client = get_supabase_client()
    if not supabase_client:
        print("[ERROR] Supabase client is not initialized. Check your environment variables.")
        sys.exit(1)

    print("\n[STEP 1] Uploading document via POST /api/documents/upload...")
    with open(LOCAL_SAMPLE_PDF, "rb") as f:
        pdf_bytes = f.read()
        
    response = client.post(
        "/api/documents/upload",
        data={
            "file": (io_bytes_wrapper(pdf_bytes, LOCAL_SAMPLE_PDF), LOCAL_SAMPLE_PDF)
        }
    )
    
    if response.status_code != 201:
        print(f"[ERROR] Upload failed with status {response.status_code}: {response.json}")
        sys.exit(1)
        
    res_json = response.json
    doc_id = res_json["document"]["id"]
    print(f"[SUCCESS] Upload succeeded. Document ID: {doc_id}")

    print("\n[STEP 2] Waiting for background processing pipeline to finish...")
    status = "pending"
    max_retries = 20
    retry_interval = 1.5
    doc_details = {}
    
    for attempt in range(1, max_retries + 1):
        print(f"[INFO] Checking status (attempt {attempt}/{max_retries})...")
        status_res = client.get(f"/api/documents/{doc_id}")
        if status_res.status_code != 200:
            print(f"[ERROR] Failed to fetch document details: {status_res.json}")
            sys.exit(1)
            
        doc_details = status_res.json
        status = doc_details["status"]
        print(f"   Current status: '{status}'")
        
        if status in ("completed", "failed"):
            break
        time.sleep(retry_interval)

    if status != "completed":
        print(f"[ERROR] Ingestion failed! Final Status: '{status}'")
        if "error_message" in doc_details and doc_details["error_message"]:
            print(f"   Error Message: {doc_details['error_message']}")
        sys.exit(1)
        
    print("[SUCCESS] Ingestion processing successfully completed!")
    print(f"   Page Count: {doc_details.get('page_count')}")
    print(f"   Chunk Count: {doc_details.get('chunk_count')}")

    print("\n[STEP 3] Verifying file presence in Supabase Storage...")
    try:
        storage_path = doc_details["storage_path"]
        downloaded = supabase_client.storage.from_("company-documents").download(storage_path)
        if downloaded and len(downloaded) == len(pdf_bytes):
            print(f"[SUCCESS] Original file verified in storage ({len(downloaded)} bytes).")
        else:
            print("[ERROR] Storage file verification failed: byte mismatch or empty.")
            sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Failed to download from Supabase Storage: {e}")
        sys.exit(1)

    print("\n[STEP 4] Verifying database records and pgvector embeddings...")
    try:
        # Check chunk records
        chunks_res = supabase_client.table("document_chunks").select("chunk_index, page_number, content, embedding").eq("document_id", doc_id).execute()
        db_chunks = chunks_res.data
        print(f"[SUCCESS] Found {len(db_chunks)} chunks in the document_chunks table.")
        
        if len(db_chunks) > 0:
            first_chunk = db_chunks[0]
            emb = first_chunk.get("embedding")
            if emb:
                if isinstance(emb, list):
                    vector_len = len(emb)
                elif isinstance(emb, str):
                    vector_len = len(emb.strip("[]").split(","))
                else:
                    vector_len = 0
                print(f"[SUCCESS] Embedding vector detected in database. Dimension: {vector_len}")
                if vector_len != 3072:
                    print(f"[ERROR] Vector dimension mismatch! Expected 3072, got {vector_len}")
                    sys.exit(1)
            else:
                print("[ERROR] Chunk embedding is missing or empty in database!")
                sys.exit(1)
        else:
            print("[ERROR] No chunks found in document_chunks database table.")
            sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Database verification query failed: {e}")
        sys.exit(1)

    print("\n[STEP 5] Verifying document list route GET /api/documents...")
    list_res = client.get("/api/documents")
    if list_res.status_code != 200:
        print(f"[ERROR] Listing endpoint failed: {list_res.json}")
        sys.exit(1)
        
    doc_list = list_res.json
    found_in_list = any(d["id"] == doc_id for d in doc_list)
    if found_in_list:
        print("[SUCCESS] Document listed successfully in GET /api/documents response.")
    else:
        print("[ERROR] Document ID not found in GET /api/documents listing response.")
        sys.exit(1)

    print("\n[SUCCESS] ALL TESTS PASSED SUCCESSFULLY! Phase 2 ingestion pipeline verified.")

def io_bytes_wrapper(data, filename):
    import io
    bio = io.BytesIO(data)
    bio.name = filename
    return bio

if __name__ == "__main__":
    run_integration_test()
