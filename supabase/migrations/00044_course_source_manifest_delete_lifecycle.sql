-- Clearing an organization and its source manifest can invoke two independent
-- foreign-key SET NULL actions. Keep the course invariant valid after the
-- first action instead of rejecting the organization deletion mid-statement.

CREATE OR REPLACE FUNCTION public.assert_course_source_manifest_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.source_manifest_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.source_manifest_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.formation_source_manifests
    WHERE id = NEW.source_manifest_id AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Course and source manifest must belong to the same organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
