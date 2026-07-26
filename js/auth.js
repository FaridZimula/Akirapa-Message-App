// Akirapa Standalone Messaging App - Auth & Role Management

let currentUser = null;
let selectedRegRole = 'CAREGIVER';

document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      showAppScreen();
    } else {
      showAuthScreen();
    }
  } catch (err) {
    console.error('Failed session check:', err);
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('authContainer').classList.remove('hidden');
  document.getElementById('appContainer').classList.add('hidden');
}

function showAppScreen() {
  document.getElementById('authContainer').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');

  const avatar = document.getElementById('currentUserAvatar');
  const name = document.getElementById('currentUserName');
  const badge = document.getElementById('currentUserBadge');

  if (avatar && currentUser) {
    avatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
  }
  if (name && currentUser) {
    name.textContent = currentUser.name;
  }
  if (badge && currentUser) {
    badge.textContent = currentUser.role.replace('_', ' ');
    badge.className = `role-badge ${currentUser.role}`;
  }

  if (window.initChatApp) {
    window.initChatApp();
  }
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  const tabLogin = document.getElementById('tabLoginBtn');
  const tabReg = document.getElementById('tabRegisterBtn');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    regForm.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
  }
}

function selectRegisterRole(role) {
  selectedRegRole = role;
  const optCaregiver = document.getElementById('roleOptCaregiver');
  const optFamily = document.getElementById('roleOptFamily');

  if (role === 'CAREGIVER') {
    optCaregiver.classList.add('selected');
    optFamily.classList.remove('selected');
  } else {
    optCaregiver.classList.remove('selected');
    optFamily.classList.add('selected');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const role = document.getElementById('loginRole').value;
  const btn = document.getElementById('loginBtnSubmit');

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Login failed');
      btn.disabled = false;
      btn.textContent = 'Sign In to Chat';
      return;
    }

    currentUser = data.user;
    showAppScreen();
  } catch (err) {
    console.error('Login error:', err);
    alert('An unexpected error occurred during sign in.');
    btn.disabled = false;
    btn.textContent = 'Sign In to Chat';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phoneNumber = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const code = document.getElementById('regCode').value.trim();
  const btn = document.getElementById('regBtnSubmit');

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password,
        phoneNumber,
        role: selectedRegRole,
        code: code || '123456',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Registration failed');
      btn.disabled = false;
      btn.textContent = 'Create Account';
      return;
    }

    currentUser = data.user;
    showAppScreen();
  } catch (err) {
    console.error('Registration error:', err);
    alert('An unexpected error occurred during account creation.');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  }
  currentUser = null;
  showAuthScreen();
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);

  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = newTheme === 'light' ? 'ri-sun-line' : 'ri-moon-line';
  }
}
