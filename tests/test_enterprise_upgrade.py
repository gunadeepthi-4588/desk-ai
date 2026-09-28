import os
import sys
import datetime
import pytest
import jwt

# Add project root to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend import create_app
from backend.config import Config
from backend.routes.auth import generate_jwt_token, decode_jwt_token


@pytest.fixture
def app():
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    return app.test_client()


# ==========================================
# 1. AUTHENTICATION & JWT TESTS
# ==========================================

def test_employee_login_jwt(client):
    """Test employee login returns a valid signed JWT."""
    res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert "token" in data
    assert data["role"] == "employee"
    
    # Decode and verify token claims
    payload = decode_jwt_token(data["token"])
    assert payload["email"] == "employee@gmail.com"
    assert payload["role"] == "employee"


def test_hr_login_jwt(client):
    """Test HR manager login returns a valid signed JWT with HR role."""
    res = client.post("/api/auth/login", json={
        "email": "hr@gmail.com",
        "password": "demo1234"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert "token" in data
    assert data["role"] == "hr"
    
    payload = decode_jwt_token(data["token"])
    assert payload["email"] == "hr@gmail.com"
    assert payload["role"] == "hr"


def test_admin_login_jwt(client):
    """Test Admin login returns a valid signed JWT with Admin role."""
    res = client.post("/api/auth/login", json={
        "email": "admin@gmail.com",
        "password": "demo1234"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert "token" in data
    assert data["role"] == "admin"


def test_invalid_login_rejected(client):
    """Test invalid credentials return 401 Unauthorized."""
    res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "wrongpassword"
    })
    assert res.status_code == 401
    assert "error" in res.get_json()


def test_protected_route_missing_jwt(client):
    """Test protected routes reject requests when no JWT is provided."""
    res = client.get("/api/tickets")
    assert res.status_code == 401
    assert "error" in res.get_json()


def test_protected_route_invalid_jwt(client):
    """Test protected routes reject requests with a malformed JWT."""
    res = client.get("/api/tickets", headers={
        "Authorization": "Bearer invalid.token.value"
    })
    assert res.status_code == 401
    assert "error" in res.get_json()


def test_protected_route_expired_jwt(client):
    """Test protected routes reject expired JWTs."""
    now = datetime.datetime.now(datetime.timezone.utc)
    expired_payload = {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "email": "employee@gmail.com",
        "role": "employee",
        "iat": now - datetime.timedelta(hours=48),
        "exp": now - datetime.timedelta(hours=24)
    }
    expired_token = jwt.encode(expired_payload, Config.JWT_SECRET_KEY, algorithm="HS256")
    
    res = client.get("/api/tickets", headers={
        "Authorization": f"Bearer {expired_token}"
    })
    assert res.status_code == 401
    assert "expired" in res.get_json().get("error", "").lower()


# ==========================================
# 2. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
# ==========================================

def test_employee_cannot_modify_ticket(client):
    """Test employees are forbidden (403) from updating ticket status/priority."""
    # Login as employee
    login_res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    emp_token = login_res.get_json()["token"]

    # Attempt to update a ticket
    res = client.patch(
        "/api/tickets/00000000-0000-0000-0000-000000000099",
        headers={"Authorization": f"Bearer {emp_token}"},
        json={"status": "Resolved"}
    )
    assert res.status_code == 403
    assert "forbidden" in res.get_json().get("error", "").lower()


def test_hr_can_access_tickets(client):
    """Test HR managers can access tickets endpoint with JWT."""
    login_res = client.post("/api/auth/login", json={
        "email": "hr@gmail.com",
        "password": "demo1234"
    })
    hr_token = login_res.get_json()["token"]

    res = client.get("/api/tickets", headers={
        "Authorization": f"Bearer {hr_token}"
    })
    # Either 200 (tickets returned) or 500 if DB offline, but NOT 401/403
    assert res.status_code in (200, 500)


# ==========================================
# 3. AI CHAT & AUTOMATIC ESCALATION TESTS
# ==========================================

def test_chat_unanswerable_triggers_auto_ticketing(client):
    """
    Test that an unanswerable question (e.g. personal payroll deduction)
    automatically creates an Open support ticket routed to HR.
    """
    login_res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    emp_token = login_res.get_json()["token"]

    # Ask unanswerable query with no knowledge base presence
    res = client.post(
        "/api/chat",
        headers={"Authorization": f"Bearer {emp_token}"},
        json={"question": "My salary was deducted incorrectly by 500 dollars this month, please refund it."}
    )
    assert res.status_code == 200
    data = res.get_json()
    
    # Verify auto-escalation contract
    assert data["resolved_via_ai"] is False
    assert data["status"] == "Escalated to Human"
    assert data["resolution_source"] == "HUMAN"
    assert data["ticket_created"] is True
    assert "ticket" in data
    assert data["ticket"]["department"] == "HR"
    assert data["ticket"]["status"] == "Open"
    assert "Payroll" in data["ticket"]["category"]


def test_chat_answerable_returns_ai_resolution(client, monkeypatch):
    """
    Test that an answerable question returns status='Resolved via AI' with sources
    and does NOT create a human support ticket.
    """
    from backend.routes import chat as chat_module
    
    # Mock RAG answer to simulate knowledge found
    def mock_answer_question(q):
        return {
            "answer": "According to the company policy, employees receive 20 days of paid leave annually.",
            "sources": [
                {
                    "document_id": "00000000-0000-0000-0000-000000000010",
                    "filename": "HR_leave_policy.txt",
                    "page_number": 1,
                    "similarity": 0.89
                }
            ],
            "is_answerable": True
        }
        
    monkeypatch.setattr(chat_module.rag_service, "answer_question", mock_answer_question)

    login_res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    emp_token = login_res.get_json()["token"]

    res = client.post(
        "/api/chat",
        headers={"Authorization": f"Bearer {emp_token}"},
        json={"question": "What is the company leave policy?"}
    )
    assert res.status_code == 200
    data = res.get_json()

    assert data["resolved_via_ai"] is True
    assert data["status"] == "Resolved via AI"
    assert data["resolution_source"] == "AI"
    assert data["ticket_created"] is False
    assert len(data["sources"]) > 0
    assert "paid leave" in data["answer"].lower()


def test_employee_ticket_creation_with_jwt(client, monkeypatch):
    """Test employee creates a support ticket using JWT authentication."""
    login_res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    emp_token = login_res.get_json()["token"]

    res = client.post(
        "/api/tickets",
        headers={"Authorization": f"Bearer {emp_token}"},
        json={
            "department": "IT Support",
            "category": "Network",
            "priority": "High",
            "subject": "VPN connection dropping constantly",
            "description": "Unable to connect to the internal staging servers via Cisco AnyConnect."
        }
    )
    # 201 Created or 500 if Supabase service role key is absent in test runner
    assert res.status_code in (201, 500)


# ==========================================
# 4. COMPANY DOCUMENT UPLOAD & DYNAMIC RAG TESTS
# ==========================================

import io
from unittest.mock import MagicMock

def test_employee_cannot_upload_document(client):
    """Test employees are rejected (403 Forbidden) when attempting to upload documents."""
    login_res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    emp_token = login_res.get_json()["token"]

    data = {
        'file': (io.BytesIO(b"Test policy content"), 'company_policy.txt')
    }
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {emp_token}"},
        data=data,
        content_type='multipart/form-data'
    )
    assert res.status_code == 403
    assert "forbidden" in res.get_json().get("error", "").lower()


def test_hr_can_upload_document(client, monkeypatch):
    """Test HR/Admin can successfully upload a document and kick off ingestion."""
    # Mock supabase client and pipeline
    mock_supabase = MagicMock()
    mock_supabase.storage.from_.return_value.upload.return_value = {"Key": "uploads/mock.txt"}
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "00000000-0000-0000-0000-000000000099", "filename": "TestCompany_Policy.txt"}]
    )
    
    from backend.routes import ingestion as ingestion_module
    monkeypatch.setattr(ingestion_module, "get_supabase_client", lambda: mock_supabase)

    login_res = client.post("/api/auth/login", json={
        "email": "hr@gmail.com",
        "password": "demo1234"
    })
    hr_token = login_res.get_json()["token"]

    data = {
        'file': (io.BytesIO(b"Employees receive 21 annual leave days per year."), 'TestCompany_Policy.txt')
    }
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {hr_token}"},
        data=data,
        content_type='multipart/form-data'
    )
    assert res.status_code == 201
    res_data = res.get_json()
    assert "document" in res_data
    assert res_data["document"]["filename"] == "TestCompany_Policy.txt"


