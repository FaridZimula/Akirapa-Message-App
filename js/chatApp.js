// ============================================================
// AKIRAPA CHAT APP - Core Chat Functionality (No Auto-Refresh)
// ============================================================

let activeConversationId = null;
let activeConversationName = '';
let conversationsList = [];
let currentMessages = [];
let selectedFile = null;
let currentUserRole = null;
let eventSource = null;
let socket = null;
let lastInitializedUserId = null;
let chatInitialized = false;
let reconnectAttempts = 0;

window.resetChatApp = function() {
    console.log('🧹 Resetting chat application state...');
    if (socket) {
        try { socket.disconnect(); } catch (e) {}
        socket = null;
    }
    if (eventSource) {
        try { eventSource.close(); } catch (e) {}
        eventSource = null;
    }
    activeConversationId = null;
    activeConversationName = '';
    conversationsList = [];
    currentMessages = [];
    selectedFile = null;
    currentUserRole = null;
    chatInitialized = false;
    window.chatInitialized = false;
    lastInitializedUserId = null;

    const threadsList = document.getElementById('threadsList');
    const messagesList = document.getElementById('messagesList');
    const title = document.getElementById('activeChatTitle');
    const avatar = document.getElementById('activeChatAvatar');
    const subtitle = document.getElementById('activeChatSubtitle');
    const adminControls = document.getElementById('adminControlsContainer');
    const chatStatusNotice = document.getElementById('chatStatusNotice');
    const standardInputBar = document.getElementById('standardInputBar');

    if (threadsList) threadsList.innerHTML = '';
    if (messagesList) messagesList.innerHTML = '';
    if (title) title.textContent = 'Select a Conversation';
    if (avatar) avatar.innerHTML = '<i class="fa-solid fa-users"></i>';
    if (subtitle) subtitle.textContent = 'Secure Care Communication';
    if (adminControls) adminControls.classList.add('hidden');
    if (chatStatusNotice) chatStatusNotice.classList.add('hidden');
    if (standardInputBar) standardInputBar.classList.remove('hidden');
};

window.initChatApp = async function() {
    const user = window.getCurrentUser();
    if (!user) {
        console.error('❌ No user found for chat initialization');
        return;
    }

    if (chatInitialized && lastInitializedUserId === user.id) {
        console.log('⚠️ Chat already initialized for user:', user.email);
        return;
    }

    if (chatInitialized || (lastInitializedUserId && lastInitializedUserId !== user.id)) {
        window.resetChatApp();
    }

    chatInitialized = true;
    window.chatInitialized = true;
    lastInitializedUserId = user.id;
    currentUserRole = user?.user_metadata?.role || user?.role || 'FAMILY_MEMBER';
    
    console.log('📱 Initializing chat app for:', currentUserRole, user.email);
    
    // Connect Socket.IO
    connectSocket();
    
    // Load conversations
    await loadConversations();
    
    // Connect live updates (SSE)
    connectLiveUpdates();
    
    if (conversationsList.length > 0) {
        selectConversation(conversationsList[0].id, conversationsList[0].name);
    }
};

// ============================================================
// SOCKET.IO CONNECTION
// ============================================================

function connectSocket() {
    const token = window.getCurrentSession()?.access_token || localStorage.getItem('akirapa_session_token');
    if (!token) {
        console.warn('⚠️ No token available for socket connection');
        return;
    }

    // Close existing socket if any
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    const socketUrl = window.location.origin;

    socket = io(socketUrl, {
        auth: { token },
        query: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 15000
    });

    socket.on('connect', () => {
        console.log('🔌 Socket connected successfully');
        reconnectAttempts = 0;
        
        // Re-join active conversation if any
        if (activeConversationId) {
            socket.emit('join_conversation', activeConversationId);
        }
    });

    socket.on('connect_error', (err) => {
        console.warn('⚠️ Socket connection error:', err.message);
        // Don't trigger page refresh - just log
    });

    socket.on('disconnect', (reason) => {
        console.log('🔴 Socket disconnected:', reason);
        // Don't refresh the page
    });

    // Handle new messages via Socket.IO
    socket.on('new_message', (data) => {
        console.log('📩 New message received via socket');
        handleNewMessage(data);
    });

    // Handle read receipts
    socket.on('messages_read', (data) => {
        console.log('👁️ Read receipts received');
        handleReadReceipts(data);
    });

    // Handle user typing status
    socket.on('user_typing', (data) => {
        handleUserTyping(data);
    });

    // Handle user status changes
    socket.on('user_status', (data) => {
        console.log('🟢 User status update:', data.userId, data.online ? 'online' : 'offline');
        updateUserStatus(data.userId, data.online);
    });

    // Handle new conversation notification
    socket.on('new_conversation', (data) => {
        console.log('💬 New conversation notification');
        loadConversations();
    });

    // Handle conversation status changes (Pause / End / Resume)
    socket.on('conversation_status_changed', (data) => {
        console.log('⚡ Conversation status changed:', data);
        const conv = conversationsList.find(c => c.id === data.conversationId);
        if (conv) {
            conv.status = data.status;
        }
        if (activeConversationId === data.conversationId) {
            updateChatInputAndHeaderStatus();
        }
        renderConversations(conversationsList);
    });
}

// ============================================================
// SSE LIVE UPDATES (FIXED - No Auto-Refresh)
// ============================================================

function connectLiveUpdates() {
    // Close existing connection
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }

    const token = window.getCurrentSession()?.access_token;
    if (!token) {
        console.warn('⚠️ No token for SSE connection');
        return;
    }

    console.log('📡 Connecting to SSE stream...');
    
    try {
        eventSource = new EventSource(`/api/messages/stream?token=${encodeURIComponent(token)}`);
    } catch (err) {
        console.error('❌ Failed to create SSE connection:', err);
        return;
    }
    
    // Handle messages - this is the only place we update
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📡 SSE Update received');
            
            // Only update if we have data
            if (data) {
                if (data.type === 'conversation_status_changed') {
                    const conv = conversationsList.find(c => c.id === data.conversationId);
                    if (conv) conv.status = data.status;
                    if (activeConversationId === data.conversationId) {
                        updateChatInputAndHeaderStatus();
                    }
                    renderConversations(conversationsList);
                } else {
                    loadConversations();
                    if (activeConversationId) {
                        loadMessages();
                    }
                }
            }
        } catch (err) {
            console.error('❌ SSE parse error:', err);
        }
    };

    // Handle connection open
    eventSource.onopen = () => {
        console.log('✅ SSE connection established');
        reconnectAttempts = 0;
    };

    // Handle errors - Close EventSource to prevent infinite reconnection loop
    eventSource.onerror = (error) => {
        console.warn('⚠️ SSE connection error, closing EventSource to prevent reconnection loops');
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    };
}

// ============================================================
// REALTIME SUBSCRIPTION
// ============================================================

