// Login Page — Client Logic

const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginError = document.getElementById('login-error');
const loginErrorMessage = document.getElementById('login-error-message');

const demoEmployeeBtn = document.getElementById('demo-employee-btn');
const demoHrBtn = document.getElementById('demo-hr-btn');
const demoAdminBtn = document.getElementById('demo-admin-btn');

// Auto-fill demo credentials
if (demoEmployeeBtn) {
  demoEmployeeBtn.addEventListener('click', () => {
    loginEmail.value = 'employee@gmail.com';
    loginPassword.value = 'demo1234';
    hideError();
    loginPassword.focus();
  });
}

if (demoHrBtn) {
  demoHrBtn.addEventListener('click', () => {
    loginEmail.value = 'hr@gmail.com';
    loginPassword.value = 'demo1234';
    hideError();
    loginPassword.focus();
  });
}

if (demoAdminBtn) {
  demoAdminBtn.addEventListener('click', () => {
    loginEmail.value = 'admin@gmail.com';
    loginPassword.value = 'demo1234';
    hideError();
    loginPassword.focus();
  });
}

function showError(msg) {
  loginErrorMessage.textContent = msg;
  loginError.classList.remove('hidden');
}

function hideError() {
  loginError.classList.add('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  hideError();

  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }

  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = 'Signing in...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed. Please check your credentials.');
    }

    // Success: store JWT token and user profile in localStorage
    if (data.token) {
      localStorage.setItem('deskai_token', data.token);
    }
    const userProfile = data.user || data;
    localStorage.setItem('deskai_user', JSON.stringify(userProfile));

    // Redirect based on role
    const role = (userProfile.role || '').toLowerCase();
    if (role === 'admin' || role === 'hr' || role === 'manager') {
      window.location.href = '/admin-dashboard';
    } else {
      window.location.href = '/';
    }

  } catch (err) {
    console.error('Login error:', err);
    showError(err.message);
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = 'Sign In';
  }
}

loginForm.addEventListener('submit', handleLogin);

// If already logged in, redirect to appropriate home
async function checkExistingSession() {
  const token = localStorage.getItem('deskai_token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch('/api/auth/me', { headers });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('deskai_user', JSON.stringify(data));
      const role = (data.role || '').toLowerCase();
      if (role === 'admin' || role === 'hr' || role === 'manager') {
        window.location.href = '/admin-dashboard';
      } else {
        window.location.href = '/';
      }
    }
  } catch (_) {
    // Ignore network error on login page
  }
}

checkExistingSession();
