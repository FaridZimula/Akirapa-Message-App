const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'your-anon-key';

// Configure Supabase with persistent session
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: {
            getItem: (key) => {
                return new Promise((resolve) => {
                    try {
                        const value = localStorage.getItem(key);
                        resolve(value);
                    } catch (err) {
                        resolve(null);
                    }
                });
            },
            setItem: (key, value) => {
                return new Promise((resolve) => {
                    try {
                        localStorage.setItem(key, value);
                        resolve();
                    } catch (err) {
                        resolve();
                    }
                });
            },
            removeItem: (key) => {
                return new Promise((resolve) => {
                    try {
                        localStorage.removeItem(key);
                        resolve();
                    } catch (err) {
                        resolve();
                    }
                });
            }
        }
    }
});

window.supabaseClient = supabase;

// Session management
let currentUser = null;
let currentSession = null;
let refreshInterval = null;

async function initSupabase() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (session) {
            currentSession = session;
            currentUser = session.user;
            
            // Auto-refresh session
            startAutoRefresh();
            
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (profile) {
                currentUser.profile = profile;
            }
            
            // Update online status
            await updateOnlineStatus(true);
            
            return session;
        }
        return null;
    } catch (err) {
        console.error('Supabase init error:', err);
        return null;
    }
}

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
        try {
            const { data: { session }, error } = await supabase.auth.refreshSession();
            if (error) throw error;
            if (session) {
                currentSession = session;
                currentUser = session.user;
            }
        } catch (err) {
            console.error('Session refresh error:', err);
        }
    }, 10 * 60 * 1000); // Refresh every 10 minutes
}

async function updateOnlineStatus(isOnline) {
    if (!currentUser) return;
    try {
        await supabase
            .from('profiles')
            .update({ 
                online_status: isOnline,
                last_seen: new Date().toISOString()
            })
            .eq('id', currentUser.id);
    } catch (err) {
        console.error('Update online status error:', err);
    }
}

async function signUpWithSupabase(email, password, userData) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: userData.name,
                    phone_number: userData.phoneNumber,
                    role: userData.role
                }
            }
        });
        if (error) throw error;
        return data;
    } catch (err) {
        throw err;
    }
}

async function signInWithSupabase(email, password, rememberMe = true) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
            options: {
            }
        });
        if (error) throw error;
        
        currentSession = data.session;
        currentUser = data.user;
        
        // Get profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        if (profile) {
            currentUser.profile = profile;
        }
        
        await updateOnlineStatus(true);
        startAutoRefresh();
        
        return data;
    } catch (err) {
        throw err;
    }
}

async function signOutWithSupabase() {
    try {
        await updateOnlineStatus(false);
        if (refreshInterval) clearInterval(refreshInterval);
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        currentUser = null;
        currentSession = null;
    } catch (err) {
        throw err;
    }
}

function getCurrentUser() {
    return currentUser;
}

function getCurrentSession() {
    return currentSession;
}

// Handle page unload - update online status
window.addEventListener('beforeunload', async () => {
    await updateOnlineStatus(false);
});

// Handle visibility change - update online status
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && currentUser) {
        await updateOnlineStatus(true);
    } else if (document.visibilityState === 'hidden' && currentUser) {
    }
});

window.supabaseClient = supabase;
window.initSupabase = initSupabase;
window.signUpWithSupabase = signUpWithSupabase;
window.signInWithSupabase = signInWithSupabase;
window.signOutWithSupabase = signOutWithSupabase;
window.getCurrentUser = getCurrentUser;
window.getCurrentSession = getCurrentSession;
window.updateOnlineStatus = updateOnlineStatus;