function setupRealtimeSubscription() {
    console.log('🔔 Setting up realtime subscription for:', activeConversationId);
    
    if (!activeConversationId) return;
    
    // Use Socket.IO for realtime updates
    if (socket && socket.connected) {
        // Leave any previous conversation room
        socket.emit('leave_conversation', activeConversationId);
        // Join the new conversation room
        socket.emit('join_conversation', activeConversationId);
        console.log('✅ Joined conversation room:', activeConversationId);
    } else {
        console.warn('⚠️ Socket not connected, will retry on connect');
    }
}

// ============================================================
// SOCKET EVENT HANDLERS
// ============================================================

function handleNewMessage(data) {
    // Only process if it's for the active conversation
    if (data.conversationId !== activeConversationId) {
        // Still reload conversations to update the sidebar (silent)
        loadConversations();
        return;
    }
    
    // Check if message already exists (prevent duplicates)
    const exists = currentMessages.some(m => m.id === data.message.id);
    if (exists) return;
    
    // Add the new message
    const newMsg = {
        id: data.message.id,
        text: data.message.text || '',
        senderId: data.message.senderId,
        senderName: data.message.senderName || data.senderName || 'Unknown',
        senderRole: data.message.senderRole || data.senderRole || 'FAMILY_MEMBER',
        mediaUrl: data.message.mediaUrl || null,
        mediaType: data.message.mediaType || null,
        mediaName: data.message.mediaName || null,
        createdAt: data.message.createdAt || data.timestamp || new Date().toISOString(),
        isRead: false
    };
    
    currentMessages.push(newMsg);
    renderMessages(currentMessages);
    scrollToBottom();
    
    // Mark as read if it's not from the current user
    const currentUserId = window.getCurrentUser()?.id;
    if (newMsg.senderId !== currentUserId) {
        markMessagesAsRead([newMsg.id]);
    }
}

function handleReadReceipts(data) {
    if (data.conversationId !== activeConversationId) return;
    
    // Update read status of messages
    currentMessages.forEach(msg => {
        if (data.messageIds.includes(msg.id)) {
            msg.isRead = true;
        }
    });
    renderMessages(currentMessages);
}

function handleUserTyping(data) {
    if (data.conversationId !== activeConversationId) return;
    
    const subtitle = document.getElementById('activeChatSubtitle');
    if (!subtitle) return;
    
    if (data.isTyping) {
        subtitle.textContent = `${data.userName} is typing...`;
        subtitle.style.color = 'var(--accent-green)';
    } else {
        subtitle.textContent = 'Secure Care Communication';
        subtitle.style.color = '';
    }
}

function updateUserStatus(userId, isOnline) {
    // Update online status in the conversation list
    const threadItems = document.querySelectorAll('.thread-item');
    threadItems.forEach(item => {
        const titleEl = item.querySelector('.thread-title');
        if (titleEl) {
            // Find the conversation in the list
            const conv = conversationsList.find(c => c.id === activeConversationId);
            if (conv && conv.participants) {
                const participant = conv.participants.find(p => p.id === userId);
                if (participant) {
                    participant.online_status = isOnline;
                }
            }
        }
    });
    
    // Update active conversation online status
    if (activeConversationId) {
        const conv = conversationsList.find(c => c.id === activeConversationId);
        if (conv && conv.participants) {
            const participant = conv.participants.find(p => p.id === userId);
            if (participant) {
                participant.online_status = isOnline;
                const subtitle = document.getElementById('activeChatSubtitle');
                if (subtitle && isOnline) {
                    subtitle.textContent = '🟢 Online';
                } else if (subtitle) {
                    subtitle.textContent = 'Secure Care Communication';
                }
            }
        }
    }
}

// ============================================================
// CONVERSATION MANAGEMENT
// ============================================================

