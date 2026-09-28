import uuid
from flask import Blueprint, request, jsonify, session, g
from backend.services.rag import RAGService
from backend.routes.auth import login_required
from backend.supabase_client import get_supabase_client

chat_bp = Blueprint('chat', __name__, url_prefix='/api/chat')
rag_service = RAGService()

# Department keyword mapping for auto-categorization
DEPT_KEYWORDS = {
    'HR': ['salary', 'payroll', 'leave', 'vacation', 'sick', 'deducted', 'deduction', 'pay', 'bonus', 'onboarding', 'benefit', 'insurance', 'holiday', 'policy', 'manager', 'probation', 'appraisal'],
    'IT Support': ['vpn', 'wifi', 'password', 'network', 'laptop', 'software', 'printer', 'login', 'computer', 'install', 'monitor', 'keyboard', 'access', 'bug', 'crash', 'error'],
    'Cybersecurity': ['phishing', 'security', 'incident', 'breach', 'suspicious', 'malware', 'virus', 'hack', 'ransomware', 'threat', '2fa', 'mfa', 'spam'],
    'Finance': ['expense', 'invoice', 'reimbursement', 'travel', 'budget', 'payment', 'receipt', 'claim', 'cost', 'tax', 'allowance'],
    'Facilities/Admin': ['desk', 'office', 'chair', 'key', 'card', 'badge', 'parking', 'ac', 'building', 'cafeteria', 'maintenance']
}

URGENCY_KEYWORDS = ['urgent', 'asap', 'immediately', 'blocked', 'down', 'emergency', 'critical', 'broken', 'deducted', "can't work", 'cant work', "can't login", 'error']


def classify_issue(question_text: str) -> tuple[str, str, str]:
    """
    Infers the appropriate department, category, and priority from the question.
    Returns: (department, category, priority)
    """
    q = question_text.lower()
    
    # 1. Department Detection
    best_dept = 'HR'
    max_hits = 0
    for dept, keywords in DEPT_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in q)
        if hits > max_hits:
            max_hits = hits
            best_dept = dept
            
    # 2. Category Inference
    category = 'General Support'
    if best_dept == 'HR':
        if any(w in q for w in ['salary', 'payroll', 'deducted', 'deduction', 'pay', 'bonus', 'tax']):
            category = 'Payroll & Compensation'
        elif any(w in q for w in ['leave', 'vacation', 'sick', 'holiday', 'pto']):
            category = 'Leave & Attendance'
        elif any(w in q for w in ['benefit', 'insurance', 'health', 'medical']):
            category = 'Benefits & Perks'
        elif any(w in q for w in ['onboarding', 'join', 'induction']):
            category = 'Onboarding'
        else:
            category = 'HR Policy'
    elif best_dept == 'IT Support':
        if any(w in q for w in ['wifi', 'vpn', 'network', 'internet']):
            category = 'Network & Connectivity'
        elif any(w in q for w in ['password', 'login', 'access', '2fa']):
            category = 'Account & Access'
        elif any(w in q for w in ['laptop', 'monitor', 'keyboard', 'hardware']):
            category = 'Hardware'
        else:
            category = 'Software & Tools'
    elif best_dept == 'Cybersecurity':
        category = 'Security Incident'
    elif best_dept == 'Finance':
        category = 'Expense Reimbursement'
    elif best_dept == 'Facilities/Admin':
        category = 'Office Facilities'

    # 3. Priority Inference
    priority = 'Medium'
    for kw in URGENCY_KEYWORDS:
        if kw in q:
            priority = 'High'
            break

    return best_dept, category, priority


def _create_escalation_ticket(employee_id: str, question: str) -> dict:
    """
    Creates an Open support ticket in the database for unresolved/unanswerable requests.
    """
    department, category, priority = classify_issue(question)
    
    subject = question.strip()
    if len(subject) > 60:
        subject = subject[:57] + '...'

    description = (
        f"Employee Query:\n{question.strip()}\n\n"
        f"Automated Escalation Note: DeskAI knowledge retrieval found insufficient or no reliable "
        f"documentation to resolve this inquiry automatically. Routed to the {department} queue for human resolution."
    )

    ticket_data = {
        "employee_id": employee_id,
        "department": department,
        "category": category,
        "priority": priority,
        "subject": subject,
        "description": description,
        "status": "Open"
    }

    client = get_supabase_client()
    ticket_id = str(uuid.uuid4())
    created_ticket = ticket_data.copy()
    created_ticket["id"] = ticket_id

    if client:
        try:
            res = client.table('tickets').insert(ticket_data).execute()
            if res.data and len(res.data) > 0:
                created_ticket = res.data[0]
                print(f"[INFO] Auto-created escalation ticket #{created_ticket['id']} in queue '{department}'")
        except Exception as e:
            print(f"[WARN] Failed to insert auto-escalation ticket into Supabase: {e}")

    return created_ticket


@chat_bp.route('', methods=['POST'])
@login_required
def chat():
    """
    POST /api/chat
    Workflow:
      1. RAG Retrieval & strict grounding check.
      2. If answerable: returns answer + cited sources + status="Resolved via AI".
      3. If unanswerable: creates an Open support ticket routed to the appropriate HR/Manager queue,
         and returns human escalation details.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. Body must be a JSON object."}), 400

    question = data.get("question")
    if not question or not isinstance(question, str) or not question.strip():
        return jsonify({"error": "Missing or empty 'question' string parameter."}), 400

    question_clean = question.strip()
    user = getattr(g, 'user', None) or session.get('user', {})
    employee_id = str(user.get('id', '00000000-0000-0000-0000-000000000001'))

    try:
        # Run RAG answer pipeline
        rag_result = rag_service.answer_question(question_clean)
        is_error = rag_result.get("is_error", False)
        is_answerable = rag_result.get("is_answerable", False)

        if is_error:
            # CASE C — API / Database service error (do not create an escalation ticket)
            error_message = rag_result.get("answer", "An error occurred while communicating with the AI service.")
            return jsonify({
                "error": error_message,
                "details": rag_result.get("error", "Service unavailable"),
                "resolved_via_ai": False,
                "status": "Service Error",
                "resolution_source": "ERROR",
                "ticket_created": False
            }), 503

        if is_answerable:
            # CASE A — AI CAN ANSWER
            return jsonify({
                "answer": rag_result.get("answer", ""),
                "sources": rag_result.get("sources", []),
                "resolved_via_ai": True,
                "status": "Resolved via AI",
                "resolution_source": "AI",
                "ticket_created": False
            }), 200
        else:
            # CASE B — AI CANNOT ANSWER (Escalate to Human Queue)
            ticket = _create_escalation_ticket(employee_id, question_clean)
            ticket_ref = str(ticket.get('id', ''))[:8]
            queue_name = ticket.get('department', 'HR')
            
            refusal_response = (
                f"I couldn't find reliable information about this in the available company knowledge base.\n\n"
                f"📋 **Human Assistance Required:** I have automatically created support ticket `#{ticket_ref}` "
                f"and assigned it to the **{queue_name}** queue ({ticket.get('category')}). A support representative will follow up with you."
            )

            return jsonify({
                "answer": refusal_response,
                "sources": [],
                "resolved_via_ai": False,
                "status": "Escalated to Human",
                "resolution_source": "HUMAN",
                "ticket_created": True,
                "ticket": ticket
            }), 200

    except Exception as e:
        print(f"[ERROR] Chat route execution failed: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
