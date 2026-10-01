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

// HR Alert Element
const hrUpdateAlert = document.getElementById('hr-update-alert');

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

let currentUser = null;
let uploadedDocuments = [];

// Utility: format file size
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Show HR Alert message (used for success and error notifications)
function showHrAlert(message, type = 'success') {
  if (!hrUpdateAlert) return;
  hrUpdateAlert.textContent = message;
  hrUpdateAlert.className = `hr-update-alert ${type}`;
  hrUpdateAlert.classList.remove('hidden');
  if (type === 'success') {
    setTimeout(() => {
      hrUpdateAlert.classList.add('hidden');
    }, 4000);
  }
}

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

// Render uploaded company documents list
function renderUploadedDocuments(docs) {
  if (docsLoading) docsLoading.classList.add('hidden');

  if (!docs || docs.length === 0) {
    if (docsEmpty) docsEmpty.classList.remove('hidden');
    if (docsList) docsList.classList.add('hidden');
    return;
  }

  if (docsEmpty) docsEmpty.classList.add('hidden');
  if (!docsList) return;

  docsList.innerHTML = '';

  docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'uploaded-doc-item';
    item.setAttribute('data-doc-id', doc.id);

    const status = (doc.status || 'completed').toLowerCase();
    let statusPill = '';
    if (status === 'completed' || status === 'indexed') {
      const chunks = doc.chunk_count ? ` • ${doc.chunk_count} chunks` : '';
      statusPill = `<span class="status-badge status-resolved">✓ Indexed${chunks}</span>`;
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
    showHrAlert('Please select a file to upload.', 'error');
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

    showHrAlert(`✓ "${file.name}" processed and indexed into company knowledge base!`, 'success');
    
    // Reset file input
    if (docFileInput) docFileInput.value = '';
    if (dropzoneText) dropzoneText.textContent = 'Click or drag & drop PDF, DOCX, or TXT (Max 10MB)';
    if (docUploadStatus) docUploadStatus.textContent = 'Upload complete.';

    // Refresh documents list
    await fetchUploadedDocuments();

  } catch (err) {
    console.error('Doc upload failed:', err);
    showHrAlert(`Upload failed: ${err.message}`, 'error');
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

    showHrAlert(`✓ Document "${docName}" deleted successfully.`, 'success');
    await fetchUploadedDocuments();

  } catch (err) {
    console.error('Failed to delete document:', err);
    showHrAlert(`Delete failed: ${err.message}`, 'error');
  }
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

// Initialize
checkAuth();