async function loadConversations() {
    try {
        const token = window.getCurrentSession()?.access_token || localStorage.getItem('akirapa_session_token');
        if (!token) {
            console.warn('⚠️ No token for loading conversations');
            return;
        }
        
        const response = await fetch('/api/messages/conversations', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (response.ok && data.conversations) {
            conversationsList = data.conversations;
            renderConversations(conversationsList);
        } else {
            showInlineError('threadsList', 'Unable to load conversations.', loadConversations);
        }
    } catch (err) {
        console.error('Failed to load conversations:', err);
        showInlineError('threadsList', 'Network error loading conversations.', loadConversations);
    }
}

function renderThreadItem(conv, isMonitored = false) {
    const isActive = conv.id === activeConversationId ? 'active' : '';
    const initial = (conv.name || 'C').charAt(0).toUpperCase();

    // Check conversation avatar, partner avatar, or participant avatar
    let avatarUrl = conv.avatarUrl || conv.avatar_url || null;
    if (!avatarUrl && conv.participants && conv.participants.length > 0) {
        const currentUserId = window.getCurrentUser()?.id;
        const otherParticipant = conv.participants.find(p => (p.id || p) !== currentUserId);
        if (otherParticipant && typeof otherParticipant === 'object') {
            avatarUrl = otherParticipant.avatarUrl || otherParticipant.avatar_url || otherParticipant.user_metadata?.avatar_url;
        }
    }

    const avatarContent = avatarUrl ? 
        `<img src="${avatarUrl}" alt="${escapeHtml(conv.name)}" style="width:100%;height:100%;object-fit:cover;">` : 
        initial;

    const onlineStatus = conv.online_status ? '<span style="color: #42dcd7; font-size: 0.6rem;">●</span>' : '';
    const roleBadge = conv.role ? `<span class="role-badge ${conv.role}" style="font-size: 0.6rem;">${conv.role.replace('_', ' ')}</span>` : '';
    const participantCount = conv.participants && conv.participants.length > 0 ? 
        `<span style="font-size: 0.65rem; color: #ffffff; font-weight: 600;">${conv.participants.length} participants</span>` : '';
    
    let statusTag = '';
    if (conv.status === 'paused') {
        statusTag = `<span class="role-badge" style="font-size: 0.58rem; background: #761d90; color: #ffffff; border: 1px solid #42dcd7; margin-left: 4px;">⏸️ PAUSED</span>`;
    } else if (conv.status === 'ended') {
        statusTag = `<span class="role-badge" style="font-size: 0.58rem; background: #761d90; color: #ffffff; border: 1px solid #42dcd7; margin-left: 4px;">🚫 ENDED</span>`;
    }

    const monitoredBadge = isMonitored ? `<span style="font-size: 0.6rem; color: #761d90; background: #ffffff; border: 1px solid #761d90; padding: 1px 6px; border-radius: 4px; font-weight: 700;">👁️ OBSERVE</span>` : '';

    return `
        <div class="thread-item ${isActive}" onclick="selectConversation('${conv.id}', '${escapeJs(conv.name)}')">
            <div class="avatar">${avatarContent}</div>
            <div class="thread-details">
                <div class="thread-top">
                    <span class="thread-title">${escapeHtml(conv.name)} ${onlineStatus} ${statusTag}</span>
                    ${conv.last_message_time ? `<span class="thread-time">${new Date(conv.last_message_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>` : ''}
                </div>
                <div class="thread-bottom">
                    <span class="thread-snippet">${escapeHtml(conv.last_message || 'No messages yet')}</span>
                    <span style="display: flex; gap: 4px; align-items: center;">
                        ${monitoredBadge}
                        ${roleBadge}
                        ${participantCount}
                    </span>
                </div>
            </div>
        </div>
    `;
}

function renderConversations(list) {
    const container = document.getElementById('threadsList');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
                No conversations available.
                ${currentUserRole === 'FAMILY_MEMBER' ? 
                    '<br><span style="font-size: 0.8rem;">Ask a caregiver to start a conversation.</span>' :
                    '<br><button onclick="startNewConversation()" class="btn-primary" style="margin-top: 12px; width: auto; padding: 8px 20px;">Start New Chat</button>'
                }
            </div>
        `;
        return;
    }

    const currentUserId = window.getCurrentUser()?.id;

    if (currentUserRole === 'ADMIN') {
        const directChats = [];
        const monitoredChats = [];

        list.forEach(conv => {
            const isParticipant = conv.isParticipant || (conv.participants && conv.participants.some(p => (p.id ? p.id === currentUserId : p === currentUserId)));
            if (isParticipant) {
                directChats.push(conv);
            } else {
                monitoredChats.push(conv);
            }
        });

        let html = '';

        // Direct Chats Section
        html += `
            <div class="sidebar-section-header" style="padding: 10px 16px 6px; font-size: 0.75rem; font-weight: 800; color: #42dcd7; letter-spacing: 0.5px; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between;">
                <span><i class="fa-solid fa-comments"></i> Direct Chats (${directChats.length})</span>
                <button onclick="startNewConversation()" title="Start Direct Chat" style="background: transparent; border: none; color: #42dcd7; cursor: pointer; font-size: 0.85rem;"><i class="fa-solid fa-plus"></i></button>
            </div>
        `;
        if (directChats.length === 0) {
            html += `<div style="padding: 10px 16px; font-size: 0.78rem; color: #ffffff; font-style: italic;">No direct chats yet</div>`;
        } else {
            html += directChats.map(conv => renderThreadItem(conv, false)).join('');
        }

        // Monitored Pod Chats Section
        html += `
            <div class="sidebar-section-header" style="padding: 16px 16px 6px; font-size: 0.75rem; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.2); margin-top: 10px;">
                <span><i class="fa-solid fa-eye"></i> Monitored Care Pods (${monitoredChats.length})</span>
            </div>
        `;
        if (monitoredChats.length === 0) {
            html += `<div style="padding: 10px 16px; font-size: 0.78rem; color: #ffffff; font-style: italic;">No monitored caregiver-family pods</div>`;
        } else {
            html += monitoredChats.map(conv => renderThreadItem(conv, true)).join('');
        }

        container.innerHTML = html;
    } else {
        container.innerHTML = list.map(conv => renderThreadItem(conv, false)).join('');
    }
}

function filterConversations() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = conversationsList.filter(c => c.name.toLowerCase().includes(query));
    renderConversations(filtered);
}

function selectConversation(conversationId, conversationName) {
    activeConversationId = conversationId;
    activeConversationName = conversationName;
    localStorage.setItem('akirapa_last_active_conv', conversationId);

    renderConversations(conversationsList);
    const title = document.getElementById('activeChatTitle');
    const avatar = document.getElementById('activeChatAvatar');
    if (title) title.textContent = conversationName;

    const conv = conversationsList.find(c => c.id === conversationId);
    let avatarUrl = conv ? (conv.avatarUrl || conv.avatar_url) : null;
    if (!avatarUrl && conv && conv.participants && conv.participants.length > 0) {
        const currentUserId = window.getCurrentUser()?.id;
        const otherParticipant = conv.participants.find(p => (p.id || p) !== currentUserId);
        if (otherParticipant && typeof otherParticipant === 'object') {
            avatarUrl = otherParticipant.avatarUrl || otherParticipant.avatar_url || otherParticipant.user_metadata?.avatar_url;
        }
    }

    if (avatar) {
        if (avatarUrl) {
            avatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(conversationName)}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            avatar.innerHTML = `<img src="logo.png" alt="Logo" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;">`;
        }
    }

    loadMessages();
    updateChatInputAndHeaderStatus();
    setupRealtimeSubscription();
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('mobile-hidden');
        document.getElementById('chatWindow').classList.remove('mobile-hidden');
    }
}

// ============================================================
// ADMIN GOVERNANCE & CONVERSATION STATUS UI
// ============================================================

function updateChatInputAndHeaderStatus() {
    if (!activeConversationId) return;

    const conv = conversationsList.find(c => c.id === activeConversationId);
    const currentStatus = conv ? (conv.status || 'active') : 'active';

    const user = window.getCurrentUser();
    const isParticipant = conv && conv.participants && conv.participants.some(p => (p.id ? p.id === user?.id : p === user?.id));
    const isAdminObserver = currentUserRole === 'ADMIN' && !isParticipant;

    const adminControlsContainer = document.getElementById('adminControlsContainer');
    const adminPauseBtn = document.getElementById('adminPauseBtn');
    const adminEndBtn = document.getElementById('adminEndBtn');
    const chatStatusNotice = document.getElementById('chatStatusNotice');
    const standardInputBar = document.getElementById('standardInputBar');

    if (currentUserRole === 'ADMIN' && adminControlsContainer) {
        adminControlsContainer.classList.remove('hidden');
        if (adminPauseBtn) {
            if (currentStatus === 'paused') {
                adminPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Lift Pause';
                adminPauseBtn.className = 'btn-admin-action resume';
            } else {
                adminPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
                adminPauseBtn.className = 'btn-admin-action';
            }
        }
        if (adminEndBtn) {
            if (currentStatus === 'ended') {
                adminEndBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Lift Ban';
                adminEndBtn.className = 'btn-admin-action resume';
            } else {
                adminEndBtn.innerHTML = '<i class="fa-solid fa-ban"></i> End / Ban';
                adminEndBtn.className = 'btn-admin-action ban';
            }
        }
    } else if (adminControlsContainer) {
        adminControlsContainer.classList.add('hidden');
    }

    if (isAdminObserver) {
        if (standardInputBar) standardInputBar.classList.add('hidden');
        if (chatStatusNotice) {
            chatStatusNotice.classList.remove('hidden');
            chatStatusNotice.className = 'chat-status-notice admin-view';
            chatStatusNotice.innerHTML = '<i class="fa-solid fa-shield-halved"></i> <strong>Admin View-Only Mode:</strong> You are observing this care pod conversation. Message posting is restricted for Admins in participant chat rooms.';
        }
    } else if (currentStatus === 'paused') {
        if (standardInputBar) standardInputBar.classList.add('hidden');
        if (chatStatusNotice) {
            chatStatusNotice.classList.remove('hidden');
            chatStatusNotice.className = 'chat-status-notice paused';
            chatStatusNotice.innerHTML = '<i class="fa-solid fa-circle-pause"></i> <strong>Conversation Paused:</strong> An Admin has temporarily limited/paused messaging in this care pod.';
        }
    } else if (currentStatus === 'ended') {
        if (standardInputBar) standardInputBar.classList.add('hidden');
        if (chatStatusNotice) {
            chatStatusNotice.classList.remove('hidden');
            chatStatusNotice.className = 'chat-status-notice ended';
            chatStatusNotice.innerHTML = '<i class="fa-solid fa-ban"></i> <strong>Conversation Ended:</strong> An Admin has ended/banned communication in this care pod.';
        }
    } else {
        if (standardInputBar) standardInputBar.classList.remove('hidden');
        if (chatStatusNotice) chatStatusNotice.classList.add('hidden');
    }
}

