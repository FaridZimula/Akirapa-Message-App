// ============================================================
// SUPABASE AUTH CLIENT
// ============================================================

let currentUser = null;
let currentSession = null;

async function initSupabase() {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      currentSession = session;
      const { data: { user } } = await client.auth.getUser();
      currentUser = user;
      return session;
    }
    return null;
  } catch (err) {
    console.error('Auth init error:', err);
    return null;
  }
}

async function signUpWithSupabase(email, password, userData) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not initialized');

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
  
  // Wait for profile to be created (trigger handles this)
  await new Promise(r => setTimeout(r, 1000));
  
  currentSession = data.session;
  currentUser = data.user;
  return { user: currentUser, session: currentSession };
}

async function signInWithSupabase(email, password) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw new Error(error.message);

  currentSession = data.session;
  currentUser = data.user;
  return { user: currentUser, session: currentSession };
}

async function signOutWithSupabase() {
  const client = getSupabase();
  if (!client) return;

  await client.auth.signOut();
  currentUser = null;
  currentSession = null;
  localStorage.removeItem('supabase_session');
}

function getCurrentUser() {
  return currentUser;
}

function getCurrentSession() {
  return currentSession;
}

async function signInWithGoogle(email, name, role) {
  // For Google auth, we'll use Supabase's built-in OAuth
  const client = getSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) throw new Error(error.message);
  
  // The user will be redirected to Google
  // After redirect, the session will be available
  return { url: data.url };
}

// Attach to window
window.initSupabase = initSupabase;
window.signUpWithSupabase = signUpWithSupabase;
window.signInWithSupabase = signInWithSupabase;
window.signInWithGoogle = signInWithGoogle;
window.signOutWithSupabase = signOutWithSupabase;
window.getCurrentUser = getCurrentUser;
window.getCurrentSession = getCurrentSession;