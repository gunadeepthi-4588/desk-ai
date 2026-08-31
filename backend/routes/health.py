from flask import Blueprint, jsonify
from backend.config import Config
from backend.supabase_client import get_supabase_client, verify_supabase_connection
from google import genai

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint to verify Flask app status and configuration
    readiness for Gemini and Supabase without exposing secrets or crashing.
    """
    try:
        # Check Supabase configuration and client initialization
        supabase_configured = bool(Config.SUPABASE_URL and (Config.SUPABASE_SECRET_KEY or Config.SUPABASE_KEY))
        supabase_client_initialized = get_supabase_client() is not None
        
        # Verify connection and categorize failures
        _, supabase_conn_status = verify_supabase_connection()
        
        # Check Gemini configuration and client initialization
        gemini_configured = bool(Config.GEMINI_API_KEY)
        gemini_client_ready = False
        
        if gemini_configured:
            try:
                # Instantiating the client parses the API key and setup.
                _ = genai.Client()
                gemini_client_ready = True
            except Exception:
                gemini_client_ready = False

        return jsonify({
            "status": "healthy",
            "flask_status": "active",
            "services": {
                "supabase": {
                    "configured": supabase_configured,
                    "initialized": supabase_client_initialized,
                    "connection_status": supabase_conn_status
                },
                "gemini": {
                    "configured": gemini_configured,
                    "client_ready": gemini_client_ready
                }
            }
        }), 200
        
    except Exception as e:
        # Guard against unexpected errors to ensure GET /health never crashes
        return jsonify({
            "status": "error",
            "flask_status": "active",
            "error_category": "diagnostic_failure"
        }), 500
