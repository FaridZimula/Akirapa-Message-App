const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(cors({ 
    origin: true, 
    credentials: true 
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ============================================================
// FILE SYSTEM SETUP
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ============================================================
// INITIAL DATA
// ============================================================

const initialUsers = [
    {
        id: 'user_1',
        name: 'Ava Thompson',
        username: 'ava_caregiver',
        email: 'ava@akirapa.com',
        password: '123456',
        phoneNumber: '+1 604 555 0101',
        role: 'CAREGIVER',
        createdAt: '2026-01-01T10:00:00.000Z'
    },
    {
        id: 'user_4',
        name: 'Andrew Ssemwogerere',
        username: 'andrew',
        email: 'andrew@akirapa.com',
        password: '123456',
        phoneNumber: '+1 604 555 0104',
        role: 'CAREGIVER',
        createdAt: '2026-01-01T11:00:00.000Z'
    },
    {
        id: 'user_2',
        name: 'Mina Patel',
        username: 'mina_family',
        email: 'mina@akirapa.com',
        password: '123456',
        phoneNumber: '+1 604 555 0102',
        role: 'FAMILY_MEMBER',
        createdAt: '2026-01-02T09:30:00.000Z'
    },
    {
        id: 'user_5',
        name: 'Farid Zimula',
        username: 'farid',
        email: 'farid@akirapa.com',
        password: '123456',
        phoneNumber: '+1 604 555 0105',
        role: 'FAMILY_MEMBER',
        createdAt: '2026-01-02T10:30:00.000Z'
    },
    {
        id: 'user_3',
        name: 'Jordan Lee',
        username: 'jordan_admin',
        email: 'jordan@akirapa.com',
        password: '123456',
        phoneNumber: '+1 604 555 0103',
        role: 'ADMIN',
        createdAt: '2026-01-03T08:15:00.000Z'
    },
    {
        id: 'user_6',
        name: 'Stuart Muyanja',
        username: 'stuart',
        email: 'stuart@akirapa.com',
        password: '123456',
        phoneNumber: '+1 604 555 0106',
        role: 'ADMIN',
        createdAt: '2026-01-03T09:15:00.000Z'
    }
];

const otps = new Map();

const initialMessages = [
    {
        id: 1,
        conversationId: 'conv_user_1_user_2',
        senderId: 'user_2',
        senderName: 'Mina Patel',
        senderRole: 'FAMILY_MEMBER',
        recipientId: 'user_1',
        text: 'Hi Ava, I just wanted to confirm the care plan for today.',
        createdAt: '2026-01-05T09:00:00.000Z',
        mediaUrl: null,
        mediaType: null,
        mediaName: null,
        isRead: false
    },
    {
        id: 2,
        conversationId: 'conv_user_1_user_2',
        senderId: 'user_1',
        senderName: 'Ava Thompson',
        senderRole: 'CAREGIVER',
        recipientId: 'user_2',
        text: 'Absolutely — I will be there at 10:30 and will update the medication log.',
        createdAt: '2026-01-05T09:05:00.000Z',
        mediaUrl: null,
        mediaType: null,
        mediaName: null,
        isRead: false
    }
];

// ============================================================
// STATE MANAGEMENT
// ============================================================

const sessions = new Map();
const onlineUsers = new Map();
const userSockets = new Map();
const typingUsers = new Map();
const sseClients = new Map();

let state = loadState();

function loadState() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            console.log('📁 No data file found, creating initial state...');
            const seed = { 
                users: initialUsers, 
                messages: initialMessages, 
                conversations: [
                    { id: 'conv_user_1_user_2', participants: ['user_1', 'user_2'], createdAt: '2026-01-05T09:00:00.000Z' }
                ],
                messageId: 3, 
                auditLogs: [] 
            };
            fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
            return seed;
        }
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(rawData);
        if (parsed.users) {
            initialUsers.forEach((seedUser) => {
                const exists = parsed.users.some(u => 
                    u.id === seedUser.id || 
                    u.email.toLowerCase() === seedUser.email.toLowerCase() || 
                    (u.username && u.username.toLowerCase() === seedUser.username.toLowerCase())
                );
                if (!exists) {
                    parsed.users.push(seedUser);
                }
            });
            parsed.users.forEach((u) => {
                if (!u.username) {
                    if (u.id === 'user_1') u.username = 'ava_caregiver';
                    else if (u.id === 'user_2') u.username = 'mina_family';
                    else if (u.id === 'user_3') u.username = 'jordan_admin';
                    else u.username = u.name.toLowerCase().replace(/\s+/g, '_');
                }
            });
        }
        if (!Array.isArray(parsed.users)) parsed.users = initialUsers;
        if (!Array.isArray(parsed.messages)) parsed.messages = initialMessages;
        if (!Array.isArray(parsed.conversations)) {
            parsed.conversations = [
                { id: 'conv_user_1_user_2', participants: ['user_1', 'user_2'], createdAt: '2026-01-05T09:00:00.000Z' }
            ];
        }
        if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
        if (!parsed.messageId) parsed.messageId = 3;

        if (parsed.sessions && typeof parsed.sessions === 'object') {
            Object.entries(parsed.sessions).forEach(([token, sessData]) => {
                sessions.set(token, sessData);
            });
        }
        return parsed;
    } catch (error) {
        console.error('❌ Could not read persisted data; resetting state.', error.message);
        const reset = { 
            users: initialUsers, 
            messages: initialMessages, 
            conversations: [
                { id: 'conv_user_1_user_2', participants: ['user_1', 'user_2'], createdAt: '2026-01-05T09:00:00.000Z' }
            ],
            messageId: 3, 
            auditLogs: [] 
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(reset, null, 2));
        return reset;
    }
}

