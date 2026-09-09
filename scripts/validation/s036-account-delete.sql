-- After the collection migration, inside BEGIN ... ROLLBACK only.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000091');
DO $$
DECLARE
  actor uuid := '00000000-0036-4000-8000-000000000091';
  org uuid := '00000000-0036-4000-8000-000000000092';
  subject text;
BEGIN
  INSERT INTO public.organizations(id,name,status,seat_limit)
    VALUES(org,'S-036 rollback deletion','active',1);
  INSERT INTO public.org_members(user_id,org_id,role) VALUES(actor,org,'apprenant');
  INSERT INTO public.stages(id,owner_id,org_id,name)
    VALUES('s036-delete-stage',actor,org,'Preserved tenant asset');
  INSERT INTO public.scenes(id,stage_id,type,"order")
    VALUES('s036-delete-scene','s036-delete-stage','slide',0);
  INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES(actor,true);
  INSERT INTO qalem_telemetry_private.subjects(user_id,org_id)
    VALUES(actor,org) RETURNING subject_hash INTO subject;
  INSERT INTO public.pedagogy_telemetry(user_hash,subject_hash,session_id)
    VALUES(subject,subject,gen_random_uuid());
  INSERT INTO public.classroom_templates(name,sector,requirements,org_id,created_by)
    VALUES('S-036 restrictive reference','test','{}'::jsonb,org,actor);
  BEGIN
    DELETE FROM auth.users WHERE id=actor;
    RAISE EXCEPTION 'Restrictive reference did not protect the transaction';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor)
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor)
    OR NOT EXISTS(SELECT 1 FROM public.org_members WHERE user_id=actor)
    OR NOT EXISTS(SELECT 1 FROM public.telemetry_consent WHERE user_id=actor)
    OR NOT EXISTS(SELECT 1 FROM public.pedagogy_telemetry WHERE subject_hash=subject)
    OR NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-delete-stage' AND owner_id=actor)
  THEN RAISE EXCEPTION 'Failed deletion left partial data loss'; END IF;

  -- Fixture-only removal of the blocker; not a production cleanup strategy.
  DELETE FROM public.classroom_templates WHERE org_id=org;
  DELETE FROM auth.users WHERE id=actor;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=actor)
    OR EXISTS(SELECT 1 FROM public.org_members WHERE user_id=actor)
    OR EXISTS(SELECT 1 FROM public.telemetry_consent WHERE user_id=actor)
    OR EXISTS(SELECT 1 FROM qalem_telemetry_private.subjects WHERE user_id=actor)
    OR EXISTS(SELECT 1 FROM public.pedagogy_telemetry WHERE subject_hash=subject)
  THEN RAISE EXCEPTION 'Personal observation cascade incomplete'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-delete-stage' AND owner_id IS NULL AND org_id=org)
    OR NOT EXISTS(SELECT 1 FROM public.scenes WHERE id='s036-delete-scene')
  THEN RAISE EXCEPTION 'Tenant classroom destroyed'; END IF;
END;
$$;
