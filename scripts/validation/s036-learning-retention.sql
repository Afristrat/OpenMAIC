-- Run after both candidate migrations inside BEGIN ... ROLLBACK only.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000071');
INSERT INTO public.organizations(id,name,status,seat_limit)
  VALUES('00000000-0036-4000-8000-000000000072','S-036 retention proof','active',1);
INSERT INTO public.org_members(user_id,org_id,role)
  VALUES('00000000-0036-4000-8000-000000000071','00000000-0036-4000-8000-000000000072','apprenant');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := '00000000-0036-4000-8000-000000000071';
  org uuid := '00000000-0036-4000-8000-000000000072';
  subject text;
  removed integer;
BEGIN
  INSERT INTO qalem_telemetry_private.subjects(user_id,org_id) VALUES(actor,org)
    RETURNING subject_hash INTO subject;
  INSERT INTO public.pedagogy_telemetry(user_hash,subject_hash,session_id,created_at)
    VALUES(subject,subject,gen_random_uuid(),now()-interval '181 days'),
          (subject,subject,gen_random_uuid(),now()-interval '180 days'),
          (subject,subject,gen_random_uuid(),now());
  INSERT INTO public.pedagogy_telemetry(user_hash,created_at)
    VALUES('s036-legacy-retention-rollback-proof',now()-interval '181 days');
  removed := public.purge_expired_learning_observations();
  IF removed <> 1 THEN RAISE EXCEPTION 'Retention failed: expected one expired row'; END IF;
  IF (SELECT count(*) FROM public.pedagogy_telemetry WHERE subject_hash=subject) <> 2 THEN
    RAISE EXCEPTION 'Retention deleted unexpired observations';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pedagogy_telemetry WHERE user_hash='s036-legacy-retention-rollback-proof') THEN
    RAISE EXCEPTION 'Legacy scope changed';
  END IF;
  IF public.purge_expired_learning_observations() <> 0 THEN RAISE EXCEPTION 'Retention not idempotent'; END IF;
  INSERT INTO public.pedagogy_telemetry(user_hash,subject_hash,session_id,created_at)
    SELECT subject,subject,gen_random_uuid(),now()-interval '181 days' FROM generate_series(1,1001);
  IF public.purge_expired_learning_observations() <> 1000 THEN RAISE EXCEPTION 'Batch bound not respected'; END IF;
  IF public.purge_expired_learning_observations() <> 1 THEN RAISE EXCEPTION 'Batch continuation lost a row'; END IF;
  IF (SELECT count(*) FROM public.pedagogy_telemetry WHERE subject_hash=subject) <> 2 THEN
    RAISE EXCEPTION 'Batch continuation deleted fresh rows';
  END IF;
  IF has_function_privilege('anon','public.purge_expired_learning_observations()','EXECUTE')
    OR has_function_privilege('authenticated','public.purge_expired_learning_observations()','EXECUTE') THEN
    RAISE EXCEPTION 'Retention exposed publicly';
  END IF;
END; $$;
RESET ROLE;
