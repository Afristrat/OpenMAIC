-- Bootstrap an organization and its first administrator atomically. The usual
-- org_members INSERT policy correctly requires an existing admin, so it cannot
-- create the first membership.

CREATE OR REPLACE FUNCTION public.create_organization_with_admin(
  organization_name TEXT,
  organization_sector TEXT DEFAULT NULL,
  organization_default_locale TEXT DEFAULT 'fr-FR'
)
RETURNS SETOF public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  created_organization public.organizations;
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(organization_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name is required' USING ERRCODE = '22023';
  END IF;
  IF organization_sector IS NOT NULL AND organization_sector NOT IN (
    'healthcare', 'legal', 'tech', 'finance', 'education', 'industry'
  ) THEN
    RAISE EXCEPTION 'Invalid organization sector' USING ERRCODE = '22023';
  END IF;
  IF organization_default_locale NOT IN ('fr-FR', 'ar-MA', 'en-US') THEN
    RAISE EXCEPTION 'Invalid organization locale' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (name, sector, default_locale, settings)
  VALUES (trim(organization_name), organization_sector, organization_default_locale, '{}'::jsonb)
  RETURNING * INTO created_organization;

  INSERT INTO public.org_members (user_id, org_id, role)
  VALUES (authenticated_user_id, created_organization.id, 'admin');

  RETURN NEXT created_organization;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_admin(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_admin(TEXT, TEXT, TEXT) TO authenticated;

-- Keep the course catalogue consistent when its generated classroom is deleted.
-- The foreign key in 00035 clears courses.stage_id, while the ready-state
-- constraint correctly forbids a ready course without a classroom. Archive and
-- unpublish that course first, in the same database transaction.

CREATE OR REPLACE FUNCTION public.archive_courses_before_classroom_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.courses
  SET status = 'archived', catalog_visible = false
  WHERE stage_id = OLD.id AND status = 'ready';

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_courses_before_classroom_delete() FROM PUBLIC;

CREATE TRIGGER archive_courses_before_classroom_delete
  BEFORE DELETE ON public.stages
  FOR EACH ROW EXECUTE FUNCTION public.archive_courses_before_classroom_delete();
