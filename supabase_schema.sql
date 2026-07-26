-- ====================================================================
-- AKIRAPA MESSAGING APP - SUPABASE DATABASE & STORAGE SCHEMA
-- Run this script in your Supabase SQL Editor (https://app.supabase.com)
-- ====================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create PROFILES Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    role TEXT NOT NULL DEFAULT 'CAREGIVER', -- 'CAREGIVER', 'FAMILY_MEMBER', 'ADMIN', 'CLIENT'
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to profiles" 
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Allow users to update their own profile" 
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Allow users to insert their own profile" 
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);


-- 3. Create CONVERSATIONS Table (Care Pod Threads)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on Conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read conversations" 
    ON public.conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to create conversations" 
    ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);


-- 4. Create CONVERSATION MEMBERS Table
CREATE TABLE IF NOT EXISTS public.conversation_members (
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- Enable RLS on Conversation Members
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on conversation_members" 
    ON public.conversation_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert on conversation_members" 
    ON public.conversation_members FOR INSERT TO authenticated WITH CHECK (true);


-- 5. Create MESSAGES Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name TEXT,
    sender_role TEXT,
    text TEXT,
    media_url TEXT,
    media_type TEXT, -- 'image', 'video', 'audio'
    media_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read messages" 
    ON public.messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to send messages" 
    ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);


-- 6. ENABLE REALTIME SUBSCRIPTIONS ON MESSAGES
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;


-- 7. AUTOMATIC PROFILE TRIGGER ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, phone_number)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'CAREGIVER'),
    COALESCE(new.raw_user_meta_data->>'phone_number', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    phone_number = EXCLUDED.phone_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 8. CREATE STORAGE BUCKET FOR MEDIA & VOICE MEMOS
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Public Read Access on chat-media" 
    ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

CREATE POLICY "Authenticated Upload Access on chat-media" 
    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media');


-- 9. SEED DEMO CARE CONVERSATIONS
INSERT INTO public.conversations (id, name, description)
VALUES 
    ('a1111111-1111-1111-1111-111111111111', 'Elder Care - Margaret Vance Pod', 'Primary Caregiving & Medication Thread'),
    ('b2222222-2222-2222-2222-222222222222', 'Palliative Support - Robert Chen', 'Family Update & Daily Status Notes'),
    ('c3333333-3333-3333-3333-333333333333', 'General Care Team Hub', 'Coordinator Announcements & Shift Handoffs')
ON CONFLICT (id) DO NOTHING;
