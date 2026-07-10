-- =============================================================================
-- Qalem — Classroom Templates
-- =============================================================================

CREATE TABLE public.classroom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  description TEXT,
  requirements JSONB NOT NULL, -- Pre-filled UserRequirements
  agent_config_ids TEXT[], -- References to agent configs
  skill_ids TEXT[], -- References to skills
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- null = system template
  created_by UUID REFERENCES public.profiles(id),
  language TEXT DEFAULT 'fr-FR',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_classroom_templates_sector ON public.classroom_templates(sector);
CREATE INDEX idx_classroom_templates_org_id ON public.classroom_templates(org_id);

ALTER TABLE public.classroom_templates ENABLE ROW LEVEL SECURITY;

-- System templates (org_id IS NULL) are readable by all authenticated users
-- Org templates are readable by org members only
CREATE POLICY "classroom_templates_select"
  ON public.classroom_templates FOR SELECT
  USING (
    org_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = classroom_templates.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Admins and managers can create org templates
CREATE POLICY "classroom_templates_insert"
  ON public.classroom_templates FOR INSERT
  WITH CHECK (
    org_id IS NULL -- system templates inserted via migration/seed
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = classroom_templates.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('admin', 'manager')
    )
  );

-- Admins can update org templates
CREATE POLICY "classroom_templates_update"
  ON public.classroom_templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = classroom_templates.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  );

-- Admins can delete org templates
CREATE POLICY "classroom_templates_delete"
  ON public.classroom_templates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = classroom_templates.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'admin'
    )
  );
