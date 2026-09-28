// HR Dashboard — Client Logic

const API_BASE = '/api/tickets';

// DOM Elements
const userDisplay = document.getElementById('user-display');
const roleDisplayPill = document.getElementById('role-display-pill');
const logoutBtn = document.getElementById('logout-btn');
const greetingTitle = document.getElementById('greeting-title');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statOpen = document.getElementById('stat-open');
const statInProgress = document.getElementById('stat-in-progress');
const statResolved = document.getElementById('stat-resolved');

// Recent Activity Elements
const recentLoading = document.getElementById('recent-loading');
const recentEmpty = document.getElementById('recent-empty');
const recentList = document.getElementById('recent-list');

let currentUser = null;

// Utility: format relative time
function formatDate(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Utility: escape HTML
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Status & Priority CSS Classes
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

function getPriorityClass(priority) {
  const map = {
    'Low': 'priority-low',
    'Medium': 'priority-medium',
    'High': 'priority-high',
    'Critical': 'priority-critical'
  };
  return map[priority] || 'priority-medium';
}

// Render a single ticket card
function createTicketCard(ticket) {
  const card = document.createElement('div');
  card.className = 'ticket-card';
  card.setAttribute('data-ticket-id', ticket.id);
  card.style.cursor = 'pointer';

  card.innerHTML = `
    <div class="ticket-card-header">
      <div class="ticket-subject">${escapeHTML(ticket.subject)}</div>
      <span class="status-badge ${getStatusClass(ticket.status)}">${escapeHTML(ticket.status)}</span>
    </div>
    <div class="ticket-meta">
      <div class="meta-item">
        <span class="meta-label">Employee:</span>
        <span>${escapeHTML(ticket.employee_name || ticket.employee_email || 'Employee')}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Priority:</span>
        <span class="priority-badge ${getPriorityClass(ticket.priority)}">${escapeHTML(ticket.priority)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Category:</span>
        <span>${escapeHTML(ticket.category)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Created:</span>
        <span>${formatDate(ticket.created_at)}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => {
    window.location.href = `/ticket-detail?id=${encodeURIComponent(ticket.id)}`;
  });

  return card;
}

// Update stats cards
function updateStats(tickets) {
  const total = tickets.length;
  const openCount = tickets.filter(t => t.status === 'Open').length;
  const inProgressCount = tickets.filter(t => t.status === 'In Progress' || t.status === 'Assigned' || t.status === 'Waiting for Employee').length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

  if (statTotal) statTotal.textContent = total;
  if (statOpen) statOpen.textContent = openCount;
  if (statInProgress) statInProgress.textContent = inProgressCount;
  if (statResolved) statResolved.textContent = resolvedCount;
}

// Render Recent Activity list
function renderRecentTickets(tickets) {
  if (recentLoading) recentLoading.classList.add('hidden');

  if (!tickets || tickets.length === 0) {
    if (recentEmpty) recentEmpty.classList.remove('hidden');
    if (recentList) recentList.classList.add('hidden');
    return;
  }

  if (recentEmpty) recentEmpty.classList.add('hidden');
  if (recentList) {
    recentList.classList.remove('hidden');
    recentList.innerHTML = '';

    const recent = tickets.slice(0, 5);
    recent.forEach(ticket => {
      recentList.appendChild(createTicketCard(ticket));
    });
  }
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

// Fetch tickets for HR
async function loadDashboardData() {
  if (recentLoading) recentLoading.classList.remove('hidden');
  if (recentEmpty) recentEmpty.classList.add('hidden');
  if (recentList) recentList.classList.add('hidden');

  try {
    const fetchUrl = `${API_BASE}?department=HR`;
    let response = await fetch(fetchUrl, {
      headers: getAuthHeaders()
    });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (response.status === 403) {
      window.location.href = '/dashboard';
      return;
    }

    if (!response.ok) {
      // Fallback: try fetching all tickets
      response = await fetch(API_BASE, { headers: getAuthHeaders() });
    }

    if (response.ok) {
      let data = await response.json();
      updateStats(data);
      renderRecentTickets(data);
    } else {
      throw new Error(`Server returned status ${response.status}`);
    }

  } catch (err) {
    console.error('Failed to load HR dashboard data:', err);
    if (recentLoading) recentLoading.classList.add('hidden');
    if (recentEmpty) recentEmpty.classList.remove('hidden');
  }
}

// Check session / JWT authentication and gate page
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

    // STRICT ROLE GUARD: HR ONLY
    if (role !== 'hr' && role !== 'manager') {
      if (role === 'admin') {
        window.location.href = '/admin-dashboard';
      } else {
        window.location.href = '/dashboard';
      }
      return;
    }

    // Set greeting and header display
    const firstName = currentUser.name ? currentUser.name.split(' ')[0] : 'Morgan';
    if (greetingTitle) {
      greetingTitle.textContent = `Welcome, ${firstName} (HR Manager) 👥`;
    }

    if (userDisplay) {
      userDisplay.textContent = `👥 ${currentUser.name} (HR)`;
    }

    if (roleDisplayPill) {
      roleDisplayPill.textContent = `HR Specialist`;
    }

    loadDashboardData();

  } catch (err) {
    console.error('Auth verification failed:', err);
    window.location.href = '/login';
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

// Initialize
checkAuth();
