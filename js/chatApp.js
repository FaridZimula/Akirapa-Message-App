// Akirapa Standalone Messaging App - Core Supabase Chat Controller

let activeClientId = null;
let activeClientName = '';
let conversationsList = [];
let realtimeChannel = null;
let selectedFile = null;

// Default demo conversations fallback if Supabase DB is newly initialized
const DEFAULT_CONVERSATIONS = [
  { id: 'a1111111-1111-1111-1111-111111111111', name: 'Elder Care - Margaret Vance Pod', description: 'Primary Caregiving & Medication Thread' },
  { id: 'b2222222-2222-2222-2222-222222222222', name: 'Palliative Support - Robert Chen', description: 'Family Update & Daily Status Notes' },
  { id: 'c3333333-3333-3333-3333-333333333333', name: 'General Care Team Hub', description: 'Coordinator Announcements & Shift Handoffs' }
];

window.initChatApp = async function() {
  await loadConversations();
  if (conversationsList.length > 0) {
    selectConversation(conversationsList[0].id, conversationsList[0].name);
  }
};

async function loadConversations() {
  const sb = getSupabase();
  if (!sb || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    conversationsList = DEFAULT_CONVERSATIONS;
    renderConversations(conversationsList);
    return;
  }

  try {
    const { data, error } = await sb
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      console.warn('No conversations found in Supabase DB or table not populated. Using default list.', error);
      conversationsList = DEFAULT_CONVERSATIONS;
    } else {
      conversationsList = data;
    }
    renderConversations(conversationsList);
  } catch (err) {
    console.error('Failed to load conversations:', err);
    conversationsList = DEFAULT_CONVERSATIONS;
    renderConversations(conversationsList);
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
            <span class="thread-snippet">${escapeHtml(client.description || 'Tap to view care conversation...')}</span>
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
  subscribeToRealtimeMessages(clientId);

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('mobile-hidden');
    document.getElementById('chatWindow').classList.remove('mobile-hidden');
  }
}

