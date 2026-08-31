from flask import Blueprint, request, jsonify, session
from backend.supabase_client import get_supabase_client
from backend.routes.auth import login_required
from postgrest.exceptions import APIError

tickets_bp = Blueprint('tickets', __name__, url_prefix='/api/tickets')

# Allowed enum values
VALID_DEPARTMENTS = {'IT Support', 'Cybersecurity', 'HR', 'Finance', 'Facilities/Admin'}
VALID_PRIORITIES = {'Low', 'Medium', 'High', 'Critical'}
VALID_STATUSES = {'Open', 'Assigned', 'In Progress', 'Waiting for Employee', 'Resolved', 'Closed'}

@tickets_bp.route('', methods=['POST'])
@login_required
def create_ticket():
    """
    POST /api/tickets
    Request body:
        {
            "department": "...",
            "category": "...",
            "priority": "...",
            "subject": "...",
            "description": "..."
        }
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. Body must be a JSON object."}), 400

    required_fields = ['department', 'category', 'priority', 'subject', 'description']
    missing_fields = [field for field in required_fields if field not in data]
    if missing_fields:
        return jsonify({"error": f"Missing required fields: {', '.join(missing_fields)}"}), 400

    # Extract and clean values
    user = session.get('user', {})
    employee_id = str(user.get('id') or data.get('employee_id', '')).strip()
    department = str(data['department']).strip()
    category = str(data['category']).strip()
    priority = str(data['priority']).strip()
    subject = str(data['subject']).strip()
    description = str(data['description']).strip()

    # Validate empty values
    if not employee_id:
        return jsonify({"error": "employee_id cannot be empty."}), 400
    if not department:
        return jsonify({"error": "department cannot be empty."}), 400
    if not category:
        return jsonify({"error": "category cannot be empty."}), 400
    if not priority:
        return jsonify({"error": "priority cannot be empty."}), 400
    if not subject:
        return jsonify({"error": "subject cannot be empty."}), 400
    if not description:
        return jsonify({"error": "description cannot be empty."}), 400

    # Validate enums
    if department not in VALID_DEPARTMENTS:
        return jsonify({"error": f"Invalid department. Must be one of: {', '.join(sorted(VALID_DEPARTMENTS))}"}), 400
    if priority not in VALID_PRIORITIES:
        return jsonify({"error": f"Invalid priority. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}"}), 400

    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Database service is currently unavailable."}), 500

    ticket_data = {
        "employee_id": employee_id,
        "department": department,
        "category": category,
        "priority": priority,
        "subject": subject,
        "description": description,
        "status": "Open" # Enforced default status
    }

    for attempt in range(3):
        try:
            res = client.table('tickets').insert(ticket_data).execute()
            if not res.data:
                return jsonify({"error": "Failed to create ticket in database."}), 500
                
            return jsonify(res.data[0]), 201
            
        except APIError as e:
            return jsonify({"error": f"Database error: {e.message}"}), 400
        except Exception as e:
            if attempt < 2 and ("10035" in str(e) or "socket" in str(e).lower()):
                import time
                time.sleep(0.5)
                continue
            return jsonify({"error": f"Internal server error: {str(e)}"}), 500


def _enrich_tickets_with_user_info(tickets_data, client):
    """Attach employee_name and employee_email to ticket records for display."""
    if not tickets_data:
        return tickets_data
        
    try:
        users_res = client.table('users').select('id, name, email').execute()
        user_map = {u['id']: u for u in (users_res.data or [])}
    except Exception as e:
        print(f"[WARN] Failed to fetch users for ticket enrichment: {e}")
        user_map = {}

    for t in tickets_data:
        emp_id = t.get('employee_id')
        if emp_id in user_map:
            t['employee_name'] = user_map[emp_id].get('name') or 'Unknown Employee'
            t['employee_email'] = user_map[emp_id].get('email') or ''
        elif emp_id == 'emp_001':
            t['employee_name'] = 'Alex Employee (Demo)'
            t['employee_email'] = 'employee@deskai.demo'
        else:
            t['employee_name'] = 'Employee'
            t['employee_email'] = ''
            
    return tickets_data


@tickets_bp.route('', methods=['GET'])
@login_required
def list_tickets():
    """
    GET /api/tickets
    Query Parameters:
        - employee_id (optional)
        - department (optional)
        - status (optional)
    """
    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Database service is currently unavailable."}), 500

    # Read optional query filters
    employee_id = request.args.get('employee_id')
    department = request.args.get('department')
    status = request.args.get('status')

    for attempt in range(3):
        try:
            query = client.table('tickets').select('*')
            if employee_id:
                query = query.eq('employee_id', employee_id.strip())
            if department:
                query = query.eq('department', department.strip())
            if status:
                query = query.eq('status', status.strip())
                
            # Order by created_at desc by default
            res = query.order('created_at', desc=True).execute()
            enriched_data = _enrich_tickets_with_user_info(res.data or [], client)
            return jsonify(enriched_data), 200
            
        except Exception as e:
            if attempt < 2 and ("10035" in str(e) or "socket" in str(e).lower()):
                import time
                time.sleep(0.5)
                continue
            return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@tickets_bp.route('/<id>', methods=['GET'])
@login_required
def get_ticket(id):
    """
    GET /api/tickets/<id>
    """
    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Database service is currently unavailable."}), 500

    try:
        res = client.table('tickets').select('*').eq('id', id).execute()
        if not res.data:
            return jsonify({"error": f"Ticket with ID {id} not found."}), 404
            
        enriched_data = _enrich_tickets_with_user_info(res.data, client)
        return jsonify(enriched_data[0]), 200
        
    except APIError as e:
        # Catch invalid UUID format error
        if "invalid input syntax for type uuid" in e.message.lower() or "22P02" in str(getattr(e, "code", "")):
            return jsonify({"error": f"Invalid ticket ID format: {id}"}), 400
        return jsonify({"error": e.message}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@tickets_bp.route('/<id>', methods=['PATCH'])
@login_required
def update_ticket(id):
    """
    PATCH /api/tickets/<id>
    Request body:
        {
            "status": "...",
            "priority": "..."
        }
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request. Body must be a JSON object."}), 400

    # Restrict fields that can be updated
    allowed_updates = {'status', 'priority'}
    invalid_keys = [k for k in data.keys() if k not in allowed_updates]
    if invalid_keys:
        return jsonify({"error": f"Only status and priority can be modified. Found disallowed fields: {', '.join(invalid_keys)}"}), 400

    if 'status' not in data and 'priority' not in data:
        return jsonify({"error": "Must provide at least one of 'status' or 'priority' to update."}), 400

    update_data = {}
    
    # Validate new status if provided
    if 'status' in data:
        status = str(data['status']).strip()
        if status not in VALID_STATUSES:
            return jsonify({"error": f"Invalid status value. Must be one of: {', '.join(sorted(VALID_STATUSES))}"}), 400
        update_data['status'] = status

    # Validate new priority if provided
    if 'priority' in data:
        priority = str(data['priority']).strip()
        if priority not in VALID_PRIORITIES:
            return jsonify({"error": f"Invalid priority value. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}"}), 400
        update_data['priority'] = priority

    client = get_supabase_client()
    if not client:
        return jsonify({"error": "Database service is currently unavailable."}), 500

    try:
        # Check if ticket exists first
        check_res = client.table('tickets').select('id').eq('id', id).execute()
        if not check_res.data:
            return jsonify({"error": f"Ticket with ID {id} not found."}), 404

        res = client.table('tickets').update(update_data).eq('id', id).execute()
        enriched_data = _enrich_tickets_with_user_info(res.data, client)
        return jsonify(enriched_data[0]), 200
        
    except APIError as e:
        if "invalid input syntax for type uuid" in e.message.lower() or "22P02" in str(getattr(e, "code", "")):
            return jsonify({"error": f"Invalid ticket ID format: {id}"}), 400
        return jsonify({"error": e.message}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
