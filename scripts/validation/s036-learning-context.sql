-- Apply collection/context candidates before this script inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000211');
INSERT INTO public.organizations(id,name) VALUES('00000000-0036-4000-8000-000000000212','S036 context proof');
INSERT INTO public.org_members(org_id,user_id,role) VALUES('00000000-0036-4000-8000-000000000212','00000000-0036-4000-8000-000000000211','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name,agent_ids) VALUES('s036-server-context','00000000-0036-4000-8000-000000000211','00000000-0036-4000-8000-000000000212','Context proof',ARRAY['a','b']);
INSERT INTO public.courses(id,owner_id,org_id,stage_id,title,language,source_kind,status,outline) VALUES
 ('00000000-0036-4000-8000-000000000213','00000000-0036-4000-8000-000000000211','00000000-0036-4000-8000-000000000212','s036-server-context','Context proof','ar-MA','generated','ready','{"analyticsContext":{"level":"advanced","subjectTags":["formation-design-pro"]}}');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES('00000000-0036-4000-8000-000000000211',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE epoch uuid; result public.pedagogy_telemetry; recorded boolean;
BEGIN
  SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id='00000000-0036-4000-8000-000000000211';
  recorded := public.record_consented_learning('00000000-0036-4000-8000-000000000211','00000000-0036-4000-8000-000000000214','s036-server-context',
    '{"scene_sequence":["slide"],"scene_durations":[4],"quiz_scores":[],"completion_rate":1,"total_duration":4,"subject_tags":["forged"],"language":"en-US","level":"beginner","agent_count":32}',epoch);
  SELECT * INTO STRICT result FROM public.pedagogy_telemetry WHERE session_id='00000000-0036-4000-8000-000000000214';
  IF recorded IS DISTINCT FROM true OR result.language IS DISTINCT FROM 'ar-MA'
    OR result.level IS DISTINCT FROM 'advanced' OR result.agent_count IS DISTINCT FROM 2
    OR result.subject_tags IS DISTINCT FROM ARRAY['formation-design-pro'] THEN
    RAISE EXCEPTION 'Client context was not replaced';
  END IF;
  UPDATE public.courses SET outline='{}' WHERE id='00000000-0036-4000-8000-000000000213';
  PERFORM public.record_consented_learning('00000000-0036-4000-8000-000000000211','00000000-0036-4000-8000-000000000215','s036-server-context',
    '{"scene_sequence":["quiz"],"scene_durations":[4],"quiz_scores":[],"completion_rate":1,"total_duration":4,"subject_tags":["forged"],"level":"beginner"}',epoch);
  SELECT * INTO STRICT result FROM public.pedagogy_telemetry WHERE session_id='00000000-0036-4000-8000-000000000215';
  IF result.level IS NOT NULL OR result.subject_tags IS DISTINCT FROM ARRAY[]::text[] OR result.language IS DISTINCT FROM 'ar-MA' THEN
    RAISE EXCEPTION 'Legacy context fabricated';
  END IF;
  UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id='00000000-0036-4000-8000-000000000211';
  IF EXISTS(SELECT 1 FROM public.pedagogy_telemetry WHERE stage_id='s036-server-context') THEN
    RAISE EXCEPTION 'Context trigger broke consent erasure';
  END IF;
END;
$$;
RESET ROLE;
