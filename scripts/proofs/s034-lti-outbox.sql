-- Requires the bindings proof fixtures before its membership-deletion step.
UPDATE public.lti_launch_sessions SET line_item_url='https://lms.example.org/item',
  ags_scopes=ARRAY['https://purl.imsglobal.org/spec/lti-ags/scope/score'] WHERE client_id='s034-client';
INSERT INTO public.scenes(id,stage_id,type,"order") VALUES ('s034-quiz','s034-stage','quiz',0);
SET LOCAL ROLE service_role;
DO $$ DECLARE first_id uuid; replay_id uuid; second_id uuid; first_time timestamptz; second_time timestamptz;
  claimed public.lti_grade_outbox; previous_lease uuid; rejected boolean;
BEGIN
  first_id:=public.enqueue_lti_grade(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz',80,'00000000-0034-4000-8000-000000000010');
  replay_id:=public.enqueue_lti_grade(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz',80,'00000000-0034-4000-8000-000000000010');
  IF first_id<>replay_id THEN RAISE EXCEPTION 'Replay duplicated a grade'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.enqueue_lti_grade(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz',90,'00000000-0034-4000-8000-000000000010');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'LTI request replay differs' THEN RAISE; END IF; rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Changed replay accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.enqueue_lti_grade(repeat('a',64),'00000000-0034-4000-8000-000000000099','s034-stage','s034-quiz',80,'00000000-0034-4000-8000-000000000011');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'LTI launch does not authorize this quiz' THEN RAISE; END IF; rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Foreign user accepted'; END IF;
  second_id:=public.enqueue_lti_grade(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz',90,'00000000-0034-4000-8000-000000000011');
  SELECT score_changed_at INTO first_time FROM public.lti_grade_outbox WHERE id=first_id;
  SELECT score_changed_at INTO second_time FROM public.lti_grade_outbox WHERE id=second_id;
  IF second_time<=first_time THEN RAISE EXCEPTION 'Score timestamps not strictly increasing'; END IF;
  SELECT * INTO claimed FROM public.claim_lti_grade();
  IF claimed.id<>first_id OR claimed.attempt_count<>1 THEN RAISE EXCEPTION 'First claim failed'; END IF;
  previous_lease:=claimed.lease_id;
  IF EXISTS (SELECT 1 FROM public.claim_lti_grade()) THEN RAISE EXCEPTION 'Concurrent or out-of-order claim allowed'; END IF;
  UPDATE public.lti_grade_outbox SET lease_expires_at=now()-interval '1 second' WHERE id=first_id;
  SELECT * INTO claimed FROM public.claim_lti_grade();
  IF claimed.id<>first_id OR claimed.attempt_count<>2 OR claimed.lease_id=previous_lease THEN RAISE EXCEPTION 'Expired lease not recovered'; END IF;
  IF public.finish_lti_grade(first_id,previous_lease,true,false,NULL) THEN RAISE EXCEPTION 'Stale acknowledgement accepted'; END IF;
  IF NOT public.finish_lti_grade(first_id,claimed.lease_id,true,false,NULL) THEN RAISE EXCEPTION 'Acknowledgement failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lti_grade_submissions WHERE client_id='s034-client' AND user_id='00000000-0034-4000-8000-000000000001' AND resource_link_id='assignment' AND score_given=80 AND success) THEN RAISE EXCEPTION 'Audit missing'; END IF;
  SELECT * INTO claimed FROM public.claim_lti_grade();
  IF claimed.id<>second_id THEN RAISE EXCEPTION 'Next ordered grade unavailable'; END IF;
  IF has_column_privilege('service_role','public.lti_grade_outbox','score','UPDATE') THEN RAISE EXCEPTION 'Worker can change the score'; END IF;
  IF has_function_privilege('authenticated','public.claim_lti_grade()','EXECUTE') OR has_function_privilege('anon','public.enqueue_lti_grade(text,uuid,text,text,numeric,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Public queue execution exposed'; END IF;
END $$;
RESET ROLE;
SELECT 'S034_OUTBOX_PROOF_OK';
