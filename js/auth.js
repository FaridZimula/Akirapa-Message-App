// Akirapa Standalone Messaging App - Auth & Role Management via Supabase

let currentUser = null;
let selectedRegRole = 'CAREGIVER';

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  checkSession();
  listenToAuthChanges();
});

function listenToAuthChanges() {
  const sb = getSupabase();
  if (!sb) return;

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await loadUserProfile(session.user);
      showAppScreen();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthScreen();
    }
  });
}

async function checkSession() {
  const sb = getSupabase();
  if (!sb) {
    showAuthScreen();
    return;
  }

  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) throw error;

    if (session && session.user) {
      await loadUserProfile(session.user);
      showAppScreen();
    } else {
      showAuthScreen();
    }
  } catch (err) {
    console.error('Failed session check:', err);
    showAuthScreen();
  }
}

async function loadUserProfile(authUser) {
  const sb = getSupabase();
  if (!sb || !authUser) return;

  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !data) {
      // Fallback if profile row is missing
      currentUser = {
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.name || authUser.email.split('@')[0],
        role: authUser.user_metadata?.role || 'CAREGIVER',
        phoneNumber: authUser.user_metadata?.phone_number || ''
      };
    } else {
      currentUser = {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role,
        phoneNumber: data.phone_number,
        avatarUrl: data.avatar_url
      };
    }
  } catch (err) {
    console.error('Error fetching profile:', err);
    currentUser = {
      id: authUser.id,
      email: authUser.email,
      name: authUser.user_metadata?.name || authUser.email.split('@')[0],
      role: authUser.user_metadata?.role || 'CAREGIVER'
    };
  }
}

function showAuthScreen() {
  const authContainer = document.getElementById('authContainer');
  const appContainer = document.getElementById('appContainer');
  if (authContainer) authContainer.classList.remove('hidden');
  if (appContainer) appContainer.classList.add('hidden');
}

function showAppScreen() {
  const authContainer = document.getElementById('authContainer');
  const appContainer = document.getElementById('appContainer');
  if (authContainer) authContainer.classList.add('hidden');
  if (appContainer) appContainer.classList.remove('hidden');

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
    badge.textContent = formatRole(currentUser.role);
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
  const sb = getSupabase();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const roleOverride = document.getElementById('loginRole').value;
  const btn = document.getElementById('loginBtnSubmit');

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  if (!sb || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    alert('Please configure your Supabase URL & Key in js/config.js first!');
    btn.disabled = false;
    btn.textContent = 'Sign In to Chat';
    return;
  }

  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert(`Login failed: ${error.message}`);
      btn.disabled = false;
      btn.textContent = 'Sign In to Chat';
      return;
    }

    await loadUserProfile(data.user);
    if (roleOverride && currentUser) {
      currentUser.role = roleOverride;
    }
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
  const sb = getSupabase();

  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phoneNumber = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const btn = document.getElementById('regBtnSubmit');

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  if (!sb || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    alert('Please configure your Supabase URL & Key in js/config.js first!');
    btn.disabled = false;
    btn.textContent = 'Create Account';
    return;
  }

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          role: selectedRegRole,
          phone_number: phoneNumber
        }
      }
    });

    if (error) {
      alert(`Registration failed: ${error.message}`);
      btn.disabled = false;
      btn.textContent = 'Create Account';
      return;
    }

    // Insert profile directly into profiles table if authenticated immediately
    if (data.user) {
      await sb.from('profiles').upsert({
        id: data.user.id,
        name: name,
        email: email,
        phone_number: phoneNumber,
        role: selectedRegRole
      });

      await loadUserProfile(data.user);
      showAppScreen();
    } else {
      alert('Account created! Please check your email to confirm registration.');
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  } catch (err) {
    console.error('Registration error:', err);
    alert('An unexpected error occurred during account creation.');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleLogout() {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
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
