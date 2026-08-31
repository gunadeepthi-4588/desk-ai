import os
import sys
import requests

# Ensure base URL is configured
BASE_URL = "http://127.0.0.1:5000"

def test_auth_pipeline():
    print("========================================")
    print("      DeskAI Auth Pipeline Testing      ")
    print("========================================")
    
    # 1. Test unauthenticated access to protected routes
    print("\n[TEST 1] Testing unauthenticated access to /api/auth/me...")
    r = requests.get(f"{BASE_URL}/api/auth/me")
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("[PASS] /api/auth/me rejected unauthenticated request.")

    print("\n[TEST 2] Testing unauthenticated access to POST /api/chat...")
    r = requests.post(f"{BASE_URL}/api/chat", json={"question": "Test question"})
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("[PASS] POST /api/chat rejected unauthenticated request.")

    print("\n[TEST 3] Testing unauthenticated access to GET /api/tickets...")
    r = requests.get(f"{BASE_URL}/api/tickets")
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("[PASS] GET /api/tickets rejected unauthenticated request.")

    print("\n[TEST 4] Testing invalid login credentials...")
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "employee@deskai.demo", "password": "wrongpassword"})
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("[PASS] Rejected invalid credentials.")

    # 2. Test successful employee login
    print("\n[TEST 5] Testing valid employee login...")
    session = requests.Session()
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": "employee@deskai.demo", "password": "demo1234"})
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    user_data = r.json()
    assert user_data["email"] == "employee@deskai.demo"
    assert user_data["role"] == "employee"
    employee_id = user_data["id"]
    print(f"[PASS] Logged in as {user_data['name']} (ID: {employee_id}).")

    # 3. Test /api/auth/me with active session
    print("\n[TEST 6] Testing /api/auth/me with active session...")
    r = session.get(f"{BASE_URL}/api/auth/me")
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.json()["id"] == employee_id
    print("[PASS] /api/auth/me returned correct session user.")

    # 4. Test creating a ticket with active session (verifying employee_id is set to user's UUID)
    print("\n[TEST 7] Testing ticket creation with active session...")
    ticket_payload = {
        "department": "IT Support",
        "category": "Auth Test",
        "priority": "Medium",
        "subject": "Testing Auth Ticket Creation",
        "description": "Verifying employee_id is auto-populated with user UUID"
    }
    r = session.post(f"{BASE_URL}/api/tickets", json=ticket_payload)
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 201, f"Expected 201, got {r.status_code}"
    created_ticket = r.json()
    assert created_ticket["employee_id"] == employee_id, f"Expected {employee_id}, got {created_ticket['employee_id']}"
    print(f"[PASS] Ticket created with authenticated user UUID: {created_ticket['employee_id']}")

    # 5. Test logout
    print("\n[TEST 8] Testing logout...")
    r = session.post(f"{BASE_URL}/api/auth/logout")
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    
    r_after = session.get(f"{BASE_URL}/api/auth/me")
    assert r_after.status_code == 401, f"Expected 401 after logout, got {r_after.status_code}"
    print("[PASS] Session cleared after logout.")

    # 6. Test Admin login
    print("\n[TEST 9] Testing Admin login...")
    admin_session = requests.Session()
    r = admin_session.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@deskai.demo", "password": "demo1234"})
    print(f"Status: {r.status_code}, Body: {r.json()}")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.json()["role"] == "admin"
    print(f"[PASS] Admin logged in as {r.json()['name']} (role: {r.json()['role']}).")

    print("\n========================================")
    print("     ALL 9 AUTH API TESTS PASSED!       ")
    print("========================================")

if __name__ == "__main__":
    test_auth_pipeline()
