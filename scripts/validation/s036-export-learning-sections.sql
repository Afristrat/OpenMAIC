-- Collection, base export and expanded export candidates must run under BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000301'),('00000000-0036-4000-8000-000000000302');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0036-4000-8000-000000000303','Export coverage',10);
INSERT INTO public.org_members(org_id,user_id,role) VALUES
 ('00000000-0036-4000-8000-000000000303','00000000-0036-4000-8000-000000000301','formateur'),
 ('00000000-0036-4000-8000-000000000303','00000000-0036-4000-8000-000000000302','formateur');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s036-expanded-export-own','00000000-0036-4000-8000-000000000301','00000000-0036-4000-8000-000000000303','Owned'),
 ('s036-expanded-export-other','00000000-0036-4000-8000-000000000302','00000000-0036-4000-8000-000000000303','Other');
INSERT INTO public.courses(id,owner_id,org_id,stage_id,title,language,source_kind,status) VALUES
 ('00000000-0036-4000-8000-000000000304','00000000-0036-4000-8000-000000000301','00000000-0036-4000-8000-000000000303','s036-expanded-export-own','Owned','fr-FR','generated','ready'),
 ('00000000-0036-4000-8000-000000000305','00000000-0036-4000-8000-000000000302','00000000-0036-4000-8000-000000000303','s036-expanded-export-other','Other','fr-FR','generated','ready');
INSERT INTO public.castings(id,user_id,course_id,lineup,lineup_hash) VALUES
 ('00000000-0036-4000-8000-000000000306','00000000-0036-4000-8000-000000000301','00000000-0036-4000-8000-000000000304','[]','export-own'),
 ('00000000-0036-4000-8000-000000000307','00000000-0036-4000-8000-000000000302','00000000-0036-4000-8000-000000000305','[]','export-other');
INSERT INTO public.live_sessions(id,course_id,user_id,casting_id,recorded,started_at,ended_at) VALUES
 ('00000000-0036-4000-8000-000000000308','00000000-0036-4000-8000-000000000304','00000000-0036-4000-8000-000000000301','00000000-0036-4000-8000-000000000306',true,now()-interval '1 hour',now()),
 ('00000000-0036-4000-8000-000000000309','00000000-0036-4000-8000-000000000305','00000000-0036-4000-8000-000000000302','00000000-0036-4000-8000-000000000307',true,now()-interval '1 hour',now());
INSERT INTO public.session_events(id,session_id,ts_ms,actor,event_type,payload) OVERRIDING SYSTEM VALUE
 SELECT 9007199254741000+n,'00000000-0036-4000-8000-000000000308',n,'user','text','{"own":true}' FROM generate_series(1,101) n;
INSERT INTO public.session_events(id,session_id,ts_ms,actor,event_type,payload) OVERRIDING SYSTEM VALUE VALUES
 (9007199254741200,'00000000-0036-4000-8000-000000000309',0,'user','text','{"other":true}');
INSERT INTO public.evaluations(session_id,user_id,phase,answers,score) VALUES
 ('00000000-0036-4000-8000-000000000308','00000000-0036-4000-8000-000000000301','hot','{}',80),
 ('00000000-0036-4000-8000-000000000309','00000000-0036-4000-8000-000000000302','hot','{}',20);
INSERT INTO public.anchor_plans(id,session_id,user_id,opted_in_at,ends_at) VALUES
 ('00000000-0036-4000-8000-000000000310','00000000-0036-4000-8000-000000000308','00000000-0036-4000-8000-000000000301',now(),now()+interval '90 days'),
 ('00000000-0036-4000-8000-000000000311','00000000-0036-4000-8000-000000000309','00000000-0036-4000-8000-000000000302',now(),now()+interval '90 days');
INSERT INTO public.anchor_deliveries(plan_id,delivery_kind,scheduled_for,dedupe_key) VALUES
 ('00000000-0036-4000-8000-000000000310','cold_eval',now()+interval '30 days','export-coverage-own'),
 ('00000000-0036-4000-8000-000000000311','cold_eval',now()+interval '30 days','export-coverage-other');
INSERT INTO public.seeds(session_id,persona,kind,content) VALUES
 ('00000000-0036-4000-8000-000000000308','coach','highlight','{"own":true}'),
 ('00000000-0036-4000-8000-000000000309','coach','highlight','{"other":true}');
INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth) VALUES
 ('00000000-0036-4000-8000-000000000301','https://example.invalid/SECRET_ENDPOINT',rpad('SECRET_PUBLIC_KEY',87,'x'),rpad('SECRET_AUTH',22,'x'));
INSERT INTO public.xapi_outbox(id,org_id,statement,lrs_target,dedupe_key) OVERRIDING SYSTEM VALUE VALUES
 (9007199254741300,'00000000-0036-4000-8000-000000000303','{"actor":{"mbox":"mailto:00000000-0036-4000-8000-000000000301@qalem.local"}}','SECRET_LRS','export-coverage-own'),
 (9007199254741301,'00000000-0036-4000-8000-000000000303','{"actor":{"mbox":"mailto:00000000-0036-4000-8000-000000000302@qalem.local"}}','SECRET_LRS','export-coverage-other');
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '00000000-0036-4000-8000-000000000301'; section text; rows jsonb; cursor_value text := NULL; total integer:=0;
BEGIN
 FOREACH section IN ARRAY ARRAY['profiles','org_members','stages','scenes','quiz_results','review_cards','certificates','payments','usage_records','telemetry_consent','pedagogy_telemetry','user_profiles','agent_reviews','castings','live_sessions','session_events','evaluations','anchor_plans','anchor_deliveries','seeds','seed_generation_runs','classroom_intervention_decisions','review_notification_preferences','review_notification_deliveries','push_subscriptions','web_push_deliveries','lti_user_bindings','lti_launch_sessions','lti_quiz_attempts','lti_grade_outbox','lti_grade_submissions','transmissions','courses','course_imports','agent_configs','organization_sources','formation_source_manifests','shared_classrooms','export_jobs','video_generation_jobs','video_capsules','classroom_generation_jobs','tenant_usage_reservations','tenant_credit_ledger','tenant_admin_audit','xapi_outbox'] LOOP
   rows := public.read_account_export_page(actor,section);
   IF rows IS NULL THEN RAISE EXCEPTION 'Missing section %',section; END IF;
 END LOOP;
 FOREACH section IN ARRAY ARRAY['courses','castings','live_sessions','evaluations','anchor_plans','anchor_deliveries','seeds','push_subscriptions','xapi_outbox'] LOOP
   rows := public.read_account_export_page(actor,section);
   IF jsonb_array_length(rows)<>1 THEN RAISE EXCEPTION 'Actor isolation failed for %',section; END IF;
   IF rows::text LIKE '%SECRET_%' OR rows::text LIKE '%"other": true%' THEN RAISE EXCEPTION 'Private field leaked in %',section; END IF;
 END LOOP;
 LOOP
   rows := public.read_account_export_page(actor,'session_events',cursor_value);
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE jsonb_typeof(r->'value'->'id')<>'string' OR r->'value'->'payload'<>'{"own":true}'::jsonb) THEN RAISE EXCEPTION 'Event precision/isolation lost'; END IF;
   total := total + jsonb_array_length(rows);
   EXIT WHEN jsonb_array_length(rows)<100;
   cursor_value := rows->99->>'cursor';
 END LOOP;
 IF total<>101 THEN RAISE EXCEPTION 'Event pagination failed'; END IF;
 rows := public.read_account_export_page(actor,'xapi_outbox');
 IF rows->0->'value'->>'id'<>'9007199254741300' THEN RAISE EXCEPTION 'xAPI bigint lost'; END IF;
 DELETE FROM public.org_members WHERE user_id=actor;
 IF public.read_account_export_page(actor,'courses')<>'[]'::jsonb THEN RAISE EXCEPTION 'Former member exported tenant authoring'; END IF;
 IF jsonb_array_length(public.read_account_export_page(actor,'evaluations'))<>1 THEN RAISE EXCEPTION 'Personal evaluation lost with membership'; END IF;
 BEGIN
   PERFORM public.read_account_export_page(actor,'webhook_configs');
   RAISE EXCEPTION 'Secret-bearing configuration accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF has_function_privilege('authenticated','public.read_account_export_page(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Client actor spoofing exposed'; END IF;
END $$;
RESET ROLE;
