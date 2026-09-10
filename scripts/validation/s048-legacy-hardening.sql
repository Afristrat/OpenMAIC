-- Run inside BEGIN/ROLLBACK in qalem_recipe, never against production.
DO $$ BEGIN
  IF current_database()<>'qalem_recipe' THEN RAISE EXCEPTION 'Isolated recipe DB required'; END IF;
END $$;
INSERT INTO auth.users(id) VALUES
 ('00000000-0048-4000-8000-000000000101'),
 ('00000000-0048-4000-8000-000000000102');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0048-4000-8000-000000000111','S048 private usage A',10),
 ('00000000-0048-4000-8000-000000000112','S048 private usage B',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0048-4000-8000-000000000101','00000000-0048-4000-8000-000000000111','admin'),
 ('00000000-0048-4000-8000-000000000102','00000000-0048-4000-8000-000000000112','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s048-hardening-proof','00000000-0048-4000-8000-000000000101','00000000-0048-4000-8000-000000000111','S048 hardening');
INSERT INTO public.scenes(id,stage_id,type,"order",content,updated_at) VALUES
 ('s048-hardening-scene','s048-hardening-proof','slide',0,'{}','2000-01-01');
INSERT INTO public.usage_records(org_id,user_id,metric,quantity,billing_period) VALUES
 ('00000000-0048-4000-8000-000000000111','00000000-0048-4000-8000-000000000101','tts_minutes',2,'2026-09'),
 ('00000000-0048-4000-8000-000000000111','00000000-0048-4000-8000-000000000101','tts_minutes',3,'2026-09'),
 ('00000000-0048-4000-8000-000000000112','00000000-0048-4000-8000-000000000102','tts_minutes',7,'2026-09');

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.usage_summary;
    RAISE EXCEPTION 'Anonymous usage view exposure';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.usage_records;
    RAISE EXCEPTION 'Anonymous usage table exposure';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.get_user_org_ids();
    RAISE EXCEPTION 'Anonymous membership helper exposure';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0048-4000-8000-000000000101',true);
DO $$ BEGIN
  IF (SELECT array_agg(id) FROM public.get_user_org_ids() id)
    IS DISTINCT FROM ARRAY['00000000-0048-4000-8000-000000000111'::uuid]
  THEN RAISE EXCEPTION 'Membership helper crossed tenant boundary'; END IF;
  BEGIN
    PERFORM * FROM public.usage_summary;
    RAISE EXCEPTION 'Authenticated direct usage exposure';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0048-4000-8000-000000000102',true);
DO $$ BEGIN
  IF (SELECT array_agg(id) FROM public.get_user_org_ids() id)
    IS DISTINCT FROM ARRAY['00000000-0048-4000-8000-000000000112'::uuid]
  THEN RAISE EXCEPTION 'Membership helper reused another identity'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.get_user_org_ids())
  THEN RAISE EXCEPTION 'Missing actor returned memberships'; END IF;
END $$;
RESET ROLE;

-- A caller-controlled schema must not replace the timestamp implementation.
CREATE SCHEMA qalem_s048_shadow;
CREATE FUNCTION qalem_s048_shadow.now() RETURNS timestamptz LANGUAGE sql
AS $$ SELECT '1900-01-01'::timestamptz $$;
GRANT USAGE ON SCHEMA qalem_s048_shadow TO service_role;
SET LOCAL ROLE service_role;
SET LOCAL search_path = qalem_s048_shadow, public, pg_catalog;
UPDATE public.scenes SET content='{"proof":true}' WHERE id='s048-hardening-scene';
DO $$ BEGIN
  IF (SELECT updated_at FROM public.scenes WHERE id='s048-hardening-scene')
    IS DISTINCT FROM pg_catalog.transaction_timestamp()
  THEN RAISE EXCEPTION 'Scene timestamp was shadowed'; END IF;
  IF (SELECT tts_minutes FROM public.usage_summary
    WHERE org_id='00000000-0048-4000-8000-000000000111' AND billing_period='2026-09')
    IS DISTINCT FROM 5::numeric
  THEN RAISE EXCEPTION 'Server usage aggregation changed'; END IF;
  IF (SELECT tts_minutes FROM public.usage_summary
    WHERE org_id='00000000-0048-4000-8000-000000000112' AND billing_period='2026-09')
    IS DISTINCT FROM 7::numeric
  THEN RAISE EXCEPTION 'Second tenant usage aggregation changed'; END IF;
END $$;
RESET ROLE;
SET LOCAL search_path = public;

DO $$
DECLARE role_name text; privilege_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name,'public.usage_records',privilege_name)
        OR has_table_privilege(role_name,'public.usage_summary',privilege_name)
      THEN RAISE EXCEPTION 'Unexpected usage privilege for %: %',role_name,privilege_name; END IF;
    END LOOP;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.usage_summary'::regclass
    AND reloptions @> ARRAY['security_invoker=true'])
  THEN RAISE EXCEPTION 'View still runs as owner'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_user_org_ids()'::regprocedure)
  THEN RAISE EXCEPTION 'Membership helper still bypasses RLS'; END IF;
  IF has_function_privilege('anon','public.update_updated_at()','EXECUTE')
    OR has_function_privilege('authenticated','public.update_updated_at()','EXECUTE')
  THEN RAISE EXCEPTION 'Trigger exposed as API function'; END IF;
END $$;
