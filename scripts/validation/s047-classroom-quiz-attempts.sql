-- Candidate and share-authority dependencies must be in the same BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0047-4000-8000-000000000011');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0047-4000-8000-000000000012','S047 quiz source',10),
 ('00000000-0047-4000-8000-000000000013','S047 quiz recipient',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0047-4000-8000-000000000011','00000000-0047-4000-8000-000000000012','formateur'),
 ('00000000-0047-4000-8000-000000000011','00000000-0047-4000-8000-000000000013','formateur');
INSERT INTO public.stages(id,owner_id,org_id,name,language) VALUES
 ('s047-quiz-proof','00000000-0047-4000-8000-000000000011','00000000-0047-4000-8000-000000000012','Synthetic quiz','ar-MA');
INSERT INTO public.scenes(id,stage_id,type,"order",content) VALUES ('s047-quiz-scene','s047-quiz-proof','quiz',0,
 '{"type":"quiz","questions":[{"id":"q","type":"short_answer","question":"Explain","points":2}]}');
INSERT INTO public.shared_classrooms(id,stage_id,org_id,shared_by,visibility) VALUES
 ('00000000-0047-4000-8000-000000000015','s047-quiz-proof','00000000-0047-4000-8000-000000000013','00000000-0047-4000-8000-000000000011','organization');
SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := '00000000-0047-4000-8000-000000000011';
 org uuid := '00000000-0047-4000-8000-000000000012';
 recipient uuid := '00000000-0047-4000-8000-000000000013';
 req uuid := '00000000-0047-4000-8000-000000000014';
 claim jsonb; again jsonb; attempt_id uuid; lease uuid; stamp timestamptz;
 correction jsonb := '{"questionId":"q","earned":1,"correct":false,"status":"incorrect"}';
 result jsonb := '{"score":50,"results":[{"questionId":"q","earned":1,"correct":false,"status":"incorrect"}]}';
BEGIN
 claim := public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',req,'{"q":"response"}');
 attempt_id := (claim->>'id')::uuid; lease := (claim->>'leaseId')::uuid;
 IF claim->>'status'<>'claimed' OR claim->>'language'<>'ar-MA' OR claim->'content'->'questions'->0->>'points'<>'2' THEN
   RAISE EXCEPTION 'Snapshot missing'; END IF;
 again := public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',req,'{"q":"response"}');
 IF again->>'status'<>'busy' THEN RAISE EXCEPTION 'Parallel lease accepted'; END IF;
 BEGIN
   PERFORM public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',req,'{"q":"changed"}');
   RAISE EXCEPTION 'Changed answers accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
   PERFORM public.begin_classroom_quiz_attempt(actor,recipient,'s047-quiz-proof','s047-quiz-scene',gen_random_uuid(),'{}');
   RAISE EXCEPTION 'Unverified share accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE public.classroom_quiz_attempts SET user_id=actor WHERE id=attempt_id;
   RAISE EXCEPTION 'Immutable identity update granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.checkpoint_classroom_quiz_answer(actor,attempt_id,lease,'q',correction);
 PERFORM public.checkpoint_classroom_quiz_answer(actor,attempt_id,lease,'q',correction);
 BEGIN
   PERFORM public.checkpoint_classroom_quiz_answer(actor,attempt_id,lease,'q',jsonb_set(correction,'{earned}','2'));
   RAISE EXCEPTION 'Checkpoint overwritten';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE public.classroom_quiz_attempts SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=attempt_id;
 BEGIN
   PERFORM public.complete_classroom_quiz_attempt(actor,attempt_id,lease,result);
   RAISE EXCEPTION 'Expired lease completed';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 again := public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',req,'{"q":"response"}');
 IF again->>'id'<>attempt_id::text OR again->>'leaseId'=lease::text OR again->'partialResults'->'q' IS DISTINCT FROM correction THEN
   RAISE EXCEPTION 'Reclaim lost checkpoint'; END IF;
 lease := (again->>'leaseId')::uuid;
 PERFORM public.complete_classroom_quiz_attempt(actor,attempt_id,lease,result);
 SELECT completed_at INTO STRICT stamp FROM public.classroom_quiz_attempts WHERE id=attempt_id;
 PERFORM public.complete_classroom_quiz_attempt(actor,attempt_id,lease,result);
 again := public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',req,'{"q":"response"}');
 IF again->>'status'<>'completed' OR again->'result' IS DISTINCT FROM result
   OR (SELECT completed_at FROM public.classroom_quiz_attempts WHERE id=attempt_id) IS DISTINCT FROM stamp THEN
   RAISE EXCEPTION 'Completion replay mutated evidence'; END IF;
 again := public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',gen_random_uuid(),'{"q":"response"}');
 IF again->>'id'=attempt_id::text OR (SELECT count(*) FROM public.classroom_quiz_attempts WHERE user_id=actor)<>2 THEN
   RAISE EXCEPTION 'Distinct attempt lost'; END IF;
 UPDATE public.organizations SET status='suspended' WHERE id=org;
 BEGIN
   PERFORM public.begin_classroom_quiz_attempt(actor,org,'s047-quiz-proof','s047-quiz-scene',req,'{"q":"response"}');
   RAISE EXCEPTION 'Suspended organization accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.organizations SET status='active' WHERE id=org;
 IF has_table_privilege('anon','public.classroom_quiz_attempts','SELECT')
   OR has_table_privilege('authenticated','public.classroom_quiz_attempts','INSERT')
   OR has_function_privilege('authenticated','public.begin_classroom_quiz_attempt(uuid,uuid,text,text,uuid,jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.complete_classroom_quiz_attempt(uuid,uuid,uuid,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Public privilege leak'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0047-4000-8000-000000000011',true);
SET LOCAL ROLE authenticated;
UPDATE public.shared_classrooms SET visibility='organization' WHERE id='00000000-0047-4000-8000-000000000015';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '00000000-0047-4000-8000-000000000011';
 recipient uuid := '00000000-0047-4000-8000-000000000013'; claim jsonb;
BEGIN
 claim := public.begin_classroom_quiz_attempt(actor,recipient,'s047-quiz-proof','s047-quiz-scene',gen_random_uuid(),'{"q":"response"}');
 IF claim->>'status'<>'claimed' THEN RAISE EXCEPTION 'Verified share refused'; END IF;
 UPDATE public.organizations SET status='suspended' WHERE id='00000000-0047-4000-8000-000000000012';
 BEGIN
   PERFORM public.begin_classroom_quiz_attempt(actor,recipient,'s047-quiz-proof','s047-quiz-scene',gen_random_uuid(),'{}');
   RAISE EXCEPTION 'Suspended source accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.organizations SET status='active' WHERE id='00000000-0047-4000-8000-000000000012';
 UPDATE public.scenes SET content=jsonb_set(content,'{questions,0,points}','3') WHERE id='s047-quiz-scene';
 BEGIN
   PERFORM public.complete_classroom_quiz_attempt(actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,'{"score":0,"results":[]}');
   RAISE EXCEPTION 'Changed content completed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE public.scenes SET content=jsonb_set(content,'{questions,0,points}','2') WHERE id='s047-quiz-scene';
 UPDATE public.shared_classrooms SET visibility='private' WHERE id='00000000-0047-4000-8000-000000000015';
 BEGIN
   PERFORM public.complete_classroom_quiz_attempt(actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,'{"score":0,"results":[]}');
   RAISE EXCEPTION 'Revoked share completed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.shared_classrooms SET visibility='organization' WHERE id='00000000-0047-4000-8000-000000000015';
 DELETE FROM public.org_members WHERE user_id=actor AND org_id=recipient;
 BEGIN
   PERFORM public.complete_classroom_quiz_attempt(actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,'{"score":0,"results":[]}');
   RAISE EXCEPTION 'Revoked membership completed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM public.shared_classrooms WHERE id='00000000-0047-4000-8000-000000000015';
SELECT set_config('request.jwt.claim.sub','',true);
DELETE FROM auth.users WHERE id='00000000-0047-4000-8000-000000000011';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.classroom_quiz_attempts WHERE user_id='00000000-0047-4000-8000-000000000011') THEN
   RAISE EXCEPTION 'Account deletion retained attempts'; END IF;
END $$;
SELECT 'S047 native quiz authority checks passed; rollback required' AS proof;