window.toggleAdminConversationPause = async function() {
    if (!activeConversationId) return;
    const conv = conversationsList.find(c => c.id === activeConversationId);
    const currentStatus = conv ? (conv.status || 'active') : 'active';
    const newStatus = currentStatus === 'paused' ? 'active' : 'paused';
    await setConversationStatus(activeConversationId, newStatus);
};

window.toggleAdminConversationEnd = async function() {
    if (!activeConversationId) return;
    const conv = conversationsList.find(c => c.id === activeConversationId);
    const currentStatus = conv ? (conv.status || 'active') : 'active';
    const newStatus = currentStatus === 'ended' ? 'active' : 'ended';
    await setConversationStatus(activeConversationId, newStatus);
};

async function setConversationStatus(conversationId, status) {
    try {
        const token = window.getCurrentSession()?.access_token || localStorage.getItem('akirapa_session_token');
        let res = await fetch(`/api/conversations/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ conversationId, status })
        });
        if (res.status === 404) {
            // Fallback to route with path param
            res = await fetch(`/api/conversations/${conversationId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
        }
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Failed to update conversation status');
            return;
        }
        const conv = conversationsList.find(c => c.id === conversationId);
        if (conv) conv.status = status;
        updateChatInputAndHeaderStatus();
        renderConversations(conversationsList);
    } catch (err) {
        alert('Network error updating conversation status');
    }
}

function toggleMobileSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-hidden');
    document.getElementById('chatWindow').classList.add('mobile-hidden');
}

// ============================================================
// MESSAGE MANAGEMENT
// ============================================================

async function loadMessages() {
    if (!activeConversationId) return;
    try {
        const token = window.getCurrentSession()?.access_token || localStorage.getItem('akirapa_session_token');
        if (!token) {
            console.warn('⚠️ No token for loading messages');
            return;
        }
        
        const response = await fetch(`/api/messages?conversationId=${activeConversationId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (response.ok && data.messages) {
            currentMessages = data.messages;
            renderMessages(currentMessages);
            scrollToBottom();
            const unreadIds = currentMessages
                .filter(m => !m.isRead && m.senderId !== window.getCurrentUser()?.id)
                .map(m => m.id);
            if (unreadIds.length > 0) {
                markMessagesAsRead(unreadIds);
            }
        } else {
            showInlineError('messagesList', 'Unable to load messages.', loadMessages);
        }
    } catch (err) {
        console.error('Failed to load messages:', err);
        showInlineError('messagesList', 'Network error loading messages.', loadMessages);
    }
}

function showInlineError(containerId, message, retryFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const retryId = 'retryBtn_' + Math.random().toString(36).slice(2, 7);
    container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #ef4444; font-size: 0.88rem; background: rgba(239, 68, 68, 0.08); border-radius: 8px; margin: 16px;">
            <i class="fa-solid fa-triangle-exclamation"></i> ${message}
            <button id="${retryId}" style="margin-left: 10px; padding: 4px 12px; background: #10b981; color: white; border: none; border-radius: 4px; font-weight: 700; cursor: pointer;">
                <i class="fa-solid fa-rotate-right"></i> Retry
            </button>
        </div>
    `;
    document.getElementById(retryId)?.addEventListener('click', retryFn);
}

function renderMessages(messages) {
    const container = document.getElementById('messagesList');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); font-size: 0.88rem; margin: 30px 0;">
                This is the beginning of your conversation with ${escapeHtml(activeConversationName)}.
                <br>
                <span style="font-size: 0.8rem; color: var(--text-muted);">Messages are end-to-end encrypted</span>
            </div>
        `;
        return;
    }

    const currentUserId = window.getCurrentUser()?.id;
    
    container.innerHTML = messages.map(msg => {
        const isOutgoing = currentUserId && msg.senderId === currentUserId;
        const groupClass = isOutgoing ? 'outgoing' : 'incoming';
        const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const senderRole = msg.senderRole || 'CAREGIVER';
        const senderName = isOutgoing ? 'You' : (msg.senderName || 'User');
        
        let contentHtml = '';
        
        if (msg.mediaUrl) {
            if (msg.mediaType === 'audio') {
                contentHtml = `
                    <div class="audio-player-bubble">
                        <button class="play-pause-btn" onclick="toggleAudioPlayback(this, '${msg.mediaUrl}')">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <div class="audio-waveform-wrap">
                            <div class="waveform-bars">
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                                <div class="wave-bar"></div>
                            </div>
                            <div class="audio-duration">Voice Memo • Audio</div>
                        </div>
                    </div>
                `;
            } else if (msg.mediaType === 'video') {
                contentHtml = `
                    <div class="media-attachment" onclick="openVideoModal('${msg.mediaUrl}')">
                        <video src="${msg.mediaUrl}#t=0.5" preload="metadata"></video>
                        <div class="media-play-overlay">
                            <i class="fa-solid fa-circle-play"></i>
                        </div>
                    </div>
                `;
            } else {
                contentHtml = `
                    <div class="media-attachment" onclick="openImageModal('${msg.mediaUrl}', '${escapeHtml(msg.mediaName || 'Photo')}')">
                        <img src="${msg.mediaUrl}" alt="${escapeHtml(msg.mediaName || 'Photo')}" loading="lazy" />
                    </div>
                `;
            }
        }
        
        if (msg.text) {
            contentHtml += `<div class="message-text">${escapeHtml(msg.text)}</div>`;
        }
        
        return `
            <div class="message-group ${groupClass}">
                <div class="message-bubble">
                    <div class="message-sender">
                        <span class="message-sender-name">${escapeHtml(senderName)}</span>
                        <span class="role-badge ${senderRole}">${formatRole(senderRole)}</span>
                    </div>
                    ${contentHtml}
                    <div class="message-meta">
                        <span>${timeStr}</span>
                        ${isOutgoing ? (msg.isRead ? '<span class="ticks" style="color: #53bdeb;">✓✓</span>' : '<span class="ticks" style="color: #8696a0;">✓</span>') : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function scrollToBottom() {
    const chatBody = document.getElementById('chatBody');
    setTimeout(() => {
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 100);
}

async function markMessagesAsRead(messageIds) {
    try {
        const token = window.getCurrentSession()?.access_token;
        if (!token) return;
        
        await fetch('/api/messages/read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                messageIds,
                conversationId: activeConversationId 
            })
        });
    } catch (err) {
        console.error('Failed to mark messages as read:', err);
    }
}

// ============================================================
// AUDIO PLAYBACK
// ============================================================

function toggleAudioPlayback(btn, audioUrl) {
    const icon = btn.querySelector('i');
    if (btn.currentAudio && !btn.currentAudio.paused) {
        btn.currentAudio.pause();
        icon.className = 'fa-solid fa-play';
        return;
    }
    document.querySelectorAll('.play-pause-btn').forEach(b => {
        if (b.currentAudio) {
            b.currentAudio.pause();
            const bIcon = b.querySelector('i');
            if (bIcon) bIcon.className = 'fa-solid fa-play';
        }
    });
    const audio = new Audio(audioUrl);
    btn.currentAudio = audio;
    icon.className = 'fa-solid fa-pause';
    audio.play().catch(err => {
        console.error('Audio playback error:', err);
        icon.className = 'fa-solid fa-play';
    });
    audio.onended = () => {
        icon.className = 'fa-solid fa-play';
    };
}

// ============================================================
// MESSAGE SENDING
// ============================================================

function handleInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    if (!activeConversationId) {
        alert('Please select a conversation first.');
        return;
    }
    const inputEl = document.getElementById('messageTextInput');
    const text = inputEl.value.trim();
    if (!text && !selectedFile) return;
    const formData = new FormData();
    formData.append('conversationId', activeConversationId);
    if (text) formData.append('text', text);
    if (selectedFile) formData.append('file', selectedFile);
    inputEl.value = '';
    selectedFile = null;
    resetFilePreview();
    try {
        const token = window.getCurrentSession()?.access_token;
        if (!token) {
            alert('Session expired. Please sign in again.');
            return;
        }
        
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Failed to send message.');
            return;
        }
        const newMsg = {
            id: data.message.id,
            text: data.message.text,
            senderId: data.message.senderId,
            senderName: 'You',
            senderRole: window.getCurrentUser()?.user_metadata?.role || 'CAREGIVER',
            mediaUrl: data.message.mediaUrl,
            mediaType: data.message.mediaType,
            mediaName: data.message.mediaName,
            createdAt: data.message.createdAt,
            isRead: false
        };
        if (!currentMessages.some(m => m.id === newMsg.id)) {
            currentMessages.push(newMsg);
            renderMessages(currentMessages);
            scrollToBottom();
        }
    } catch (err) {
        console.error('Error sending message:', err);
        alert('Failed to send message.');
    }
}

