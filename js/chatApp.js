let activeConversationId = null;
let activeConversationName = '';
let conversationsList = [];
let currentMessages = [];
let supabaseChannel = null;
let selectedFile = null;
let currentUserRole = null;

window.initChatApp = async function() {
    const user = window.getCurrentUser();
    currentUserRole = user?.user_metadata?.role || 'FAMILY_MEMBER';
    await loadConversations();
    setupRealtimeSubscription();
    if (conversationsList.length > 0) {
        selectConversation(conversationsList[0].id, conversationsList[0].name);
    }
};

function setupRealtimeSubscription() {
    if (supabaseChannel) {
        supabaseChannel.unsubscribe();
    }
    const currentUserId = window.getCurrentUser()?.id;
    if (!currentUserId || !activeConversationId) return;

    supabaseChannel = window.supabaseClient
        .channel('messages-channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${activeConversationId}`
            },
            async (payload) => {
                if (payload.new && payload.new.sender_id !== currentUserId) {
                    const { data: sender } = await window.supabaseClient
                        .from('profiles')
                        .select('name, role')
                        .eq('id', payload.new.sender_id)
                        .single();

                    const newMsg = {
                        id: payload.new.id,
                        text: payload.new.text,
                        senderId: payload.new.sender_id,
                        senderName: sender ? sender.name : 'Unknown',
                        senderRole: sender ? sender.role : 'UNKNOWN',
                        mediaUrl: payload.new.media_url,
                        mediaType: payload.new.media_type,
                        mediaName: payload.new.media_name,
                        createdAt: payload.new.created_at,
                        isRead: payload.new.is_read
                    };

                    currentMessages.push(newMsg);
                    renderMessages(currentMessages);
                    scrollToBottom();
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${activeConversationId}`
            },
            (payload) => {
                if (payload.new && payload.new.is_read) {
                    const msgIndex = currentMessages.findIndex(m => m.id === payload.new.id);
                    if (msgIndex !== -1) {
                        currentMessages[msgIndex].isRead = true;
                        renderMessages(currentMessages);
                    }
                }
            }
        )
        .subscribe();
}

async function loadConversations() {
    try {
        const response = await fetch('/api/messages/conversations', {
            headers: {
                'Authorization': `Bearer ${window.currentSession?.access_token}`
            }
        });
        const data = await response.json();
        if (response.ok && data.conversations) {
            conversationsList = data.conversations;
            renderConversations(conversationsList);
        }
    } catch (err) {
        console.error('Failed to load conversations:', err);
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

async function loadMessages() {
    if (!activeConversationId) return;
    try {
        const response = await fetch(`/api/messages?conversationId=${activeConversationId}`, {
            headers: {
                'Authorization': `Bearer ${window.currentSession?.access_token}`
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
        }
    } catch (err) {
        console.error('Failed to load messages:', err);
    }
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
        await fetch('/api/messages/read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.currentSession?.access_token}`
            },
            body: JSON.stringify({ messageIds })
        });
    } catch (err) {
        console.error('Failed to mark messages as read:', err);
    }
}

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
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.currentSession?.access_token}`
            },
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Failed to send message.');
            return;
        }
        const currentUserId = window.getCurrentUser()?.id;
        const newMsg = {
            id: data.message.id,
            text: data.message.text,
            senderId: data.message.senderId,
            senderName: 'You',
            senderRole: window.currentUser?.user_metadata?.role || 'CAREGIVER',
            mediaUrl: data.message.mediaUrl,
            mediaType: data.message.mediaType,
            mediaName: data.message.mediaName,
            createdAt: data.message.createdAt,
            isRead: false
        };
        currentMessages.push(newMsg);
        renderMessages(currentMessages);
        scrollToBottom();
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
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.currentSession?.access_token}`
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
                senderRole: window.currentUser?.user_metadata?.role || 'CAREGIVER',
                mediaUrl: data.message.mediaUrl,
                mediaType: data.message.mediaType,
                mediaName: data.message.mediaName,
                createdAt: data.message.createdAt,
                isRead: false
            };
            currentMessages.push(newMsg);
            renderMessages(currentMessages);
            scrollToBottom();
        }
    } catch (err) {
        console.error('Error sending voice memo:', err);
    }
};

async function startNewConversation() {
    let emailPrompt = 'Enter the email of the person you want to chat with:';
    let roleHint = '';
    
    if (currentUserRole === 'FAMILY_MEMBER') {
        roleHint = ' (Only caregivers are available)';
    } else if (currentUserRole === 'CAREGIVER') {
        roleHint = ' (Family members and admins)';
    }
    
    const email = prompt(`${emailPrompt}${roleHint}`);
    if (!email) return;
    
    try {
        const { data: users, error: userError } = await window.supabaseClient
            .from('profiles')
            .select('id, name, role')
            .eq('email', email)
            .single();
            
        if (userError || !users) {
            alert('User not found');
            return;
        }
        
        if (currentUserRole === 'FAMILY_MEMBER' && users.role !== 'CAREGIVER') {
            alert('Family members can only chat with caregivers.');
            return;
        }
        
        if (currentUserRole === 'CAREGIVER' && !['FAMILY_MEMBER', 'ADMIN'].includes(users.role)) {
            alert('Caregivers can only chat with family members and admins.');
            return;
        }
        
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.currentSession?.access_token}`
            },
            body: JSON.stringify({
                participantId: users.id,
                name: users.name,
                isGroup: false
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            await loadConversations();
            selectConversation(data.conversation.id, users.name);
        } else {
            alert(data.error || 'Failed to start conversation');
        }
    } catch (err) {
        alert('Failed to start conversation: ' + err.message);
    }
}

function triggerFileInput() {
    document.getElementById('mediaFileInput').click();
}

function handleFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    const inputEl = document.getElementById('messageTextInput');
    inputEl.placeholder = `Attachment: ${file.name} (Press Send)`;
}

function resetFilePreview() {
    const fileInput = document.getElementById('mediaFileInput');
    if (fileInput) fileInput.value = '';
    const inputEl = document.getElementById('messageTextInput');
    if (inputEl) inputEl.placeholder = 'Type a message...';
}

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
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    return String(str).replace(/'/g, "\\'");
}

// Password visibility toggle (if needed in chat)
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