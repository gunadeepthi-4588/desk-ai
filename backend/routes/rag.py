from flask import Blueprint, jsonify

rag_bp = Blueprint('rag', __name__, url_prefix='/api/rag')

@rag_bp.route('', methods=['GET'])
def index():
    return jsonify({
        "message": "RAG Retrieval module placeholder. Ready for semantic vector queries in future phases."
    }), 200
