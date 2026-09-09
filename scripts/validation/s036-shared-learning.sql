-- Run collection, context, sharing and shared-learning candidates under BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000281'),('00000000-0036-4000-8000-000000000282');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0036-4000-8000-000000000283','Learning source',10),
 ('00000000-0036-4000-8000-000000000284','Learning recipient',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0036-4000-8000-000000000281','00000000-0036-4000-8000-000000000283','formateur'),
 ('00000000-0036-4000-8000-000000000281','00000000-0036-4000-8000-000000000284','formateur'),
 ('00000000-0036-4000-8000-000000000282','00000000-0036-4000-8000-000000000284','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name,agent_ids) VALUES
 ('s036-shared-learning','00000000-0036-4000-8000-000000000281','00000000-0036-4000-8000-000000000283','Learning proof',ARRAY['a','b']),
 ('s036-shared-learning-other','00000000-0036-4000-8000-000000000281','00000000-0036-4000-8000-000000000284','Other',ARRAY[]::text[]);
INSERT INTO public.courses(id,owner_id,org_id,stage_id,title,language,source_kind,status,outline) VALUES
 ('00000000-0036-4000-8000-000000000285','00000000-0036-4000-8000-000000000281','00000000-0036-4000-8000-000000000283','s036-shared-learning','Context','ar-MA','generated','ready','{"analyticsContext":{"level":"advanced","subjectTags":["formation-design-pro"]}}');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES
 ('00000000-0036-4000-8000-000000000281',true),('00000000-0036-4000-8000-000000000282',true);
INSERT INTO public.shared_classrooms(id,stage_id,org_id,shared_by,visibility) VALUES
 ('00000000-0036-4000-8000-000000000286','s036-shared-learning','00000000-0036-4000-8000-000000000284','00000000-0036-4000-8000-000000000281','organization');
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0036-4000-8000-000000000282';
 owner_actor uuid := '00000000-0036-4000-8000-000000000281';
 target_org uuid := '00000000-0036-4000-8000-000000000284';
 source_org uuid := '00000000-0036-4000-8000-000000000283';
 session uuid := '00000000-0036-4000-8000-000000000287';
 owner_session uuid := '00000000-0036-4000-8000-000000000288';
 payload jsonb := '{"scene_sequence":["slide"],"scene_durations":[4],"quiz_scores":[],"completion_rate":1,"total_duration":4,"language":"en-US","subject_tags":["forged"],"level":"beginner"}';
 epoch uuid; owner_epoch uuid; row public.pedagogy_telemetry;
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 SELECT collection_epoch INTO owner_epoch FROM public.telemetry_consent WHERE user_id=owner_actor;
 BEGIN
   PERFORM public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org);
   RAISE EXCEPTION 'Unverified share accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000281',true);
UPDATE public.shared_classrooms SET visibility='organization' WHERE id='00000000-0036-4000-8000-000000000286';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0036-4000-8000-000000000282';
 owner_actor uuid := '00000000-0036-4000-8000-000000000281';
 target_org uuid := '00000000-0036-4000-8000-000000000284';
 source_org uuid := '00000000-0036-4000-8000-000000000283';
 session uuid := '00000000-0036-4000-8000-000000000287';
 owner_session uuid := '00000000-0036-4000-8000-000000000288';
 payload jsonb := '{"scene_sequence":["slide"],"scene_durations":[4],"quiz_scores":[],"completion_rate":1,"total_duration":4,"language":"en-US","subject_tags":["forged"],"level":"beginner"}';
 epoch uuid; owner_epoch uuid; row public.pedagogy_telemetry;
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 SELECT collection_epoch INTO owner_epoch FROM public.telemetry_consent WHERE user_id=owner_actor;
 IF NOT public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org) THEN RAISE EXCEPTION 'Shared observation refused'; END IF;
 PERFORM public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org);
 IF (SELECT count(*) FROM public.pedagogy_telemetry WHERE session_id=session)<>1 THEN RAISE EXCEPTION 'Replay duplicated'; END IF;
 SELECT * INTO STRICT row FROM public.pedagogy_telemetry WHERE session_id=session;
 IF row.org_id IS DISTINCT FROM target_org OR row.language IS DISTINCT FROM 'ar-MA'
   OR row.level IS DISTINCT FROM 'advanced' OR row.agent_count IS DISTINCT FROM 2
   OR row.subject_tags IS DISTINCT FROM ARRAY['formation-design-pro'] THEN RAISE EXCEPTION 'Source context or recipient scope lost'; END IF;
 BEGIN
   PERFORM public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch);
   RAISE EXCEPTION 'Legacy call inferred recipient';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.record_consented_learning(actor,session,'s036-shared-learning-other',payload,epoch,target_org);
   RAISE EXCEPTION 'Session stage reattributed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.record_consented_learning(owner_actor,owner_session,'s036-shared-learning',payload,owner_epoch);
 BEGIN
   PERFORM public.record_consented_learning(owner_actor,owner_session,'s036-shared-learning',payload,owner_epoch,target_org);
   RAISE EXCEPTION 'Session tenant reattributed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.record_consented_learning(owner_actor,'00000000-0036-4000-8000-000000000289','s036-shared-learning',payload,owner_epoch,target_org);
 IF (SELECT count(DISTINCT subject_hash) FROM qalem_telemetry_private.subjects WHERE user_id=owner_actor)<>2 THEN RAISE EXCEPTION 'Tenant pseudonyms merged'; END IF;
 UPDATE public.shared_classrooms SET visibility='private' WHERE id='00000000-0036-4000-8000-000000000286';
 BEGIN
   PERFORM public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org);
   RAISE EXCEPTION 'Revoked share accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.shared_classrooms SET visibility='organization' WHERE id='00000000-0036-4000-8000-000000000286';
 UPDATE public.organizations SET status='suspended' WHERE id=target_org;
 BEGIN
   PERFORM public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org);
   RAISE EXCEPTION 'Suspended tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.organizations SET status='active' WHERE id=target_org;
 DELETE FROM public.org_members WHERE org_id=target_org AND user_id=actor;
 BEGIN
   PERFORM public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org);
   RAISE EXCEPTION 'Former member accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 UPDATE public.telemetry_consent SET pedagogy_consent=true WHERE user_id=actor;
 IF public.record_consented_learning(actor,session,'s036-shared-learning',payload,epoch,target_org) THEN RAISE EXCEPTION 'Stale consent accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.pedagogy_telemetry WHERE session_id=session) THEN RAISE EXCEPTION 'Withdrawal left observation'; END IF;
END $$;
RESET ROLE;
