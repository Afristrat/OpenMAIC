-- Run with consent, verified-share, scene-observation and projection candidates under ROLLBACK.
INSERT INTO auth.users(id) VALUES('00000000-0035-4000-8000-000000000401');
INSERT INTO public.organizations(id,name) VALUES
 ('00000000-0035-4000-8000-000000000402','Course xAPI source'),
 ('00000000-0035-4000-8000-000000000403','Course xAPI recipient');
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0035-4000-8000-000000000401','00000000-0035-4000-8000-000000000402','apprenant'),
 ('00000000-0035-4000-8000-000000000401','00000000-0035-4000-8000-000000000403','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s035-course-xapi','00000000-0035-4000-8000-000000000401','00000000-0035-4000-8000-000000000402','Projection proof');
INSERT INTO public.scenes(id,stage_id,type,"order") VALUES
 ('s035-x-slide','s035-course-xapi','slide',0),('s035-x-quiz','s035-course-xapi','quiz',1),('s035-x-pbl','s035-course-xapi','pbl',2);
INSERT INTO public.shared_classrooms(stage_id,org_id,shared_by,visibility,authorization_verified) VALUES
 ('s035-course-xapi','00000000-0035-4000-8000-000000000403','00000000-0035-4000-8000-000000000401','organization',true);
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES('00000000-0035-4000-8000-000000000401',true);
INSERT INTO public.organization_lrs_configs(org_id,endpoint,auth_ciphertext,auth_iv,auth_tag,enabled) VALUES
 ('00000000-0035-4000-8000-000000000402','https://source.invalid',decode('00','hex'),decode('00','hex'),decode('00','hex'),true),
 ('00000000-0035-4000-8000-000000000403','https://recipient.invalid',decode('00','hex'),decode('00','hex'),decode('00','hex'),true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0035-4000-8000-000000000401';
 org uuid := '00000000-0035-4000-8000-000000000402';
 session uuid := '00000000-0035-4000-8000-000000000407';
 epoch uuid; payload jsonb; invalid jsonb; statements jsonb;
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 UPDATE public.feature_flags SET enabled=true WHERE flag_name='xapi_emission';
 payload := '{"scene_sequence":["quiz"],"scene_durations":[12],"quiz_scores":[1],"total_duration":12,"completion_rate":1,"agent_count":1,"scene_observations":[{"id":"s035-x-quiz","type":"quiz","seconds":12,"completed":true,"score":1,"attempts":[0,1,1],"discussionMessages":2}]}'::jsonb;
 PERFORM public.record_consented_learning(actor,session,'s035-course-xapi',payload,epoch,org);
 SELECT jsonb_agg(statement ORDER BY id) INTO statements FROM public.xapi_outbox WHERE org_id=org;
 IF jsonb_array_length(statements)<>7 THEN RAISE EXCEPTION 'Lost repeated attempts'; END IF;
 IF (SELECT count(DISTINCT statement->'context'->'extensions'->>'https://qalem.ma/xapi/attempt') FROM public.xapi_outbox WHERE org_id=org)<>3
   OR EXISTS(SELECT 1 FROM public.xapi_outbox WHERE org_id=org AND statement->'result' ? 'duration')
 THEN RAISE EXCEPTION 'Attempt identity or invented duration'; END IF;
 IF NOT statements @> '[{"verb":{"id":"http://adlnet.gov/expapi/verbs/failed"},"result":{"score":{"scaled":0}}}]'::jsonb
 THEN RAISE EXCEPTION 'Zero lost'; END IF;
 IF (public.read_account_export_page(actor,'pedagogy_telemetry',NULL)->0->'value'->'scene_observations'->0->'attempts') IS DISTINCT FROM '[0,1,1]'::jsonb
 THEN RAISE EXCEPTION 'Export lost attempts'; END IF;
 PERFORM public.record_consented_learning(actor,session,'s035-course-xapi',payload,epoch,org);
 IF (SELECT jsonb_agg(statement ORDER BY id) FROM public.xapi_outbox WHERE org_id=org) IS DISTINCT FROM statements
 THEN RAISE EXCEPTION 'Replay mutated attempts'; END IF;
 IF NOT statements @> '[{"context":{"extensions":{"https://qalem.ma/xapi/message-count":2,"https://qalem.ma/xapi/measurement":"accepted-user-messages"}}}]'::jsonb
 THEN RAISE EXCEPTION 'Missing discussion statement'; END IF;
 IF (public.read_account_export_page(actor,'pedagogy_telemetry',NULL)->0->'value'->'scene_observations'->0->'discussionMessages') IS DISTINCT FROM '2'::jsonb
 THEN RAISE EXCEPTION 'Export lost discussion'; END IF;
 FOREACH invalid IN ARRAY ARRAY['null'::jsonb,'{}'::jsonb,'"1"'::jsonb,'-1'::jsonb,'513'::jsonb,'0.5'::jsonb] LOOP
   BEGIN
     PERFORM public.record_consented_learning(actor,gen_random_uuid(),'s035-course-xapi',
       jsonb_set(payload,'{scene_observations,0,discussionMessages}',invalid),epoch,org);
     RAISE EXCEPTION 'Accepted invalid attempts %',invalid;
   EXCEPTION WHEN invalid_parameter_value THEN NULL;
   END;
 END LOOP;
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 IF EXISTS(SELECT 1 FROM public.xapi_outbox WHERE org_id=org) THEN RAISE EXCEPTION 'Withdrawal retained attempts'; END IF;
 RAISE NOTICE 'Discussion counts, quiz coexistence, rejection, export, replay and withdrawal verified';
END $$;
RESET ROLE;
