-- =============================================================================
-- S1-003 — Course pivot and validated import records
-- =============================================================================

CREATE TABLE public.course_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL CHECK (char_length(trim(original_filename)) > 0),
  storage_path TEXT NOT NULL UNIQUE CHECK (char_length(trim(storage_path)) > 0),
  canvas_version TEXT NOT NULL DEFAULT 'v1' CHECK (canvas_version = 'v1'),
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'conform', 'rejected')),
  validation_report JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(validation_report) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_imports_owner_created_at
  ON public.course_imports(owner_id, created_at DESC);

CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  stage_id TEXT UNIQUE REFERENCES public.stages(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  language TEXT NOT NULL CHECK (language IN ('fr-FR', 'ar-MA', 'en-US')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('generated', 'imported', 'catalog_copy')),
  import_id UUID UNIQUE REFERENCES public.course_imports(id) ON DELETE SET NULL,
  outline JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'archived')),
  catalog_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT courses_import_link_matches_source
    CHECK ((source_kind = 'imported') = (import_id IS NOT NULL)),
  CONSTRAINT courses_ready_requires_classroom
    CHECK (status <> 'ready' OR stage_id IS NOT NULL)
);

CREATE INDEX idx_courses_owner_created_at ON public.courses(owner_id, created_at DESC);
CREATE INDEX idx_courses_org_status ON public.courses(org_id, status);
CREATE INDEX idx_courses_catalog_ready ON public.courses(catalog_visible, status)
  WHERE catalog_visible = true AND status = 'ready';

CREATE TRIGGER set_updated_at_courses
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Service writes also pass this constraint: a course cannot claim another
-- tenant's classroom or a tenant owner who is not a member of that tenant.
CREATE OR REPLACE FUNCTION public.assert_course_tenant_integrity()
RETURNS TRIGGER AS $$
DECLARE
  stage_org_id UUID;
BEGIN
  IF NEW.org_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = NEW.org_id AND user_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Course owner is not a member of the organization';
  END IF;

  IF NEW.stage_id IS NOT NULL THEN
    SELECT org_id INTO stage_org_id FROM public.stages WHERE id = NEW.stage_id;
    IF stage_org_id IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'Course and classroom must belong to the same organization';
    END IF;
  END IF;

  IF NEW.import_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.course_imports
    WHERE id = NEW.import_id AND owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Course import does not belong to the course owner';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assert_course_tenant_integrity
  BEFORE INSERT OR UPDATE OF owner_id, org_id, stage_id, import_id
  ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.assert_course_tenant_integrity();

ALTER TABLE public.course_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_imports_select_owner"
  ON public.course_imports FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "course_imports_insert_service_only"
  ON public.course_imports FOR INSERT WITH CHECK (false);
CREATE POLICY "course_imports_update_service_only"
  ON public.course_imports FOR UPDATE USING (false);
CREATE POLICY "course_imports_delete_service_only"
  ON public.course_imports FOR DELETE USING (false);

CREATE POLICY "courses_select_owner"
  ON public.courses FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "courses_select_org_member"
  ON public.courses FOR SELECT USING (
    org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = courses.org_id AND user_id = auth.uid()
    )
  );
CREATE POLICY "courses_select_catalog_ready"
  ON public.courses FOR SELECT USING (
    catalog_visible = true AND status = 'ready' AND auth.role() = 'authenticated'
  );
CREATE POLICY "courses_insert_service_only"
  ON public.courses FOR INSERT WITH CHECK (false);
CREATE POLICY "courses_update_service_only"
  ON public.courses FOR UPDATE USING (false);
CREATE POLICY "courses_delete_service_only"
  ON public.courses FOR DELETE USING (false);