function subscribeToRealtimeMessages(conversationId) {
  const sb = getSupabase();
  if (!sb) return;

  // Unsubscribe existing realtime subscription if active
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
  }

  realtimeChannel = sb
    .channel(`public:messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        appendSingleMessage(payload.new);
      }
    )
    .subscribe();
}

function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-hidden');
  document.getElementById('chatWindow').classList.add('mobile-hidden');
}

async function loadMessages() {
  if (!activeClientId) return;

  const sb = getSupabase();
  if (!sb || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    renderMessages([]);
    return;
  }

  try {
    const { data, error } = await sb
      .from('messages')
      .select('*')
      .eq('conversation_id', activeClientId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages from Supabase:', error);
      renderMessages([]);
      return;
    }

    renderMessages(data || []);
  } catch (err) {
    console.error('Failed to load messages:', err);
    renderMessages([]);
  }
}

function appendSingleMessage(msg) {
  const container = document.getElementById('messagesList');
  if (!container) return;

  const msgHtml = buildMessageHtml(msg);
  container.insertAdjacentHTML('beforeend', msgHtml);

  const chatBody = document.getElementById('chatBody');
  if (chatBody) {
    chatBody.scrollTop = chatBody.scrollHeight;
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

  container.innerHTML = messages.map(msg => buildMessageHtml(msg)).join('');

  const chatBody = document.getElementById('chatBody');
  if (chatBody) {
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function buildMessageHtml(msg) {
  const isOutgoing = currentUser && (msg.sender_id === currentUser.id || msg.senderId === currentUser.id);
  const groupClass = isOutgoing ? 'outgoing' : 'incoming';
  const rawTime = msg.created_at || msg.createdAt || new Date();
  const timeStr = new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const senderRole = msg.sender_role || msg.senderRole || 'CAREGIVER';

  const senderName = isOutgoing ? 'You' : (msg.sender_name || msg.senderName || 'User');
  const roleBadgeHtml = `<span class="role-badge ${senderRole}">${formatRole(senderRole)}</span>`;

  let contentHtml = '';
  const mediaUrl = msg.media_url || msg.mediaUrl;
  const mediaType = msg.media_type || msg.mediaType;
  const mediaName = msg.media_name || msg.mediaName;

  if (mediaUrl) {
    if (mediaType === 'audio') {
      contentHtml = `
        <div class="audio-player-bubble">
          <button class="play-pause-btn" onclick="toggleAudioPlayback(this, '${mediaUrl}')">
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
    } else if (mediaType === 'video') {
      contentHtml = `
        <div class="media-attachment" onclick="openVideoModal('${mediaUrl}')">
          <video src="${mediaUrl}#t=0.5" preload="metadata"></video>
          <div class="media-play-overlay">
            <i class="ri-play-circle-fill"></i>
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="media-attachment" onclick="openImageModal('${mediaUrl}', '${escapeHtml(mediaName || 'Photo')}')">
          <img src="${mediaUrl}" alt="${escapeHtml(mediaName || 'Photo')}" loading="lazy" />
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

  const sb = getSupabase();
  if (!sb || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    alert('Please configure your Supabase URL & Key in js/config.js first!');
    return;
  }

  const inputEl = document.getElementById('messageTextInput');
  const text = inputEl.value.trim();

  if (!text && !selectedFile) return;

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.disabled = true;

  let mediaUrl = null;
  let mediaType = null;
  let mediaName = null;

  try {
    if (selectedFile) {
      mediaName = selectedFile.name;
      if (selectedFile.type.startsWith('image/')) mediaType = 'image';
      else if (selectedFile.type.startsWith('video/')) mediaType = 'video';
      else if (selectedFile.type.startsWith('audio/')) mediaType = 'audio';

      const filePath = `uploads/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data: uploadData, error: uploadError } = await sb.storage
        .from('chat-media')
        .upload(filePath, selectedFile);

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        alert(`Failed to upload media: ${uploadError.message}`);
        if (sendBtn) sendBtn.disabled = false;
        return;
      }

      const { data: urlData } = sb.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      mediaUrl = urlData.publicUrl;
    }

    const newMessage = {
      conversation_id: activeClientId,
      sender_id: currentUser ? currentUser.id : null,
      sender_name: currentUser ? currentUser.name : 'Caregiver',
      sender_role: currentUser ? currentUser.role : 'CAREGIVER',
      text: text || null,
      media_url: mediaUrl,
      media_type: mediaType,
      media_name: mediaName
    };

    inputEl.value = '';
    selectedFile = null;
    resetFilePreview();

    const { error: insertError } = await sb
      .from('messages')
      .insert(newMessage);

    if (insertError) {
      console.error('Error sending message:', insertError);
      alert(`Failed to send message: ${insertError.message}`);
    } else {
      loadMessages();
    }
  } catch (err) {
    console.error('Unexpected error sending message:', err);
    alert('Failed to send message.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

window.sendAudioMessage = async function(audioBlob) {
  if (!activeClientId) return;

  const sb = getSupabase();
  if (!sb || SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL") {
    alert('Please configure your Supabase URL & Key in js/config.js first!');
    return;
  }

  const fileName = `voice_memo_${Date.now()}.webm`;
  const filePath = `voice_memos/${fileName}`;

  try {
    const { data: uploadData, error: uploadError } = await sb.storage
      .from('chat-media')
      .upload(filePath, audioBlob, { contentType: 'audio/webm' });

    if (uploadError) {
      console.error('Failed to upload voice memo:', uploadError);
      alert(`Failed to upload voice note: ${uploadError.message}`);
      return;
    }

    const { data: urlData } = sb.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    const newMessage = {
      conversation_id: activeClientId,
      sender_id: currentUser ? currentUser.id : null,
      sender_name: currentUser ? currentUser.name : 'Caregiver',
      sender_role: currentUser ? currentUser.role : 'CAREGIVER',
      text: null,
      media_url: publicUrl,
      media_type: 'audio',
      media_name: 'Voice Memo'
    };

    const { error: insertError } = await sb
      .from('messages')
      .insert(newMessage);

    if (insertError) {
      console.error('Error inserting voice memo message:', insertError);
    } else {
      loadMessages();
    }
  } catch (err) {
    console.error('Error processing audio memo upload:', err);
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
    default: return role || 'Caregiver';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  return String(str || '').replace(/'/g, "\\'");
}
