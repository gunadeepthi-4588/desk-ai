import sys
import os
import requests
import json

BASE_URL = 'http://localhost:5000/api/tickets'

def print_section(title):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)

def main():
    print("Starting Ticket API CRUD verification tests...")
    
    # 1. Create 3 tickets with different departments/priorities
    print_section("1. Creating 3 valid tickets")
    
    ticket_a = {
        "employee_id": "emp_001",
        "department": "IT Support",
        "category": "Hardware",
        "priority": "High",
        "subject": "Broken Screen",
        "description": "My laptop screen has horizontal green lines."
    }
    
    ticket_b = {
        "employee_id": "emp_001",
        "department": "HR",
        "category": "Leave",
        "priority": "Medium",
        "subject": "Annual Leave Balance",
        "description": "Accrued annual leave days do not match HR system."
    }
    
    ticket_c = {
        "employee_id": "emp_002",
        "department": "Finance",
        "category": "Expenses",
        "priority": "Low",
        "subject": "Receipt submission issue",
        "description": "Expense portal does not accept PNG image receipts."
    }
    
    created_tickets = []
    for i, t in enumerate([ticket_a, ticket_b, ticket_c], 1):
        print(f"\n[POST] Creating Ticket {i}...")
        res = requests.post(BASE_URL, json=t)
        print(f"Response Status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        if res.status_code == 201:
            created_tickets.append(res.json())
            
    if len(created_tickets) < 3:
        print("\n[ERROR] Failed to create 3 test tickets. Aborting further tests.")
        return
        
    ticket_a_id = created_tickets[0]['id']
    
    # 2. List all tickets
    print_section("2. Listing All Tickets")
    res = requests.get(BASE_URL)
    print(f"Response Status: {res.status_code}")
    tickets = res.json()
    print(f"Total Tickets Found: {len(tickets)}")
    
    # 3. Filter by department
    print_section("3. Filtering by Department (IT Support)")
    res = requests.get(f"{BASE_URL}?department=IT Support")
    print(f"Response Status: {res.status_code}")
    tickets = res.json()
    print(f"Tickets Found: {len(tickets)}")
    for t in tickets:
        print(f" - ID: {t['id']} | Dept: {t['department']} | Subject: {t['subject']}")
        
    # 4. Filter by status
    print_section("4. Filtering by Status (Open)")
    res = requests.get(f"{BASE_URL}?status=Open")
    print(f"Response Status: {res.status_code}")
    tickets = res.json()
    print(f"Tickets Found: {len(tickets)}")
    for t in tickets:
        print(f" - ID: {t['id']} | Status: {t['status']} | Subject: {t['subject']}")
    
    # 5. Fetch Ticket A by ID
    print_section(f"5. Fetching Ticket A by ID: {ticket_a_id}")
    res = requests.get(f"{BASE_URL}/{ticket_a_id}")
    print(f"Response Status: {res.status_code}")
    print(json.dumps(res.json(), indent=2))
    
    # 6. Update status of Ticket A using PATCH
    print_section(f"6. Updating Ticket A Status to 'In Progress'")
    patch_data = {"status": "In Progress"}
    res = requests.patch(f"{BASE_URL}/{ticket_a_id}", json=patch_data)
    print(f"Response Status: {res.status_code}")
    print(json.dumps(res.json(), indent=2))
    
    # 7. Invalid create (missing field 'subject')
    print_section("7. Invalid Create (Missing 'subject' field)")
    invalid_ticket = {
        "employee_id": "emp_001",
        "department": "IT Support",
        "category": "Hardware",
        "priority": "High",
        "description": "No subject provided in this payload."
    }
    res = requests.post(BASE_URL, json=invalid_ticket)
    print(f"Response Status: {res.status_code}")
    print(json.dumps(res.json(), indent=2))
    
    # 8. Invalid PATCH (bad status value 'SuperOpen')
    print_section("8. Invalid PATCH (Bad status value 'SuperOpen')")
    invalid_patch = {"status": "SuperOpen"}
    res = requests.patch(f"{BASE_URL}/{ticket_a_id}", json=invalid_patch)
    print(f"Response Status: {res.status_code}")
    print(json.dumps(res.json(), indent=2))

if __name__ == '__main__':
    main()
