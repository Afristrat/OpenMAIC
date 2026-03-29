-- =============================================================================
-- Migration 00008: Curriculum Graph
-- Adds curriculum_links table for inter-stage relationships (prerequisite,
-- follows, deepens, reviews).
-- =============================================================================

CREATE TABLE public.curriculum_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  to_stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('prerequisite', 'follows', 'deepens', 'reviews')),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(from_stage_id, to_stage_id, org_id)
);

ALTER TABLE public.curriculum_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read" ON public.curriculum_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.org_members WHERE org_id = curriculum_links.org_id AND user_id = auth.uid())
  );

CREATE POLICY "Formateurs manage" ON public.curriculum_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.org_members WHERE org_id = curriculum_links.org_id AND user_id = auth.uid() AND role IN ('admin', 'manager', 'formateur'))
  );
