-- ============================================
-- Migration v6: Groups + Session Notes + Retour event type
-- Execute in Supabase Dashboard > SQL Editor
-- ============================================

-- 1. Create student_groups table
CREATE TABLE IF NOT EXISTS public.student_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_student_groups_user_id ON public.student_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_class_id ON public.student_groups(class_id);

-- 3. Enable RLS on student_groups
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for student_groups
CREATE POLICY "Users can view own student_groups" ON public.student_groups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own student_groups" ON public.student_groups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own student_groups" ON public.student_groups
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own student_groups" ON public.student_groups
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Add group_id column to students
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.student_groups(id) ON DELETE SET NULL;

-- 6. Add index for group_id
CREATE INDEX IF NOT EXISTS idx_students_group_id ON public.students(group_id);

-- 7. Add notes column to sessions
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 8. Update events type CHECK constraint to include 'retour'
-- First drop the existing constraint
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_type_check;

-- Then add the new constraint with 'retour'
ALTER TABLE public.events
ADD CONSTRAINT events_type_check
CHECK (type IN ('participation', 'bavardage', 'absence', 'remarque', 'sortie', 'retour'));

-- ============================================
-- DONE! Verify with:
-- SELECT * FROM student_groups LIMIT 1;
-- SELECT group_id FROM students LIMIT 1;
-- SELECT notes FROM sessions LIMIT 1;
-- ============================================