window.sendAudioMessage = async function(audioBlob) {
    if (!activeConversationId) return;
    const file = new File([audioBlob], `voice-memo-${Date.now()}.webm`, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('conversationId', activeConversationId);
    formData.append('file', file);
    try {
        const token = window.getCurrentSession()?.access_token;
        if (!token) return;
        
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        const data = await response.json();
        if (response.ok) {
            const newMsg = {
                id: data.message.id,
                text: data.message.text || '',
                senderId: data.message.senderId,
                senderName: 'You',
                senderRole: window.getCurrentUser()?.user_metadata?.role || window.getCurrentUser()?.role || 'CAREGIVER',
                mediaUrl: data.message.mediaUrl,
                mediaType: data.message.mediaType,
                mediaName: data.message.mediaName,
                createdAt: data.message.createdAt,
                isRead: false
            };
            if (!currentMessages.some(m => m.id === newMsg.id)) {
                currentMessages.push(newMsg);
                renderMessages(currentMessages);
                scrollToBottom();
            }
        }
    } catch (err) {
        console.error('Error sending voice memo:', err);
    }
};

// ============================================================
// CONVERSATION CREATION
// ============================================================

async function startNewConversation() {
    try {
        const token = window.getCurrentSession()?.access_token;
        if (!token) {
            alert('Session expired. Please sign in again.');
            return;
        }

        const catResponse = await fetch('/api/users/categorized', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const catData = await catResponse.json();

        let promptLines = ['==================================='];
        promptLines.push(' AVAILABLE CONTACTS BY ROLE GROUP');
        promptLines.push('===================================');

        if (catData.groups) {
            if (catData.groups.admins && catData.groups.admins.length > 0) {
                promptLines.push('\n👑 ADMINS:');
                catData.groups.admins.forEach(u => promptLines.push(`  • @${u.username || u.name} (${u.name})`));
            }
            if (catData.groups.caregivers && catData.groups.caregivers.length > 0) {
                promptLines.push('\n💚 CAREGIVERS:');
                catData.groups.caregivers.forEach(u => promptLines.push(`  • @${u.username || u.name} (${u.name})`));
            }
            if (catData.groups.familyMembers && catData.groups.familyMembers.length > 0) {
                promptLines.push('\n💜 FAMILY MEMBERS / CLIENTS:');
                catData.groups.familyMembers.forEach(u => promptLines.push(`  • @${u.username || u.name} (${u.name})`));
            }
        }

        promptLines.push('\n-----------------------------------');
        promptLines.push('Enter the username of the contact to chat with:');

        const usernameInput = prompt(promptLines.join('\n'));
        if (!usernameInput) return;

        const searchResponse = await fetch(`/api/users/search?q=${encodeURIComponent(usernameInput.trim())}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const usersData = await searchResponse.json();

        let foundUser = null;
        if (usersData.users && usersData.users.length > 0) {
            foundUser = usersData.users.find(u =>
                (u.username && u.username.toLowerCase() === usernameInput.trim().toLowerCase()) ||
                u.name.toLowerCase() === usernameInput.trim().toLowerCase()
            ) || usersData.users[0];
        }

        if (!foundUser) {
            alert('User not found. Please check the username.');
            return;
        }

        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                participantId: foundUser.id,
                name: foundUser.name,
                isGroup: false
            })
        });

        const data = await response.json();
        if (response.ok) {
            await loadConversations();
            selectConversation(data.conversation.id, foundUser.name);
        } else {
            alert('User not found.');
        }
    } catch (err) {
        console.error('Start conversation error:', err);
    }
}

// ============================================================
// FILE HANDLING
// ============================================================

function triggerFileInput() {
    document.getElementById('mediaFileInput').click();
}

function handleFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit. Please choose a smaller file.');
        e.target.value = '';
        return;
    }
    
    selectedFile = file;
    const inputEl = document.getElementById('messageTextInput');
    inputEl.placeholder = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB) - Press Send`;
}

function resetFilePreview() {
    const fileInput = document.getElementById('mediaFileInput');
    if (fileInput) fileInput.value = '';
    const inputEl = document.getElementById('messageTextInput');
    if (inputEl) inputEl.placeholder = 'Type a message...';
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatRole(role) {
    switch (role) {
        case 'CAREGIVER': return 'Caregiver';
        case 'FAMILY_MEMBER': return 'Family / Client';
        case 'CLIENT': return 'Client';
        case 'ADMIN': return 'Admin';
        case 'CARE_COORDINATOR': return 'Coordinator';
        default: return role;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'");
}

function togglePasswordVisibility(inputId, buttonElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = buttonElement.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye';
    }
}

// ============================================================
// CHAT ROOM MENU & MODAL UI CONTROLS
// ============================================================

function toggleChatMenu(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('chatMenuDropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('chatMenuDropdown');
    if (dropdown && !e.target.closest('.chat-menu-wrapper')) {
        dropdown.classList.add('hidden');
    }
});

function closeCurrentChatRoom() {
    activeConversationId = null;
    activeConversationName = '';
    const activeTitle = document.getElementById('activeChatTitle');
    const activeSubtitle = document.getElementById('activeChatSubtitle');
    const messagesList = document.getElementById('messagesList');
    if (activeTitle) activeTitle.textContent = 'Select a Conversation';
    if (activeSubtitle) activeSubtitle.textContent = 'Secure Care Communication';
    if (messagesList) messagesList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 40px;">Select a conversation to start chatting.</div>';
    const dropdown = document.getElementById('chatMenuDropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

let _pendingAvatarUrl = null;

function terminateCurrentChatRoom() {
    if (!activeConversationId) return;
    if (confirm('Are you sure you want to terminate this chat room?')) {
        closeCurrentChatRoom();
    }
}

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const content = document.getElementById('settingsContent');
    const title = document.getElementById('settingsTitle');
    const dropdown = document.getElementById('chatMenuDropdown');
    
    if (dropdown) dropdown.classList.add('hidden');
    if (!modal) return;

    if (title) title.textContent = 'Profile & App Settings';

    const user = window.getCurrentUser() || {};
    const metadata = user.user_metadata || {};
    const name = metadata.name || user.name || '';
    const username = metadata.username || user.username || '';
    const phone = metadata.phone_number || metadata.phoneNumber || user.phoneNumber || '';
    const bio = metadata.bio || user.bio || '';
    const avatarUrl = metadata.avatar_url || user.avatar_url || '';
    _pendingAvatarUrl = avatarUrl;

    if (content) {
        content.innerHTML = `
            <!-- TAB BAR IN SETTINGS -->
            <div style="display: flex; gap: 8px; border-bottom: 1.5px solid rgba(118, 29, 144, 0.2); padding-bottom: 8px; margin-bottom: 14px;">
                <button type="button" id="tabSettingsProfile" class="auth-tab active" onclick="switchSettingsTab('profile')" style="padding: 8px 16px; font-size: 0.88rem;">
                    <i class="fa-solid fa-user-gear"></i> Profile Details
                </button>
                <button type="button" id="tabSettingsPreferences" class="auth-tab" onclick="switchSettingsTab('preferences')" style="padding: 8px 16px; font-size: 0.88rem;">
                    <i class="fa-solid fa-sliders"></i> Preferences
                </button>
            </div>

            <!-- PROFILE SECTION -->
            <div id="settingsProfileSection" style="display: flex; flex-direction: column; gap: 14px;">
                <!-- Profile Picture Upload Area -->
                <div style="display: flex; align-items: center; gap: 16px; background: rgba(118, 29, 144, 0.05); padding: 12px 16px; border-radius: var(--radius-md); border: 1.5px solid rgba(118, 29, 144, 0.2);">
                    <div style="position: relative; width: 64px; height: 64px;">
                        <div id="settingsAvatarPreview" class="avatar" style="width: 64px; height: 64px; font-size: 1.5rem; border: 2px solid #42dcd7;">
                            ${avatarUrl ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;">` : (name || 'U').charAt(0).toUpperCase()}
                        </div>
                    </div>
                    <div>
                        <button type="button" onclick="document.getElementById('profilePicInput').click()" style="padding: 8px 16px; background: #761d90; color: #ffffff; border: 1.5px solid #42dcd7; border-radius: var(--radius-sm); font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-upload"></i> Upload Photo
                        </button>
                        <input type="file" id="profilePicInput" accept="image/*" class="hidden" onchange="handleProfilePicSelected(event)">
                        <div style="font-size: 0.75rem; color: #761d90; margin-top: 4px; font-weight: 600;">JPG, PNG, GIF or WebP (max 5MB)</div>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" for="profileNameInput">Full Name</label>
                    <input type="text" id="profileNameInput" class="form-input" value="${escapeHtml(name)}" placeholder="Enter your full name">
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" for="profileUsernameInput">Username</label>
                    <input type="text" id="profileUsernameInput" class="form-input" value="${escapeHtml(username)}" placeholder="Enter username">
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" for="profilePhoneInput">Phone Number</label>
                    <input type="tel" id="profilePhoneInput" class="form-input" value="${escapeHtml(phone)}" placeholder="+1 (604) 555-0199">
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" for="profileBioInput">Care Specialty / Emergency Notes</label>
                    <textarea id="profileBioInput" class="form-input" rows="2" placeholder="Add care details, shift notes, or emergency contacts...">${escapeHtml(bio)}</textarea>
                </div>
            </div>

            <!-- PREFERENCES SECTION -->
            <div id="settingsPreferencesSection" class="hidden" style="display: flex; flex-direction: column; gap: 12px;">
                <div class="setting-item">
                    <div>
                        <div class="setting-title"><i class="fa-solid fa-bell" style="color: #42dcd7; margin-right: 6px;"></i> Care Notification Alerts</div>
                        <div class="setting-desc">Play sound alert for incoming care pod messages</div>
                    </div>
                    <input type="checkbox" id="settingChimes" checked style="width: 20px; height: 20px; cursor: pointer; accent-color: #761d90;">
                </div>

                <div class="setting-item">
                    <div>
                        <div class="setting-title"><i class="fa-solid fa-triangle-exclamation" style="color: #761d90; margin-right: 6px;"></i> Emergency Priority Alerts</div>
                        <div class="setting-desc">High-priority chime for urgent caregiver updates</div>
                    </div>
                    <input type="checkbox" id="settingUrgent" checked style="width: 20px; height: 20px; cursor: pointer; accent-color: #761d90;">
                </div>

                <div class="setting-item">
                    <div>
                        <div class="setting-title"><i class="fa-solid fa-eye" style="color: #42dcd7; margin-right: 6px;"></i> Read Receipts</div>
                        <div class="setting-desc">Allow care pod members to see when messages are read</div>
                    </div>
                    <input type="checkbox" id="settingReceipts" checked style="width: 20px; height: 20px; cursor: pointer; accent-color: #761d90;">
                </div>

                <div class="setting-item">
                    <div>
                        <div class="setting-title"><i class="fa-solid fa-circle-user" style="color: #761d90; margin-right: 6px;"></i> Online Status Indicator</div>
                        <div class="setting-desc">Show your active status to caregivers and family</div>
                    </div>
                    <input type="checkbox" id="settingOnline" checked style="width: 20px; height: 20px; cursor: pointer; accent-color: #761d90;">
                </div>

                <div class="setting-item">
                    <div>
                        <div class="setting-title"><i class="fa-solid fa-photo-film" style="color: #42dcd7; margin-right: 6px;"></i> Auto-Download Care Media</div>
                        <div class="setting-desc">Auto-download photos and voice memos sent in care chats</div>
                    </div>
                    <input type="checkbox" id="settingAutoDownload" checked style="width: 20px; height: 20px; cursor: pointer; accent-color: #761d90;">
                </div>
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

function switchSettingsTab(tab) {
    const profileSec = document.getElementById('settingsProfileSection');
    const prefSec = document.getElementById('settingsPreferencesSection');
    const profileTab = document.getElementById('tabSettingsProfile');
    const prefTab = document.getElementById('tabSettingsPreferences');

    if (tab === 'profile') {
        if (profileSec) profileSec.classList.remove('hidden');
        if (prefSec) prefSec.classList.add('hidden');
        if (profileTab) profileTab.classList.add('active');
        if (prefTab) prefTab.classList.remove('active');
    } else {
        if (profileSec) profileSec.classList.add('hidden');
        if (prefSec) prefSec.classList.remove('hidden');
        if (profileTab) profileTab.classList.remove('active');
        if (prefTab) prefTab.classList.add('active');
    }
}

function handleProfilePicSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }

    // Hide Settings modal temporarily so Cropping window appears first & front-and-center
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = function(event) {
        openCropModal(event.target.result, 'profile');
    };
    reader.readAsDataURL(file);
}

function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit. Please choose a smaller file.');
        e.target.value = '';
        return;
    }

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            openCropModal(event.target.result, 'chat_file');
        };
        reader.readAsDataURL(file);
    } else {
        selectedFile = file;
        const inputEl = document.getElementById('messageTextInput');
        if (inputEl) {
            inputEl.placeholder = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB) - Press Send`;
        }
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
}

async function saveRoleSettings() {
    const nameInput = document.getElementById('profileNameInput');
    const usernameInput = document.getElementById('profileUsernameInput');
    const phoneInput = document.getElementById('profilePhoneInput');
    const bioInput = document.getElementById('profileBioInput');
    const statusMsg = document.getElementById('settingsSaveStatus');

    const newName = nameInput ? nameInput.value.trim() : '';
    const newUsername = usernameInput ? usernameInput.value.trim() : '';
    const newPhone = phoneInput ? phoneInput.value.trim() : '';
    const newBio = bioInput ? bioInput.value.trim() : '';

    const user = window.getCurrentUser();
    if (user) {
        if (!user.user_metadata) user.user_metadata = {};
        if (newName) user.user_metadata.name = newName;
        if (newUsername) user.user_metadata.username = newUsername;
        if (newPhone) user.user_metadata.phone_number = newPhone;
        if (newBio) user.user_metadata.bio = newBio;
        if (_pendingAvatarUrl) {
            user.user_metadata.avatar_url = _pendingAvatarUrl;
            user.avatarUrl = _pendingAvatarUrl;
        }

        localStorage.setItem('akirapa_user', JSON.stringify(user));

        try {
            const token = window.getCurrentSession()?.access_token || localStorage.getItem('akirapa_session_token');
            if (token) {
                const res = await fetch('/api/users/profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: newName,
                        username: newUsername,
                        phoneNumber: newPhone,
                        bio: newBio,
                        avatarUrl: _pendingAvatarUrl
                    })
                });
                if (!res.ok) {
                    console.warn(`Profile sync note: Endpoint returned status ${res.status}. Profile saved locally.`);
                }
            }
        } catch (err) {
            console.warn('Backend profile sync note (saved locally):', err);
        }

        // Update UI
        const currentNameEl = document.getElementById('currentUserName');
        const currentAvatarEl = document.getElementById('currentUserAvatar');

        if (currentNameEl && newName) {
            currentNameEl.textContent = newName;
        }

        if (currentAvatarEl) {
            const activeAvatarUrl = _pendingAvatarUrl || user.user_metadata?.avatar_url || user.avatarUrl;
            if (activeAvatarUrl) {
                currentAvatarEl.innerHTML = `<img src="${activeAvatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;">`;
            } else if (newName) {
                currentAvatarEl.textContent = newName.charAt(0).toUpperCase();
            }
        }
    }

    if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #761d90;"></i> Profile & settings saved successfully!';
        setTimeout(() => {
            statusMsg.style.display = 'none';
            closeSettingsModal();
        }, 1200);
    } else {
        closeSettingsModal();
    }
}

window.toggleChatMenu = toggleChatMenu;
window.closeCurrentChatRoom = closeCurrentChatRoom;
window.terminateCurrentChatRoom = terminateCurrentChatRoom;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveRoleSettings = saveRoleSettings;

window.addEventListener('beforeunload', function() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (socket) {
        socket.disconnect();
        socket = null;
    }
});

console.log('✅ chatApp.js loaded successfully (no auto-refresh)');

// ============================================================
// CAMERA CAPTURE & CROPPER MODULES
// ============================================================

let cameraStream = null;
let capturedBlob = null;

let cropperInstance = null;
let cropTargetContext = null; // 'profile' | 'chat_file' | 'camera'

function openCropModal(imageSrc, context = 'profile') {
    cropTargetContext = context;
    const modal = document.getElementById('imageCropModal');
    const imgEl = document.getElementById('cropperTargetImage');

    if (!modal || !imgEl) return;

    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }

    imgEl.src = imageSrc;
    modal.classList.remove('hidden');

    setTimeout(() => {
        cropperInstance = new Cropper(imgEl, {
            aspectRatio: context === 'profile' ? 1 : NaN,
            viewMode: 1,
            dragMode: 'crop',
            autoCropArea: 0.95,
            restore: false,
            guides: true,
            center: true,
            highlight: true,
            cropBoxMovable: true,
            cropBoxResizable: true
        });
    }, 100);
}

function rotateCropper(degree) {
    if (cropperInstance) cropperInstance.rotate(degree);
}

function zoomCropper(ratio) {
    if (cropperInstance) cropperInstance.zoom(ratio);
}

function resetCropper() {
    if (cropperInstance) cropperInstance.reset();
}

function closeCropModal(e) {
    if (e && e.target !== document.getElementById('imageCropModal') && !e.target.closest('.close-modal-btn')) {
        if (e.target !== e.currentTarget) return;
    }

    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }

    const modal = document.getElementById('imageCropModal');
    if (modal) modal.classList.add('hidden');

    if (cropTargetContext === 'profile') {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.remove('hidden');
    }
}

function applyCroppedImage() {
    if (!cropperInstance) return;

    const canvas = cropperInstance.getCroppedCanvas({
        maxWidth: 1200,
        maxHeight: 1200,
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    if (!canvas) return;

    if (cropTargetContext === 'profile') {
        _pendingAvatarUrl = canvas.toDataURL('image/jpeg', 0.9);
        const avatarPreview = document.getElementById('settingsAvatarPreview');
        if (avatarPreview) {
            avatarPreview.innerHTML = `<img src="${_pendingAvatarUrl}" alt="Avatar Preview" style="width:100%;height:100%;object-fit:cover;">`;
        }
        closeCropModal();
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.remove('hidden');
    } else if (cropTargetContext === 'chat_file' || cropTargetContext === 'camera') {
        canvas.toBlob((blob) => {
            if (!blob) return;
            capturedBlob = blob;
            const croppedFile = new File([blob], `cropped_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            selectedFile = croppedFile;

            if (cropTargetContext === 'camera') {
                closeCropModal();
                const cameraModal = document.getElementById('cameraModal');
                const video = document.getElementById('cameraVideo');
                const preview = document.getElementById('photoCapturedPreview');
                const captionWrap = document.getElementById('cameraCaptionWrap');
                const snapBtn = document.getElementById('snapPhotoBtn');
                const retakeBtn = document.getElementById('retakePhotoBtn');
                const sendBtn = document.getElementById('sendPhotoBtn');

                if (video) video.classList.add('hidden');
                if (preview) {
                    preview.src = URL.createObjectURL(blob);
                    preview.classList.remove('hidden');
                }
                if (captionWrap) captionWrap.classList.remove('hidden');
                if (snapBtn) snapBtn.classList.add('hidden');
                if (retakeBtn) retakeBtn.classList.remove('hidden');
                if (sendBtn) sendBtn.classList.remove('hidden');
                if (cameraModal) cameraModal.classList.remove('hidden');
            } else {
                const inputEl = document.getElementById('messageTextInput');
                if (inputEl) {
                    inputEl.placeholder = `✂️ Cropped Photo ready (${(blob.size / 1024).toFixed(1)} KB) - Press Send`;
                }
                closeCropModal();
            }
        }, 'image/jpeg', 0.9);
    }
}

