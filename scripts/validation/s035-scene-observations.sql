-- Apply consent and scene-observation candidates inside BEGIN/ROLLBACK first.
INSERT INTO auth.users(id) VALUES ('00000000-0035-4000-8000-000000000301');
INSERT INTO public.organizations(id,name) VALUES('00000000-0035-4000-8000-000000000302','S035 scene proof');
INSERT INTO public.org_members(org_id,user_id,role) VALUES('00000000-0035-4000-8000-000000000302','00000000-0035-4000-8000-000000000301','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES('s035-scene-proof','00000000-0035-4000-8000-000000000301','00000000-0035-4000-8000-000000000302','Scene proof');
INSERT INTO public.scenes(id,stage_id,type,"order") VALUES('s035-slide','s035-scene-proof','slide',0),('s035-quiz','s035-scene-proof','quiz',1);
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES('00000000-0035-4000-8000-000000000301',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0035-4000-8000-000000000301';
 org uuid := '00000000-0035-4000-8000-000000000302';
 session uuid := '00000000-0035-4000-8000-000000000303';
 epoch uuid; bad jsonb; stored jsonb;
 payload jsonb := '{"scene_sequence":["slide","quiz"],"scene_durations":[3,2],"quiz_scores":[0],"completion_rate":1,"total_duration":5,"scene_observations":[{"id":"s035-slide","type":"slide","seconds":3,"completed":true,"score":null},{"id":"s035-quiz","type":"quiz","seconds":2,"completed":true,"score":0}]}';
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 IF NOT public.record_consented_learning(actor,session,'s035-scene-proof',payload,epoch,org) THEN RAISE EXCEPTION 'Collection refused'; END IF;
 SELECT scene_observations INTO STRICT stored FROM public.pedagogy_telemetry WHERE session_id=session;
 IF stored IS DISTINCT FROM payload->'scene_observations' THEN RAISE EXCEPTION 'Scene mapping lost'; END IF;
 IF (public.read_account_export_page(actor,'pedagogy_telemetry',NULL)->0->'value'->'scene_observations') IS DISTINCT FROM stored THEN RAISE EXCEPTION 'Personal export lost scene observations'; END IF;
 PERFORM public.record_consented_learning(actor,session,'s035-scene-proof',jsonb_set(payload,'{scene_observations,1,score}','1'),epoch,org);
 IF (SELECT scene_observations FROM public.pedagogy_telemetry WHERE session_id=session) IS DISTINCT FROM stored THEN RAISE EXCEPTION 'Replay changed scene outcome'; END IF;
 FOREACH bad IN ARRAY ARRAY[
   jsonb_set(payload,'{scene_observations,0,id}','"foreign-scene"'),
   jsonb_set(payload,'{scene_observations,0,type}','"quiz"'),
   jsonb_set(payload,'{scene_observations,1,seconds}','3'),
   jsonb_set(payload,'{scene_observations,0,score}','0'),
   jsonb_set(payload,'{scene_observations,1,score}','2')
 ] LOOP
   BEGIN
     PERFORM public.record_consented_learning(actor,session,'s035-scene-proof',bad,epoch,org);
     RAISE EXCEPTION 'Invalid scene provenance accepted';
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 PERFORM public.record_consented_learning(actor,'00000000-0035-4000-8000-000000000304','s035-scene-proof',payload-'scene_observations',epoch,org);
 IF (SELECT scene_observations FROM public.pedagogy_telemetry WHERE session_id='00000000-0035-4000-8000-000000000304') IS NOT NULL THEN RAISE EXCEPTION 'Historical mapping invented'; END IF;
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 IF EXISTS (SELECT 1 FROM public.pedagogy_telemetry WHERE session_id=session) THEN RAISE EXCEPTION 'Withdrawal retained scene data'; END IF;
 IF public.record_consented_learning(actor,session,'s035-scene-proof',payload,epoch,org) THEN RAISE EXCEPTION 'Refused consent accepted'; END IF;
 RAISE NOTICE 'Scene provenance, zero score, replay, invalid scope, legacy absence and withdrawal verified';
END $$;
RESET ROLE;
