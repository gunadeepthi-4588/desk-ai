// Admin Dashboard — Client Logic

const API_BASE = '/api/tickets';

// DOM Elements
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statOpen = document.getElementById('stat-open');
const statInProgress = document.getElementById('stat-in-progress');
const statResolved = document.getElementById('stat-resolved');

// Department Counts
const countDeptIt = document.getElementById('count-dept-it');
const countDeptCyber = document.getElementById('count-dept-cyber');
const countDeptHr = document.getElementById('count-dept-hr');
const countDeptFin = document.getElementById('count-dept-fin');
const countDeptFac = document.getElementById('count-dept-fac');

// Priority Counts
const countPriCritical = document.getElementById('count-pri-critical');
const countPriHigh = document.getElementById('count-pri-high');
const countPriMedium = document.getElementById('count-pri-medium');
const countPriLow = document.getElementById('count-pri-low');

// Filter Elements
const searchInput = document.getElementById('admin-search-input');
const filterDept = document.getElementById('filter-department');
const filterStatus = document.getElementById('filter-status');
const filterPriority = document.getElementById('filter-priority');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const filteredCountBadge = document.getElementById('filtered-ticket-count');

// State Containers
const adminLoading = document.getElementById('admin-loading');
const adminError = document.getElementById('admin-error');
const adminErrorMessage = document.getElementById('admin-error-message');
const adminRetryBtn = document.getElementById('admin-retry-btn');
const adminEmpty = document.getElementById('admin-empty');
const adminEmptyResetBtn = document.getElementById('admin-empty-reset-btn');
const adminTableContainer = document.getElementById('admin-table-container');
const adminCardsContainer = document.getElementById('admin-cards-container');
const adminTicketsTbody = document.getElementById('admin-tickets-tbody');

// Global State
let allTickets = [];
let currentUser = null;
let lastFiltered = [];
// Utility: format relative date/time
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

// Show Admin Alert message (used for success and error notifications)
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

// Show/Hide States
function showState(state) {
  adminLoading.classList.add('hidden');
  adminError.classList.add('hidden');
  adminEmpty.classList.add('hidden');
  adminTableContainer.classList.add('hidden');

  if (state === 'loading') adminLoading.classList.remove('hidden');
  else if (state === 'error') adminError.classList.remove('hidden');
  else if (state === 'empty') adminEmpty.classList.remove('hidden');
  else if (state === 'table') adminTableContainer.classList.remove('hidden');
}

// Update all aggregate metrics
function updateStats(tickets) {
  const total = tickets.length;
  const openCount = tickets.filter(t => t.status === 'Open').length;
  const inProgressCount = tickets.filter(t => ['In Progress', 'Assigned', 'Waiting for Employee'].includes(t.status)).length;
  const resolvedCount = tickets.filter(t => ['Resolved', 'Closed'].includes(t.status)).length;

  statTotal.textContent = total;
  statOpen.textContent = openCount;
  statInProgress.textContent = inProgressCount;
  statResolved.textContent = resolvedCount;

  // Department counts
  countDeptIt.textContent = tickets.filter(t => t.department === 'IT Support').length;
  countDeptCyber.textContent = tickets.filter(t => t.department === 'Cybersecurity').length;
  countDeptHr.textContent = tickets.filter(t => t.department === 'HR').length;
  countDeptFin.textContent = tickets.filter(t => t.department === 'Finance').length;
  countDeptFac.textContent = tickets.filter(t => t.department === 'Facilities/Admin').length;

  // Priority counts
  countPriCritical.textContent = tickets.filter(t => t.priority === 'Critical').length;
  countPriHigh.textContent = tickets.filter(t => t.priority === 'High').length;
  countPriMedium.textContent = tickets.filter(t => t.priority === 'Medium').length;
  countPriLow.textContent = tickets.filter(t => t.priority === 'Low').length;
}

// Render the filtered table of tickets
function renderFilteredTickets() {
  const searchVal = searchInput.value.trim().toLowerCase();
  const deptVal = filterDept.value;
  const statusVal = filterStatus.value;
  const priVal = filterPriority.value;

  const filtered = allTickets.filter(t => {
    // Search match (subject, id, employee name, employee email)
    if (searchVal) {
      const matchSubject = (t.subject || '').toLowerCase().includes(searchVal);
      const matchId = (t.id || '').toLowerCase().includes(searchVal);
      const matchEmp = (t.employee_name || '').toLowerCase().includes(searchVal);
      const matchEmail = (t.employee_email || '').toLowerCase().includes(searchVal);
      if (!matchSubject && !matchId && !matchEmp && !matchEmail) {
        return false;
      }
    }

    // Department match
    if (deptVal !== 'All' && t.department !== deptVal) {
      return false;
    }

    // Status match
    if (statusVal !== 'All' && t.status !== statusVal) {
      return false;
    }

    // Priority match
    if (priVal !== 'All' && t.priority !== priVal) {
      return false;
    }

    return true;
  });

  filteredCountBadge.textContent = `${filtered.length} of ${allTickets.length} ticket${allTickets.length !== 1 ? 's' : ''}`;
  adminTicketsTbody.innerHTML = '';

  if (filtered.length === 0) {
    showState('empty');
    return;
  }

  filtered.forEach(ticket => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-ticket-id', ticket.id);
    tr.style.cursor = 'pointer';

    const empName = ticket.employee_name || 'Alex Employee';
    const empEmail = ticket.employee_email ? `<div class="admin-employee-email">${escapeHTML(ticket.employee_email)}</div>` : '';

    tr.innerHTML = `
      <td data-label="Subject / ID">
        <div class="admin-ticket-subject">${escapeHTML(ticket.subject)}</div>
        <div class="admin-ticket-id">${escapeHTML(ticket.id)}</div>
      </td>
      <td data-label="Employee">
        <div class="admin-employee-name">👤 ${escapeHTML(empName)}</div>
        ${empEmail}
      </td>
      <td data-label="Department"><span>${escapeHTML(ticket.department)}</span></td>
      <td data-label="Priority"><span class="priority-badge ${getPriorityClass(ticket.priority)}">${escapeHTML(ticket.priority)}</span></td>
      <td data-label="Status"><span class="status-badge ${getStatusClass(ticket.status)}">${escapeHTML(ticket.status)}</span></td>
      <td data-label="Created"><span>${formatDate(ticket.created_at)}</span></td>
      <td data-label="Action"><a href="/ticket-detail?id=${encodeURIComponent(ticket.id)}" class="btn-table-action" title="View & Edit ticket">View & Edit →</a></td>
    `;

    // Clicking row navigates to ticket details
    tr.addEventListener('click', (e) => {
      // Don't duplicate navigation if user clicked the action button directly
      if (e.target.tagName !== 'A') {
        window.location.href = `/ticket-detail?id=${encodeURIComponent(ticket.id)}`;
      }
    });

    adminTicketsTbody.appendChild(tr);
  });

  lastFiltered = filtered;
  updateViewMode(filtered);
}