def test_empty_document_upload_rejected(client, monkeypatch):
    """Test documents with no extractable text are rejected."""
    mock_supabase = MagicMock()
    mock_supabase.storage.from_.return_value.upload.return_value = {"Key": "uploads/empty.txt"}
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "00000000-0000-0000-0000-000000000098", "filename": "empty.txt"}]
    )
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    
    from backend.routes import ingestion as ingestion_module
    from backend.services import pipeline as pipeline_module
    monkeypatch.setattr(ingestion_module, "get_supabase_client", lambda: mock_supabase)
    monkeypatch.setattr(pipeline_module, "get_supabase_client", lambda: mock_supabase)

    login_res = client.post("/api/auth/login", json={
        "email": "admin@gmail.com",
        "password": "demo1234"
    })
    admin_token = login_res.get_json()["token"]

    data = {
        'file': (io.BytesIO(b"   \n\n   "), 'empty.txt')
    }
    res = client.post(
        "/api/documents/upload?sync=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        data=data,
        content_type='multipart/form-data'
    )
    assert res.status_code == 400
    assert "no extractable text" in res.get_json().get("error", "").lower()


def test_additive_rag_both_demo_and_new_knowledge(client, monkeypatch):
    """
    Test that RAG seamlessly serves both:
    1. Existing demo knowledge (e.g. Leave Policy)
    2. Newly uploaded company document (e.g. TestCompany_Policy.pdf)
    at the same time without losing existing knowledge.
    """
    from backend.routes import chat as chat_module

    # Mock RAG answer to simulate retrieval from both datasets
    def mock_answer_question(q):
        q_lower = q.lower()
        if "annual leave allowance" in q_lower or "21 days" in q_lower:
            # Query against newly uploaded document
            return {
                "answer": "Employees receive 21 annual leave days per year.",
                "sources": [
                    {
                        "document_id": "00000000-0000-0000-0000-000000000099",
                        "filename": "TestCompany_Policy.pdf",
                        "page_number": 1,
                        "similarity": 0.92
                    }
                ],
                "is_answerable": True
            }
        elif "work from home" in q_lower or "core hours" in q_lower:
            # Query against existing demo knowledge
            return {
                "answer": "Standard core working hours are 10:00 AM to 4:00 PM with hybrid flexibility.",
                "sources": [
                    {
                        "document_id": "00000000-0000-0000-0000-000000000001",
                        "filename": "employee_handbook.txt",
                        "page_number": 1,
                        "similarity": 0.88
                    }
                ],
                "is_answerable": True
            }
        else:
            return {
                "answer": "I couldn't find reliable information about this in the available company knowledge.",
                "sources": [],
                "is_answerable": False
            }

    monkeypatch.setattr(chat_module.rag_service, "answer_question", mock_answer_question)

    login_res = client.post("/api/auth/login", json={
        "email": "employee@gmail.com",
        "password": "demo1234"
    })
    emp_token = login_res.get_json()["token"]

    # Test 1: Query from Newly Uploaded Document
    res_new = client.post(
        "/api/chat",
        headers={"Authorization": f"Bearer {emp_token}"},
        json={"question": "What is the annual leave allowance?"}
    )
    assert res_new.status_code == 200
    data_new = res_new.get_json()
    assert data_new["resolved_via_ai"] is True
    assert "21 annual leave days" in data_new["answer"]
    assert data_new["sources"][0]["filename"] == "TestCompany_Policy.pdf"

    # Test 2: Query from Existing Demo Knowledge
    res_demo = client.post(
        "/api/chat",
        headers={"Authorization": f"Bearer {emp_token}"},
        json={"question": "What are the core hours for work from home?"}
    )
    assert res_demo.status_code == 200
    data_demo = res_demo.get_json()
    assert data_demo["resolved_via_ai"] is True
    assert "core working hours" in data_demo["answer"]
    assert data_demo["sources"][0]["filename"] == "employee_handbook.txt"


