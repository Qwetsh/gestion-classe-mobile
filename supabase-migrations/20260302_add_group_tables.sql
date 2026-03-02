-- Migration: Add group tables for group work feature
-- Date: 2026-03-02
-- Description: Adds tables for managing student groups during sessions

-- ===========================================
-- 1. Group Templates (saved configurations per class)
-- ===========================================
CREATE TABLE IF NOT EXISTS group_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  groups_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_templates_user_id ON group_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_group_templates_class_id ON group_templates(class_id);

-- RLS Policies
ALTER TABLE group_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own group templates"
  ON group_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own group templates"
  ON group_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own group templates"
  ON group_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own group templates"
  ON group_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ===========================================
-- 2. Session Groups (active groups during a session)
-- ===========================================
CREATE TABLE IF NOT EXISTS session_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  group_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_groups_session_id ON session_groups(session_id);

-- RLS Policies (via session ownership)
ALTER TABLE session_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view groups from their sessions"
  ON session_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_groups.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create groups in their sessions"
  ON session_groups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_groups.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete groups from their sessions"
  ON session_groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_groups.session_id
      AND sessions.user_id = auth.uid()
    )
  );

-- ===========================================
-- 3. Group Members (student-group association)
-- ===========================================
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_group_id UUID NOT NULL REFERENCES session_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_members_session_group_id ON group_members(session_group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_student_id ON group_members(student_id);

-- RLS Policies (via session_groups -> sessions ownership)
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members from their groups"
  ON group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_members.session_group_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add members to their groups"
  ON group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_members.session_group_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update members in their groups"
  ON group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_members.session_group_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove members from their groups"
  ON group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_members.session_group_id
      AND s.user_id = auth.uid()
    )
  );

-- ===========================================
-- 4. Group Events (remarks and grades for groups)
-- ===========================================
CREATE TABLE IF NOT EXISTS group_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_group_id UUID NOT NULL REFERENCES session_groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('remarque', 'note')),
  note TEXT,
  photo_path TEXT,
  grade_value REAL,
  grade_max INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_events_session_group_id ON group_events(session_group_id);

-- RLS Policies (via session_groups -> sessions ownership)
ALTER TABLE group_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events from their groups"
  ON group_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_events.session_group_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create events in their groups"
  ON group_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_events.session_group_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update events in their groups"
  ON group_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_events.session_group_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete events from their groups"
  ON group_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM session_groups sg
      JOIN sessions s ON s.id = sg.session_id
      WHERE sg.id = group_events.session_group_id
      AND s.user_id = auth.uid()
    )
  );

-- ===========================================
-- Done!
-- ===========================================
-- To apply this migration:
-- 1. Go to your Supabase dashboard
-- 2. Navigate to SQL Editor
-- 3. Paste and run this script
