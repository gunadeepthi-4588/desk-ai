from flask import Flask
from backend.config import Config
from backend.routes import register_routes

def create_app() -> Flask:
    """
    App Factory pattern for creating and configuring the Flask application instance.
    """
    app = Flask(__name__, static_folder='../frontend', static_url_path='')
    
    # Load settings from environment/config class
    app.config.from_object(Config)
    app.secret_key = Config.SECRET_KEY
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    
    # Register blueprints (routes)
    register_routes(app)
    
    # Serve dashboard.html at root / and /dashboard
    @app.route('/')
    @app.route('/dashboard')
    def dashboard_page():
        return app.send_static_file('dashboard.html')

    # Serve index.html at /chat
    @app.route('/chat')
    def chat_page():
        return app.send_static_file('index.html')

    # Serve login.html at /login
    @app.route('/login')
    def login_page():
        return app.send_static_file('login.html')

    # Serve tickets.html at /tickets
    @app.route('/tickets')
    def tickets_page():
        return app.send_static_file('tickets.html')

    # Serve ticket-detail.html at /ticket-detail
    @app.route('/ticket-detail')
    def ticket_detail_page():
        return app.send_static_file('ticket-detail.html')

    # Serve admin-dashboard.html at /admin-dashboard and /admin
    @app.route('/admin-dashboard')
    @app.route('/admin')
    def admin_dashboard_page():
        return app.send_static_file('admin-dashboard.html')

    # Add CORS headers to all responses
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH')
        return response

    return app
