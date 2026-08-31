// Login Page — Client Logic

const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginError = document.getElementById('login-error');
const loginErrorMessage = document.getElementById('login-error-message');

const demoEmployeeBtn = document.getElementById('demo-employee-btn');
const demoAdminBtn = document.getElementById('demo-admin-btn');

// Auto-fill demo credentials
if (demoEmployeeBtn) {
  demoEmployeeBtn.addEventListener('click', () => {
    loginEmail.value = 'employee@deskai.demo';
    loginPassword.value = 'demo1234';
    hideError();
    loginPassword.focus();
  });
}

if (demoAdminBtn) {
  demoAdminBtn.addEventListener('click', () => {
    loginEmail.value = 'admin@deskai.demo';
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

    // Success: store user in localStorage for quick display and redirect based on role
    localStorage.setItem('deskai_user', JSON.stringify(data));
    if (data.role === 'admin') {
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
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('deskai_user', JSON.stringify(data));
      if (data.role === 'admin') {
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
