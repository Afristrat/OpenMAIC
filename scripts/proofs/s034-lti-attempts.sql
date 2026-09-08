-- Run after bindings/outbox fixtures, inside a transaction that is rolled back.
UPDATE public.scenes SET content='{"type":"quiz","questions":[{"id":"q","type":"short_answer","question":"Explain","points":1}]}'::jsonb WHERE id='s034-quiz';
SET LOCAL ROLE service_role;
DO $$
DECLARE first_claim jsonb; replay jsonb; recovered jsonb; result jsonb:='{"score":80,"results":[{"questionId":"q","earned":0.8,"correct":true,"status":"correct"}]}';
  delivery uuid; rejected boolean;
BEGIN
  first_claim:=public.begin_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz','00000000-0034-4000-8000-000000000040','{"q":"original"}');
  IF first_claim->>'status'<>'claimed' OR first_claim->'answers'->>'q'<>'original' THEN RAISE EXCEPTION 'Attempt not claimed'; END IF;
  replay:=public.begin_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz','00000000-0034-4000-8000-000000000040','{"q":"original"}');
  IF replay->>'status'<>'busy' THEN RAISE EXCEPTION 'Concurrent grading allowed'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.begin_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz','00000000-0034-4000-8000-000000000040','{"q":"changed"}');
  EXCEPTION WHEN invalid_parameter_value THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Changed answers accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.begin_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000099','s034-stage','s034-quiz','00000000-0034-4000-8000-000000000041','{}');
  EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Foreign user accepted'; END IF;
  PERFORM public.checkpoint_lti_quiz_answer((first_claim->>'id')::uuid,(first_claim->>'leaseId')::uuid,'q',result->'results'->0);
  PERFORM public.checkpoint_lti_quiz_answer((first_claim->>'id')::uuid,(first_claim->>'leaseId')::uuid,'q',result->'results'->0);
  rejected:=false;
  BEGIN
    PERFORM public.checkpoint_lti_quiz_answer((first_claim->>'id')::uuid,(first_claim->>'leaseId')::uuid,'q','{"questionId":"q","earned":1,"correct":true,"status":"correct"}');
  EXCEPTION WHEN invalid_parameter_value THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Changed checkpoint accepted'; END IF;
  UPDATE public.lti_quiz_attempts SET lease_expires_at=now()-interval '1 second' WHERE id=(first_claim->>'id')::uuid;
  recovered:=public.begin_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz','00000000-0034-4000-8000-000000000040','{"q":"original"}');
  IF recovered->>'leaseId'=first_claim->>'leaseId' OR recovered->'content'<>first_claim->'content' THEN RAISE EXCEPTION 'Recovery lost its snapshot or lease'; END IF;
  IF (SELECT partial_results->'q' FROM public.lti_quiz_attempts WHERE id=(recovered->>'id')::uuid) IS DISTINCT FROM result->'results'->0 THEN
    RAISE EXCEPTION 'Recovery lost the checkpoint';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.checkpoint_lti_quiz_answer((first_claim->>'id')::uuid,(first_claim->>'leaseId')::uuid,'q',result->'results'->0);
  EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale checkpoint lease accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.complete_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001',(first_claim->>'id')::uuid,(first_claim->>'leaseId')::uuid,result);
  EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale lease accepted'; END IF;
  delivery:=public.complete_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001',(recovered->>'id')::uuid,(recovered->>'leaseId')::uuid,result);
  replay:=public.begin_lti_quiz_attempt(repeat('a',64),'00000000-0034-4000-8000-000000000001','s034-stage','s034-quiz','00000000-0034-4000-8000-000000000040','{"q":"original"}');
  IF replay->>'status'<>'completed' OR replay->'result'<>result OR (replay->>'outboxId')::uuid<>delivery THEN RAISE EXCEPTION 'Completed replay changed'; END IF;
  IF (SELECT count(*) FROM public.lti_grade_outbox WHERE request_id='00000000-0034-4000-8000-000000000040')<>1 THEN RAISE EXCEPTION 'Duplicate outbox delivery'; END IF;
  IF has_table_privilege('authenticated','public.lti_quiz_attempts','SELECT') OR has_table_privilege('anon','public.lti_quiz_attempts','TRUNCATE')
    OR has_function_privilege('authenticated','public.begin_lti_quiz_attempt(text,uuid,text,text,uuid,jsonb)','EXECUTE')
    OR has_column_privilege('service_role','public.lti_quiz_attempts','answers','UPDATE')
    OR has_function_privilege('authenticated','public.checkpoint_lti_quiz_answer(uuid,uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Attempt exposed or mutable'; END IF;
END $$;
RESET ROLE;
SELECT 'S034_ATTEMPTS_PROOF_OK';
