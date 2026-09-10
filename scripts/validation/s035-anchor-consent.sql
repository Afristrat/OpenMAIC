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

INSERT INTO public.courses(id,owner_id,org_id,title,language,source_kind) VALUES('00000000-0035-4000-8000-000000000410','00000000-0035-4000-8000-000000000401','00000000-0035-4000-8000-000000000402','Anchor proof','fr-FR','generated');
INSERT INTO public.castings(id,user_id,course_id,lineup,lineup_hash) VALUES('00000000-0035-4000-8000-000000000411','00000000-0035-4000-8000-000000000401','00000000-0035-4000-8000-000000000410','[]','proof');
INSERT INTO public.live_sessions(id,course_id,user_id,casting_id) VALUES('00000000-0035-4000-8000-000000000412','00000000-0035-4000-8000-000000000410','00000000-0035-4000-8000-000000000401','00000000-0035-4000-8000-000000000411');
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:='00000000-0035-4000-8000-000000000401'; session uuid:='00000000-0035-4000-8000-000000000412';
 org uuid:='00000000-0035-4000-8000-000000000402'; item bigint;
BEGIN
 UPDATE public.feature_flags SET enabled=true WHERE flag_name='xapi_emission';
 IF public.enqueue_consented_anchor_xapi(actor,session,org,'proof','https://source.invalid','{}') IS NOT NULL THEN RAISE EXCEPTION 'No consent allowed'; END IF;
 UPDATE public.telemetry_consent SET xapi_consent=true WHERE user_id=actor;
 item:=public.enqueue_consented_anchor_xapi(actor,session,org,'proof','https://source.invalid','{"actor":{"mbox":"mailto:pseudonym@qalem.invalid"}}');
 IF item IS NULL OR item<=0 OR NOT public.authorize_xapi_delivery(item) THEN RAISE EXCEPTION 'Consented event missing'; END IF;
 IF public.enqueue_consented_anchor_xapi(actor,session,org,'proof','https://source.invalid','{}')<>0 THEN RAISE EXCEPTION 'Duplicate changed'; END IF;
 IF jsonb_array_length(public.read_account_export_page(actor,'xapi_outbox',NULL))<>1 THEN RAISE EXCEPTION 'Export missing'; END IF;
 UPDATE public.organizations SET status='suspended' WHERE id=org;
 IF public.authorize_xapi_delivery(item) THEN RAISE EXCEPTION 'Suspended tenant allowed'; END IF;
 UPDATE public.organizations SET status='active' WHERE id=org;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0035-4000-8000-000000000401',true);
SET LOCAL ROLE authenticated;
UPDATE public.telemetry_consent SET xapi_consent=false WHERE user_id='00000000-0035-4000-8000-000000000401';
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.xapi_outbox WHERE anchor_session_id='00000000-0035-4000-8000-000000000412') THEN RAISE EXCEPTION 'Direct withdrawal retained events'; END IF;
 RAISE NOTICE 'Anchor consent, tenant, replay, export and direct RLS withdrawal verified';
END $$;
