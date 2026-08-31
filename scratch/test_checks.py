import urllib.request, json, http.cookiejar

base = 'http://localhost:5000'

print('=== CHECK 1: TOTAL TICKET COUNT ===')
cookie_jar_admin = http.cookiejar.CookieJar()
opener_admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar_admin))
login_data = json.dumps({'email': 'admin@deskai.demo', 'password': 'demo1234'}).encode('utf-8')
req = urllib.request.Request(base + '/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
resp = opener_admin.open(req)
req_tickets = urllib.request.Request(base + '/api/tickets')
all_tickets = json.loads(opener_admin.open(req_tickets).read().decode('utf-8'))
raw_count = len(all_tickets)
print(f'Unfiltered GET /api/tickets count: {raw_count}')

print('\n=== CHECK 2: FILTER COMBINATION TEST ===')
it_open = [t for t in all_tickets if t['department'] == 'IT Support' and t['status'] == 'Open']
it_all = [t for t in all_tickets if t['department'] == 'IT Support']
open_all = [t for t in all_tickets if t['status'] == 'Open']
print(f'Total "IT Support" tickets: {len(it_all)}')
print(f'Total "Open" tickets: {len(open_all)}')
print(f'Combined "IT Support" AND "Open" tickets: {len(it_open)}')
for t in it_open[:3]:
    print(f'  - [{t["id"][:8]}] {t["subject"]} | Dept: {t["department"]} | Status: {t["status"]} | Employee: {t.get("employee_name")}')

print('\n=== CHECK 3: STATUS UPDATE PERSISTENCE & CROSS-USER REFLECTION ===')
target_ticket = None
for t in all_tickets:
    if t.get('employee_email') == 'employee@deskai.demo' or t.get('employee_id') == '25a0196f-6aad-47da-ac35-f5419f3192df':
        target_ticket = t
        break

if not target_ticket:
    target_ticket = all_tickets[0]

t_id = target_ticket['id']
print(f'Target Ticket ID: {t_id}')
print(f'Target Subject: "{target_ticket["subject"]}"')
print(f'Current Status before update: {target_ticket["status"]}')

# Admin updates status to 'Resolved' and priority to 'Critical'
new_status = 'Resolved' if target_ticket['status'] != 'Resolved' else 'In Progress'
patch_data = json.dumps({'status': new_status, 'priority': 'Critical'}).encode('utf-8')
req_patch = urllib.request.Request(base + f'/api/tickets/{t_id}', data=patch_data, headers={'Content-Type': 'application/json'}, method='PATCH')
patch_res = json.loads(opener_admin.open(req_patch).read().decode('utf-8'))
print(f'Admin updated status via PATCH to: {patch_res["status"]}')

# 3a: Re-fetch ticket detail as admin
req_get = urllib.request.Request(base + f'/api/tickets/{t_id}')
refetched_admin = json.loads(opener_admin.open(req_get).read().decode('utf-8'))
print(f'3a. Re-fetched as Admin (ticket-detail persistence): Status = "{refetched_admin["status"]}", Priority = "{refetched_admin["priority"]}"')

# Admin logout
opener_admin.open(urllib.request.Request(base + '/api/auth/logout', data=b'{}', headers={'Content-Type': 'application/json'}))

# 3b: Log in as employee@deskai.demo
cookie_jar_emp = http.cookiejar.CookieJar()
opener_emp = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar_emp))
emp_login_data = json.dumps({'email': 'employee@deskai.demo', 'password': 'demo1234'}).encode('utf-8')
emp_user = json.loads(opener_emp.open(urllib.request.Request(base + '/api/auth/login', data=emp_login_data, headers={'Content-Type': 'application/json'})).read().decode('utf-8'))
print(f'Employee Logged In: {emp_user["name"]} ({emp_user["email"]})')

# Employee fetches their own tickets
req_emp_tickets = urllib.request.Request(base + f'/api/tickets?employee_id={emp_user["id"]}')
emp_tickets = json.loads(opener_emp.open(req_emp_tickets).read().decode('utf-8'))
emp_ticket_match = next((t for t in emp_tickets if t['id'] == t_id), None)
if emp_ticket_match:
    print(f'3b. Employee My Tickets query: Ticket "{emp_ticket_match["subject"]}" reflects Status = "{emp_ticket_match["status"]}", Priority = "{emp_ticket_match["priority"]}"')
else:
    single_emp_view = json.loads(opener_emp.open(urllib.request.Request(base + f'/api/tickets/{t_id}')).read().decode('utf-8'))
    print(f'3b. Employee single ticket query: Status = "{single_emp_view["status"]}"')