function saveState() {
    try {
        const sessionsObj = {};
        for (const [token, sessData] of sessions.entries()) {
            sessionsObj[token] = sessData;
        }
        const dataToSave = { ...state, sessions: sessionsObj };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('❌ Failed to save state:', error.message);
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function createConversationId(userA, userB) {
    return `conv_${[userA, userB].sort().join('_')}`;
}

function createSession(user) {
    const token = `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessions.set(token, { userId: user.id, user });
    saveState();
    return token;
}

function broadcastSseEvent(userId, payload) {
    const clients = sseClients.get(userId);
    if (!clients || clients.size === 0) return;

    const message = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const response of [...clients]) {
        try {
            response.write(message);
        } catch (error) {
            clients.delete(response);
        }
    }

    if (clients.size === 0) {
        sseClients.delete(userId);
    }
}

function getSessionFromRequest(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        const queryToken = req.query.token;
        return queryToken ? sessions.get(queryToken) || null : null;
    }
    return sessions.get(token) || null;
}

function getAuthenticatedUser(req) {
    const session = getSessionFromRequest(req);
    if (!session) return null;
    const user = state.users.find((candidate) => candidate.id === session.userId);
    if (!user) return null;
    return user;
}

function sanitizeUser(user) {
    if (!user) return null;
    const safeUser = { ...user };
    delete safeUser.password;
    return safeUser;
}

function createAuditLog(actorId, action, detail) {
    if (!Array.isArray(state.auditLogs)) {
        state.auditLogs = [];
    }
    const log = {
        id: Date.now(),
        actorId,
        action,
        detail,
        createdAt: new Date().toISOString()
    };
    state.auditLogs.unshift(log);
    return log;
}

function buildConversationList(user) {
    if (!user) return [];
    try {
        const convs = [];
        const seen = new Set();
        const isAdmin = user.role === 'ADMIN';
        const allUsers = Array.isArray(state.users) ? state.users : [];
        const allMessages = Array.isArray(state.messages) ? state.messages : [];
        const allConversations = Array.isArray(state.conversations) ? state.conversations : [];

        allConversations.forEach((conv) => {
            if (!conv || !conv.id) return;
            const isParticipant = conv.participants && Array.isArray(conv.participants) && conv.participants.includes(user.id);
            if (isAdmin || isParticipant) {
                const key = conv.id;
                seen.add(key);
                const otherId = conv.participants ? conv.participants.find((id) => id !== user.id) : null;
                const partner = allUsers.find((candidate) => candidate && candidate.id === otherId);
                const conversationMessages = allMessages
                    .filter((item) => item && item.conversationId === key)
                    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
                const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
                
                let titleName = conv.name;
                if (!titleName && partner) {
                    titleName = partner.name;
                } else if (!titleName && conv.participants && conv.participants.length > 0) {
                    const participantNames = conv.participants
                        .map(pid => allUsers.find(u => u && u.id === pid)?.name)
                        .filter(Boolean);
                    if (participantNames.length > 0) titleName = participantNames.join(' & ');
                }

                convs.push({
                    id: key,
                    name: titleName || 'Care Pod Chat',
                    role: partner ? partner.role : null,
                    status: conv.status || 'active',
                    isParticipant: !!isParticipant,
                    last_message: lastMessage ? (lastMessage.text || lastMessage.mediaName || 'Shared media') : 'No messages yet',
                    last_message_time: lastMessage ? lastMessage.createdAt : conv.createdAt || null,
                    online_status: otherId ? onlineUsers.has(otherId) : false,
                    participants: conv.participants ? conv.participants.map(pid => {
                        const pUser = allUsers.find(u => u && u.id === pid);
                        return pUser ? sanitizeUser(pUser) : { id: pid, name: 'User' };
                    }).filter(Boolean) : []
                });
            }
        });

        allMessages.forEach((message) => {
            if (!message || !message.conversationId) return;
            let otherId = message.senderId === user.id ? message.recipientId : message.senderId;
            if (!otherId && typeof message.conversationId === 'string' && message.conversationId.startsWith('conv_')) {
                const parts = message.conversationId.replace('conv_', '').split('_');
                otherId = parts.find((id) => id !== user.id);
            }
            
            const key = message.conversationId;
            if (!key || seen.has(key)) return;
            
            const parts = (typeof key === 'string' && key.startsWith('conv_')) ? key.replace('conv_', '').split('_') : [];
            const isParticipant = message.senderId === user.id || message.recipientId === user.id || parts.includes(user.id);
            
            if (isAdmin || isParticipant) {
                seen.add(key);
                const partner = allUsers.find((candidate) => candidate && candidate.id === otherId);
                const conversationMessages = allMessages
                    .filter((item) => item && item.conversationId === key)
                    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
                const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
                
                let titleName = partner ? partner.name : 'Care Pod Chat';
                if (parts.length === 2) {
                    const u1 = allUsers.find(u => u && u.id === parts[0]);
                    const u2 = allUsers.find(u => u && u.id === parts[1]);
                    if (u1 && u2) {
                        titleName = `${u1.name} & ${u2.name}`;
                    }
                }

                const existingConvRec = allConversations.find(c => c && c.id === key);
                convs.push({
                    id: key,
                    name: titleName,
                    role: partner ? partner.role : null,
                    status: existingConvRec ? (existingConvRec.status || 'active') : 'active',
                    isParticipant: !!isParticipant,
                    last_message: lastMessage ? (lastMessage.text || lastMessage.mediaName || 'Shared media') : null,
                    last_message_time: lastMessage ? lastMessage.createdAt : null,
                    online_status: otherId ? onlineUsers.has(otherId) : false,
                    participants: partner ? [sanitizeUser(partner)] : []
                });
            }
        });

        return convs.sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0));
    } catch (e) {
        console.error('Error in buildConversationList:', e);
        return [];
    }
}

function verifyAuth(req, res, next) {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    req.profile = { role: user.role };
    next();
}

// ============================================================
// SOCKET.IO SETUP
// ============================================================

const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: (origin, callback) => {
            callback(null, true);
        },
        credentials: true
    },
    transports: ['websocket', 'polling']
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }
    const session = sessions.get(token);
    if (!session) {
        return next(new Error('Invalid token'));
    }
    socket.userId = session.userId;
    socket.user = session.user;
    next();
});

io.on('connection', (socket) => {
    const userId = socket.userId;
    const user = socket.user;
    
    if (!user) {
        console.log('⚠️ Connection attempt without valid user');
        socket.disconnect();
        return;
    }
    
    console.log(`🟢 User connected: ${user.name} (${userId})`);
    
    onlineUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);
    
    io.emit('user_status', { userId, online: true });

    socket.join(`user_${userId}`);

    socket.on('join_conversation', (conversationId) => {
        console.log(`📥 ${user.name} joined conversation: ${conversationId}`);
        socket.join(`conv_${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        console.log(`📤 ${user.name} left conversation: ${conversationId}`);
        socket.leave(`conv_${conversationId}`);
    });

    socket.on('typing_start', ({ conversationId }) => {
        if (!typingUsers.has(conversationId)) {
            typingUsers.set(conversationId, new Set());
        }
        typingUsers.get(conversationId).add(userId);
        socket.to(`conv_${conversationId}`).emit('user_typing', {
            conversationId,
            userId,
            userName: user.name,
            isTyping: true
        });
    });

    socket.on('typing_stop', ({ conversationId }) => {
        if (typingUsers.has(conversationId)) {
            typingUsers.get(conversationId).delete(userId);
            if (typingUsers.get(conversationId).size === 0) {
                typingUsers.delete(conversationId);
            }
        }
        socket.to(`conv_${conversationId}`).emit('user_typing', {
            conversationId,
            userId,
            userName: user.name,
            isTyping: false
        });
    });

    socket.on('disconnect', () => {
        console.log(`🔴 User disconnected: ${user.name} (${userId})`);
        
        typingUsers.forEach((users, convId) => {
            if (users.has(userId)) {
                users.delete(userId);
                if (users.size === 0) {
                    typingUsers.delete(convId);
                }
                io.to(`conv_${convId}`).emit('user_typing', {
                    conversationId: convId,
                    userId,
                    userName: user.name,
                    isTyping: false
                });
            }
        });
        
        onlineUsers.delete(userId);
        userSockets.delete(socket.id);
        io.emit('user_status', { userId, online: false });
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

function broadcastUpdate() {
    const updateData = { type: 'update' };
    io.emit('update', updateData);
}

// ============================================================
// API ROUTES
// ============================================================

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        ok: true, 
        users: state.users.length, 
        messages: state.messages.length,
        onlineUsers: onlineUsers.size,
        sessions: sessions.size
    });
});

