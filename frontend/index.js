// Elements
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const errorCloseBtn = document.getElementById('error-close-btn');

// Ticket Modal Elements
const ticketModal = document.getElementById('ticket-modal');
const ticketForm = document.getElementById('ticket-form');
const modalError = document.getElementById('modal-error');
const modalErrorMessage = document.getElementById('modal-error-message');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const submitTicketBtn = document.getElementById('submit-ticket-btn');

// Ticket Form Fields
const ticketDept = document.getElementById('ticket-department');
const ticketCategory = document.getElementById('ticket-category');
const ticketPriority = document.getElementById('ticket-priority');
const ticketSubject = document.getElementById('ticket-subject');
const ticketDescription = document.getElementById('ticket-description');

// User Nav Elements
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

// App State
let isLoading = false;
let currentUser = null;

// API Endpoint (Relative to support same-origin and proxy setups)
const API_URL = '/api/chat';

// HTML Entity Escaper for Security
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Basic Markdown Formatter (Processes escaped strings safely)
function formatMarkdown(text) {
  if (!text) return '';

  // 1. Temporarily extract code blocks so inline formatting doesn't corrupt them
  const codeBlocks = [];
  let processed = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(code.trim());
    return `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length - 1}__`;
  });

  // 2. Temporarily extract inline code
  const inlineCodes = [];
  processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
    inlineCodes.push(code.trim());
    return `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length - 1}__`;
  });

  // 3. Format headers (h3, h2, h1)
  processed = processed
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 4. Format bold text (**text**)
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 5. Format lists (lines starting with - or * followed by space)
  processed = processed.replace(/^\s*[\*\-]\s+(.*$)/gim, '<li>$1</li>');

  // 6. Handle single carriage returns as line breaks
  // Convert standard newlines to <br>, except where we already have block headers or elements
  const lines = processed.split('\n');
  const formattedLines = lines.map(line => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('<li>') || 
      trimmed.startsWith('<h3>') || 
      trimmed.startsWith('<h2>') || 
      trimmed.startsWith('<h1>') ||
      trimmed.startsWith('__CODE_BLOCK_PLACEHOLDER_')
    ) {
      return line;
    }
    return line + '<br>';
  });
  processed = formattedLines.join('\n');

  // 7. Group list items together in <ul> blocks
  processed = processed.replace(/(<li>.*?<\/li>\n?)+/gs, (match) => {
    return `<ul>${match}</ul>`;
  });

  // 8. Restore Code Blocks
  processed = processed.replace(/__CODE_BLOCK_PLACEHOLDER_(\d+)__/g, (match, index) => {
    return `<pre><code>${codeBlocks[index]}</code></pre>`;
  });

  // 9. Restore Inline Code
  processed = processed.replace(/__INLINE_CODE_PLACEHOLDER_(\d+)__/g, (match, index) => {
    return `<code>${inlineCodes[index]}</code>`;
  });

  // 10. Clean up extra line breaks
  processed = processed.replace(/(<br>\s*){2,}/g, '<br>');

  return processed;
}

// Scroll chat viewport to bottom
function scrollToBottom() {
  const viewport = document.querySelector('.chat-viewport');
  viewport.scrollTop = viewport.scrollHeight;
}

// Input Auto-resizing and validation
function handleInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
  
  const hasValue = chatInput.value.trim().length > 0;
  sendBtn.disabled = !hasValue || isLoading;
}

// Show/Hide Inline Error Banners
function showError(msg) {
  errorMessage.textContent = msg;
  errorContainer.classList.remove('hidden');
  scrollToBottom();
}

function hideError() {
  errorContainer.classList.add('hidden');
}

// Display welcome message card or clear it
function appendUserMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message message-user';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = text; // Secure text content
  
  msgDiv.appendChild(contentDiv);
  chatHistory.appendChild(msgDiv);
  scrollToBottom();
}

