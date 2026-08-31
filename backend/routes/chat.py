from flask import Blueprint, request, jsonify
from backend.services.rag import RAGService
from backend.routes.auth import login_required

chat_bp = Blueprint('chat', __name__, url_prefix='/api/chat')
rag_service = RAGService()

@chat_bp.route('', methods=['POST'])
@login_required
def chat():
    """
    POST /api/chat
    Request Body:
        {
            "question": "What is the leave policy?"
        }
    Response:
        {
            "answer": "...",
            "sources": [
                {
                    "document_id": "...",
                    "filename": "...",
                    "page_number": 5,
                    "similarity": 0.89
                }
            ]
        }
    """
    # 1. Parse and validate JSON request body
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. Body must be a JSON object."}), 400

    question = data.get("question")
    if not question or not isinstance(question, str) or not question.strip():
        return jsonify({"error": "Missing or empty 'question' string parameter."}), 400

    # 2. Get grounded answer from RAG pipeline
    try:
        result = rag_service.answer_question(question.strip())
        return jsonify(result), 200
    except Exception as e:
        print(f"[ERROR] Chat route execution failed: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
