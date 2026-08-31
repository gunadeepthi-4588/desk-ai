from functools import wraps
from flask import Blueprint, request, jsonify, session
from werkzeug.security import check_password_hash
from backend.supabase_client import get_supabase_client

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def login_required(f):
    """Decorator to protect routes from unauthenticated access."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session or not session.get('user'):
            return jsonify({"error": "Authentication required. Please log in."}), 401
        return f(*args, **kwargs)
    return decorated_function


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    POST /api/auth/login
    Request body:
        {
            "email": "employee@deskai.demo",
            "password": "demo1234"
        }
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. Body must be a JSON object."}), 400

    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', '')).strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Database service is currently unavailable."}), 500

    try:
        res = client.table('users').select('*').eq('email', email).execute()
        if not res.data or len(res.data) == 0:
            return jsonify({"error": "Invalid email or password."}), 401

        user = res.data[0]
        stored_hash = user.get('password_hash', '')

        if not check_password_hash(stored_hash, password):
            return jsonify({"error": "Invalid email or password."}), 401

        # Store user profile in Flask server-side session
        user_session = {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'role': user['role'],
            'department': user.get('department')
        }
        session['user'] = user_session
        session.permanent = True

        return jsonify(user_session), 200

    except Exception as e:
        print(f"[ERROR] Login failed: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    POST /api/auth/logout
    Clears the server-side session.
    """
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    """
    GET /api/auth/me
    Returns current authenticated user session data.
    """
    user = session.get('user')
    if not user:
        return jsonify({"error": "Not authenticated."}), 401

    return jsonify(user), 200
