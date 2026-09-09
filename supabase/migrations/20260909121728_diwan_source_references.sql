-- S6-003: pin external references in the existing immutable source manifest.
ALTER TABLE public.formation_source_manifests
  ADD COLUMN diwan_references JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION public.assert_diwan_manifest_references()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  item JSONB;
  field TEXT;
  seen TEXT[] := '{}';
BEGIN
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

CREATE TRIGGER assert_diwan_manifest_references
  BEFORE INSERT OR UPDATE ON public.formation_source_manifests
  FOR EACH ROW EXECUTE FUNCTION public.assert_diwan_manifest_references();
REVOKE ALL ON FUNCTION public.assert_diwan_manifest_references() FROM PUBLIC, anon, authenticated;

-- Preserve the named-argument API. NULL means keep the prior external selection;
-- [] explicitly removes it. Existing local clients cannot silently erase it.
DROP FUNCTION public.replace_formation_source_manifest(UUID, UUID, UUID[], INTEGER);
CREATE FUNCTION public.replace_formation_source_manifest(
  p_org_id UUID,
  p_owner_id UUID,
  p_source_ids UUID[],
  p_expected_version INTEGER DEFAULT NULL,
  p_diwan_references JSONB DEFAULT NULL
)
RETURNS SETOF public.formation_source_manifests
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  latest_manifest public.formation_source_manifests;
  created_manifest public.formation_source_manifests;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_owner_id::text, 0));
  SELECT * INTO latest_manifest FROM public.formation_source_manifests
    WHERE org_id = p_org_id AND owner_id = p_owner_id ORDER BY version DESC LIMIT 1;
  IF p_expected_version IS NOT NULL
    AND p_expected_version <> COALESCE(latest_manifest.version, 0) THEN
    RAISE EXCEPTION 'Source manifest version conflict' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.formation_source_manifests
    (org_id, owner_id, version, source_ids, previous_manifest_id, diwan_references)
  VALUES (p_org_id, p_owner_id, COALESCE(latest_manifest.version, 0) + 1,
    COALESCE(p_source_ids, '{}'::uuid[]), latest_manifest.id,
    COALESCE(p_diwan_references, latest_manifest.diwan_references, '[]'::jsonb))
  RETURNING * INTO created_manifest;
  RETURN NEXT created_manifest;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_formation_source_manifest(UUID, UUID, UUID[], INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_formation_source_manifest(UUID, UUID, UUID[], INTEGER, JSONB)
  TO service_role;
-- Existing RLS and table grants remain intact; no new browser mutation permission.
NOTIFY pgrst, 'reload schema';
