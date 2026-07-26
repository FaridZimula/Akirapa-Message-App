-- ====================================================================
-- AKIRAPA MESSAGING APP - COMPLETE SUPABASE DATABASE SCHEMA
-- Run this script in your Supabase SQL Editor (https://app.supabase.com)
-- ====================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 2. PROFILES TABLE
-- ====================================================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    role VARCHAR(50) NOT NULL CHECK (role IN ('CAREGIVER', 'FAMILY_MEMBER', 'CLIENT', 'ADMIN', 'CARE_COORDINATOR')),
    avatar_url TEXT,
    online_status BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 3. CONVERSATIONS TABLE
-- ====================================================================
CREATE TABLE public.conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100),
    is_group BOOLEAN DEFAULT false,
    conversation_type VARCHAR(50) DEFAULT 'PRIVATE' CHECK (conversation_type IN ('PRIVATE', 'GROUP', 'ADMIN_VIEW')),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 4. CONVERSATION PARTICIPANTS TABLE
-- ====================================================================
CREATE TABLE public.conversation_participants (
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- ====================================================================
-- 5. MESSAGES TABLE
-- ====================================================================
CREATE TABLE public.messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    text TEXT,
    media_url TEXT,
    media_type VARCHAR(20),
    media_name VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 6. ADMIN AUDIT LOGS TABLE
-- ====================================================================
CREATE TABLE public.admin_audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    admin_id UUID REFERENCES public.profiles(id),
    action VARCHAR(100),
    target_user_id UUID REFERENCES public.profiles(id),
    target_message_id UUID REFERENCES public.messages(id),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 7. INDEXES
-- ====================================================================
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_conversation_participants_user_id ON public.conversation_participants(user_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_messages_is_read ON public.messages(is_read);

-- ====================================================================
-- 8. ENABLE ROW LEVEL SECURITY (RLS)
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 9. RLS POLICIES
-- ====================================================================

-- PROFILES POLICIES
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- CONVERSATIONS POLICIES
CREATE POLICY "Users can view their conversations" ON public.conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = id AND user_id = auth.uid()
        ) OR (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'ADMIN'
            )
        )
    );

CREATE POLICY "Users can create conversations" ON public.conversations
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their conversations" ON public.conversations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = id AND user_id = auth.uid()
        ) OR (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'ADMIN'
            )
        )
    );

-- CONVERSATION PARTICIPANTS POLICIES
CREATE POLICY "Users can view conversation participants" ON public.conversation_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.conversation_participants cp
            WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
        ) OR (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'ADMIN'
            )
        )
    );

CREATE POLICY "Users can add participants" ON public.conversation_participants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversation_participants cp
            WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
        ) OR (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'ADMIN'
            )
        )
    );

CREATE POLICY "Users can remove participants" ON public.conversation_participants
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        ) OR auth.uid() = user_id
    );

-- MESSAGES POLICIES
CREATE POLICY "Users can view conversation messages" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
        ) OR (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'ADMIN'
            )
        )
    );

CREATE POLICY "Users can send messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their own messages" ON public.messages
    FOR UPDATE USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages" ON public.messages
    FOR DELETE USING (auth.uid() = sender_id);

-- ADMIN AUDIT LOGS POLICIES
CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ====================================================================
-- 10. FUNCTIONS AND TRIGGERS
-- ====================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- 11. AUTO-CREATE PROFILE ON SIGNUP
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, phone_number, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'FAMILY_MEMBER')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- 12. CREATE CONVERSATION BETWEEN USERS FUNCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION create_conversation_between_users(
    user1_id UUID,
    user2_id UUID
)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    -- Check if conversation already exists (private chat between these two users)
    SELECT cp1.conversation_id INTO conv_id
    FROM conversation_participants cp1
    JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = user1_id AND cp2.user_id = user2_id
    AND NOT EXISTS (
        SELECT 1 FROM conversation_participants cp3
        WHERE cp3.conversation_id = cp1.conversation_id
        AND cp3.user_id NOT IN (user1_id, user2_id)
    )
    LIMIT 1;

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    -- Create new conversation
    INSERT INTO conversations (created_by, is_group, conversation_type)
    VALUES (user1_id, false, 'PRIVATE')
    RETURNING id INTO conv_id;

    -- Add participants
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES (conv_id, user1_id), (conv_id, user2_id);

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 13. GET USER'S CONVERSATIONS FUNCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION get_user_conversations(user_id UUID)
RETURNS TABLE(
    conversation_id UUID,
    conversation_name VARCHAR,
    is_group BOOLEAN,
    conversation_type VARCHAR,
    last_message TEXT,
    last_message_time TIMESTAMPTZ,
    other_participant_id UUID,
    other_participant_name VARCHAR,
    other_participant_role VARCHAR,
    other_participant_online BOOLEAN,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS conversation_id,
        c.name AS conversation_name,
        c.is_group,
        c.conversation_type,
        m.text AS last_message,
        m.created_at AS last_message_time,
        p.id AS other_participant_id,
        p.name AS other_participant_name,
        p.role AS other_participant_role,
        p.online_status AS other_participant_online,
        COUNT(CASE WHEN msg.is_read = false AND msg.sender_id != user_id THEN 1 END) AS unread_count
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id != user_id
    LEFT JOIN profiles p ON cp2.user_id = p.id
    LEFT JOIN LATERAL (
        SELECT text, created_at FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) m ON true
    LEFT JOIN messages msg ON c.id = msg.conversation_id
    WHERE cp.user_id = user_id
    GROUP BY c.id, c.name, c.is_group, c.conversation_type, m.text, m.created_at, p.id, p.name, p.role, p.online_status
    ORDER BY m.created_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 14. ENABLE REALTIME SUBSCRIPTIONS
-- ====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ====================================================================
-- 15. CREATE STORAGE BUCKET FOR MEDIA
-- ====================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Public Read Access on chat-media" 
    ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

CREATE POLICY "Authenticated Upload Access on chat-media" 
    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Authenticated Update Access on chat-media" 
    ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'chat-media');

CREATE POLICY "Authenticated Delete Access on chat-media" 
    ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-media');

-- ====================================================================
-- 16. SEED DEMO DATA (OPTIONAL)
-- ====================================================================
-- Uncomment to insert demo conversations
/*
INSERT INTO public.conversations (id, name, description)
VALUES 
    ('a1111111-1111-1111-1111-111111111111', 'Elder Care - Margaret Vance Pod', 'Primary Caregiving & Medication Thread'),
    ('b2222222-2222-2222-2222-222222222222', 'Palliative Support - Robert Chen', 'Family Update & Daily Status Notes'),
    ('c3333333-3333-3333-3333-333333333333', 'General Care Team Hub', 'Coordinator Announcements & Shift Handoffs')
ON CONFLICT (id) DO NOTHING;
*/

-- ====================================================================
-- 17. VERIFICATION QUERIES
-- ====================================================================
-- Run these to verify everything is set up correctly
/*
SELECT COUNT(*) FROM profiles; -- Should be 0 initially
SELECT COUNT(*) FROM conversations; -- Should be 0 initially
SELECT COUNT(*) FROM conversation_participants; -- Should be 0 initially
SELECT COUNT(*) FROM messages; -- Should be 0 initially
SELECT COUNT(*) FROM admin_audit_logs; -- Should be 0 initially
*/