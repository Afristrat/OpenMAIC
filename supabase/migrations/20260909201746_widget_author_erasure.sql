-- Authorship is removable; published content and version identity are immutable.
ALTER TABLE public.widget_templates
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT widget_templates_created_by_fkey,
  ADD CONSTRAINT widget_templates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.widget_template_versions
  ALTER COLUMN created_by DROP NOT NULL,
  DROP CONSTRAINT widget_template_versions_created_by_fkey,
  ADD CONSTRAINT widget_template_versions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT widget_template_versions_published_by_fkey,
  ADD CONSTRAINT widget_template_versions_published_by_fkey
    FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.widget_template_publications
  ALTER COLUMN published_by DROP NOT NULL,
  DROP CONSTRAINT widget_template_publications_published_by_fkey,
  ADD CONSTRAINT widget_template_publications_published_by_fkey
    FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Preserve the former NOT NULL invariant on creation, while allowing FK erasure.
CREATE OR REPLACE FUNCTION public.require_widget_author_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (TG_TABLE_NAME = 'widget_template_publications' AND to_jsonb(NEW)->>'published_by' IS NULL)
    OR (TG_TABLE_NAME <> 'widget_template_publications' AND to_jsonb(NEW)->>'created_by' IS NULL)
  THEN RAISE EXCEPTION 'WIDGET_AUTHOR_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_widget_author_on_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_widget_author_on_insert BEFORE INSERT ON public.widget_templates
  FOR EACH ROW EXECUTE FUNCTION public.require_widget_author_on_insert();
CREATE TRIGGER require_widget_author_on_insert BEFORE INSERT ON public.widget_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.require_widget_author_on_insert();
CREATE TRIGGER require_widget_author_on_insert BEFORE INSERT ON public.widget_template_publications
  FOR EACH ROW EXECUTE FUNCTION public.require_widget_author_on_insert();

CREATE OR REPLACE FUNCTION public.prevent_widget_template_version_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WIDGET_TEMPLATE_VERSION_IMMUTABLE';
  END IF;

  -- FK actions may clear one reference at a time. The referenced Auth row must
  -- already be gone, and every other field must remain byte-for-byte equivalent.
  IF (to_jsonb(OLD) - ARRAY['created_by','published_by'])
       = (to_jsonb(NEW) - ARRAY['created_by','published_by'])
    AND (OLD.created_by IS DISTINCT FROM NEW.created_by
      OR OLD.published_by IS DISTINCT FROM NEW.published_by)
    AND (OLD.created_by IS NOT DISTINCT FROM NEW.created_by
      OR (NEW.created_by IS NULL AND OLD.created_by IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.created_by)))
    AND (OLD.published_by IS NOT DISTINCT FROM NEW.published_by
      OR (NEW.published_by IS NULL AND OLD.published_by IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.published_by)))
  THEN RETURN NEW; END IF;

  -- The only ordinary update remains the first publication of an unchanged version.
  IF (to_jsonb(OLD) - ARRAY['published_at','published_by'])
       = (to_jsonb(NEW) - ARRAY['published_at','published_by'])
    AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
    AND NEW.published_by IS NOT NULL
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'WIDGET_TEMPLATE_VERSION_IMMUTABLE';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_widget_template_version_mutation() FROM PUBLIC, anon, authenticated;