// Render mobile card layout for admin tickets
function renderMobileCards(tickets) {
  if (!adminCardsContainer) return;
  adminCardsContainer.innerHTML = '';
  if (!tickets || tickets.length === 0) {
    adminCardsContainer.classList.add('hidden');
    return;
  }
  tickets.forEach(ticket => {
    const card = document.createElement('div');
    card.className = 'admin-ticket-card';
    const empName = ticket.employee_name || 'Alex Employee';
    const empEmail = ticket.employee_email ? `<div class="admin-employee-email">${escapeHTML(ticket.employee_email)}</div>` : '';
    card.innerHTML = `
      <div class="admin-ticket-subject">${escapeHTML(ticket.subject)}</div>
      <div class="admin-ticket-id">${escapeHTML(ticket.id)}</div>
      <div class="admin-employee-name">👤 ${escapeHTML(empName)}</div>
      ${empEmail}
      <div class="admin-meta">
        <span class="breakdown-item"><strong>Dept:</strong> ${escapeHTML(ticket.department)}</span>
        <span class="breakdown-item"><strong>Priority:</strong> <span class="priority-badge ${getPriorityClass(ticket.priority)}">${escapeHTML(ticket.priority)}</span></span>
        <span class="breakdown-item"><strong>Status:</strong> <span class="status-badge ${getStatusClass(ticket.status)}">${escapeHTML(ticket.status)}</span></span>
        <span class="breakdown-item"><strong>Created:</strong> ${formatDate(ticket.created_at)}</span>
      </div>
      <a href="/ticket-detail?id=${encodeURIComponent(ticket.id)}" class="btn-table-action" title="View & Edit ticket">View & Edit →</a>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A') {
        window.location.href = `/ticket-detail?id=${encodeURIComponent(ticket.id)}`;
      }
    });
    adminCardsContainer.appendChild(card);
  });
  adminCardsContainer.classList.remove('hidden');
}

// Fetch all tickets across all employees
async function fetchAdminTickets() {
  showState('loading');

  try {
    const res = await fetch(API_BASE);

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }

    allTickets = Array.isArray(data) ? data : [];
    updateStats(allTickets);
    renderFilteredTickets(); // render based on viewport
    // After successful data load, show a refresh success alert
    showAdminAlert('Ticket data refreshed.', 'success');

  } catch (err) {
    console.error('Failed to fetch admin tickets:', err);
    adminErrorMessage.textContent = `Failed to load tickets: ${err.message}`;
    // Show error alert
    showAdminAlert(`Error loading tickets: ${err.message}`, 'error');
    showState('error');
  }
}

// Update view mode based on viewport width
function updateViewMode(tickets) {
  if (window.innerWidth <= 600) {
    // Mobile: hide table, show cards
    adminTableContainer.classList.add('hidden');
    adminCardsContainer.classList.remove('hidden');
    renderMobileCards(tickets);
  } else {
    // Desktop: show table, hide cards
    adminCardsContainer.classList.add('hidden');
    adminTableContainer.classList.remove('hidden');
  }
}


// Reset all filter controls
function resetFilters() {
  searchInput.value = '';
  filterDept.value = 'All';
  filterStatus.value = 'All';
  filterPriority.value = 'All';
  renderFilteredTickets();
}

// Auth Verification and Role Guard
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }

    currentUser = await res.json();

    // STRICT ROLE GUARD: Redirect non-admins to employee dashboard
    if (currentUser.role !== 'admin') {
      window.location.href = '/';
      return;
    }

    if (userDisplay) {
      userDisplay.textContent = `🛡️ ${currentUser.name}`;
    }

    fetchAdminTickets();

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

// Event Listeners
searchInput.addEventListener('input', renderFilteredTickets);
filterDept.addEventListener('change', renderFilteredTickets);
filterStatus.addEventListener('change', renderFilteredTickets);
filterPriority.addEventListener('change', renderFilteredTickets);
resetFiltersBtn.addEventListener('click', resetFilters);
adminEmptyResetBtn.addEventListener('click', resetFilters);
adminRetryBtn.addEventListener('click', fetchAdminTickets);
refreshBtn.addEventListener('click', fetchAdminTickets);
// Update view mode on window resize
window.addEventListener('resize', () => {
  updateViewMode(lastFiltered);
});


// Initial auth check
checkAuth();
