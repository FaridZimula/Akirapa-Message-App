let currentUser = null;
let selectedRegRole = 'FAMILY_MEMBER';

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    
    // Check for saved credentials (for auto-login)
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
        document.getElementById('loginEmail').value = savedEmail;
        document.getElementById('rememberMe').checked = true;
    }
});

async function checkSession() {
    try {
        const session = await window.initSupabase();
        const user = window.getCurrentUser();
        
        if (session && user) {
            currentUser = user;
            showAppScreen();
        } else {
            showAuthScreen();
        }
    } catch (err) {
        console.error('Session check failed:', err);
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById('authContainer').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    
    // Auto-fill saved email
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
        document.getElementById('loginEmail').value = savedEmail;
        document.getElementById('rememberMe').checked = true;
    }
}

function showAppScreen() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    const user = window.getCurrentUser();
    if (!user) return;
    
    const avatar = document.getElementById('currentUserAvatar');
    const name = document.getElementById('currentUserName');
    const badge = document.getElementById('currentUserBadge');
    
    if (avatar) {
        avatar.textContent = (user.user_metadata?.name || user.email || 'U').charAt(0).toUpperCase();
    }
    if (name) {
        name.textContent = user.user_metadata?.name || user.email;
    }
    if (badge) {
        const role = user.user_metadata?.role || 'FAMILY_MEMBER';
        badge.textContent = role.replace('_', ' ');
        badge.className = `role-badge ${role}`;
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
    const rememberMe = document.getElementById('rememberMe').checked;
    const btn = document.getElementById('loginBtnSubmit');
    
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    
    try {
        if (rememberMe) {
            localStorage.setItem('savedEmail', email);
        } else {
            localStorage.removeItem('savedEmail');
        }
        
        const data = await window.signInWithSupabase(email, password);
        currentUser = window.getCurrentUser();
        showAppScreen();
        
        document.getElementById('loginPassword').value = '';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Chat';
        
    } catch (err) {
        alert(err.message || 'Login failed');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Chat';
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
        if (code !== '123456') {
            throw new Error('Invalid verification code');
        }
        
        const data = await window.signUpWithSupabase(email, password, {
            name,
            phoneNumber,
            role: selectedRegRole
        });
        
        // Auto-login after registration
        const loginData = await window.signInWithSupabase(email, password);
        currentUser = window.getCurrentUser();
        showAppScreen();
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
        
    } catch (err) {
        alert(err.message || 'Registration failed');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
    }
}

async function handleLogout() {
    try {
        await window.signOutWithSupabase();
        currentUser = null;
        localStorage.removeItem('savedEmail');
        showAuthScreen();
    } catch (err) {
        console.error('Logout error:', err);
        alert('Logout failed');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = newTheme === 'light' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    }
    localStorage.setItem('theme', newTheme);
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        const icon = document.getElementById('themeIcon');
        if (icon) {
            icon.className = savedTheme === 'light' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
        }
    }
});

window.addEventListener('load', () => {
});

window.addEventListener('online', async () => {
    const session = window.getCurrentSession();
    if (session) {
        try {
            const { data: { session: refreshedSession }, error } = await window.supabaseClient.auth.refreshSession();
            if (error) throw error;
            if (refreshedSession) {
                console.log('Session refreshed after reconnection');
            }
        } catch (err) {
            console.error('Session refresh failed after reconnect:', err);
        }
    }
});

function togglePasswordVisibility(inputId, buttonElement) {
    const input = document.getElementById(inputId);
    const icon = buttonElement.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye';
    }
}