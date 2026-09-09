-- Run after the candidate migration, within a transaction that ends in ROLLBACK.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := '5b58a2ea-9ee5-41e8-ad83-b868536e23b5';
  org uuid;
  sample jsonb := '{"scene_sequence":["slide","quiz"],"scene_durations":[4,5],"quiz_scores":[0.8],"completion_rate":1,"total_duration":9,"subject_tags":[],"language":"fr-FR","level":"beginner","agent_count":1,"action_counts":{"play":1,"pause":0,"seek":0}}';
  accepted boolean;
BEGIN
  SELECT m.org_id INTO STRICT org FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.user_id=actor AND o.status='active' LIMIT 1;
  INSERT INTO public.stages(id, owner_id, org_id, name) VALUES('s036-proof-learning-20260909',actor,org,'S-036 synthetic rollback proof');
  INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES(actor,false)
    ON CONFLICT(user_id) DO UPDATE SET pedagogy_consent=false;
  accepted := public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000001','s036-proof-learning-20260909',sample);
  IF accepted THEN RAISE EXCEPTION 'Refusal bypass'; END IF;
  UPDATE public.telemetry_consent SET pedagogy_consent=true WHERE user_id=actor;
  accepted := public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000001','s036-proof-learning-20260909',sample);
  IF NOT accepted THEN RAISE EXCEPTION 'Consented insert missing'; END IF;
  PERFORM public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000001','s036-proof-learning-20260909',sample);
  IF (SELECT count(*) FROM public.pedagogy_telemetry WHERE stage_id='s036-proof-learning-20260909') <> 1 THEN
    RAISE EXCEPTION 'Duplicate observation';
  END IF;
  BEGIN
    PERFORM public.record_consented_learning(actor,'00000000-0036-4000-8000-000000000002','not-authorized',sample);
    RAISE EXCEPTION 'Scope bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon','public.record_consented_learning(uuid,uuid,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.record_consented_learning(uuid,uuid,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Public service RPC';
  END IF;
END;
$$;
RESET ROLE;

-- Exercise withdrawal through the real RLS role, not only as postgres.
SELECT set_config('request.jwt.claim.sub','5b58a2ea-9ee5-41e8-ad83-b868536e23b5',true);
SET LOCAL ROLE authenticated;
UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=auth.uid();
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.pedagogy_telemetry WHERE stage_id='s036-proof-learning-20260909')
    OR EXISTS(SELECT 1 FROM qalem_telemetry_private.subjects WHERE user_id='5b58a2ea-9ee5-41e8-ad83-b868536e23b5') THEN
    RAISE EXCEPTION 'Withdrawal did not erase observations';
  END IF;
END; $$;