// Auth - Get Current User
app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.json({ user: null });
    res.json({ user: sanitizeUser(user) });
});

// Auth - Send OTP to Email
app.post('/api/auth/send-otp', (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email address required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    otps.set(cleanEmail, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000
    });

    console.log(`\n📧 [EMAIL OTP SENT] Target Email: ${cleanEmail} | Random 6-Digit OTP Code: ${code}\n`);
    createAuditLog('system', 'otp_generated', `Generated OTP for ${cleanEmail}`);

    res.json({
        ok: true,
        message: `OTP verification code sent to ${cleanEmail}`,
        devOtp: code
    });
});

// Auth - Google OAuth Authentication
app.post('/api/auth/google', (req, res) => {
    const { email, name, role } = req.body;
    const cleanEmail = (email || 'google.user@akirapa.com').toLowerCase().trim();

    let user = state.users.find((u) => u.email === cleanEmail);
    if (!user) {
        const baseUsername = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        let finalUsername = `${baseUsername}_google`;
        let counter = 1;
        while (state.users.find(u => u.username === finalUsername)) {
            finalUsername = `${baseUsername}_google${counter++}`;
        }

        user = {
            id: `user_${Date.now()}`,
            name: name || 'Google User',
            username: finalUsername,
            email: cleanEmail,
            password: 'google_oauth_protected',
            phoneNumber: '',
            role: role || 'FAMILY_MEMBER',
            createdAt: new Date().toISOString(),
            provider: 'google'
        };
        state.users.push(user);
        saveState();
        createAuditLog(user.id, 'register_google', `Registered via Google OAuth (${cleanEmail})`);
    } else {
        createAuditLog(user.id, 'login_google', `Signed in via Google OAuth (${cleanEmail})`);
    }

    const token = createSession(user);
    res.json({ user: sanitizeUser(user), session: { access_token: token } });
});

