-- Apply dependencies and candidate in the same BEGIN/ROLLBACK as this proof.
INSERT INTO auth.users(id) VALUES ('00000000-0047-4000-8000-000000000001');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0047-4000-8000-000000000002','S047 synthetic source',10),
 ('00000000-0047-4000-8000-000000000003','S047 synthetic recipient',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0047-4000-8000-000000000001','00000000-0047-4000-8000-000000000002','formateur'),
 ('00000000-0047-4000-8000-000000000001','00000000-0047-4000-8000-000000000003','formateur');
INSERT INTO public.stages(id,owner_id,org_id,name,agent_ids) VALUES
 ('s047-proof','00000000-0047-4000-8000-000000000001','00000000-0047-4000-8000-000000000002','Synthetic discussion',ARRAY['a','b']);
INSERT INTO public.scenes(id,stage_id,type,"order") VALUES ('s047-scene','s047-proof','slide',0);
INSERT INTO public.courses(owner_id,org_id,stage_id,title,language,source_kind,status,outline) VALUES
 ('00000000-0047-4000-8000-000000000001','00000000-0047-4000-8000-000000000002','s047-proof','Context','ar-MA','generated','ready','{"analyticsContext":{"subjectTags":["formation-design-pro"]}}');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES ('00000000-0047-4000-8000-000000000001',false);
INSERT INTO public.shared_classrooms(id,stage_id,org_id,shared_by,visibility) VALUES
 ('00000000-0047-4000-8000-000000000005','s047-proof','00000000-0047-4000-8000-000000000003','00000000-0047-4000-8000-000000000001','organization');
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0047-4000-8000-000000000001';
 org uuid := '00000000-0047-4000-8000-000000000002';
 recipient uuid := '00000000-0047-4000-8000-000000000003';
 epoch uuid; old_epoch uuid; row public.discussion_patterns; invalid jsonb;
 payload jsonb := '{"discussionId":"00000000-0047-4000-8000-000000000004","sceneId":"s047-scene","durationBasis":"client-monotonic-elapsed","classificationMethod":"text-heuristic-v1","turns":[{"id":"one","agentId":"a","interventionType":"question","durationMs":1450,"outcome":"completed"},{"id":"two","agentId":"b","interventionType":"unknown","durationMs":250,"outcome":"interrupted"}],"postDiscussionQuiz":null}';
BEGIN
 SELECT collection_epoch INTO old_epoch FROM public.telemetry_consent WHERE user_id=actor;
 IF public.record_consented_discussion(actor,'s047-proof',org,old_epoch,payload) THEN RAISE EXCEPTION 'Refusal bypass'; END IF;
 UPDATE public.telemetry_consent SET pedagogy_consent=true WHERE user_id=actor;
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 IF public.record_consented_discussion(actor,'s047-proof',org,old_epoch,payload) THEN RAISE EXCEPTION 'Old epoch accepted'; END IF;
 IF NOT public.record_consented_discussion(actor,'s047-proof',org,epoch,payload) THEN RAISE EXCEPTION 'Missing insertion'; END IF;
 PERFORM public.record_consented_discussion(actor,'s047-proof',org,epoch,payload);
 SELECT * INTO STRICT row FROM public.discussion_patterns WHERE stage_id='s047-proof';
 IF row.org_id IS DISTINCT FROM org OR row.subject_hash IS NULL OR row.user_hash=actor::text
   OR row.observation IS DISTINCT FROM payload OR row.agent_sequence IS DISTINCT FROM ARRAY['a','b']
   OR row.turn_durations IS DISTINCT FROM ARRAY[1,0] OR row.total_turns<>2
   OR row.post_discussion_quiz_score IS NOT NULL OR row.engagement_score IS NOT NULL
   OR row.language IS DISTINCT FROM 'ar-MA' OR row.subject_tags IS DISTINCT FROM ARRAY['formation-design-pro'] THEN
   RAISE EXCEPTION 'Incorrect measures/context/pseudonym';
 END IF;
 FOR invalid IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
   jsonb_set(payload,'{turns,0,agentId}','"foreign"'),
   jsonb_set(payload,'{turns,0,durationMs}','-1'),
   jsonb_set(payload,'{turns,0,durationMs}','86400001'),
   jsonb_set(payload,'{turns,1,id}','"one"'),
   jsonb_set(payload,'{turns,1,interventionType}','"answer"'),
   jsonb_set(payload,'{postDiscussionQuiz}','{"sceneId":"quiz","score":1}'),
   jsonb_set(payload,'{turns,0,durationMs}','1400'),
   payload || '{"userHash":"forged"}'::jsonb,
   payload || '{"text":"must not be retained"}'::jsonb
 )) LOOP
   BEGIN
     PERFORM public.record_consented_discussion(actor,'s047-proof',org,epoch,invalid);
     RAISE EXCEPTION 'Invalid or changed observation accepted';
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
   PERFORM public.record_consented_discussion(actor,'s047-proof',org,epoch,jsonb_set(payload,'{sceneId}','"foreign"'));
   RAISE EXCEPTION 'Foreign scene accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.record_consented_discussion(actor,'s047-proof',recipient,epoch,payload);
   RAISE EXCEPTION 'Unverified share accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.organizations SET status='suspended' WHERE id=org;
 BEGIN
   PERFORM public.record_consented_discussion(actor,'s047-proof',org,epoch,payload);
   RAISE EXCEPTION 'Suspended tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.organizations SET status='active' WHERE id=org;
 IF has_function_privilege('anon','public.record_consented_discussion(uuid,text,uuid,uuid,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.record_consented_discussion(uuid,text,uuid,uuid,jsonb)','EXECUTE')
   OR has_table_privilege('authenticated','public.discussion_patterns','INSERT') THEN RAISE EXCEPTION 'Public write privilege'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0047-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
UPDATE public.shared_classrooms SET visibility='organization' WHERE id='00000000-0047-4000-8000-000000000005';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0047-4000-8000-000000000001';
 recipient uuid := '00000000-0047-4000-8000-000000000003';
 epoch uuid; payload jsonb;
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 SELECT observation INTO STRICT payload FROM public.discussion_patterns WHERE stage_id='s047-proof';
 BEGIN
   PERFORM public.record_consented_discussion(actor,'s047-proof',recipient,epoch,payload);
   RAISE EXCEPTION 'Discussion tenant rewritten';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 payload := jsonb_set(payload,'{discussionId}','"00000000-0047-4000-8000-000000000006"');
 IF NOT public.record_consented_discussion(actor,'s047-proof',recipient,epoch,payload) THEN RAISE EXCEPTION 'Verified share refused'; END IF;
 IF (SELECT count(DISTINCT subject_hash) FROM public.discussion_patterns WHERE stage_id='s047-proof')<>2 THEN
   RAISE EXCEPTION 'Tenant pseudonyms merged';
 END IF;
 DELETE FROM public.org_members WHERE user_id=actor AND org_id=recipient;
 BEGIN
   PERFORM public.record_consented_discussion(actor,'s047-proof',recipient,epoch,payload);
   RAISE EXCEPTION 'Former member accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=auth.uid();
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.discussion_patterns WHERE stage_id='s047-proof')
   OR EXISTS(SELECT 1 FROM qalem_telemetry_private.subjects WHERE user_id='00000000-0047-4000-8000-000000000001') THEN
   RAISE EXCEPTION 'RLS withdrawal failed to erase discussions';
 END IF;
END $$;
