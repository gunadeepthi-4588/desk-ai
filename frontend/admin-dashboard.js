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
const adminUpdateAlert = document.getElementById('admin-update-alert');

// Document Management DOM Elements
const docUploadForm = document.getElementById('doc-upload-form');
const docFileInput = document.getElementById('doc-file-input');
const uploadDropzone = document.getElementById('upload-dropzone');
const dropzoneText = document.getElementById('dropzone-text');
const docUploadBtn = document.getElementById('doc-upload-btn');
const docUploadStatus = document.getElementById('doc-upload-status');
const refreshDocsBtn = document.getElementById('refresh-docs-btn');
const docsLoading = document.getElementById('docs-loading');
const docsEmpty = document.getElementById('docs-empty');
const docsList = document.getElementById('docs-list');

// Global State
let allTickets = [];
let uploadedDocuments = [];
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

// Auth Token Helper
function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const token = localStorage.getItem('deskai_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Fetch all tickets across all employees / HR queue
async function fetchAdminTickets() {
  showState('loading');

  try {
    const res = await fetch(API_BASE, {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (res.status === 403) {
      window.location.href = '/';
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

// Format file size in KB or MB
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Render uploaded documents list
function renderUploadedDocuments(docs) {
  if (!docsList || !docsEmpty || !docsLoading) return;

  docsLoading.classList.add('hidden');

  if (!docs || docs.length === 0) {
    docsEmpty.classList.remove('hidden');
    docsList.classList.add('hidden');
    return;
  }

  docsEmpty.classList.add('hidden');
  docsList.innerHTML = '';

  docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'uploaded-doc-item';
    
    // Status Badge calculation
    let statusPill = '';
    const status = (doc.status || 'pending').toLowerCase();
    if (status === 'completed') {
      statusPill = `<span class="status-badge status-resolved">✓ Ready for AI (${doc.chunk_count || 0} chunks)</span>`;
    } else if (status === 'processing' || status === 'pending') {
      statusPill = `<span class="status-badge status-in-progress">⏳ Processing...</span>`;
    } else {
      statusPill = `<span class="status-badge status-open">❌ Failed</span>`;
    }

    item.innerHTML = `
      <div class="uploaded-doc-info">
        <span class="demo-icon">📄</span>
        <div>
          <div class="doc-name" title="${escapeHTML(doc.filename)}">${escapeHTML(doc.filename)}</div>
          <div class="doc-meta">${formatFileSize(doc.file_size)} • ${formatDate(doc.created_at)}</div>
        </div>
      </div>
      <div class="doc-actions">
        ${statusPill}
        <button type="button" class="btn-delete-doc" data-doc-id="${escapeHTML(doc.id)}" data-doc-name="${escapeHTML(doc.filename)}" title="Delete document from knowledge base">🗑️ Delete</button>
      </div>
    `;

    // Bind delete click
    const deleteBtn = item.querySelector('.btn-delete-doc');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = deleteBtn.getAttribute('data-doc-id');
        const name = deleteBtn.getAttribute('data-doc-name');
        handleDocDelete(id, name);
      });
    }

    docsList.appendChild(item);
  });

  docsList.classList.remove('hidden');
}

// Fetch all uploaded company documents
async function fetchUploadedDocuments() {
  if (docsLoading) docsLoading.classList.remove('hidden');
  if (docsEmpty) docsEmpty.classList.add('hidden');
  if (docsList) docsList.classList.add('hidden');

  try {
    const res = await fetch('/api/documents', {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch documents: ${res.status}`);
    }

    const data = await res.json();
    uploadedDocuments = Array.isArray(data) ? data : [];
    renderUploadedDocuments(uploadedDocuments);

  } catch (err) {
    console.error('Failed to fetch documents:', err);
    if (docsLoading) docsLoading.classList.add('hidden');
    if (docsEmpty) {
      docsEmpty.textContent = `Error loading documents: ${err.message}`;
      docsEmpty.classList.remove('hidden');
    }
  }
}

// Handle Document Upload
async function handleDocUpload(e) {
  if (e) e.preventDefault();
  
  if (!docFileInput || !docFileInput.files || docFileInput.files.length === 0) {
    showAdminAlert('Please select a file to upload.', 'error');
    return;
  }

  const file = docFileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sync', 'true'); // Immediate RAG indexing for instant searchability

  if (docUploadBtn) {
    docUploadBtn.disabled = true;
    docUploadBtn.textContent = '⏳ Processing & Generating Embeddings...';
  }
  if (docUploadStatus) {
    docUploadStatus.textContent = `Uploading "${file.name}"...`;
  }

  try {
    const res = await fetch('/api/documents/upload?sync=true', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || `Upload failed with status ${res.status}`);
    }

    showAdminAlert(`✓ "${file.name}" processed and indexed into company knowledge base!`, 'success');
    
    // Reset file input
    if (docFileInput) docFileInput.value = '';
    if (dropzoneText) dropzoneText.textContent = 'Click or drag & drop PDF, DOCX, or TXT (Max 10MB)';
    if (docUploadStatus) docUploadStatus.textContent = 'Upload complete.';

    // Refresh documents list
    await fetchUploadedDocuments();

  } catch (err) {
    console.error('Doc upload failed:', err);
    showAdminAlert(`Upload failed: ${err.message}`, 'error');
    if (docUploadStatus) docUploadStatus.textContent = `Error: ${err.message}`;
  } finally {
    if (docUploadBtn) {
      docUploadBtn.disabled = false;
      docUploadBtn.textContent = '⬆️ Upload & Process for AI';
    }
  }
}

// Handle Document Deletion
async function handleDocDelete(docId, docName) {
  if (!confirm(`Are you sure you want to delete "${docName}" from the company knowledge base? Its vector embeddings will be removed.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/documents/${docId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || `Delete failed with status ${res.status}`);
    }

    showAdminAlert(`✓ Document "${docName}" deleted successfully.`, 'success');
    await fetchUploadedDocuments();

  } catch (err) {
    console.error('Failed to delete document:', err);
    showAdminAlert(`Delete failed: ${err.message}`, 'error');
  }
}

// Auth Verification and Role Guard
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

    // STRICT ROLE GUARD: Allow Admin and HR/Manager roles
    const role = (currentUser.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'hr' && role !== 'manager') {
      window.location.href = '/';
      return;
    }

    if (userDisplay) {
      const icon = role === 'admin' ? '🛡️' : '👥';
      userDisplay.textContent = `${icon} ${currentUser.name} (${role.toUpperCase()})`;
    }

    // If HR manager, customize page title/header if present
    const headerTitle = document.querySelector('.admin-header h1, .dashboard-title');
    if (headerTitle && (role === 'hr' || role === 'manager')) {
      headerTitle.textContent = 'HR & Admin Ticket Management';
    }

    fetchAdminTickets();
    fetchUploadedDocuments();

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

// Document Upload Listeners
if (docFileInput) {
  docFileInput.addEventListener('change', () => {
    if (docFileInput.files && docFileInput.files.length > 0) {
      const file = docFileInput.files[0];
      if (dropzoneText) dropzoneText.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
      if (docUploadBtn) docUploadBtn.disabled = false;
    }
  });
}

if (docUploadForm) {
  docUploadForm.addEventListener('submit', handleDocUpload);
}

if (refreshDocsBtn) {
  refreshDocsBtn.addEventListener('click', fetchUploadedDocuments);
}

// Drag & drop on dropzone
if (uploadDropzone) {
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadDropzone.classList.remove('dragover');
    });
  });

  uploadDropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      docFileInput.files = e.dataTransfer.files;
      const file = docFileInput.files[0];
      if (dropzoneText) dropzoneText.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
      if (docUploadBtn) docUploadBtn.disabled = false;
    }
  });
}

// Event Listeners for Tickets & Filters
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

