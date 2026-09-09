-- Run after the candidate migration inside BEGIN/ROLLBACK only.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000221'),('00000000-0036-4000-8000-000000000222');
INSERT INTO public.organizations(id,name) VALUES
 ('00000000-0036-4000-8000-000000000223','Quiz tenant A'),
 ('00000000-0036-4000-8000-000000000224','Quiz tenant B');
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0036-4000-8000-000000000221','00000000-0036-4000-8000-000000000223','apprenant'),
 ('00000000-0036-4000-8000-000000000221','00000000-0036-4000-8000-000000000224','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s036-quiz-tenant','00000000-0036-4000-8000-000000000221','00000000-0036-4000-8000-000000000223','Quiz tenant proof');
INSERT INTO public.scenes(id,stage_id,type,"order") VALUES('s036-quiz-scene','s036-quiz-tenant','quiz',0);
INSERT INTO public.shared_classrooms(stage_id,org_id,visibility) VALUES
 ('s036-quiz-tenant','00000000-0036-4000-8000-000000000224','organization');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000221',true);
INSERT INTO public.quiz_results(id,user_id,stage_id,scene_id,org_id,answers,score) VALUES
 ('00000000-0036-4000-8000-000000000225','00000000-0036-4000-8000-000000000221','s036-quiz-tenant','s036-quiz-scene','00000000-0036-4000-8000-000000000223','[]',20),
 ('00000000-0036-4000-8000-000000000226','00000000-0036-4000-8000-000000000221','s036-quiz-tenant','s036-quiz-scene','00000000-0036-4000-8000-000000000224','[]',80),
 ('00000000-0036-4000-8000-000000000227','00000000-0036-4000-8000-000000000221','s036-quiz-tenant','s036-quiz-scene',NULL,'[]',100);
DO $$ BEGIN
  BEGIN
    UPDATE public.quiz_results SET org_id='00000000-0036-4000-8000-000000000224' WHERE id='00000000-0036-4000-8000-000000000225';
    RAISE EXCEPTION 'Provenance changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.quiz_results SET org_id='00000000-0036-4000-8000-000000000223' WHERE id='00000000-0036-4000-8000-000000000227';
    RAISE EXCEPTION 'Legacy result reattributed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000222',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.quiz_results WHERE stage_id='s036-quiz-tenant') THEN RAISE EXCEPTION 'RLS disclosure'; END IF;
  BEGIN
    INSERT INTO public.quiz_results(user_id,stage_id,scene_id,org_id,answers,score) VALUES
      ('00000000-0036-4000-8000-000000000222','s036-quiz-tenant','s036-quiz-scene','00000000-0036-4000-8000-000000000223','[]',100);
    RAISE EXCEPTION 'Foreign tenant accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF (SELECT avg(score) FROM public.quiz_results WHERE stage_id='s036-quiz-tenant' AND org_id='00000000-0036-4000-8000-000000000223') IS DISTINCT FROM 20::numeric
    OR (SELECT avg(score) FROM public.quiz_results WHERE stage_id='s036-quiz-tenant' AND org_id='00000000-0036-4000-8000-000000000224') IS DISTINCT FROM 80::numeric
  THEN RAISE EXCEPTION 'Tenant aggregate mixed'; END IF;
END $$;
RESET ROLE;
