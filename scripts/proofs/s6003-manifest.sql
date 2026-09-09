-- Run only inside a transaction after the candidate migration, then ROLLBACK.
-- Uses the authorized synthetic S-034 tenant; no real user data is read or changed.
DO $$
DECLARE
  tenant UUID := '00000000-0034-4000-9000-202609090001';
  actor UUID := '5b58a2ea-9ee5-41e8-ad83-b868536e23b5';
  first_manifest public.formation_source_manifests;
  next_manifest public.formation_source_manifests;
  reference JSONB := jsonb_build_array(jsonb_build_object(
    'corpusId', 'corpus:test', 'sourceId', 'source:test', 'sourceVersion', 'version:test',
    'checksumSha256', 'sha256:' || repeat('a', 64), 'title', 'Document de recette'));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = tenant AND user_id = actor) THEN
    RAISE EXCEPTION 'Authorized synthetic fixture missing';
  END IF;
  SELECT * INTO first_manifest FROM public.replace_formation_source_manifest(tenant, actor, '{}', NULL, reference);
  IF first_manifest.diwan_references <> reference THEN RAISE EXCEPTION 'Reference not persisted'; END IF;
  SELECT * INTO next_manifest FROM public.replace_formation_source_manifest(tenant, actor, '{}', first_manifest.version);
  IF next_manifest.diwan_references <> reference OR next_manifest.version <> first_manifest.version + 1 THEN
    RAISE EXCEPTION 'Legacy update lost external selection';
  END IF;
  BEGIN
    PERFORM public.replace_formation_source_manifest(tenant, actor, '{}', first_manifest.version, '[]');
    RAISE EXCEPTION 'Stale version accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    UPDATE public.formation_source_manifests SET diwan_references = '[]' WHERE id = first_manifest.id;
    RAISE EXCEPTION 'Immutable source changed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.replace_formation_source_manifest(tenant, actor, '{}', next_manifest.version, reference || reference);
    RAISE EXCEPTION 'Duplicate source accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.replace_formation_source_manifest(tenant, actor, '{}', next_manifest.version,
      jsonb_set(reference, '{0,checksumSha256}', '"invalid"'));
    RAISE EXCEPTION 'Invalid checksum accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT * INTO next_manifest FROM public.replace_formation_source_manifest(tenant, actor, '{}', next_manifest.version, '[]');
  IF next_manifest.diwan_references <> '[]' THEN RAISE EXCEPTION 'Explicit removal failed'; END IF;
  IF has_function_privilege('anon', 'public.replace_formation_source_manifest(uuid,uuid,uuid[],integer,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.replace_formation_source_manifest(uuid,uuid,uuid[],integer,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.replace_formation_source_manifest(uuid,uuid,uuid[],integer,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC privileges incorrect';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.formation_source_manifests'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;
  PERFORM set_config('qalem.s6003_manifest', first_manifest.id::text, true);
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5b58a2ea-9ee5-41e8-ad83-b868536e23b5', true) IS NOT NULL AS actor_configured;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.formation_source_manifests WHERE id = current_setting('qalem.s6003_manifest')::uuid) <> 1 THEN
    RAISE EXCEPTION 'Member cannot read reference';
  END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub', '00000000-6003-4000-8000-000000000099', true) IS NOT NULL AS outsider_configured;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.formation_source_manifests WHERE id = current_setting('qalem.s6003_manifest')::uuid) THEN
    RAISE EXCEPTION 'Cross-tenant reference visible';
  END IF;
END; $$;
RESET ROLE;
SELECT 'S6003_MANIFEST_PROOF_OK' AS result;
