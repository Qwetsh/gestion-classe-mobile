-- Migration v9: Add TP templates feature
-- Run this migration on Supabase SQL Editor

-- ============================================
-- Create Tables
-- ============================================

-- TP templates table
CREATE TABLE IF NOT EXISTS public.tp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- TP template criteria table
CREATE TABLE IF NOT EXISTS public.tp_template_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES public.tp_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ
);

-- ============================================
-- Create Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tp_templates_user_id ON public.tp_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_tp_template_criteria_template_id ON public.tp_template_criteria(template_id);

-- ============================================
-- Enable RLS
-- ============================================

ALTER TABLE public.tp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tp_template_criteria ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: tp_templates
-- ============================================

CREATE POLICY "Users can view their own TP templates"
  ON public.tp_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TP templates"
  ON public.tp_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TP templates"
  ON public.tp_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TP templates"
  ON public.tp_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies: tp_template_criteria
-- ============================================

CREATE POLICY "Users can view criteria of their templates"
  ON public.tp_template_criteria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tp_templates t
      WHERE t.id = tp_template_criteria.template_id
      AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert criteria for their templates"
  ON public.tp_template_criteria FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tp_templates t
      WHERE t.id = tp_template_criteria.template_id
      AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update criteria of their templates"
  ON public.tp_template_criteria FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tp_templates t
      WHERE t.id = tp_template_criteria.template_id
      AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete criteria from their templates"
  ON public.tp_template_criteria FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tp_templates t
      WHERE t.id = tp_template_criteria.template_id
      AND t.user_id = auth.uid()
    )
  );
