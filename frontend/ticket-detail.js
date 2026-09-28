// Ticket Detail Page — Client Logic

const API_BASE = '/api/tickets';

// DOM Elements
const detailLoading = document.getElementById('detail-loading');
const detailError = document.getElementById('detail-error');
const detailErrorMessage = document.getElementById('detail-error-message');
const detailCard = document.getElementById('detail-card');
const backLink = document.getElementById('back-link');

// Detail field elements
const detailSubject = document.getElementById('detail-subject');
const detailStatus = document.getElementById('detail-status');
const detailEmployee = document.getElementById('detail-employee');
const detailDepartment = document.getElementById('detail-department');
const detailCategory = document.getElementById('detail-category');
const detailPriority = document.getElementById('detail-priority');
const detailId = document.getElementById('detail-id');
const detailCreated = document.getElementById('detail-created');
const detailUpdated = document.getElementById('detail-updated');
const detailDescription = document.getElementById('detail-description');

// Admin Action Elements
const adminActionsCard = document.getElementById('admin-actions-card');
const adminUpdateAlert = document.getElementById('admin-update-alert');
const adminUpdateForm = document.getElementById('admin-update-form');
const adminSelectStatus = document.getElementById('admin-select-status');
const adminSelectPriority = document.getElementById('admin-select-priority');
const adminUpdateBtn = document.getElementById('admin-update-btn');

// User Nav Elements
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');
const navDashboard = document.getElementById('nav-dashboard');
const navMyTickets = document.getElementById('nav-my-tickets');

// State
let currentUser = null;
let currentTicket = null;

// Utility: escape HTML
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Utility: format ISO timestamp to readable date/time
function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) + ' at ' + date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Status CSS Class mapping
function getStatusClass(status) {
  const map = {
    'Open': 'status-open',
    'Assigned': 'status-assigned',
    'In Progress': 'status-in-progress',
    'Waiting for Employee': 'status-waiting',
    'Resolved': 'status-resolved',
    'Closed': 'status-closed'
  };
  return map[status] || 'status-open';
}

// Priority CSS Class mapping
function getPriorityClass(priority) {
  const map = {
    'Low': 'priority-low',
    'Medium': 'priority-medium',
    'High': 'priority-high',
    'Critical': 'priority-critical'
  };
  return map[priority] || 'priority-medium';
}

// Show/hide state containers
function showState(state) {
  detailLoading.classList.add('hidden');
  detailError.classList.add('hidden');
  detailCard.classList.add('hidden');

  if (state === 'loading') detailLoading.classList.remove('hidden');
  else if (state === 'error') detailError.classList.remove('hidden');
  else if (state === 'detail') detailCard.classList.remove('hidden');
}

// Show Admin Alert message
function showAdminAlert(message, type = 'success') {
  if (!adminUpdateAlert) return;
  adminUpdateAlert.textContent = message;
  adminUpdateAlert.className = `admin-update-alert ${type}`;
  adminUpdateAlert.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => {
      adminUpdateAlert.classList.add('hidden');
    }, 4000);
  }
}

// Populate the detail card with ticket data
function renderTicket(ticket) {
  currentTicket = ticket;

  // Subject
  detailSubject.textContent = ticket.subject;

  // Status badge
  detailStatus.textContent = ticket.status;
  detailStatus.className = `status-badge ${getStatusClass(ticket.status)}`;

  // Raised By Employee
  if (detailEmployee) {
    const empName = ticket.employee_name || 'Alex Employee';
    detailEmployee.innerHTML = `👤 ${escapeHTML(empName)}`;
    if (ticket.employee_email) {
      detailEmployee.innerHTML += ` <span style="color:var(--text-secondary);font-size:0.8rem">(${escapeHTML(ticket.employee_email)})</span>`;
    }
  }

  // Metadata
  detailDepartment.textContent = ticket.department;
  detailCategory.textContent = ticket.category;

  // Priority with badge
  detailPriority.innerHTML = '';
  const priBadge = document.createElement('span');
  priBadge.className = `priority-badge ${getPriorityClass(ticket.priority)}`;
  priBadge.textContent = ticket.priority;
  detailPriority.appendChild(priBadge);

  // Ticket ID
  detailId.textContent = ticket.id;

  // Dates
  detailCreated.textContent = formatDateTime(ticket.created_at);
  detailUpdated.textContent = formatDateTime(ticket.updated_at);

  // Description
  detailDescription.textContent = ticket.description;

  // Update page title
  document.title = `${ticket.subject} - DeskAI`;

  // Render Admin Controls if role is admin
  if (currentUser && currentUser.role === 'admin' && adminActionsCard) {
    adminActionsCard.classList.remove('hidden');
    if (adminSelectStatus) adminSelectStatus.value = ticket.status;
    if (adminSelectPriority) adminSelectPriority.value = ticket.priority;
  } else if (adminActionsCard) {
    adminActionsCard.classList.add('hidden');
  }

  showState('detail');
}

