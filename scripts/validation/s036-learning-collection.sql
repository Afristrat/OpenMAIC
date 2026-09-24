-- Run after the candidate migration, within a transaction that ends in ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000061');
INSERT INTO public.organizations(id,name,status,seat_limit)
  VALUES('00000000-0036-4000-8000-000000000062','S-036 collection proof','active',1);
INSERT INTO public.org_members(user_id,org_id,role)
  VALUES('00000000-0036-4000-8000-000000000061','00000000-0036-4000-8000-000000000062','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name)
  VALUES('s036-proof-learning-20260909','00000000-0036-4000-8000-000000000061','00000000-0036-4000-8000-000000000062','S-036 synthetic rollback proof');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := '00000000-0036-4000-8000-000000000061';
  org uuid := '00000000-0036-4000-8000-000000000062';
  sample jsonb := '{"scene_sequence":["slide","quiz"],"scene_durations":[4,5],"quiz_scores":[0.8],"completion_rate":1,"total_duration":9,"subject_tags":[],"language":"fr-FR","level":"beginner","agent_count":1,"action_counts":{"play":1,"pause":0,"seek":0}}';
  accepted boolean;
  epoch uuid;
BEGIN
  SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
  IF NOT EXISTS(SELECT 1 FROM public.telemetry_consent WHERE user_id=actor AND pedagogy_consent) THEN
    RAISE EXCEPTION 'Contractual analytics were not provisioned';
  END IF;
  accepted := public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000001','s036-proof-learning-20260909',sample,epoch);
  IF NOT accepted THEN RAISE EXCEPTION 'Consented insert missing'; END IF;
  PERFORM public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000001','s036-proof-learning-20260909',sample,epoch);
  IF (SELECT count(*) FROM public.pedagogy_telemetry WHERE stage_id='s036-proof-learning-20260909') <> 1 THEN
    RAISE EXCEPTION 'Duplicate observation';
  END IF;
  BEGIN
    PERFORM public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000002','not-authorized',sample,epoch);
    RAISE EXCEPTION 'Scope bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.telemetry_consent SET pedagogy_consent=true, collection_epoch=gen_random_uuid() WHERE user_id=actor;
  IF (SELECT collection_epoch FROM public.telemetry_consent WHERE user_id=actor) <> epoch THEN
    RAISE EXCEPTION 'Unchanged consent invalidated an active epoch';
  END IF;
  PERFORM public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000004','s036-proof-learning-20260909',sample,epoch);
  IF has_function_privilege('anon','public.record_consented_learning(uuid,uuid,text,jsonb,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.record_consented_learning(uuid,uuid,text,jsonb,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Public service RPC';
  END IF;
END;
$$;
RESET ROLE;
