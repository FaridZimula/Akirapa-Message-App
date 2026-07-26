// Akirapa Standalone Messaging App - Core Controller

let activeClientId = null;
let activeClientName = '';
let conversationsList = [];
let messagesPollInterval = null;
let selectedFile = null;

window.initChatApp = async function() {
  await loadConversations();
  if (conversationsList.length > 0) {
    selectConversation(conversationsList[0].id, conversationsList[0].name);
  }
};

async function loadConversations() {
  try {
    const res = await fetch('/api/messages/conversations');
    const data = await res.json();
    if (res.ok && data.conversations) {
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
        No active care threads found.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(client => {
    const isActive = client.id === activeClientId ? 'active' : '';
    const initial = (client.name || 'C').charAt(0).toUpperCase();

    return `
      <div class="thread-item ${isActive}" onclick="selectConversation('${client.id}', '${escapeJs(client.name)}')">
        <div class="avatar">${initial}</div>
        <div class="thread-details">
          <div class="thread-top">
            <span class="thread-title">${escapeHtml(client.name)}</span>
            <span class="thread-time">Active Pod</span>
          </div>
          <div class="thread-bottom">
            <span class="thread-snippet">Tap to view care conversation...</span>
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

function selectConversation(clientId, clientName) {
  activeClientId = clientId;
  activeClientName = clientName;

  renderConversations(conversationsList);

  const title = document.getElementById('activeChatTitle');
  const avatar = document.getElementById('activeChatAvatar');
  if (title) title.textContent = clientName;
  if (avatar) avatar.textContent = clientName.charAt(0).toUpperCase();

  loadMessages();

  if (messagesPollInterval) clearInterval(messagesPollInterval);
  messagesPollInterval = setInterval(loadMessages, 3000);

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
  if (!activeClientId) return;

  try {
    const res = await fetch(`/api/messages?clientId=${activeClientId}`);
    const data = await res.json();
    if (res.ok && data.messages) {
      renderMessages(data.messages);
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
        This is the beginning of your care conversation for ${escapeHtml(activeClientName)}.
      </div>
    `;
    return;
  }

  const chatBody = document.getElementById('chatBody');
  const isScrolledToBottom = chatBody.scrollHeight - chatBody.clientHeight <= chatBody.scrollTop + 80;

  container.innerHTML = messages.map(msg => {
    const isOutgoing = currentUser && msg.senderId === currentUser.id;
    const groupClass = isOutgoing ? 'outgoing' : 'incoming';
    const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderRole = msg.senderRole || 'CAREGIVER';

    const senderName = isOutgoing ? 'You' : (msg.senderName || 'User');
    const roleBadgeHtml = `<span class="role-badge ${senderRole}">${formatRole(senderRole)}</span>`;

    let contentHtml = '';

    if (msg.mediaUrl) {
      if (msg.mediaType === 'audio') {
        contentHtml = `
          <div class="audio-player-bubble">
            <button class="play-pause-btn" onclick="toggleAudioPlayback(this, '${msg.mediaUrl}')">
              <i class="ri-play-fill"></i>
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
              <i class="ri-play-circle-fill"></i>
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
            ${roleBadgeHtml}
          </div>
          ${contentHtml}
          <div class="message-meta">
            <span>${timeStr}</span>
            ${isOutgoing ? '<span class="ticks">✓✓</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (isScrolledToBottom) {
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function toggleAudioPlayback(btn, audioUrl) {
  const icon = btn.querySelector('i');
  if (btn.currentAudio && !btn.currentAudio.paused) {
    btn.currentAudio.pause();
    icon.className = 'ri-play-fill';
    return;
  }

  document.querySelectorAll('.play-pause-btn').forEach(b => {
    if (b.currentAudio) {
      b.currentAudio.pause();
      const bIcon = b.querySelector('i');
      if (bIcon) bIcon.className = 'ri-play-fill';
    }
  });

  const audio = new Audio(audioUrl);
  btn.currentAudio = audio;
  icon.className = 'ri-pause-fill';

  audio.play().catch(err => {
    console.error('Audio playback error:', err);
    icon.className = 'ri-play-fill';
  });

  audio.onended = () => {
    icon.className = 'ri-play-fill';
  };
}

function handleInputKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

async function sendMessage() {
  if (!activeClientId) {
    alert('Please select a conversation first.');
    return;
  }

  const inputEl = document.getElementById('messageTextInput');
  const text = inputEl.value.trim();

  if (!text && !selectedFile) return;

  const formData = new FormData();
  formData.append('clientId', activeClientId);
  if (text) formData.append('text', text);
  if (selectedFile) formData.append('file', selectedFile);

  inputEl.value = '';
  selectedFile = null;
  resetFilePreview();

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to send message.');
      return;
    }

    loadMessages();
  } catch (err) {
    console.error('Error sending message:', err);
    alert('Failed to send message.');
  }
}

window.sendAudioMessage = async function(audioBlob) {
  if (!activeClientId) return;

  const file = new File([audioBlob], `voice-memo-${Date.now()}.webm`, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('clientId', activeClientId);
  formData.append('file', file);

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      loadMessages();
    }
  } catch (err) {
    console.error('Error sending voice memo:', err);
  }
};

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
