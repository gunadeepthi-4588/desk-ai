import sys
import httpx
from supabase import create_client, Client
from postgrest.exceptions import APIError
from backend.config import Config

# Module-level singletons to store the client state and initialization errors
_supabase_client: Client | None = None
_supabase_init_error: str | None = None

def get_supabase_client() -> Client | None:
    """
    Initializes and returns the Supabase client singleton.
    Returns None if Supabase credentials are not configured or initialization fails.
    """
    global _supabase_client, _supabase_init_error
    if _supabase_client is not None:
        return _supabase_client
        
    url = Config.SUPABASE_URL
    key = Config.SUPABASE_SECRET_KEY or Config.SUPABASE_KEY
    
    if not url or not key:
        _supabase_init_error = "unconfigured"
        return None
        
    try:
        # Create official supabase Client
        _supabase_client = create_client(url, key)
        _supabase_init_error = None
        print("[SUCCESS] Supabase client initialized successfully.")
    except Exception as e:
        err_msg = str(e)
        _supabase_init_error = err_msg
        print(f"[ERROR] Error initializing Supabase client: {err_msg}")
        _supabase_client = None
        
    return _supabase_client

def verify_supabase_connection() -> tuple[bool, str]:
    """
    Verifies that the Supabase client can reach the database and execute queries.
    Returns a tuple: (is_connected, error_category_or_success_message)
    """
    url = Config.SUPABASE_URL
    key = Config.SUPABASE_SECRET_KEY or Config.SUPABASE_KEY
    
    if not url or not key:
        return False, "unconfigured"
        
    client = get_supabase_client()
    if not client:
        # Diagnose initialization error category
        err = (_supabase_init_error or "").lower()
        if "invalid api key" in err or "jwt" in err or "api key not valid" in err:
            return False, "unauthorized"
        return False, "initialization_failed"
        
    try:
        # Perform a tiny query on a dummy connection-check table.
        # This triggers a network query but does not require the table to exist.
        client.table('_connection_check').select('*').limit(1).execute()
        return True, "success"
    except APIError as e:
        # An APIError indicates the server was reached!
        # Status code 401/403 means bad/unauthorized keys.
        err_msg = str(e).lower()
        if "unauthorized" in err_msg or "invalid api key" in err_msg or "jwt" in err_msg or str(getattr(e, "code", "")) == "401":
            return False, "unauthorized"
        # Other API errors (like 404 table not found) mean the credentials are valid
        # and Postgrest was able to authenticate the request and contact the DB.
        return True, "success"
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RequestError):
        return False, "network_error"
    except Exception as e:
        err_msg = str(e).lower()
        if "unauthorized" in err_msg or "invalid api key" in err_msg or "jwt" in err_msg:
            return False, "unauthorized"
        elif "failed to resolve" in err_msg or "connection" in err_msg or "connect" in err_msg:
            return False, "network_error"
        return False, "unknown_error"

def create_private_bucket_if_not_exists(bucket_name: str = "company-documents") -> bool:
    """
    Verifies if the specified storage bucket exists, and creates it as private if not.
    """
    client = get_supabase_client()
    if not client:
        print(f"[WARNING] Storage bucket check skipped: Supabase client not initialized.")
        return False
    try:
        buckets = client.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        if bucket_name not in bucket_names:
            client.storage.create_bucket(bucket_name, options={"public": False})
            print(f"[INFO] Created private storage bucket: {bucket_name}")
        return True
    except Exception as e:
        print(f"[WARNING] Failed to verify or create storage bucket '{bucket_name}': {e}")
        return False

