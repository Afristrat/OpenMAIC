BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'author-a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'author-b@example.test');
INSERT INTO public.profiles (id, nickname) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Auteur A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Auteur B')
ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;
INSERT INTO public.organizations (id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Organisation A'),
  ('22222222-2222-4222-8222-222222222222', 'Organisation B');
INSERT INTO public.org_members (user_id, org_id, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'author'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '22222222-2222-4222-8222-222222222222', 'author');

INSERT INTO public.organization_sources
  (id, org_id, owner_id, name, mime_type, size_bytes, content_hash, parser_id, text_content)
VALUES
  ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'A.pdf', 'application/pdf', 100, repeat('a', 64), 'unpdf', 'Marge cible 30 %.'),
  ('10000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'B.pdf', 'application/pdf', 100, repeat('b', 64), 'unpdf', 'Marge cible 45 %.'),
  ('10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'C.md', 'text/markdown', 80, repeat('c', 64), 'native', 'Annexe.'),
  ('20000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Foreign.pdf', 'application/pdf', 90, repeat('d', 64), 'unpdf', 'Other tenant.');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT version, cardinality(source_ids)
FROM public.replace_formation_source_manifest(
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  ARRAY[
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'
  ]::uuid[],
  0
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.replace_formation_source_manifest(uuid,uuid,uuid[],integer)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Manifest replacement must remain SECURITY INVOKER';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.replace_formation_source_manifest(uuid,uuid,uuid[],integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated role must not execute manifest replacement';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.replace_formation_source_manifest(uuid,uuid,uuid[],integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Service role must execute manifest replacement';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.formation_source_manifests (org_id, owner_id, version, source_ids)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      2,
      ARRAY[
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001'
      ]::uuid[]
    );
    RAISE EXCEPTION 'cross-tenant source unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF (SELECT max(version) FROM public.formation_source_manifests) <> 1 THEN
    RAISE EXCEPTION 'invalid selection changed the current version';
  END IF;
END
$$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.replace_formation_source_manifest(
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],
      0
    );
    RAISE EXCEPTION 'stale version unexpectedly accepted';
  EXCEPTION WHEN serialization_failure THEN
    NULL;
  END;
END
$$;
SELECT version, cardinality(source_ids)
FROM public.replace_formation_source_manifest(
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  ARRAY[
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003'
  ]::uuid[],
  1
);
RESET ROLE;

DO $$
DECLARE
  current_manifest UUID;
BEGIN
  SELECT id INTO current_manifest
  FROM public.formation_source_manifests
  WHERE org_id = '11111111-1111-4111-8111-111111111111'
  ORDER BY version DESC
  LIMIT 1;

  INSERT INTO public.courses
    (id, owner_id, org_id, title, language, source_kind, outline, status, source_manifest_id)
  VALUES
    ('30000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'Formation A', 'fr-FR', 'generated', '{}'::jsonb, 'draft', current_manifest);

  BEGIN
    INSERT INTO public.courses
      (id, owner_id, org_id, title, language, source_kind, outline, status, source_manifest_id)
    VALUES
      ('30000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '22222222-2222-4222-8222-222222222222', 'Formation B', 'fr-FR', 'generated', '{}'::jsonb, 'draft', current_manifest);
    RAISE EXCEPTION 'cross-tenant manifest unexpectedly linked';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.formation_source_manifests) <> 2 THEN
    RAISE EXCEPTION 'manifest history is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.formation_source_manifests newer
    JOIN public.formation_source_manifests older ON older.id = newer.previous_manifest_id
    WHERE newer.version = 2 AND older.version = 1
  ) THEN
    RAISE EXCEPTION 'manifest version chain is broken';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.organization_sources) <> 3 THEN
    RAISE EXCEPTION 'source library RLS exposed another tenant';
  END IF;
  IF (SELECT count(*) FROM public.formation_source_manifests) <> 2 THEN
    RAISE EXCEPTION 'source manifest RLS exposed another tenant';
  END IF;
END
$$;
RESET ROLE;

ROLLBACK;
SELECT 's6004-db-contract-ok';
