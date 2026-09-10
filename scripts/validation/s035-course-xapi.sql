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
 source_org uuid := '00000000-0035-4000-8000-000000000402';
 target_org uuid := '00000000-0035-4000-8000-000000000403';
 first_session uuid := '00000000-0035-4000-8000-000000000404';
 active_session uuid := '00000000-0035-4000-8000-000000000405';
 target_session uuid := '00000000-0035-4000-8000-000000000406';
 epoch uuid; delivery bigint; target_delivery bigint; snapshot jsonb;
 payload jsonb := '{"scene_sequence":["slide","quiz","pbl"],"scene_durations":[3,2,1],"quiz_scores":[0],"completion_rate":1,"total_duration":6,"scene_observations":[{"id":"s035-x-slide","type":"slide","seconds":3,"completed":true,"score":null},{"id":"s035-x-quiz","type":"quiz","seconds":2,"completed":true,"score":0},{"id":"s035-x-pbl","type":"pbl","seconds":1,"completed":true,"score":null}]}';
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 UPDATE public.feature_flags SET enabled=false WHERE flag_name='xapi_emission';
 PERFORM public.record_consented_learning(actor,first_session,'s035-course-xapi',payload,epoch,source_org);
 IF EXISTS (SELECT 1 FROM public.xapi_outbox WHERE org_id=source_org) THEN RAISE EXCEPTION 'Disabled projection emitted'; END IF;
 UPDATE public.feature_flags SET enabled=true WHERE flag_name='xapi_emission';
 PERFORM public.record_consented_learning(actor,first_session,'s035-course-xapi',payload,epoch,source_org);
 IF EXISTS (SELECT 1 FROM public.xapi_outbox WHERE org_id=source_org) THEN RAISE EXCEPTION 'Replay backfilled disabled data'; END IF;
 PERFORM public.record_consented_learning(actor,active_session,'s035-course-xapi',payload,epoch,source_org);
 IF (SELECT count(*) FROM public.xapi_outbox WHERE org_id=source_org) <> 4 THEN RAISE EXCEPTION 'Missing scene events'; END IF;
 SELECT jsonb_agg(statement ORDER BY id),min(id) INTO snapshot,delivery FROM public.xapi_outbox WHERE org_id=source_org;
 IF snapshot::text LIKE '%' || actor::text || '%' OR NOT snapshot @> '[{"verb":{"id":"http://adlnet.gov/expapi/verbs/failed"},"result":{"score":{"scaled":0}}}]'::jsonb THEN RAISE EXCEPTION 'Raw actor or zero score lost'; END IF;
 PERFORM public.record_consented_learning(actor,active_session,'s035-course-xapi',payload,epoch,source_org);
 IF (SELECT jsonb_agg(statement ORDER BY id) FROM public.xapi_outbox WHERE org_id=source_org) IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Replay changed statements'; END IF;
 IF NOT public.authorize_xapi_delivery(delivery) THEN RAISE EXCEPTION 'Valid delivery denied'; END IF;
 IF (SELECT count(*) FROM public.list_due_xapi_deliveries())<>4 THEN RAISE EXCEPTION 'Eligible scan lost events'; END IF;
 UPDATE public.organization_lrs_configs SET endpoint='https://changed.invalid' WHERE org_id=source_org;
 IF EXISTS(SELECT 1 FROM public.list_due_xapi_deliveries()) THEN RAISE EXCEPTION 'Retargeted events scheduled'; END IF;
 UPDATE public.organization_lrs_configs SET endpoint='https://source.invalid' WHERE org_id=source_org;
 UPDATE public.organizations SET status='suspended' WHERE id=source_org;
 IF public.authorize_xapi_delivery(delivery) THEN RAISE EXCEPTION 'Suspended tenant allowed'; END IF;
 IF EXISTS(SELECT 1 FROM public.list_due_xapi_deliveries()) THEN RAISE EXCEPTION 'Suspended events scheduled'; END IF;
 UPDATE public.organizations SET status='active' WHERE id=source_org;
 PERFORM public.record_consented_learning(actor,target_session,'s035-course-xapi',payload,epoch,target_org);
 SELECT min(id) INTO target_delivery FROM public.xapi_outbox WHERE org_id=target_org;
 IF NOT public.authorize_xapi_delivery(target_delivery) THEN RAISE EXCEPTION 'Shared recipient denied'; END IF;
 IF (SELECT count(DISTINCT statement->'actor'->>'mbox') FROM public.xapi_outbox WHERE org_id IN(source_org,target_org))<>2 THEN RAISE EXCEPTION 'Tenant pseudonyms collapsed'; END IF;
 IF jsonb_array_length(public.read_account_export_page(actor,'xapi_outbox',NULL))<>8 THEN RAISE EXCEPTION 'Personal xAPI export incomplete'; END IF;
 UPDATE public.shared_classrooms SET visibility='private' WHERE org_id=target_org AND stage_id='s035-course-xapi';
 IF public.authorize_xapi_delivery(target_delivery) THEN RAISE EXCEPTION 'Revoked share allowed'; END IF;
 DELETE FROM public.org_members WHERE user_id=actor AND org_id=source_org;
 IF public.authorize_xapi_delivery(delivery) THEN RAISE EXCEPTION 'Former member allowed'; END IF;
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 IF EXISTS (SELECT 1 FROM public.xapi_outbox WHERE org_id IN(source_org,target_org)) THEN RAISE EXCEPTION 'Withdrawal retained local events'; END IF;
 IF public.authorize_xapi_delivery(delivery) THEN RAISE EXCEPTION 'Deleted delivery allowed'; END IF;
 RAISE NOTICE 'Projection, flag, no backfill, replay, tenant pseudonyms, export, revocation and cascade verified';
END $$;
RESET ROLE;
