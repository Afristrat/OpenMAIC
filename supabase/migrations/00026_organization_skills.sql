-- Tenant-scoped, persistent skill packs installed by organization administrators.
CREATE TABLE public.organization_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL CHECK (skill_id ~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$'),
  manifest JSONB NOT NULL,
  installed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, skill_id)
);

CREATE INDEX idx_organization_skills_org_id ON public.organization_skills(org_id);
CREATE TRIGGER set_updated_at_organization_skills
  BEFORE UPDATE ON public.organization_skills
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.organization_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_skills_select"
  ON public.organization_skills FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = organization_skills.org_id
      AND org_members.user_id = auth.uid()
  ));

CREATE POLICY "organization_skills_insert"
  ON public.organization_skills FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = organization_skills.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('admin', 'manager')
  ));

CREATE POLICY "organization_skills_update"
  ON public.organization_skills FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = organization_skills.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('admin', 'manager')
  ));

CREATE POLICY "organization_skills_delete"
  ON public.organization_skills FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = organization_skills.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('admin', 'manager')
  ));