async function openCameraModal() {
    if (!activeConversationId) {
        alert('Please select a conversation first before taking a photo.');
        return;
    }

    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const preview = document.getElementById('photoCapturedPreview');
    const captionWrap = document.getElementById('cameraCaptionWrap');
    const captionInput = document.getElementById('cameraCaptionInput');
    const snapBtn = document.getElementById('snapPhotoBtn');
    const cropBtn = document.getElementById('cropCameraPhotoBtn');
    const retakeBtn = document.getElementById('retakePhotoBtn');
    const sendBtn = document.getElementById('sendPhotoBtn');
    const loadingNotice = document.getElementById('cameraLoadingNotice');

    if (!modal || !video) return;

    // Reset camera state
    capturedBlob = null;
    if (captionInput) captionInput.value = '';
    if (preview) preview.classList.add('hidden');
    if (canvas) canvas.classList.add('hidden');
    if (captionWrap) captionWrap.classList.add('hidden');
    if (cropBtn) cropBtn.classList.add('hidden');
    if (retakeBtn) retakeBtn.classList.add('hidden');
    if (sendBtn) sendBtn.classList.add('hidden');
    if (snapBtn) snapBtn.classList.remove('hidden');
    if (video) video.classList.remove('hidden');

    modal.classList.remove('hidden');
    if (loadingNotice) loadingNotice.classList.remove('hidden');

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = cameraStream;
        await video.play();
        if (loadingNotice) loadingNotice.classList.add('hidden');
    } catch (err) {
        console.error('Camera access error:', err);
        if (loadingNotice) loadingNotice.classList.add('hidden');
        alert('Unable to access camera. Please allow camera permissions in your browser.');
        closeCameraModal();
    }
}

function snapCameraPhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');

    if (!video || !canvas) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    // Stop camera stream & close camera modal
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    const cameraModal = document.getElementById('cameraModal');
    if (cameraModal) cameraModal.classList.add('hidden');

    // Open cropper modal straight away!
    openCropModal(dataUrl, 'camera');
}

function cropCameraSnappedPhoto() {
    const preview = document.getElementById('photoCapturedPreview');
    if (!preview || !preview.src) return;
    openCropModal(preview.src, 'camera');
}

function retakeCameraPhoto() {
    const video = document.getElementById('cameraVideo');
    const preview = document.getElementById('photoCapturedPreview');
    const captionWrap = document.getElementById('cameraCaptionWrap');
    const snapBtn = document.getElementById('snapPhotoBtn');
    const cropBtn = document.getElementById('cropCameraPhotoBtn');
    const retakeBtn = document.getElementById('retakePhotoBtn');
    const sendBtn = document.getElementById('sendPhotoBtn');

    capturedBlob = null;

    if (preview) preview.classList.add('hidden');
    if (captionWrap) captionWrap.classList.add('hidden');
    if (cropBtn) cropBtn.classList.add('hidden');
    if (retakeBtn) retakeBtn.classList.add('hidden');
    if (sendBtn) sendBtn.classList.add('hidden');
    if (snapBtn) snapBtn.classList.remove('hidden');
    if (video) video.classList.remove('hidden');
}

