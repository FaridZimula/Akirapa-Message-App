// ============================================================
// AKIRAPA AUTH CLIENT - Synchronous Window Attach (Fail-Safe)
// ============================================================

(function() {
    let currentUser = null;
    let currentSession = null;
    let refreshInterval = null;

    function normalizeUser(user) {
        if (!user) return null;
        const metadata = user.user_metadata || {
            name: user.name || user.email,
            role: user.role || 'FAMILY_MEMBER',
            phone_number: user.phoneNumber || null
        };

        return {
            ...user,
            user_metadata: metadata,
            role: user.role || metadata.role || 'FAMILY_MEMBER',
            email: user.email
        };
    }

    async function initSupabase() {
        try {
            const token = localStorage.getItem('akirapa_session_token');
            if (token) {
                const response = await fetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await response.json();
                if (response.ok && data.user) {
                    currentSession = { access_token: token };
                    currentUser = normalizeUser(data.user);
                    return currentSession;
                }
                localStorage.removeItem('akirapa_session_token');
            }
            return null;
        } catch (err) {
            console.error('Auth init error:', err);
            return null;
        }
    }

    async function signUpWithSupabase(email, password, userData) {
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    name: userData.name,
                    username: userData.username,
                    phoneNumber: userData.phoneNumber,
                    role: userData.role,
                    code: userData.code || '123456'
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Registration failed');

            currentSession = data.session;
            currentUser = normalizeUser(data.user);
            localStorage.setItem('akirapa_session_token', data.session.access_token);
            return { user: currentUser, session: currentSession };
        } catch (err) {
            throw err;
        }
    }

    async function signInWithSupabase(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login failed');

            currentSession = data.session;
            currentUser = normalizeUser(data.user);
            localStorage.setItem('akirapa_session_token', data.session.access_token);
            return { user: currentUser, session: currentSession };
        } catch (err) {
            throw err;
        }
    }

    async function signOutWithSupabase() {
        try {
            if (currentSession?.access_token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${currentSession.access_token}` }
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('akirapa_session_token');
            currentUser = null;
            currentSession = null;
        }
    }

    function getCurrentUser() {
        return currentUser;
    }

    function getCurrentSession() {
        return currentSession;
    }

    async function signInWithGoogle(email, name, role) {
        try {
            const response = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name, role })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Google authentication failed');

            currentSession = data.session;
            currentUser = normalizeUser(data.user);
            localStorage.setItem('akirapa_session_token', data.session.access_token);
            return { user: currentUser, session: currentSession };
        } catch (err) {
            throw err;
        }
    }

    // Attach all functions synchronously to window immediately
    window.initSupabase = initSupabase;
    window.signUpWithSupabase = signUpWithSupabase;
    window.signInWithSupabase = signInWithSupabase;
    window.signInWithGoogle = signInWithGoogle;
    window.signOutWithSupabase = signOutWithSupabase;
    window.getCurrentUser = getCurrentUser;
    window.getCurrentSession = getCurrentSession;

    console.log('✅ Auth client initialized and attached to window');
})();