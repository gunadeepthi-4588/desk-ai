from flask import Blueprint, jsonify

embeddings_bp = Blueprint('embeddings', __name__, url_prefix='/api/embeddings')

@embeddings_bp.route('', methods=['GET'])
def index():
    return jsonify({
        "message": "Embeddings module placeholder. Ready for chunking & embedding generation in future phases."
    }), 200
