import os
import sys

# Ensure backend modules can be imported
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir)) if "brain" in current_dir else os.path.dirname(current_dir)
# Add project root to sys.path
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from werkzeug.security import generate_password_hash
from backend.supabase_client import get_supabase_client

DEMO_USERS = [
    {
        "email": "employee@deskai.demo",
        "password": "demo1234",
        "name": "Alex Employee",
        "role": "employee",
        "department": "Engineering"
    },
    {
        "email": "employee@gmail.com",
        "password": "demo1234",
        "name": "Alex Employee (Gmail)",
        "role": "employee",
        "department": "Engineering"
    },
    {
        "email": "hr@deskai.demo",
        "password": "demo1234",
        "name": "Morgan HR",
        "role": "hr",
        "department": "HR"
    },
    {
        "email": "hr@gmail.com",
        "password": "demo1234",
        "name": "Morgan HR (Gmail)",
        "role": "hr",
        "department": "HR"
    },
    {
        "email": "admin@deskai.demo",
        "password": "demo1234",
        "name": "Sam Admin",
        "role": "admin",
        "department": None
    },
    {
        "email": "admin@gmail.com",
        "password": "demo1234",
        "name": "Sam Admin (Gmail)",
        "role": "admin",
        "department": None
    }
]

def seed_users():
    client = get_supabase_client()
    if not client:
        print("[ERROR] Supabase client could not be initialized.")
        return False

    print("[INFO] Seeding demo users into Supabase...")
    for user_info in DEMO_USERS:
        email = user_info["email"]
        password = user_info["password"]
        name = user_info["name"]
        role = user_info["role"]
        department = user_info["department"]

        password_hash = generate_password_hash(password)

        try:
            # Check if user already exists
            res = client.table("users").select("*").eq("email", email).execute()
            if res.data and len(res.data) > 0:
                user_id = res.data[0]["id"]
                print(f"[INFO] Updating existing user '{email}' (ID: {user_id})...")
                update_res = client.table("users").update({
                    "password_hash": password_hash,
                    "name": name,
                    "role": role,
                    "department": department
                }).eq("id", user_id).execute()
                print(f"[SUCCESS] Updated user '{email}'.")
            else:
                print(f"[INFO] Inserting new user '{email}'...")
                insert_res = client.table("users").insert({
                    "email": email,
                    "password_hash": password_hash,
                    "name": name,
                    "role": role,
                    "department": department
                }).execute()
                created_user = insert_res.data[0]
                print(f"[SUCCESS] Created user '{email}' with ID: {created_user['id']}")

        except Exception as e:
            print(f"[ERROR] Failed to seed user '{email}': {e}")
            return False

    print("\n[SUCCESS] All demo users seeded successfully!")
    return True

if __name__ == "__main__":
    success = seed_users()
    if not success:
        sys.exit(1)