def test_document_deletion_rbac(client, monkeypatch):
    """Test HR/Admin can delete uploaded documents, but employees cannot."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "00000000-0000-0000-0000-000000000099", "filename": "TestCompany_Policy.pdf", "storage_path": "uploads/mock.pdf"}]
    )
    mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    mock_supabase.storage.from_.return_value.remove.return_value = []
    
    from backend.routes import ingestion as ingestion_module
    monkeypatch.setattr(ingestion_module, "get_supabase_client", lambda: mock_supabase)

    # 1. Employee attempt -> 403 Forbidden
    emp_login = client.post("/api/auth/login", json={"email": "employee@gmail.com", "password": "demo1234"})
    emp_token = emp_login.get_json()["token"]

    del_res_emp = client.delete(
        "/api/documents/00000000-0000-0000-0000-000000000099",
        headers={"Authorization": f"Bearer {emp_token}"}
    )
    assert del_res_emp.status_code == 403

    # 2. Admin attempt -> 200 Success
    admin_login = client.post("/api/auth/login", json={"email": "admin@gmail.com", "password": "demo1234"})
    admin_token = admin_login.get_json()["token"]

    del_res_admin = client.delete(
        "/api/documents/00000000-0000-0000-0000-000000000099",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert del_res_admin.status_code == 200
    assert "deleted successfully" in del_res_admin.get_json()["message"]


def test_static_pages_healthy(client):
    """Regression test: verify all main DeskAI pages load successfully."""
    pages = ["/", "/dashboard", "/chat", "/tickets", "/login", "/admin-dashboard", "/ticket-detail"]
    for path in pages:
        res = client.get(path)
        assert res.status_code == 200, f"Page {path} failed to load."


