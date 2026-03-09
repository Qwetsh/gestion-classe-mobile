-- Migration v7: Remove student_groups feature (replaced by group_sessions)
-- Run this migration on Supabase SQL Editor

-- 1. Remove foreign key constraint and column from students
ALTER TABLE public.students DROP COLUMN IF EXISTS group_id;

-- 2. Drop RLS policies for student_groups
DROP POLICY IF EXISTS "Users can view their own groups" ON public.student_groups;
DROP POLICY IF EXISTS "Users can insert their own groups" ON public.student_groups;
DROP POLICY IF EXISTS "Users can update their own groups" ON public.student_groups;
DROP POLICY IF EXISTS "Users can delete their own groups" ON public.student_groups;

-- 3. Drop the student_groups table
DROP TABLE IF EXISTS public.student_groups;

-- Verification query (run separately to check):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'group_id';
-- Should return 0 rows
