import os
import sys
from dotenv import load_dotenv

# Ensure we read environment variables from the absolute project root .env file
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(backend_dir)
dotenv_path = os.path.join(project_root, '.env')
load_dotenv(dotenv_path)

class Config:
    # Flask Configuration
    FLASK_ENV = os.environ.get("FLASK_ENV", "development")
    DEBUG = FLASK_ENV == "development"
    PORT = int(os.environ.get("PORT", 5000))
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "deskai-enterprise-jwt-session-secret-key-2026-v2")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", SECRET_KEY)
    JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", 24))
    
    # Gemini Configuration
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    
    # Supabase Configuration
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
    SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY")

    @classmethod
    def validate(cls):
        """Validates configuration and prints warnings for missing values."""
        missing = []
        if not cls.GEMINI_API_KEY:
            missing.append("GEMINI_API_KEY")
        if not cls.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not cls.SUPABASE_SECRET_KEY and not cls.SUPABASE_KEY:
            missing.append("SUPABASE_SECRET_KEY/SUPABASE_KEY")
            
        if missing:
            print(f"[WARNING] Missing environment configuration for: {', '.join(missing)}")
            print("Please configure these in your system environment or a local .env file.")
        else:
            print("[SUCCESS] All required environment configurations are detected.")

# Validate config on import to log warnings to stderr
Config.validate()
