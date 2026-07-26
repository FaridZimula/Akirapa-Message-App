const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error) throw error;
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        req.user = user;
        req.profile = profile;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, phoneNumber, role, code } = req.body;
    if (code !== '123456') {
        return res.status(400).json({ error: 'Invalid verification code' });
    }
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, phone_number: phoneNumber, role: role || 'FAMILY_MEMBER' }
            }
        });
        if (error) throw error;
        res.json({ user: data.user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        res.json({
            user: data.user,
            session: data.session
        });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        await supabase.auth.signOut();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.json({ user: null });
    }
    const token = authHeader.split(' ')[1];
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error) throw error;
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        res.json({ user: { ...user, ...profile } });
    } catch (err) {
        res.json({ user: null });
    }
});

async function getAllowedPartners(userId, userRole) {
    let query = supabase
        .from('profiles')
        .select('id, name, role, online_status')
        .neq('id', userId);

    if (userRole === 'CAREGIVER') {
        query = query.in('role', ['FAMILY_MEMBER', 'ADMIN']);
    } else if (userRole === 'FAMILY_MEMBER') {
        query = query.eq('role', 'CAREGIVER');
    } else if (userRole === 'ADMIN') {
        // Admin sees everyone
    } else {
        query = query.eq('role', userRole);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

app.get('/api/messages/conversations', verifyAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.profile.role;

        const allowedPartners = await getAllowedPartners(userId, userRole);
        const allowedIds = allowedPartners.map(p => p.id);

        const { data: participantData, error: partError } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);
        
        if (partError) throw partError;
        const conversationIds = participantData.map(p => p.conversation_id);

        if (conversationIds.length === 0) {
            return res.json({ conversations: [] });
        }

        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select(`
                id,
                name,
                is_group,
                conversation_type,
                created_at,
                updated_at
            `)
            .in('id', conversationIds)
            .order('updated_at', { ascending: false });

        if (convError) throw convError;

        const result = [];
        for (const conv of conversations) {
            const { data: participants } = await supabase
                .from('conversation_participants')
                .select(`
                    user_id,
                    profiles (
                        id,
                        name,
                        role,
                        avatar_url,
                        online_status
                    )
                `)
                .eq('conversation_id', conv.id)
                .neq('user_id', userId);

            const visibleParticipants = participants
                .filter(p => allowedIds.includes(p.profiles.id))
                .map(p => p.profiles);

            const displayParticipants = userRole === 'ADMIN' 
                ? participants.map(p => p.profiles)
                : visibleParticipants;

            if (displayParticipants.length === 0 && userRole !== 'ADMIN') {
                continue;
            }

            const { data: lastMessage } = await supabase
                .from('messages')
                .select('text, created_at, media_type, sender_id')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1);

            const otherUser = displayParticipants.length > 0 ? displayParticipants[0] : null;
            let displayName = conv.name;
            if (!conv.is_group && otherUser) {
                displayName = otherUser.name;
            }

            let isVisible = true;
            if (userRole === 'FAMILY_MEMBER') {
                const hasCaregiver = displayParticipants.some(p => p.role === 'CAREGIVER');
                isVisible = hasCaregiver;
            }

            if (isVisible) {
                result.push({
                    id: conv.id,
                    name: displayName,
                    participants: displayParticipants,
                    is_group: conv.is_group,
                    conversation_type: conv.conversation_type,
                    last_message: lastMessage && lastMessage.length > 0 ? lastMessage[0].text : null,
                    last_message_time: lastMessage && lastMessage.length > 0 ? lastMessage[0].created_at : null,
                    last_message_sender: lastMessage && lastMessage.length > 0 ? lastMessage[0].sender_id : null,
                    online_status: otherUser ? otherUser.online_status : false,
                    role: otherUser ? otherUser.role : null
                });
            }
        }

        res.json({ conversations: result });
    } catch (err) {
        console.error('Conversations error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/messages', verifyAuth, async (req, res) => {
    const { conversationId } = req.query;
    if (!conversationId) {
        return res.status(400).json({ error: 'conversationId required' });
    }

    try {
        const userId = req.user.id;
        const userRole = req.profile.role;

        const { data: participantCheck } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!participantCheck && userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized to view this conversation' });
        }

        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!sender_id (
                    id,
                    name,
                    role,
                    avatar_url
                )
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const messages = data.map(msg => ({
            id: msg.id,
            text: msg.text,
            senderId: msg.sender_id,
            senderName: msg.sender ? msg.sender.name : 'Unknown',
            senderRole: msg.sender ? msg.sender.role : 'UNKNOWN',
            mediaUrl: msg.media_url,
            mediaType: msg.media_type,
            mediaName: msg.media_name,
            createdAt: msg.created_at,
            isRead: msg.is_read,
            readAt: msg.read_at
        }));

        if (userRole === 'ADMIN') {
            const unreadIds = messages
                .filter(m => !m.isRead)
                .map(m => m.id);
            if (unreadIds.length > 0) {
                await supabase
                    .from('messages')
                    .update({ is_read: true, read_at: new Date().toISOString() })
                    .in('id', unreadIds);
            }
        }

        res.json({ messages });
    } catch (err) {
        console.error('Messages error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages', verifyAuth, upload.single('file'), async (req, res) => {
    const { conversationId, text } = req.body;
    const file = req.file;

    try {
        const userId = req.user.id;
        const userRole = req.profile.role;

        const { data: participantCheck } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!participantCheck && userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized to send message' });
        }

        let mediaUrl = null;
        let mediaType = null;
        let mediaName = null;
        let fileSize = null;
        let mimeType = null;

        if (file) {
            mimeType = file.mimetype;
            fileSize = file.size;
            if (mimeType.startsWith('image/')) mediaType = 'image';
            else if (mimeType.startsWith('video/')) mediaType = 'video';
            else if (mimeType.startsWith('audio/')) mediaType = 'audio';
            else mediaType = 'file';
            mediaUrl = `/uploads/${file.filename}`;
            mediaName = file.originalname;
        }

        const messageData = {
            conversation_id: conversationId,
            sender_id: userId,
            text: text || '',
            media_url: mediaUrl,
            media_type: mediaType,
            media_name: mediaName,
            file_size: fileSize,
            mime_type: mimeType,
            is_read: userRole === 'ADMIN' ? true : false
        };

        const { data, error } = await supabase
            .from('messages')
            .insert([messageData])
            .select(`
                *,
                sender:profiles!sender_id (
                    id,
                    name,
                    role,
                    avatar_url
                )
            `)
            .single();

        if (error) throw error;

        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        res.json({
            message: {
                id: data.id,
                text: data.text,
                senderId: data.sender_id,
                senderName: data.sender ? data.sender.name : 'Unknown',
                senderRole: data.sender ? data.sender.role : 'UNKNOWN',
                mediaUrl: data.media_url,
                mediaType: data.media_type,
                mediaName: data.media_name,
                createdAt: data.created_at,
                isRead: data.is_read
            }
        });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/conversations', verifyAuth, async (req, res) => {
    const { participantId, name, isGroup } = req.body;

    try {
        const userId = req.user.id;
        const userRole = req.profile.role;

        const { data: participant } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', participantId)
            .single();

        if (!participant) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userRole === 'FAMILY_MEMBER' && participant.role !== 'CAREGIVER') {
            return res.status(403).json({ 
                error: 'Family members can only chat with caregivers' 
            });
        }

        if (userRole === 'CAREGIVER' && !['FAMILY_MEMBER', 'ADMIN'].includes(participant.role)) {
            return res.status(403).json({ 
                error: 'Caregivers can only chat with family members and admins' 
            });
        }

        const { data: conv, error: convError } = await supabase
            .rpc('create_conversation_between_users', {
                user1_id: userId,
                user2_id: participantId
            });

        if (convError) throw convError;

        const { data: conversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', conv)
            .single();

        res.json({ conversation });
    } catch (err) {
        console.error('Create conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages/read', verifyAuth, async (req, res) => {
    const { messageIds } = req.body;
    if (!messageIds || !messageIds.length) {
        return res.status(400).json({ error: 'messageIds required' });
    }
    try {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .in('id', messageIds);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/users', verifyAuth, async (req, res) => {
    if (req.profile.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ users: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/audit-logs', verifyAuth, async (req, res) => {
    if (req.profile.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const { data, error } = await supabase
            .from('admin_audit_logs')
            .select(`
                *,
                admin:profiles!admin_id (
                    id,
                    name,
                    role
                )
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json({ logs: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints available:`);
    console.log(`   POST /api/auth/register`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/auth/me`);
    console.log(`   POST /api/auth/logout`);
    console.log(`   GET  /api/messages/conversations`);
    console.log(`   GET  /api/messages?conversationId=...`);
    console.log(`   POST /api/messages (multipart/form-data)`);
    console.log(`   POST /api/conversations`);
    console.log(`   POST /api/messages/read`);
    console.log(`   GET  /api/admin/users`);
    console.log(`   GET  /api/admin/audit-logs`);
    console.log(`   GET  /api/health`);
});