from backend.routes.health import health_bp
from backend.routes.ingestion import ingestion_bp
from backend.routes.embeddings import embeddings_bp
from backend.routes.rag import rag_bp
from backend.routes.chat import chat_bp
from backend.routes.tickets import tickets_bp
from backend.routes.auth import auth_bp

def register_routes(app):
    """Registers all blueprints to the provided Flask application instance."""
    app.register_blueprint(health_bp)
    app.register_blueprint(ingestion_bp)
    app.register_blueprint(embeddings_bp)
    app.register_blueprint(rag_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(tickets_bp)
    app.register_blueprint(auth_bp)

