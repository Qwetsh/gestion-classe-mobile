-- Migration v8: Add group_sessions feature (Séances de groupe notées)
-- Run this migration on Supabase SQL Editor

-- ============================================
-- Create Tables
-- ============================================

-- Group sessions table
CREATE TABLE IF NOT EXISTS public.group_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ
);

-- Grading criteria table
CREATE TABLE IF NOT EXISTS public.grading_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ
);

-- Session groups table
CREATE TABLE IF NOT EXISTS public.session_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  conduct_malus REAL NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ
);

-- Session group members table
CREATE TABLE IF NOT EXISTS public.session_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.session_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ,
  UNIQUE(group_id, student_id)
);

-- Group grades table
CREATE TABLE IF NOT EXISTS public.group_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.session_groups(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES public.grading_criteria(id) ON DELETE CASCADE,
  points_awarded REAL NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ,
  UNIQUE(group_id, criteria_id)
);

-- ============================================
-- Create Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_group_sessions_user_id ON public.group_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_class_id ON public.group_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_grading_criteria_session_id ON public.grading_criteria(session_id);
CREATE INDEX IF NOT EXISTS idx_session_groups_session_id ON public.session_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_session_group_members_group_id ON public.session_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_session_group_members_student_id ON public.session_group_members(student_id);
CREATE INDEX IF NOT EXISTS idx_group_grades_group_id ON public.group_grades(group_id);
CREATE INDEX IF NOT EXISTS idx_group_grades_criteria_id ON public.group_grades(criteria_id);

-- ============================================
-- Enable RLS
-- ============================================

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_grades ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: group_sessions
-- ============================================

CREATE POLICY "Users can view their own group sessions"
  ON public.group_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own group sessions"
  ON public.group_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own group sessions"
  ON public.group_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own group sessions"
  ON public.group_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: grading_criteria
-- (Access via parent group_sessions)
-- ============================================

CREATE POLICY "Users can view criteria of their sessions"
  ON public.grading_criteria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = grading_criteria.session_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert criteria for their sessions"
  ON public.grading_criteria FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = grading_criteria.session_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update criteria of their sessions"
  ON public.grading_criteria FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = grading_criteria.session_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete criteria of their sessions"
  ON public.grading_criteria FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = grading_criteria.session_id
      AND gs.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies: session_groups
-- (Access via parent group_sessions)
-- ============================================

CREATE POLICY "Users can view groups of their sessions"
  ON public.session_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = session_groups.session_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert groups for their sessions"
  ON public.session_groups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = session_groups.session_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update groups of their sessions"
  ON public.session_groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = session_groups.session_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete groups of their sessions"
  ON public.session_groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = session_groups.session_id
      AND gs.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies: session_group_members
-- (Access via parent session_groups -> group_sessions)
-- ============================================

CREATE POLICY "Users can view members of their session groups"
  ON public.session_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = session_group_members.group_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert members to their session groups"
  ON public.session_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = session_group_members.group_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update members of their session groups"
  ON public.session_group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = session_group_members.group_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete members from their session groups"
  ON public.session_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = session_group_members.group_id
      AND gs.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies: group_grades
-- (Access via parent session_groups -> group_sessions)
-- ============================================

CREATE POLICY "Users can view grades of their session groups"
  ON public.group_grades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = group_grades.group_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert grades to their session groups"
  ON public.group_grades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = group_grades.group_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update grades of their session groups"
  ON public.group_grades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = group_grades.group_id
      AND gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete grades from their session groups"
  ON public.group_grades FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.session_groups sg
      JOIN public.group_sessions gs ON gs.id = sg.session_id
      WHERE sg.id = group_grades.group_id
      AND gs.user_id = auth.uid()
    )
  );

-- ============================================
-- Verification Queries (run separately)
-- ============================================

-- Check tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%group%';

-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%group%';
