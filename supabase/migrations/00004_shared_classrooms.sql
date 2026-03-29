-- =============================================================================
-- Qalem — Shared Classrooms
-- =============================================================================

CREATE TABLE public.shared_classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES public.profiles(id),
  visibility TEXT DEFAULT 'organization' CHECK (visibility IN ('private', 'organization', 'public')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shared_classrooms_org_id ON public.shared_classrooms(org_id);
CREATE INDEX idx_shared_classrooms_stage_id ON public.shared_classrooms(stage_id);
CREATE INDEX idx_shared_classrooms_visibility ON public.shared_classrooms(visibility);

ALTER TABLE public.shared_classrooms ENABLE ROW LEVEL SECURITY;

-- Org members can read shared classrooms in their org; public ones are readable by all authenticated users
CREATE POLICY "shared_classrooms_select_member"
  ON public.shared_classrooms FOR SELECT
  USING (
    visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = shared_classrooms.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Admin, manager, and formateur can share classrooms
CREATE POLICY "shared_classrooms_insert_formateur"
  ON public.shared_classrooms FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = shared_classrooms.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('admin', 'manager', 'formateur')
    )
  );

-- Only the person who shared or admins can update visibility
CREATE POLICY "shared_classrooms_update"
  ON public.shared_classrooms FOR UPDATE
  USING (
    shared_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = shared_classrooms.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  );

-- Only the person who shared or admins can delete
CREATE POLICY "shared_classrooms_delete"
  ON public.shared_classrooms FOR DELETE
  USING (
    shared_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = shared_classrooms.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  );
