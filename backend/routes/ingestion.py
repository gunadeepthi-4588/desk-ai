import os
import uuid
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from backend.supabase_client import get_supabase_client, create_private_bucket_if_not_exists
from backend.services.pipeline import IngestionPipeline

ingestion_bp = Blueprint('ingestion', __name__, url_prefix='/api/documents')

# Configuration constraints
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@ingestion_bp.route('/upload', methods=['POST'])
def upload_document():
    """
    POST /api/documents/upload
    Accepts multipart/form-data with a 'file' parameter.
    Validates, uploads to private storage, and kicks off background processing.
    """
    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Supabase client is uninitialized. Configure env variables."}), 500

    # 1. Validate file presence
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected for upload"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file format. Only PDF, DOCX, and TXT are allowed."}), 400

    # 2. Read and validate file size
    file_bytes = file.read()
    file_size = len(file_bytes)
    if file_size > MAX_FILE_SIZE_BYTES:
        return jsonify({"error": "File size exceeds the 10 MB limit."}), 400

    filename = secure_filename(file.filename)
    file_ext = filename.rsplit('.', 1)[1].lower()

    try:
        # 3. Ensure target private bucket exists
        create_private_bucket_if_not_exists("company-documents")

        # 4. Generate unique target storage filename
        unique_name = f"{uuid.uuid4()}.{file_ext}"
        storage_path = f"uploads/{unique_name}"

        # 5. Upload document bytes to Supabase private storage
        # Need to wrap in BytesIO so the storage client reads correctly
        client.storage.from_("company-documents").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"}
        )
        print(f"[INFO] Uploaded original document to storage: {storage_path}")

        # 6. Insert metadata record in documents table with 'pending' status
        doc_data = {
            "filename": filename,
            "file_type": file_ext,
            "storage_path": storage_path,
            "file_size": file_size,
            "status": "pending"
        }
        db_response = client.table("documents").insert(doc_data).execute()
        
        if not db_response.data:
            raise RuntimeError("Failed to insert metadata record into public.documents table.")

        document_record = db_response.data[0]
        document_id = document_record["id"]
        print(f"[INFO] Created metadata record for document: {document_id}")

        # 7. Start processing pipeline asynchronously in a background thread
        IngestionPipeline.process_document_in_background(
            document_id=document_id,
            file_bytes=file_bytes,
            file_type=file_ext,
            filename=filename
        )

        return jsonify({
            "message": "Document uploaded successfully. Processing started.",
            "document": {
                "id": document_id,
                "filename": filename,
                "file_type": file_ext,
                "file_size": file_size,
                "status": "pending"
            }
        }), 201

    except Exception as e:
        print(f"[ERROR] Failed to handle upload: {e}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@ingestion_bp.route('', methods=['GET'])
def list_documents():
    """
    GET /api/documents
    Lists all documents stored in the system.
    """
    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Supabase client is uninitialized."}), 500
        
    try:
        response = client.table("documents").select("id, filename, file_type, file_size, status, page_count, chunk_count, error_message, created_at").order("created_at", desc=True).execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({"error": f"Failed to list documents: {str(e)}"}), 500

@ingestion_bp.route('/<uuid:document_id>', methods=['GET'])
def get_document_details(document_id):
    """
    GET /api/documents/<document_id>
    Retrieves metadata and processing state of a specific document.
    """
    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Supabase client is uninitialized."}), 500
        
    try:
        response = client.table("documents").select("*").eq("id", str(document_id)).execute()
        if not response.data:
            return jsonify({"error": "Document not found"}), 404
        return jsonify(response.data[0]), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve document details: {str(e)}"}), 500
