import os
import uuid
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
from backend.supabase_client import get_supabase_client, create_private_bucket_if_not_exists
from backend.services.pipeline import IngestionPipeline
from backend.routes.auth import login_required, roles_required

ingestion_bp = Blueprint('ingestion', __name__, url_prefix='/api/documents')

# Configuration constraints
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@ingestion_bp.route('/upload', methods=['POST'])
@roles_required('admin', 'hr', 'manager')
def upload_document():
    """
    POST /api/documents/upload
    Accepts multipart/form-data with a 'file' parameter.
    Protected by RBAC: Only Admin, HR, and Manager can upload company documents.
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

    # Check if synchronous processing is requested
    is_sync = (request.args.get('sync', '').lower() in ('true', '1') or 
               request.form.get('sync', '').lower() in ('true', '1'))

    try:
        # 3. Ensure target private bucket exists
        try:
            create_private_bucket_if_not_exists("company-documents")
        except Exception as storage_bucket_err:
            print(f"[WARN] Bucket verification warning: {storage_bucket_err}")

        # 4. Generate unique target storage filename
        unique_name = f"{uuid.uuid4()}.{file_ext}"
        storage_path = f"uploads/{unique_name}"

        # 5. Upload document bytes to Supabase private storage
        try:
            client.storage.from_("company-documents").upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": file.content_type or "application/octet-stream"}
            )
            print(f"[INFO] Uploaded original document to storage: {storage_path}")
        except Exception as upload_err:
            print(f"[WARN] Storage upload failed or bypassed: {upload_err}")

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

        if is_sync:
            # Synchronous processing
            result = IngestionPipeline.process_document(
                document_id=document_id,
                file_bytes=file_bytes,
                file_type=file_ext,
                filename=filename
            )
            if result.get("status") == "failed":
                return jsonify({
                    "error": f"Document processing failed: {result.get('error')}",
                    "document": {
                        "id": document_id,
                        "filename": filename,
                        "status": "failed"
                    }
                }), 400

            return jsonify({
                "message": "Document uploaded and processed successfully into knowledge base.",
                "document": {
                    "id": document_id,
                    "filename": filename,
                    "file_type": file_ext,
                    "file_size": file_size,
                    "status": "completed",
                    "chunk_count": result.get("chunk_count", 0),
                    "page_count": result.get("page_count", 1)
                }
            }), 201
        else:
            # Asynchronous background processing
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
@login_required
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
        return jsonify(response.data or []), 200
    except Exception as e:
        return jsonify({"error": f"Failed to list documents: {str(e)}"}), 500

@ingestion_bp.route('/<uuid:document_id>', methods=['GET'])
@login_required
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

@ingestion_bp.route('/<uuid:document_id>', methods=['DELETE'])
@roles_required('admin', 'hr', 'manager')
def delete_document(document_id):
    """
    DELETE /api/documents/<document_id>
    Deletes an uploaded document, its associated vector chunks, and its storage file.
    Protected by RBAC: Only Admin, HR, and Manager can delete company documents.
    """
    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Supabase client is uninitialized."}), 500
        
    try:
        doc_id_str = str(document_id)
        # 1. Fetch document to obtain storage path
        doc_res = client.table("documents").select("id, filename, storage_path").eq("id", doc_id_str).execute()
        if not doc_res.data:
            return jsonify({"error": "Document not found"}), 404
            
        doc_record = doc_res.data[0]
        storage_path = doc_record.get("storage_path")

        # 2. Delete associated chunks from document_chunks table
        client.table("document_chunks").delete().eq("document_id", doc_id_str).execute()
        print(f"[INFO] Deleted vector chunks for document: {doc_id_str}")

        # 3. Delete document record
        client.table("documents").delete().eq("id", doc_id_str).execute()
        print(f"[INFO] Deleted document metadata record: {doc_id_str}")

        # 4. Remove from storage bucket if present
        if storage_path:
            try:
                client.storage.from_("company-documents").remove([storage_path])
                print(f"[INFO] Deleted storage file: {storage_path}")
            except Exception as st_err:
                print(f"[WARN] Failed to delete storage file {storage_path}: {st_err}")

        return jsonify({
            "message": f"Document '{doc_record.get('filename')}' and its vector embeddings deleted successfully.",
            "id": doc_id_str
        }), 200

    except Exception as e:
        print(f"[ERROR] Failed to delete document: {e}")
        return jsonify({"error": f"Failed to delete document: {str(e)}"}), 500
