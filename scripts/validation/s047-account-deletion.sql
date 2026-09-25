-- Execute after the S-047 migrations inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES
  ('00000000-0047-4000-8000-000000000041'),
  ('00000000-0047-4000-8000-000000000042');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
  ('00000000-0047-4000-8000-000000000043','S047 account deletion proof',2);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
  ('00000000-0047-4000-8000-000000000041','00000000-0047-4000-8000-000000000043','admin'),
  ('00000000-0047-4000-8000-000000000042','00000000-0047-4000-8000-000000000043','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name,language,agent_ids) VALUES
  ('s047-account-delete','00000000-0047-4000-8000-000000000041',
   '00000000-0047-4000-8000-000000000043','Account deletion proof','fr-FR',ARRAY['a']);
INSERT INTO public.scenes(id,stage_id,type,"order",content) VALUES
  ('s047-account-delete-quiz','s047-account-delete','quiz',0,
   '{"type":"quiz","questions":[{"id":"q","type":"single","question":"Choose","options":[{"label":"A","value":"a"}],"answer":["a"],"points":1}]}');
UPDATE public.telemetry_consent SET pedagogy_consent=true
WHERE user_id='00000000-0047-4000-8000-000000000042';
INSERT INTO public.courses(owner_id,org_id,stage_id,title,language,source_kind,status,outline) VALUES
  ('00000000-0047-4000-8000-000000000041','00000000-0047-4000-8000-000000000043',
   's047-account-delete','Context','fr-FR','generated','ready',
   '{"analyticsContext":{"subjectTags":["SIPOC"]}}');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := '00000000-0047-4000-8000-000000000042';
  org uuid := '00000000-0047-4000-8000-000000000043';
  epoch uuid;
  claim jsonb;
  observation jsonb := '{"discussionId":"00000000-0047-4000-8000-000000000044","sceneId":"s047-account-delete-quiz","durationBasis":"client-monotonic-elapsed","classificationMethod":"text-heuristic-v1","turns":[{"id":"t","agentId":"a","interventionType":"question","durationMs":300,"outcome":"completed"}],"postDiscussionQuiz":null}';
  grade jsonb := '{"score":100,"results":[{"questionId":"q","earned":1,"correct":true,"status":"correct"}]}';
BEGIN
  SELECT collection_epoch INTO STRICT epoch
  FROM public.telemetry_consent WHERE user_id=actor;
  IF NOT public.record_consented_discussion(
    actor,'s047-account-delete',org,epoch,observation
  ) THEN
    RAISE EXCEPTION 'Discussion was not recorded';
  END IF;
  claim := public.begin_classroom_quiz_attempt(
    actor,org,'s047-account-delete','s047-account-delete-quiz',
    '00000000-0047-4000-8000-000000000045','{"q":"a"}'
  );
  PERFORM public.complete_classroom_quiz_attempt(
    actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,grade
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.classroom_quiz_attempts
    WHERE user_id=actor AND discussion_pattern_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Quiz was not linked to the discussion';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE supabase_auth_admin;
DELETE FROM auth.users WHERE id='00000000-0047-4000-8000-000000000042';
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE id='00000000-0047-4000-8000-000000000042'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id='00000000-0047-4000-8000-000000000042'
  ) OR EXISTS (
    SELECT 1 FROM public.classroom_quiz_attempts
    WHERE user_id='00000000-0047-4000-8000-000000000042'
  ) OR EXISTS (
    SELECT 1 FROM public.discussion_patterns
    WHERE discussion_id='00000000-0047-4000-8000-000000000044'
  ) OR EXISTS (
    SELECT 1 FROM qalem_telemetry_private.subjects
    WHERE user_id='00000000-0047-4000-8000-000000000042'
  ) THEN
    RAISE EXCEPTION 'Account deletion retained S-047 data';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.courses WHERE stage_id='s047-account-delete'
  ) THEN
    RAISE EXCEPTION 'Learner deletion removed the tenant course';
  END IF;
END;
$$;

SELECT 'S047 Auth account deletion cascade passed' AS proof;
