// ============================================================
// AKIRAPA AUTH - No Auto-Refresh
// ============================================================

let currentUser = null;
let selectedRegRole = 'FAMILY_MEMBER';
let authInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
    if (authInitialized) return;
    authInitialized = true;
    
    await checkSession();
    
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
        const emailInput = document.getElementById('loginEmail');
        if (emailInput) {
            emailInput.value = savedEmail;
            const rememberEl = document.getElementById('rememberMe');
            if (rememberEl) rememberEl.checked = true;
        }
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
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    if (authContainer) authContainer.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
        const emailInput = document.getElementById('loginEmail');
        if (emailInput) {
            emailInput.value = savedEmail;
            document.getElementById('rememberMe').checked = true;
        }
    }
}

function showAppScreen() {
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    if (authContainer) authContainer.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    
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
    
    // Only initialize chat once
    if (window.initChatApp && !window.chatInitialized) {
        window.chatInitialized = true;
        window.initChatApp();
    } else if (window.initChatApp) {
        console.log('Chat already initialized');
    }
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabReg = document.getElementById('tabRegisterBtn');
    
    if (tab === 'login') {
        if (loginForm) loginForm.classList.remove('hidden');
        if (regForm) regForm.classList.add('hidden');
        if (tabLogin) tabLogin.classList.add('active');
        if (tabReg) tabReg.classList.remove('active');
    } else {
        if (loginForm) loginForm.classList.add('hidden');
        if (regForm) regForm.classList.remove('hidden');
        if (tabLogin) tabLogin.classList.remove('active');
        if (tabReg) tabReg.classList.add('active');
    }
}

function selectRegisterRole(role) {
    selectedRegRole = role;
    const optCaregiver = document.getElementById('roleOptCaregiver');
    const optFamily = document.getElementById('roleOptFamily');
    if (role === 'CAREGIVER') {
        if (optCaregiver) optCaregiver.classList.add('selected');
        if (optFamily) optFamily.classList.remove('selected');
    } else {
        if (optCaregiver) optCaregiver.classList.remove('selected');
        if (optFamily) optFamily.classList.add('selected');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const btn = document.getElementById('loginBtnSubmit');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';
    
    try {
        if (rememberMe) {
            localStorage.setItem('savedEmail', email);
        } else {
            localStorage.removeItem('savedEmail');
        }
        
        await window.signInWithSupabase(email, password);
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

async function handleSendOtp() {
    const emailEl = document.getElementById('regEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    const statusMsg = document.getElementById('otpStatusMsg');
    const sendBtn = document.getElementById('sendOtpBtn');

    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address first.');
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    }

    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        
        if (res.ok) {
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.style.color = '#10b981';
                statusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> OTP code generated! <strong>(Code: ${data.devOtp})</strong>`;
            }
            const codeInput = document.getElementById('regCode');
            if (codeInput) {
                codeInput.value = data.devOtp;
            }
        } else {
            alert(data.error || 'Failed to send OTP code.');
        }
    } catch (err) {
        alert('Network error sending OTP code.');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send OTP';
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phoneNumber = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const code = document.getElementById('regCode').value.trim();
    const btn = document.getElementById('regBtnSubmit');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';
    
    try {
        await window.signUpWithSupabase(email, password, {
            name,
            username,
            phoneNumber,
            role: selectedRegRole,
            code
        });
        
        await window.signInWithSupabase(email, password);
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

async function handleGoogleAuth() {
    const loginEmailInput = document.getElementById('loginEmail')?.value.trim();
    const regEmailInput = document.getElementById('regEmail')?.value.trim();
    const savedEmail = localStorage.getItem('savedEmail');

    let targetEmail = loginEmailInput || regEmailInput || savedEmail;

    if (!targetEmail || !targetEmail.includes('@')) {
        targetEmail = 'google.user@gmail.com';
    }

    const namePart = targetEmail.split('@')[0];
    const googleName = namePart.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' (Google)';

    try {
        await window.signInWithGoogle(targetEmail, googleName, selectedRegRole);
        currentUser = window.getCurrentUser();
        showAppScreen();
    } catch (err) {
        alert('Google Authentication failed: ' + (err.message || 'Unknown error'));
    }
}

async function quickLogin(email, password) {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = password;

    try {
        await window.signInWithSupabase(email, password);
        currentUser = window.getCurrentUser();
        showAppScreen();
    } catch (err) {
        alert('Quick Login failed: ' + (err.message || 'Unknown error'));
    }
}
window.quickLogin = quickLogin;

async function handleLogout() {
    try {
        await window.signOutWithSupabase();
        currentUser = null;
        localStorage.removeItem('savedEmail');
        window.chatInitialized = false;
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

// Theme loading - no refresh
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

function togglePasswordVisibility(inputId, buttonElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = buttonElement.querySelector('i');
    if (!icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye';
    }
}