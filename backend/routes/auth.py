import datetime
from functools import wraps
import jwt
from flask import Blueprint, request, jsonify, session, g
from werkzeug.security import check_password_hash, generate_password_hash
from backend.config import Config
from backend.supabase_client import get_supabase_client

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Fallback built-in demo credentials for robust testing and offline/demo environments
DEMO_ACCOUNTS = {
    "employee@deskai.demo": {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "employee@deskai.demo",
        "password": "demo1234",
        "name": "Alex Employee",
        "role": "employee",
        "department": "Engineering"
    },
    "employee@gmail.com": {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "employee@gmail.com",
        "password": "demo1234",
        "name": "Alex Employee",
        "role": "employee",
        "department": "Engineering"
    },
    "hr@deskai.demo": {
        "id": "00000000-0000-0000-0000-000000000002",
        "email": "hr@deskai.demo",
        "password": "demo1234",
        "name": "Morgan HR",
        "role": "hr",
        "department": "HR"
    },
    "hr@gmail.com": {
        "id": "00000000-0000-0000-0000-000000000002",
        "email": "hr@gmail.com",
        "password": "demo1234",
        "name": "Morgan HR",
        "role": "hr",
        "department": "HR"
    },
    "admin@deskai.demo": {
        "id": "00000000-0000-0000-0000-000000000003",
        "email": "admin@deskai.demo",
        "password": "demo1234",
        "name": "Sam Admin",
        "role": "admin",
        "department": None
    },
    "admin@gmail.com": {
        "id": "00000000-0000-0000-0000-000000000003",
        "email": "admin@gmail.com",
        "password": "demo1234",
        "name": "Sam Admin",
        "role": "admin",
        "department": None
    }
}


def generate_jwt_token(user_data: dict) -> str:
    """
    Generates a signed JWT with user claims and expiration timestamp.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(hours=Config.JWT_EXPIRATION_HOURS)
    
    payload = {
        "user_id": str(user_data.get('id', '')),
        "id": str(user_data.get('id', '')),
        "email": user_data.get('email', ''),
        "name": user_data.get('name', ''),
        "role": user_data.get('role', 'employee'),
        "department": user_data.get('department'),
        "iat": now,
        "exp": exp
    }
    
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def decode_jwt_token(token: str) -> dict:
    """
    Decodes and validates a JWT token. Raises ExpiredSignatureError or InvalidTokenError.
    """
    return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])


def get_current_user_from_request():
    """
    Extracts and validates user authentication from either:
    1. 'Authorization: Bearer <token>' header (preferred JWT)
    2. Flask server-side session (session['user']) for backward compatibility
    
    Returns:
        (user_dict, error_response_or_None)
    """
    auth_header = request.headers.get('Authorization', '').strip()
    
    # Check Bearer JWT first
    if auth_header:
        parts = auth_header.split(' ', 1)
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            token = parts[1].strip()
            try:
                payload = decode_jwt_token(token)
                return payload, None
            except jwt.ExpiredSignatureError:
                return None, (jsonify({"error": "Token has expired. Please log in again."}), 401)
            except jwt.InvalidTokenError as e:
                return None, (jsonify({"error": f"Invalid authentication token: {str(e)}"}), 401)
        else:
            return None, (jsonify({"error": "Invalid Authorization header format. Expected 'Bearer <token>'."}), 401)
    
    # Fallback to Flask session for backward compatibility
    if 'user' in session and session.get('user'):
        return session.get('user'), None
        
    return None, (jsonify({"error": "Authentication required. Missing or invalid token."}), 401)


def login_required(f):
    """
    Decorator to protect routes from unauthenticated access.
    Attaches authenticated user payload to `g.user` and `request.user`.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user, error = get_current_user_from_request()
        if error:
            return error
        g.user = user
        request.user = user
        return f(*args, **kwargs)
    return decorated_function


def roles_required(*allowed_roles):
    """
    Decorator to enforce role-based access control (RBAC) on routes.
    Example:
        @roles_required('admin', 'hr')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user, error = get_current_user_from_request()
            if error:
                return error
            
            user_role = user.get('role', 'employee')
            if user_role not in allowed_roles:
                return jsonify({
                    "error": f"Access forbidden: Requires one of {list(allowed_roles)} role. Your role is '{user_role}'."
                }), 403
                
            g.user = user
            request.user = user
            return f(*args, **kwargs)
        return decorated_function
    return decorator


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    POST /api/auth/login
    Request body:
        {
            "email": "employee@deskai.demo",
            "password": "demo1234"
        }
    Response:
        {
            "token": "<JWT_TOKEN>",
            "access_token": "<JWT_TOKEN>",
            "token_type": "Bearer",
            "user": { ... }
        }
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. Body must be a JSON object."}), 400

    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', '')).strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    user = None
    client = get_supabase_client()
    
    if client:
        try:
            res = client.table('users').select('*').eq('email', email).execute()
            if res.data and len(res.data) > 0:
                db_user = res.data[0]
                stored_hash = db_user.get('password_hash', '')
                if check_password_hash(stored_hash, password):
                    user = {
                        'id': db_user['id'],
                        'email': db_user['email'],
                        'name': db_user['name'],
                        'role': db_user['role'],
                        'department': db_user.get('department')
                    }
        except Exception as e:
            print(f"[WARN] Supabase login query failed: {e}")

    # If not found in DB or DB unavailable, check demo accounts
    if not user and email in DEMO_ACCOUNTS:
        demo_info = DEMO_ACCOUNTS[email]
        if password == demo_info['password']:
            user = {
                'id': demo_info['id'],
                'email': demo_info['email'],
                'name': demo_info['name'],
                'role': demo_info['role'],
                'department': demo_info.get('department')
            }

    if not user:
        return jsonify({"error": "Invalid email or password."}), 401

    # Generate signed JWT
    token = generate_jwt_token(user)

    # Store in session as well for seamless hybrid support
    session['user'] = user
    session.permanent = True

    return jsonify({
        "token": token,
        "access_token": token,
        "token_type": "Bearer",
        "user": user,
        "id": user['id'],
        "email": user['email'],
        "name": user['name'],
        "role": user['role'],
        "department": user.get('department')
    }), 200


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    POST /api/auth/logout
    Clears the server-side session.
    """
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user():
    """
    GET /api/auth/me
    Returns current authenticated user claims from JWT or session.
    """
    user = getattr(g, 'user', None) or session.get('user')
    if not user:
        return jsonify({"error": "Not authenticated."}), 401

    return jsonify(user), 200

