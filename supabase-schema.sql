-- ============================================
-- Gestion Classe - Supabase Schema
-- ============================================
-- Execute this SQL in Supabase SQL Editor
-- Dashboard > SQL Editor > New Query
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Classes table
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Student groups (îlots) table
CREATE TABLE IF NOT EXISTS public.student_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Students table (pseudonymized - only pseudo stored here)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pseudo TEXT NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.student_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grid_rows INTEGER DEFAULT 6,
  grid_cols INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Class-Room plans (student positions)
CREATE TABLE IF NOT EXISTS public.class_room_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  positions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE(class_id, room_id)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  topic TEXT,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('participation', 'bavardage', 'absence', 'remarque', 'sortie', 'retour')),
  subtype TEXT CHECK (subtype IN ('infirmerie', 'toilettes', 'convocation', 'exclusion') OR subtype IS NULL),
  note TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_classes_user_id ON public.classes(user_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_user_id ON public.student_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_class_id ON public.student_groups(class_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_group_id ON public.students(group_id);
CREATE INDEX IF NOT EXISTS idx_rooms_user_id ON public.rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON public.sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON public.events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_student_id ON public.events(student_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Each user can only see and modify their own data

-- Enable RLS on all tables
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_room_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Classes policies
CREATE POLICY "Users can view own classes" ON public.classes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own classes" ON public.classes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own classes" ON public.classes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own classes" ON public.classes
  FOR DELETE USING (auth.uid() = user_id);

-- Student groups policies
CREATE POLICY "Users can view own student_groups" ON public.student_groups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own student_groups" ON public.student_groups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own student_groups" ON public.student_groups
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own student_groups" ON public.student_groups
  FOR DELETE USING (auth.uid() = user_id);

-- Students policies
CREATE POLICY "Users can view own students" ON public.students
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own students" ON public.students
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own students" ON public.students
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own students" ON public.students
  FOR DELETE USING (auth.uid() = user_id);

-- Rooms policies
CREATE POLICY "Users can view own rooms" ON public.rooms
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rooms" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rooms" ON public.rooms
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rooms" ON public.rooms
  FOR DELETE USING (auth.uid() = user_id);

-- Class-Room plans policies (based on class ownership)
CREATE POLICY "Users can view own class_room_plans" ON public.class_room_plans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can insert own class_room_plans" ON public.class_room_plans
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update own class_room_plans" ON public.class_room_plans
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can delete own class_room_plans" ON public.class_room_plans
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND user_id = auth.uid())
  );

-- Sessions policies
CREATE POLICY "Users can view own sessions" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON public.sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Events policies (based on session ownership)
CREATE POLICY "Users can view own events" ON public.events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can insert own events" ON public.events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update own events" ON public.events
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can delete own events" ON public.events
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND user_id = auth.uid())
  );

-- ============================================
-- DONE!
-- ============================================
-- NOTE: The local_student_mapping table is NOT created here
-- because it should NEVER be synced to the server (RGPD compliance)
-- It only exists locally in SQLite on the device