// Append Loading State Bubble
function appendLoadingBubble() {
  const loaderDiv = document.createElement('div');
  loaderDiv.className = 'message message-ai loading-bubble-container';
  loaderDiv.id = 'ai-loader';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content loading-bubble';
  
  const dotDiv = document.createElement('div');
  dotDiv.className = 'dot-flashing';

  contentDiv.appendChild(dotDiv);
  loaderDiv.appendChild(contentDiv);
  chatHistory.appendChild(loaderDiv);
  scrollToBottom();
}

// Remove Loading Bubble
function removeLoadingBubble() {
  const loader = document.getElementById('ai-loader');
  if (loader) {
    loader.remove();
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

// Append AI Answer Bubble with Markdown and Sources
function appendAIMessage(answer, sources = [], originalQuestion = '', meta = {}) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message message-ai';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  // SECURE STEP: Escape HTML from model, then convert verified formatting patterns
  const escapedText = escapeHTML(answer);
  contentDiv.innerHTML = formatMarkdown(escapedText);
  msgDiv.appendChild(contentDiv);

  // Resolution Status Badge
  if (meta.resolved_via_ai) {
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 4px 10px; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; border-radius: 6px; font-size: 11px; font-weight: 600;';
    statusDiv.innerHTML = '<span>✓</span> Resolved via AI (Verified Knowledge Base)';
    msgDiv.appendChild(statusDiv);
  }

  // Automatic Human Escalation Card
  if (meta.ticket_created && meta.ticket) {
    const escCard = document.createElement('div');
    escCard.style.cssText = 'margin-top: 12px; padding: 12px 14px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px;';
    const ticketRef = (meta.ticket.id || '').substring(0, 8);
    escCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <span style="font-weight: 700; color: #92400E; font-size: 12px;">📋 Automatic Ticket Escalation</span>
        <span style="background: #FEF3C7; color: #B45309; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">Status: ${escapeHTML(meta.ticket.status || 'Open')}</span>
      </div>
      <div style="font-size: 12px; color: #78350F; line-height: 1.5;">
        <div><strong>Assigned Queue:</strong> ${escapeHTML(meta.ticket.department || 'HR')}</div>
        <div><strong>Category:</strong> ${escapeHTML(meta.ticket.category || 'General')}</div>
        <div><strong>Ticket Ref:</strong> <code>#${escapeHTML(ticketRef)}</code></div>
      </div>
      <div style="margin-top: 8px;">
        <a href="/tickets" style="color: #B45309; font-weight: 600; font-size: 11.5px; text-decoration: underline;">View in My Tickets &rarr;</a>
      </div>
    `;
    msgDiv.appendChild(escCard);
  }

  const isRefusal = (!sources || sources.length === 0) && (answer.includes("I couldn't find reliable information") || meta.ticket_created);

  // Render sources filename block (only if sources exist and it's not a refusal response)
  if (sources && sources.length > 0 && !isRefusal) {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'message-sources';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'sources-title';
    titleDiv.textContent = 'Sources';
    sourcesDiv.appendChild(titleDiv);

    const listDiv = document.createElement('div');
    listDiv.className = 'sources-list';

    // Unique file list using Set
    const uniqueFiles = new Set();
    sources.forEach(src => {
      if (src.filename) uniqueFiles.add(src.filename);
    });

    uniqueFiles.forEach(filename => {
      const itemSpan = document.createElement('span');
      itemSpan.className = 'source-item';
      
      const iconSpan = document.createElement('span');
      iconSpan.className = 'source-icon';
      iconSpan.textContent = '📄';
      
      const nameText = document.createTextNode(` ${filename}`);
      
      itemSpan.appendChild(iconSpan);
      itemSpan.appendChild(nameText);
      listDiv.appendChild(itemSpan);
    });

    sourcesDiv.appendChild(listDiv);
    msgDiv.appendChild(sourcesDiv);
  }

  // Render manual Raise a Ticket button only if not already auto-created
  if (isRefusal && !meta.ticket_created) {
    const fallbackDiv = document.createElement('div');
    fallbackDiv.className = 'fallback-cta';

    const textDiv = document.createElement('div');
    textDiv.className = 'fallback-text';
    textDiv.textContent = 'DeskAI could not resolve your query. You can raise a support ticket directly with our team.';
    fallbackDiv.appendChild(textDiv);

    const btn = document.createElement('button');
    btn.className = 'fallback-btn';
    btn.innerHTML = '🎫 Raise a Support Ticket';
    btn.addEventListener('click', () => openTicketModal(originalQuestion));
    fallbackDiv.appendChild(btn);

    msgDiv.appendChild(fallbackDiv);
  } else if (!isRefusal) {
    // Grounded answer: Render small feedback link
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'grounded-feedback';

    const textNode = document.createTextNode('Not helpful? ');
    feedbackDiv.appendChild(textNode);

    const linkBtn = document.createElement('button');
    linkBtn.className = 'feedback-link-btn';
    linkBtn.textContent = 'Raise a ticket';
    linkBtn.addEventListener('click', () => openTicketModal(originalQuestion));
    feedbackDiv.appendChild(linkBtn);

    msgDiv.appendChild(feedbackDiv);
  }

  chatHistory.appendChild(msgDiv);
  scrollToBottom();
}

// Send Chat Message Request to Backend API
async function sendChatMessage(questionText) {
  if (isLoading) return;
  
  isLoading = true;
  hideError();
  chatInput.disabled = true;
  sendBtn.disabled = true;

  // Append user bubble and loader
  appendUserMessage(questionText);
  appendLoadingBubble();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: getAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ question: questionText })
    });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(`Server returned status code ${response.status}`);
    }

    const result = await response.json();
    
    // Remove loading dots and print response
    removeLoadingBubble();
    
    if (result.error) {
      showError(`API Error: ${result.error}`);
    } else {
      appendAIMessage(result.answer, result.sources, questionText, {
        resolved_via_ai: result.resolved_via_ai,
        status: result.status,
        resolution_source: result.resolution_source,
        ticket_created: result.ticket_created,
        ticket: result.ticket
      });
    }

  } catch (error) {
    console.error('Fetch error:', error);
    removeLoadingBubble();
    showError('DeskAI is currently unreachable. Make sure the backend server is running and try again.');
  } finally {
    isLoading = false;
    chatInput.disabled = false;
    chatInput.value = '';
    handleInput();
    chatInput.focus();
  }
}

// Ticket Form Required Fields Client-side Validation
function validateTicketForm() {
  const hasDept = ticketDept.value !== '';
  const hasCategory = ticketCategory.value.trim().length > 0;
  const hasPriority = ticketPriority.value !== '';
  const hasSubject = ticketSubject.value.trim().length > 0;
  const hasDesc = ticketDescription.value.trim().length > 0;

  submitTicketBtn.disabled = !(hasDept && hasCategory && hasPriority && hasSubject && hasDesc);
}

// Auto-suggest hint DOM elements
const deptHint = document.getElementById('dept-hint');
const priorityHint = document.getElementById('priority-hint');

// Keyword-based auto-classification for department and priority
const DEPT_KEYWORDS = {
  'IT Support': ['vpn', 'wifi', 'password', 'network', 'laptop', 'software', 'printer', 'login', 'computer', 'install'],
  'Cybersecurity': ['phishing', 'security', 'incident', 'breach', 'suspicious', 'malware', 'virus', 'hack', 'ransomware', 'threat'],
  'HR': ['leave', 'onboarding', 'remote work', 'policy', 'benefits', 'payroll', 'vacation', 'sick day', 'hiring', 'termination'],
  'Finance': ['expense', 'invoice', 'reimbursement', 'travel', 'budget', 'payment', 'receipt', 'claim', 'cost', 'salary']
};

const URGENCY_KEYWORDS = ['urgent', 'asap', 'immediately', "can't work", 'blocked', 'down', 'emergency', 'critical', 'broken', "can't login", "can't access"];

function classifyQuestion(questionText) {
  const q = questionText.toLowerCase();

  // Department detection: count keyword hits per department, pick highest
  let bestDept = '';
  let bestScore = 0;
  for (const [dept, keywords] of Object.entries(DEPT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDept = dept;
    }
  }
  // Only suggest if at least one keyword matched
  const suggestedDept = bestScore > 0 ? bestDept : '';

  // Priority detection: default Medium, bump to High on urgency signals
  let suggestedPriority = 'Medium';
  for (const kw of URGENCY_KEYWORDS) {
    if (q.includes(kw)) {
      suggestedPriority = 'High';
      break;
    }
  }

  return { suggestedDept, suggestedPriority };
}

// Modal open handler prefilling data from original question
function openTicketModal(originalQuestion) {
  ticketModal.classList.remove('hidden');
  modalError.classList.add('hidden');

  // Classify the question for auto-suggestions
  const questionStr = originalQuestion ? originalQuestion.trim() : '';
  const { suggestedDept, suggestedPriority } = classifyQuestion(questionStr);

  // Set department (auto-suggested or blank)
  ticketDept.value = suggestedDept;
  if (suggestedDept) {
    deptHint.classList.remove('hidden');
  } else {
    deptHint.classList.add('hidden');
  }

  // Set priority (auto-suggested, show hint only if bumped from default)
  ticketPriority.value = suggestedPriority;
  if (suggestedPriority !== 'Medium') {
    priorityHint.classList.remove('hidden');
  } else {
    priorityHint.classList.add('hidden');
  }

  // Category stays blank for the employee to fill
  ticketCategory.value = '';

  // Shorten original question for the subject field
  ticketSubject.value = questionStr.length > 60
    ? questionStr.substring(0, 57) + '...'
    : questionStr;

  // Set description pre-fill text
  ticketDescription.value = questionStr
    ? `Original question: ${questionStr}\n\nNote: DeskAI was unable to resolve this question.`
    : '';

  validateTicketForm();
  // Focus on the first field that still needs manual input
  if (!suggestedDept) {
    ticketDept.focus();
  } else {
    ticketCategory.focus();
  }
}

// Modal close and reset
function closeTicketModal() {
  ticketModal.classList.add('hidden');
  ticketForm.reset();
}

// Submit Support Ticket via API
async function handleTicketSubmit(e) {
  e.preventDefault();

  const dept = ticketDept.value;
  const category = ticketCategory.value.trim();
  const priority = ticketPriority.value;
  const subject = ticketSubject.value.trim();
  const desc = ticketDescription.value.trim();

  if (!dept || !category || !priority || !subject || !desc) {
    return;
  }

  // Set loading state on modal
  submitTicketBtn.disabled = true;
  submitTicketBtn.textContent = 'Submitting...';
  ticketDept.disabled = true;
  ticketCategory.disabled = true;
  ticketPriority.disabled = true;
  ticketSubject.disabled = true;
  ticketDescription.disabled = true;
  modalError.classList.add('hidden');

  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: getAuthHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        department: dept,
        category: category,
        priority: priority,
        subject: subject,
        description: desc
      })
    });

    const result = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      throw new Error(result.error || `Server returned error status ${res.status}`);
    }

    // Success! Hide modal and output success card to conversation
    closeTicketModal();
    appendTicketConfirmation(result);

  } catch (error) {
    console.error('Ticket submit error:', error);
    modalErrorMessage.textContent = `Submission failed: ${error.message}`;
    modalError.classList.remove('hidden');
  } finally {
    submitTicketBtn.textContent = 'Submit Ticket';
    ticketDept.disabled = false;
    ticketCategory.disabled = false;
    ticketPriority.disabled = false;
    ticketSubject.disabled = false;
    ticketDescription.disabled = false;
    validateTicketForm();
  }
}

// Append Ticket Created Confirmation Card in Chat History
function appendTicketConfirmation(ticket) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message message-ai';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const successCard = document.createElement('div');
  successCard.className = 'ticket-success-card';

  const headerDiv = document.createElement('div');
  headerDiv.className = 'ticket-success-header';
  headerDiv.textContent = '🎫 Support Ticket Raised';
  successCard.appendChild(headerDiv);

  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'ticket-success-details';
  detailsDiv.innerHTML = `
    <strong>Ticket ID:</strong> #${escapeHTML(ticket.id)}<br>
    <strong>Department:</strong> ${escapeHTML(ticket.department)}<br>
    <strong>Priority:</strong> ${escapeHTML(ticket.priority)}<br>
    <strong>Subject:</strong> ${escapeHTML(ticket.subject)}<br>
    <strong>Status:</strong> ${escapeHTML(ticket.status)}
  `;
  successCard.appendChild(detailsDiv);

  contentDiv.appendChild(successCard);
  msgDiv.appendChild(contentDiv);
  chatHistory.appendChild(msgDiv);
  scrollToBottom();
}

// Event Listeners
chatInput.addEventListener('input', handleInput);

chatInput.addEventListener('keydown', (e) => {
  // Submit on Enter key without Shift
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
      sendChatMessage(text);
    }
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) {
    sendChatMessage(text);
  }
});

errorCloseBtn.addEventListener('click', hideError);

// Modal listeners
closeModalBtn.addEventListener('click', closeTicketModal);
cancelModalBtn.addEventListener('click', closeTicketModal);
ticketForm.addEventListener('submit', handleTicketSubmit);

// Dynamic validation checks
ticketDept.addEventListener('change', validateTicketForm);
ticketCategory.addEventListener('input', validateTicketForm);
ticketPriority.addEventListener('change', validateTicketForm);
ticketSubject.addEventListener('input', validateTicketForm);
ticketDescription.addEventListener('input', validateTicketForm);

// Handle Quick Prompt Clicks
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('prompt-btn')) {
    const question = e.target.getAttribute('data-question');
    if (question) {
      sendChatMessage(question);
    }
  }
});

// Close modal if clicking overlay background
window.addEventListener('click', (e) => {
  if (e.target === ticketModal) {
    closeTicketModal();
  }
});

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
    if (userDisplay) {
      let roleBadge = '👤';
      if (currentUser.role === 'admin') roleBadge = '🛡️ Admin';
      else if (currentUser.role === 'hr' || currentUser.role === 'manager') roleBadge = '👥 HR';
      userDisplay.textContent = `${roleBadge} ${currentUser.name}`;
    }
    if (currentUser.role === 'admin' || currentUser.role === 'hr' || currentUser.role === 'manager') {
      const navDash = document.getElementById('nav-dashboard');
      if (navDash) {
        navDash.href = '/admin-dashboard';
        navDash.textContent = currentUser.role === 'admin' ? '🏠 Admin Dashboard' : '🏠 HR Dashboard';
      }
      const navMy = document.getElementById('nav-my-tickets');
      if (navMy) {
        navMy.textContent = '🎫 Manage Tickets';
      }
    }
  } catch (err) {
    console.error('Auth verification failed:', err);
    window.location.href = '/login';
  }
}

// Check for ticket mode parameter in URL
function checkTicketMode() {
  const params = new URLSearchParams(window.location.search);
  const isTicketMode = params.get('mode') === 'ticket' || params.get('source') === 'raise';
  const ticketModeBanner = document.getElementById('ticket-mode-banner');
  const closeTicketBannerBtn = document.getElementById('close-ticket-banner');

  if (isTicketMode && ticketModeBanner) {
    ticketModeBanner.classList.remove('hidden');
    if (chatInput) {
      chatInput.placeholder = 'Describe your issue in detail to check policies or raise a ticket...';
    }
  }

  if (closeTicketBannerBtn && ticketModeBanner) {
    closeTicketBannerBtn.addEventListener('click', () => {
      ticketModeBanner.classList.add('hidden');
    });
  }
}

// Initialization
checkAuth();
checkTicketMode();
chatInput.focus();
