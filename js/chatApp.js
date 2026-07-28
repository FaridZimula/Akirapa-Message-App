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
let chatInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// ============================================================
// INITIALIZATION
// ============================================================

window.initChatApp = async function() {
    // Prevent double initialization
    if (chatInitialized) {
        console.log('⚠️ Chat already initialized, skipping...');
        return;
    }
    chatInitialized = true;
    
    const user = window.getCurrentUser();
    if (!user) {
        console.error('❌ No user found for chat initialization');
        return;
    }
    
    currentUserRole = user?.user_metadata?.role || user?.role || 'FAMILY_MEMBER';
    
    console.log('📱 Initializing chat app for:', currentUserRole);
    
    // Connect Socket.IO
    connectSocket();
    
    // Load conversations
    await loadConversations();
    
    // Connect live updates (SSE) - with no auto-refresh
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

    const socketUrl = window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:3001';

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
                // Update conversations silently
                loadConversations();
                // Update messages if we're in a conversation
                if (activeConversationId) {
                    loadMessages();
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

    container.innerHTML = list.map(conv => {
        const isActive = conv.id === activeConversationId ? 'active' : '';
        const initial = (conv.name || 'C').charAt(0).toUpperCase();
        const onlineStatus = conv.online_status ? '<span style="color: #00a884; font-size: 0.6rem;">●</span>' : '';
        const roleBadge = conv.role ? `<span class="role-badge ${conv.role}" style="font-size: 0.6rem;">${conv.role.replace('_', ' ')}</span>` : '';
        const participantCount = conv.participants && conv.participants.length > 0 ? 
            `<span style="font-size: 0.6rem; color: var(--text-muted);">${conv.participants.length} participants</span>` : '';

        return `
            <div class="thread-item ${isActive}" onclick="selectConversation('${conv.id}', '${escapeJs(conv.name)}')">
                <div class="avatar">${initial}</div>
                <div class="thread-details">
                    <div class="thread-top">
                        <span class="thread-title">${escapeHtml(conv.name)} ${onlineStatus}</span>
                        ${conv.last_message_time ? `<span class="thread-time">${new Date(conv.last_message_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>` : ''}
                    </div>
                    <div class="thread-bottom">
                        <span class="thread-snippet">${escapeHtml(conv.last_message || 'No messages yet')}</span>
                        <span style="display: flex; gap: 4px; align-items: center;">
                            ${roleBadge}
                            ${participantCount}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterConversations() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = conversationsList.filter(c => c.name.toLowerCase().includes(query));
    renderConversations(filtered);
}

function selectConversation(conversationId, conversationName) {
    activeConversationId = conversationId;
    activeConversationName = conversationName;
    renderConversations(conversationsList);
    const title = document.getElementById('activeChatTitle');
    const avatar = document.getElementById('activeChatAvatar');
    if (title) title.textContent = conversationName;
    if (avatar) avatar.textContent = conversationName.charAt(0).toUpperCase();
    loadMessages();
    setupRealtimeSubscription();
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('mobile-hidden');
        document.getElementById('chatWindow').classList.remove('mobile-hidden');
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
// CLEANUP
// ============================================================

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