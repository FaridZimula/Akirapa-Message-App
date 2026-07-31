// ============================================================
// SUPABASE & EXPRESS AUTH CLIENT (Dual-Mode Support)
// ============================================================

let currentUser = null;
let currentSession = null;

async function initSupabase() {
  const token = localStorage.getItem('akirapa_session_token');
  const savedUser = localStorage.getItem('akirapa_user');
  
  if (token && savedUser) {
    try {
      const parsedUser = JSON.parse(savedUser);
      currentUser = parsedUser;
      currentSession = { access_token: token };
      return currentSession;
    } catch (e) {
      console.warn('Session parse error:', e);
    }
  }

  const client = getSupabase();
  if (!client) return null;

  try {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      currentSession = session;
      const { data: { user } } = await client.auth.getUser();
      currentUser = user;
      if (user) {
        localStorage.setItem('akirapa_session_token', session.access_token);
        localStorage.setItem('akirapa_user', JSON.stringify(user));
      }
      return session;
    }
    return null;
  } catch (err) {
    console.error('Auth init error:', err);
    return null;
  }
}

async function signUpWithSupabase(email, password, userData) {
  // 1. Try Local Express Server API first
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name: userData.name,
        username: userData.username,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        code: userData.code
      })
    });
    const data = await res.json();
    if (res.ok && data.session) {
      currentSession = data.session;
      currentUser = data.user;
      localStorage.setItem('akirapa_session_token', data.session.access_token);
      localStorage.setItem('akirapa_user', JSON.stringify(data.user));
      return { user: currentUser, session: currentSession };
    } else if (data && data.error) {
      throw new Error(data.error);
    }
  } catch (e) {
    if (e.message && !e.message.toLowerCase().includes('failed to fetch') && !e.message.toLowerCase().includes('networkerror')) {
      throw e;
    }
  }

  // 2. Fallback to Supabase remote project
  const client = getSupabase();
  if (!client) throw new Error('Registration service unavailable');

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: userData.name,
        username: userData.username,
        phone_number: userData.phoneNumber,
        role: userData.role
      }
    }
  });

  if (error) throw new Error(error.message);
  
  currentSession = data.session;
  currentUser = data.user;
  if (currentUser) {
    localStorage.setItem('akirapa_session_token', data.session?.access_token || 'mock_token');
    localStorage.setItem('akirapa_user', JSON.stringify(currentUser));
  }
  return { user: currentUser, session: currentSession };
}

async function signInWithSupabase(email, password) {
  const identifier = email.trim();

  // 1. Try Local Express Server API first (handles seed accounts & local DB)
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier, username: identifier, password })
    });
    const data = await res.json();
    if (res.ok && data.session) {
      currentSession = data.session;
      currentUser = data.user;
      localStorage.setItem('akirapa_session_token', data.session.access_token);
      localStorage.setItem('akirapa_user', JSON.stringify(data.user));
      return { user: currentUser, session: currentSession };
    }
  } catch (e) {
    console.warn('Local auth login error, checking Supabase:', e);
  }

  // 2. Fallback to Supabase remote project
  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: identifier,
        password
      });
      if (!error && data.session) {
        currentSession = data.session;
        currentUser = data.user;
        localStorage.setItem('akirapa_session_token', data.session.access_token);
        localStorage.setItem('akirapa_user', JSON.stringify(data.user));
        return { user: currentUser, session: currentSession };
      }
    } catch (e) {
      console.warn('Supabase remote login error:', e);
    }
  }

  throw new Error('Invalid username/email or password');
}

async function signOutWithSupabase() {
  const token = localStorage.getItem('akirapa_session_token');
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }

  const client = getSupabase();
  if (client) {
    try { await client.auth.signOut(); } catch (e) {}
  }

  currentUser = null;
  currentSession = null;
  localStorage.removeItem('akirapa_session_token');
  localStorage.removeItem('akirapa_user');
  localStorage.removeItem('supabase_session');
}

function getCurrentUser() {
  return currentUser;
}

function getCurrentSession() {
  return currentSession;
}

async function signInWithGoogle(email, name, role) {
  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (!error && data?.url) {
        return { url: data.url };
      }
    } catch (e) {}
  }

  // Fallback for dev environment Google sign-in
  const targetEmail = email || 'google.user@gmail.com';
  const targetName = name || 'Google User';

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, name: targetName, role: role || 'FAMILY_MEMBER' })
    });
    const data = await res.json();
    if (res.ok && data.session) {
      currentSession = data.session;
      currentUser = data.user;
      localStorage.setItem('akirapa_session_token', data.session.access_token);
      localStorage.setItem('akirapa_user', JSON.stringify(data.user));
      return { user: currentUser, session: currentSession };
    }
  } catch (e) {
    console.error('Google dev auth error:', e);
  }

  throw new Error('Google authentication failed');
}

// Attach to window
window.initSupabase = initSupabase;
window.signUpWithSupabase = signUpWithSupabase;
window.signInWithSupabase = signInWithSupabase;
window.signInWithGoogle = signInWithGoogle;
window.signOutWithSupabase = signOutWithSupabase;
window.getCurrentUser = getCurrentUser;
window.getCurrentSession = getCurrentSession;