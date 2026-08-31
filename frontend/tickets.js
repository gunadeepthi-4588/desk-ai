// My Tickets Page — Client Logic

const API_BASE = '/api/tickets';

// DOM Elements
const ticketsLoading = document.getElementById('tickets-loading');
const ticketsError = document.getElementById('tickets-error');
const ticketsErrorMessage = document.getElementById('tickets-error-message');
const ticketsEmpty = document.getElementById('tickets-empty');
const ticketsList = document.getElementById('tickets-list');
const ticketCount = document.getElementById('ticket-count');
const statusFilter = document.getElementById('status-filter');
const retryBtn = document.getElementById('retry-btn');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// State
let allTickets = [];
let currentUser = null;

// Utility: format ISO timestamp to readable date
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
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Get status CSS class
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

// Get priority CSS class
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
  ticketsLoading.classList.add('hidden');
  ticketsError.classList.add('hidden');
  ticketsEmpty.classList.add('hidden');
  ticketsList.classList.add('hidden');

  if (state === 'loading') ticketsLoading.classList.remove('hidden');
  else if (state === 'error') ticketsError.classList.remove('hidden');
  else if (state === 'empty') ticketsEmpty.classList.remove('hidden');
  else if (state === 'list') ticketsList.classList.remove('hidden');
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

// Render the ticket list based on current filter
function renderTickets() {
  const filterValue = statusFilter.value;
  const filtered = filterValue === 'All'
    ? allTickets
    : allTickets.filter(t => t.status === filterValue);

  ticketsList.innerHTML = '';

  if (allTickets.length === 0) {
    ticketCount.textContent = '';
    showState('empty');
    return;
  }

  if (filtered.length === 0) {
    ticketCount.textContent = `(0 of ${allTickets.length})`;
    ticketsList.innerHTML = `<div class="filter-empty-message">No tickets with status "${escapeHTML(filterValue)}".</div>`;
    showState('list');
    return;
  }

  ticketCount.textContent = filterValue === 'All'
    ? `(${filtered.length} ticket${filtered.length !== 1 ? 's' : ''})`
    : `(${filtered.length} of ${allTickets.length})`;

  filtered.forEach(ticket => {
    ticketsList.appendChild(createTicketCard(ticket));
  });

  showState('list');
}

// Fetch tickets from the API
async function fetchTickets() {
  showState('loading');
  ticketCount.textContent = '';

  try {
    const fetchUrl = currentUser && currentUser.role === 'admin'
      ? `${API_BASE}`
      : `${API_BASE}?employee_id=${encodeURIComponent(currentUser ? currentUser.id : '')}`;

    let response = await fetch(fetchUrl);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    let data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // If employee has no tickets under their new UUID, also fetch legacy emp_001 demo tickets
    if (data.length === 0 && currentUser && currentUser.role !== 'admin') {
      const fallbackRes = await fetch(`${API_BASE}?employee_id=emp_001`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          data = fallbackData;
        }
      }
    }

    allTickets = data;
    renderTickets();

  } catch (error) {
    console.error('Failed to fetch tickets:', error);
    ticketsErrorMessage.textContent = `Failed to load tickets: ${error.message}`;
    showState('error');
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

// Check session authentication and gate page
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    currentUser = await res.json();
    if (userDisplay) {
      const roleBadge = currentUser.role === 'admin' ? '🛡️ Admin' : '👤';
      userDisplay.textContent = `${roleBadge} ${currentUser.name}`;
    }
    if (currentUser.role === 'admin') {
      const navDash = document.getElementById('nav-dashboard');
      if (navDash) {
        navDash.href = '/admin-dashboard';
        navDash.textContent = '🏠 Admin Dashboard';
      }
      const navMy = document.getElementById('nav-my-tickets');
      if (navMy) {
        navMy.textContent = '🎫 All Tickets';
      }
    }
    fetchTickets();
  } catch (err) {
    console.error('Auth verification failed:', err);
    window.location.href = '/login';
  }
}

// Event Listeners
statusFilter.addEventListener('change', renderTickets);
retryBtn.addEventListener('click', fetchTickets);

// Initial load
checkAuth();