// Auth - Register
app.post('/api/auth/register', (req, res) => {
    const { email, password, name, username, phoneNumber, role, code } = req.body;
    
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Name, email, and password required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const otpRecord = otps.get(cleanEmail);

    const isTestEnv = process.env.NODE_ENV === 'test';
    const isTestBypass = isTestEnv && String(code).trim() === '123456';
    const isOtpValid = otpRecord && otpRecord.code === String(code).trim() && Date.now() <= otpRecord.expiresAt;

    if (!isTestBypass && !isOtpValid) {
        return res.status(400).json({ error: 'Invalid or expired 6-digit OTP code. Please click Send OTP to receive a code.' });
    }

    if (otpRecord) {
        otps.delete(cleanEmail);
    }

    const desiredUsername = (username || name.toLowerCase().replace(/\s+/g, '_')).trim();
    
    if (state.users.find((user) => user.email === cleanEmail || (user.username && user.username.toLowerCase() === desiredUsername.toLowerCase()))) {
        return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    const newUser = {
        id: `user_${Date.now()}`,
        name,
        username: desiredUsername,
        email: cleanEmail,
        password,
        phoneNumber: phoneNumber || '',
        role: role || 'FAMILY_MEMBER',
        createdAt: new Date().toISOString()
    };

    state.users.push(newUser);
    saveState();
    createAuditLog(newUser.id, 'register', `Registered ${newUser.username} (${newUser.email})`);
    const token = createSession(newUser);
    res.json({ user: sanitizeUser(newUser), session: { access_token: token } });
});

// Auth - Login
app.post('/api/auth/login', (req, res) => {
    const { email, username, password } = req.body;
    const identifier = (email || username || '').toLowerCase().trim();

    const user = state.users.find((candidate) => 
        (candidate.email.toLowerCase() === identifier || (candidate.username && candidate.username.toLowerCase() === identifier)) && 
        candidate.password === password
    );
    if (!user) {
        return res.status(401).json({ error: 'Invalid username/email or password' });
    }
    const token = createSession(user);
    createAuditLog(user.id, 'login', `Signed in ${user.username || user.email}`);
    res.json({ user: sanitizeUser(user), session: { access_token: token } });
});

// Auth - Logout
app.post('/api/auth/logout', verifyAuth, (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        sessions.delete(token);
        saveState();
    }
    createAuditLog(req.user.id, 'logout', 'Signed out');
    res.json({ success: true });
});

