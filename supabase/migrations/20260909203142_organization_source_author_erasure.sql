-- Preserve organization assets independently of an individual author's account.
ALTER TABLE public.organization_sources
  ALTER COLUMN owner_id DROP NOT NULL,
  DROP CONSTRAINT organization_sources_owner_id_fkey,
  ADD CONSTRAINT organization_sources_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.formation_source_manifests
  ALTER COLUMN owner_id DROP NOT NULL,
  DROP CONSTRAINT formation_source_manifests_owner_id_fkey,
  ADD CONSTRAINT formation_source_manifests_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE FUNCTION public.require_organization_source_author()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'SOURCE_AUTHOR_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_organization_source_author() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_organization_source_author BEFORE INSERT ON public.organization_sources
  FOR EACH ROW EXECUTE FUNCTION public.require_organization_source_author();

CREATE OR REPLACE FUNCTION public.assert_source_manifest_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  distinct_source_count INTEGER;
  valid_source_count INTEGER;
BEGIN
  -- Only attribution can be cleared by a deleted profile's FK action.
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
    AND (to_jsonb(NEW)-'owner_id') = (to_jsonb(OLD)-'owner_id')
    AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.owner_id)
  THEN RETURN NEW; END IF;
  SELECT count(DISTINCT source_id), count(source.id)
  INTO distinct_source_count, valid_source_count
  FROM unnest(NEW.source_ids) AS source_id
  LEFT JOIN public.organization_sources AS source
    ON source.id = source_id
   AND source.org_id = NEW.org_id
   AND source.status = 'ready';

  IF distinct_source_count <> cardinality(NEW.source_ids)
     OR valid_source_count <> cardinality(NEW.source_ids) THEN
    RAISE EXCEPTION 'Every selected source must be unique, ready and owned by the manifest organization'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = NEW.org_id AND user_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Manifest owner is not a member of the organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_source_manifest_integrity() FROM PUBLIC, anon, authenticated;

-- Applies after the candidate Diwan reference migration, preserving its validation.
CREATE OR REPLACE FUNCTION public.assert_diwan_manifest_references()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  item JSONB;
  field TEXT;
  seen TEXT[] := '{}';
BEGIN
  -- Only attribution can be cleared by a deleted profile's FK action.
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
    AND (to_jsonb(NEW)-'owner_id') = (to_jsonb(OLD)-'owner_id')
    AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.owner_id)
  THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND
    (NEW.id, NEW.org_id, NEW.owner_id, NEW.version, NEW.source_ids, NEW.diwan_references, NEW.created_at)
    IS DISTINCT FROM
    (OLD.id, OLD.org_id, OLD.owner_id, OLD.version, OLD.source_ids, OLD.diwan_references, OLD.created_at) THEN
    RAISE EXCEPTION 'Source manifest versions are immutable' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(NEW.diwan_references) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Diwan references' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(NEW.diwan_references) + cardinality(NEW.source_ids) > 20 THEN
    RAISE EXCEPTION 'At most 20 sources may be selected' USING ERRCODE = '23514';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.diwan_references) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid Diwan reference' USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 5 THEN
      RAISE EXCEPTION 'Invalid Diwan reference fields' USING ERRCODE = '23514';
    END IF;
    FOREACH field IN ARRAY ARRAY['corpusId', 'sourceId', 'sourceVersion', 'checksumSha256', 'title'] LOOP
      IF jsonb_typeof(item -> field) IS DISTINCT FROM 'string'
        OR char_length(btrim(item ->> field)) NOT BETWEEN 1 AND 512 THEN
        RAISE EXCEPTION 'Invalid Diwan reference field' USING ERRCODE = '23514';
      END IF;
    END LOOP;
    IF (item ->> 'checksumSha256') !~ '^sha256:[0-9a-f]{64}$'
      OR (item ->> 'sourceId') = ANY(seen) THEN
      RAISE EXCEPTION 'Invalid or duplicate Diwan source' USING ERRCODE = '23514';
    END IF;
    seen := array_append(seen, item ->> 'sourceId');
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_diwan_manifest_references() FROM PUBLIC, anon, authenticated;