async function sendCameraPhoto() {
    const sendBtn = document.getElementById('sendPhotoBtn');

    if (!capturedBlob && !selectedFile) {
        const canvas = document.getElementById('cameraCanvas');
        if (canvas) {
            await new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    capturedBlob = blob;
                    resolve();
                }, 'image/jpeg', 0.9);
            });
        }
    }

    if (!capturedBlob && !selectedFile) {
        alert('No photo captured. Please snap a picture first.');
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    }

    const captionInput = document.getElementById('cameraCaptionInput');
    const caption = captionInput ? captionInput.value.trim() : '';

    if (!selectedFile && capturedBlob) {
        selectedFile = new File([capturedBlob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    }

    const inputField = document.getElementById('messageTextInput');
    if (inputField && caption) {
        inputField.value = caption;
    }

    closeCameraModal();

    if (window.sendMessage) {
        await window.sendMessage();
    }

    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Photo';
    }
}

function closeCameraModal(e) {
    if (e && e.target !== document.getElementById('cameraModal') && !e.target.closest('.close-modal-btn')) {
        if (e.target !== e.currentTarget) return;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    const modal = document.getElementById('cameraModal');
    if (modal) modal.classList.add('hidden');
}

window.openCropModal = openCropModal;
window.rotateCropper = rotateCropper;
window.zoomCropper = zoomCropper;
window.resetCropper = resetCropper;
window.closeCropModal = closeCropModal;
window.applyCroppedImage = applyCroppedImage;

window.openCameraModal = openCameraModal;
window.snapCameraPhoto = snapCameraPhoto;
window.cropCameraSnappedPhoto = cropCameraSnappedPhoto;
window.retakeCameraPhoto = retakeCameraPhoto;
window.sendCameraPhoto = sendCameraPhoto;
window.closeCameraModal = closeCameraModal;