// Employee Dashboard — Client Logic

const API_BASE = '/api/tickets';

// DOM Elements
const userDisplay = document.getElementById('user-display');
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
        <span class="meta-label">Dept:</span>
        <span>${escapeHTML(ticket.department)}</span>
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

  statTotal.textContent = total;
  statOpen.textContent = openCount;
  statInProgress.textContent = inProgressCount;
  statResolved.textContent = resolvedCount;
}

// Render Recent Activity list
function renderRecentTickets(tickets) {
  recentLoading.classList.add('hidden');

  if (tickets.length === 0) {
    recentEmpty.classList.remove('hidden');
    recentList.classList.add('hidden');
    return;
  }

  recentEmpty.classList.add('hidden');
  recentList.classList.remove('hidden');
  recentList.innerHTML = '';

  const recent = tickets.slice(0, 3);
  recent.forEach(ticket => {
    recentList.appendChild(createTicketCard(ticket));
  });
}

// Fetch tickets for current employee
async function loadDashboardData() {
  recentLoading.classList.remove('hidden');
  recentEmpty.classList.add('hidden');
  recentList.classList.add('hidden');

  try {
    const fetchUrl = `${API_BASE}?employee_id=${encodeURIComponent(currentUser.id)}`;
    let response = await fetch(fetchUrl);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    let data = await response.json();

    // If employee has no tickets under new UUID yet, load fallback demo tickets
    if (data.length === 0) {
      const fallbackRes = await fetch(`${API_BASE}?employee_id=emp_001`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          data = fallbackData;
        }
      }
    }

    updateStats(data);
    renderRecentTickets(data);

  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    recentLoading.classList.add('hidden');
    recentEmpty.classList.remove('hidden');
  }
}

// Check session authentication and gate page
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }

    currentUser = await res.json();

    // If admin lands on employee dashboard, redirect to admin dashboard
    if (currentUser.role === 'admin') {
      window.location.href = '/admin-dashboard';
      return;
    }

    // Set greeting and header display
    const firstName = currentUser.name ? currentUser.name.split(' ')[0] : 'there';
    if (greetingTitle) {
      greetingTitle.textContent = `Welcome back, ${firstName} 👋`;
    }

    if (userDisplay) {
      userDisplay.textContent = `👤 ${currentUser.name}`;
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
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    localStorage.removeItem('deskai_user');
    window.location.href = '/login';
  });
}

// Initialize
checkAuth();