// Extract ticket ID from URL query params
function getTicketIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// Auth Token Helper
function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const token = localStorage.getItem('deskai_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Handle Admin Status/Priority Update Submission
async function handleAdminUpdate(e) {
  e.preventDefault();
  if (!currentTicket) return;

  const newStatus = adminSelectStatus.value;
  const newPriority = adminSelectPriority.value;

  adminUpdateBtn.disabled = true;
  adminUpdateBtn.textContent = 'Saving...';
  adminUpdateAlert.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(currentTicket.id)}`, {
      method: 'PATCH',
      headers: getAuthHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        status: newStatus,
        priority: newPriority
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to update ticket.');
    }

    // Update current ticket in place and re-render
    renderTicket(data);
    showAdminAlert(`Ticket successfully updated to "${newStatus}" status and "${newPriority}" priority!`, 'success');

  } catch (err) {
    console.error('Update ticket error:', err);
    showAdminAlert(err.message || 'Error updating ticket.', 'error');
  } finally {
    adminUpdateBtn.disabled = false;
    adminUpdateBtn.textContent = 'Save Changes';
  }
}

// Fetch ticket from the API
async function fetchTicket() {
  const ticketId = getTicketIdFromUrl();

  if (!ticketId) {
    detailErrorMessage.textContent = 'No ticket ID provided. Please select a ticket from My Tickets.';
    showState('error');
    return;
  }

  showState('loading');

  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(ticketId)}`, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server returned status ${response.status}`);
    }

    renderTicket(data);

  } catch (error) {
    console.error('Failed to fetch ticket:', error);
    detailErrorMessage.textContent = error.message || 'Failed to load ticket details.';
    showState('error');
  }
}

// Logout handler
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch (_) {}
    localStorage.removeItem('deskai_token');
    localStorage.removeItem('deskai_user');
    window.location.href = '/login';
  });
}

// Check session / JWT authentication and configure page
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    currentUser = await res.json();

    const role = (currentUser.role || '').toLowerCase();
    const isStaff = (role === 'admin' || role === 'hr' || role === 'manager');

    if (userDisplay) {
      let roleBadge = '👤';
      if (role === 'admin') roleBadge = '🛡️ Admin';
      else if (role === 'hr' || role === 'manager') roleBadge = '👥 HR';
      userDisplay.textContent = `${roleBadge} ${currentUser.name}`;
    }

    // Role-dependent navigation adjustments
    if (isStaff) {
      const isHr = (role === 'hr' || role === 'manager');
      const targetDash = isHr ? '/hr-dashboard' : '/admin-dashboard';
      const dashLabel = isHr ? '🏠 HR Dashboard' : '🏠 Admin Dashboard';
      const backLabel = isHr ? '← Back to HR Dashboard' : '← Back to Admin Dashboard';
      if (backLink) {
        backLink.href = targetDash;
        backLabel && (backLink.textContent = backLabel);
      }
      if (navDashboard) {
        navDashboard.href = targetDash;
        dashLabel && (navDashboard.textContent = dashLabel);
      }
      if (navMyTickets) {
        navMyTickets.textContent = '🎫 All Tickets';
      }
    } else {
      if (backLink) {
        backLink.href = '/tickets';
        backLink.textContent = '← Back to My Tickets';
      }
      if (navDashboard) {
        navDashboard.href = '/';
        navDashboard.textContent = '🏠 Dashboard';
      }
      if (navMyTickets) {
        navMyTickets.textContent = '🎫 My Tickets';
      }
    }

    fetchTicket();

  } catch (err) {
    console.error('Auth verification failed:', err);
    window.location.href = '/login';
  }
}

// Event Listeners
if (adminUpdateForm) {
  adminUpdateForm.addEventListener('submit', handleAdminUpdate);
}

// Initial load
checkAuth();