// Messages - Get Conversations
app.get('/api/messages/conversations', verifyAuth, (req, res) => {
    res.json({ conversations: buildConversationList(req.user) });
});

// Messages - SSE Stream
app.get('/api/messages/stream', verifyAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, userId: req.user.id })}\n\n`);

    let clients = sseClients.get(req.user.id);
    if (!clients) {
        clients = new Set();
        sseClients.set(req.user.id, clients);
    }
    clients.add(res);

    const heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch (error) {
            clearInterval(heartbeat);
            clients.delete(res);
            if (clients.size === 0) sseClients.delete(req.user.id);
        }
    }, 15000);

    const cleanup = () => {
        clearInterval(heartbeat);
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(req.user.id);
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('error', cleanup);
});

// Messages - Get Conversation Messages
app.get('/api/messages', verifyAuth, (req, res) => {
    const { conversationId } = req.query;
    if (!conversationId) {
        return res.status(400).json({ error: 'conversationId required' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const conv = Array.isArray(state.conversations) ? state.conversations.find(c => c.id === conversationId) : null;
    let isParticipant = conv && conv.participants && conv.participants.includes(req.user.id);

    if (!isParticipant && conversationId.startsWith('conv_')) {
        const parts = conversationId.replace('conv_', '').split('_');
        isParticipant = parts.includes(req.user.id);
    }

    if (!isAdmin && !isParticipant) {
        return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const conversationMessages = state.messages
        .filter((message) => message.conversationId === conversationId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.json({ messages: conversationMessages });
});

// Messages - Send Message (with file upload & rate limiting)
const userUploadLimits = new Map();

function checkUploadRateLimit(req, res, next) {
    const userId = req.user.id;
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxUploads = 10;

    let userRecord = userUploadLimits.get(userId) || [];
    userRecord = userRecord.filter(timestamp => now - timestamp < windowMs);

    if (userRecord.length >= maxUploads) {
        return res.status(429).json({ error: 'Upload rate limit exceeded. Maximum 10 uploads per minute.' });
    }

    userRecord.push(now);
    userUploadLimits.set(userId, userRecord);
    next();
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const safeOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9_.-]/g, '_');
        const ext = path.extname(safeOriginalName).toLowerCase();
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 
                              'video/mp4', 'video/webm', 'video/quicktime',
                              'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.mp3', '.wav'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type or extension not supported'), false);
        }
    }
});

app.post('/api/messages', verifyAuth, checkUploadRateLimit, upload.single('file'), (req, res) => {
    const { conversationId, text } = req.body;
    const file = req.file;
    
    if (!conversationId) {
        return res.status(400).json({ error: 'conversationId required' });
    }
    if (!text && !file) {
        return res.status(400).json({ error: 'Message or file required' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const conv = Array.isArray(state.conversations) ? state.conversations.find(c => c.id === conversationId) : null;
    let isParticipant = conv && conv.participants && conv.participants.includes(req.user.id);

    if (!isParticipant && conversationId.startsWith('conv_')) {
        const parts = conversationId.replace('conv_', '').split('_');
        isParticipant = parts.includes(req.user.id);
    }

    if (isAdmin && !isParticipant) {
        return res.status(403).json({ error: 'Admins cannot send messages in caregiver-family conversations (View-Only Mode).' });
    }

    if (!isAdmin && !isParticipant) {
        return res.status(403).json({ error: 'Access denied: You are not a participant in this conversation' });
    }

    const currentStatus = conv ? (conv.status || 'active') : 'active';
    if (currentStatus === 'paused') {
        return res.status(403).json({ error: 'This conversation has been paused by an Admin.' });
    } else if (currentStatus === 'ended') {
        return res.status(403).json({ error: 'This conversation has been ended by an Admin.' });
    }

    let mediaUrl = null;
    let mediaType = null;
    let mediaName = null;
    let mimeType = null;
    
    if (file) {
        mimeType = file.mimetype;
        if (mimeType.startsWith('image/')) mediaType = 'image';
        else if (mimeType.startsWith('video/')) mediaType = 'video';
        else if (mimeType.startsWith('audio/')) mediaType = 'audio';
        else mediaType = 'file';
        mediaUrl = `/uploads/${file.filename}`;
        mediaName = file.originalname;
    }

    let recipientId = null;
    if (conversationId.startsWith('conv_')) {
        const parts = conversationId.replace('conv_', '').split('_');
        recipientId = parts.find((id) => id !== req.user.id) || null;
    }

    const newMessage = {
        id: state.messageId++,
        conversationId,
        senderId: req.user.id,
        senderName: req.user.name,
        senderRole: req.user.role,
        recipientId,
        text: text || '',
        createdAt: new Date().toISOString(),
        mediaUrl,
        mediaType,
        mediaName,
        isRead: false
    };
    
    state.messages.push(newMessage);
    saveState();
    createAuditLog(req.user.id, 'message_sent', `Sent message in ${conversationId}`);
    
    // Broadcast via SSE
    broadcastSseEvent(req.user.id, {
        type: 'message',
        conversationId,
        message: newMessage
    });

    // Broadcast via Socket.IO
    io.to(`conv_${conversationId}`).emit('new_message', {
        conversationId,
        message: newMessage,
        senderId: req.user.id,
        senderName: req.user.name,
        senderRole: req.user.role,
        timestamp: new Date().toISOString()
    });
    
    res.json({ message: newMessage });
});

// Users - Get Categorized Contacts Grouped by Role
app.get('/api/users/categorized', verifyAuth, (req, res) => {
    const role = req.user.role;
    const allowedUsers = state.users.filter((candidate) => {
        if (candidate.id === req.user.id) return false;
        
        if (role === 'FAMILY_MEMBER' || role === 'CLIENT') {
            return candidate.role === 'CAREGIVER';
        }
        if (role === 'CAREGIVER') {
            return ['FAMILY_MEMBER', 'CLIENT', 'ADMIN'].includes(candidate.role);
        }
        if (role === 'ADMIN') {
            return true; // Admins can see and text all
        }
        return true;
    }).map((user) => sanitizeUser(user));

    const groups = {
        admins: allowedUsers.filter(u => u.role === 'ADMIN'),
        caregivers: allowedUsers.filter(u => u.role === 'CAREGIVER'),
        familyMembers: allowedUsers.filter(u => u.role === 'FAMILY_MEMBER' || u.role === 'CLIENT')
    };

    res.json({ groups, total: allowedUsers.length });
});

// Users - Search Contacts
app.get('/api/users/search', verifyAuth, (req, res) => {
    const query = (req.query.q || req.query.username || req.query.email || '').toLowerCase().trim();
    if (!query) {
        return res.json({ users: [] });
    }
    
    const matchingUsers = state.users.filter((candidate) => {
        if (candidate.id === req.user.id) return false;
        
        const matchesQuery = (candidate.username && candidate.username.toLowerCase().includes(query)) ||
                             candidate.email.toLowerCase().includes(query) || 
                             candidate.name.toLowerCase().includes(query);
        if (!matchesQuery) return false;
        
        if (req.user.role === 'FAMILY_MEMBER' || req.user.role === 'CLIENT') {
            return candidate.role === 'CAREGIVER';
        }
        if (req.user.role === 'CAREGIVER') {
            return ['FAMILY_MEMBER', 'CLIENT', 'ADMIN'].includes(candidate.role);
        }
        if (req.user.role === 'ADMIN') {
            return true; // Admins can search and text all
        }
        return true;
    }).map((user) => sanitizeUser(user));
    
    res.json({ users: matchingUsers });
});

// Messages - Create Conversation
app.post('/api/conversations', verifyAuth, (req, res) => {
    const { participantId } = req.body;
    if (!participantId) {
        return res.status(400).json({ error: 'participantId required' });
    }
    
    const recipient = state.users.find((user) => user.id === participantId);
    if (!recipient) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Role-based texting permission checks
    if (req.user.role === 'FAMILY_MEMBER' || req.user.role === 'CLIENT') {
        if (recipient.role !== 'CAREGIVER') {
            return res.status(403).json({ error: 'Family members can only message caregivers' });
        }
    } else if (req.user.role === 'CAREGIVER') {
        if (!['FAMILY_MEMBER', 'CLIENT', 'ADMIN'].includes(recipient.role)) {
            return res.status(403).json({ error: 'Caregivers can only message family members, clients, or admins' });
        }
    } else if (req.user.role === 'ADMIN') {
        // Admins can see and text all (including Admins, Caregivers, Family Members)
    }
    
    const conversationId = createConversationId(req.user.id, participantId);
    
    if (!Array.isArray(state.conversations)) {
        state.conversations = [];
    }
    let existingConv = state.conversations.find(c => c.id === conversationId);
    if (!existingConv) {
        existingConv = {
            id: conversationId,
            participants: [req.user.id, participantId],
            createdAt: new Date().toISOString()
        };
        state.conversations.push(existingConv);
        saveState();
    }
    
    const conversation = { id: conversationId, name: recipient.name, participantId, status: existingConv.status || 'active' };
    
    // Broadcast via SSE
    broadcastSseEvent(req.user.id, {
        type: 'conversation',
        conversation
    });

    // Notify via Socket.IO
    const otherSocketId = onlineUsers.get(participantId);
    if (otherSocketId) {
        io.to(`user_${participantId}`).emit('new_conversation', {
            conversation,
            otherUser: sanitizeUser(req.user)
        });
    }
    
    res.json({ conversation });
});

// Admin - Update Conversation Status (Active, Paused, Ended)
const handleConversationStatusUpdate = (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required to change conversation status' });
    }

    const conversationId = req.params.id || req.body.conversationId;
    const { status } = req.body;

    if (!conversationId) {
        return res.status(400).json({ error: 'conversationId required' });
    }

    if (!['active', 'paused', 'ended'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be active, paused, or ended.' });
    }

    if (!Array.isArray(state.conversations)) {
        state.conversations = [];
    }

    let conv = state.conversations.find(c => c.id === conversationId);
    if (!conv) {
        let participants = [];
        if (conversationId.startsWith('conv_')) {
            participants = conversationId.replace('conv_', '').split('_');
        }
        conv = {
            id: conversationId,
            name: '',
            participants,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        state.conversations.push(conv);
    }

    conv.status = status;
    saveState();

    createAuditLog(req.user.id, `admin_${status}_conversation`, `Admin ${req.user.name} set conversation ${conversationId} status to ${status}`);

    // Broadcast via Socket.IO to room and all clients
    io.emit('conversation_status_changed', {
        conversationId,
        status,
        updatedBy: req.user.id,
        updatedByName: req.user.name
    });

    // Broadcast via SSE to all users
    if (Array.isArray(state.users)) {
        state.users.forEach(u => {
            broadcastSseEvent(u.id, {
                type: 'conversation_status_changed',
                conversationId,
                status
            });
        });
    }

    res.json({ success: true, conversationId, status });
};

app.post('/api/conversations/status', verifyAuth, handleConversationStatusUpdate);
app.post('/api/conversations/:id/status', verifyAuth, handleConversationStatusUpdate);

// Messages - Mark as Read
app.post('/api/messages/read', verifyAuth, (req, res) => {
    const { messageIds, conversationId } = req.body || {};
    if (!Array.isArray(messageIds) || !messageIds.length) {
        return res.status(400).json({ error: 'messageIds required' });
    }
    
    state.messages.forEach((message) => {
        if (messageIds.includes(message.id)) {
            message.isRead = true;
        }
    });
    saveState();
    
    broadcastSseEvent(req.user.id, {
        type: 'messages_read',
        conversationId,
        messageIds
    });

    if (conversationId) {
        io.to(`conv_${conversationId}`).emit('messages_read', {
            conversationId,
            messageIds,
            userId: req.user.id
        });
    }
    
    res.json({ success: true });
});

// Admin - Get Users
app.get('/api/admin/users', verifyAuth, (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    res.json({ users: state.users.map((user) => sanitizeUser(user)) });
});

// Admin - Get Audit Logs
app.get('/api/admin/audit-logs', verifyAuth, (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    res.json({ logs: state.auditLogs });
});

// STATIC FILE SERVING
app.use('/uploads', express.static(UPLOAD_DIR));

// ERROR HANDLING

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO running on ws://localhost:${PORT}`);
    console.log('\n📊 API Endpoints:');
    console.log('   POST /api/auth/register');
    console.log('   POST /api/auth/login');
    console.log('   GET  /api/auth/me');
    console.log('   POST /api/auth/logout');
    console.log('   GET  /api/messages/conversations');
    console.log('   GET  /api/messages?conversationId=...');
    console.log('   POST /api/messages');
    console.log('   POST /api/conversations');
    console.log('   POST /api/messages/read');
    console.log('   GET  /api/admin/users');
    console.log('   GET  /api/admin/audit-logs');
    console.log('\n👤 Test Credentials:');
    console.log('   Caregiver: ava@akirapa.com / 123456');
    console.log('   Family:    mina@akirapa.com / 123456');
    console.log('   Admin:     jordan@akirapa.com / 123456');
    console.log('\n🚀 Server ready!');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    saveState();
    io.close(() => {
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    saveState();
    io.close(() => {
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
});