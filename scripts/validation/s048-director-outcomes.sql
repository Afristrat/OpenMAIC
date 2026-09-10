-- Candidate migrations only, BEGIN/ROLLBACK. No durable fixture or real learner.
INSERT INTO auth.users(id) VALUES ('00000000-0048-4000-8000-000000000031'),('00000000-0048-4000-8000-000000000032'),('00000000-0048-4000-8000-000000000033');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0048-4000-8000-000000000032','S048 outcomes proof',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0048-4000-8000-000000000031','00000000-0048-4000-8000-000000000032','admin'),
 ('00000000-0048-4000-8000-000000000032','00000000-0048-4000-8000-000000000032','apprenant'),
 ('00000000-0048-4000-8000-000000000033','00000000-0048-4000-8000-000000000032','apprenant');
INSERT INTO public.stages(id,owner_id,org_id,name,language,agent_ids) VALUES
 ('s048-receipt-proof','00000000-0048-4000-8000-000000000031','00000000-0048-4000-8000-000000000032','Outcomes proof','fr-FR',ARRAY['a']);
INSERT INTO public.scenes(id,stage_id,type,"order",content) VALUES
 ('s048-receipt-scene','s048-receipt-proof','slide',0,'{}'),
 ('s048-receipt-quiz','s048-receipt-proof','quiz',1,'{"type":"quiz","questions":[{"id":"q","type":"single","question":"Choose","options":[{"label":"A","value":"a"}],"answer":["a"],"points":1}]}');
INSERT INTO public.courses(owner_id,org_id,stage_id,title,language,source_kind,status,outline) VALUES
 ('00000000-0048-4000-8000-000000000031','00000000-0048-4000-8000-000000000032','s048-receipt-proof','Context','fr-FR','generated','ready','{"analyticsContext":{"subjectTags":["SIPOC"]}}');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES ('00000000-0048-4000-8000-000000000031',true),('00000000-0048-4000-8000-000000000032',true),('00000000-0048-4000-8000-000000000033',true);
SET LOCAL ROLE service_role;
DO $$ <<proof>>
DECLARE actor uuid := '00000000-0048-4000-8000-000000000031'; org uuid := '00000000-0048-4000-8000-000000000032';
 other uuid := '00000000-0048-4000-8000-000000000033'; epoch uuid; other_epoch uuid; r_id uuid; arm text; n integer;
 obs jsonb := '{"discussionId":"00000000-0048-4000-8000-000000000051","sceneId":"s048-receipt-scene","durationBasis":"client-monotonic-elapsed","classificationMethod":"text-heuristic-v1","turns":[{"id":"assistant-00000000-0048-4000-8000-000000000041","agentId":"a","interventionType":"question","durationMs":300,"outcome":"completed"},{"id":"assistant-00000000-0048-4000-8000-000000000042","agentId":"a","interventionType":"answer","durationMs":300,"outcome":"completed"}],"postDiscussionQuiz":null}';
 first_claim jsonb; second_claim jsonb; control_claim jsonb; report jsonb; treatment jsonb; control_row jsonb; d_id uuid;
 grade jsonb := '{"score":0,"results":[{"questionId":"q","earned":0,"correct":false,"status":"incorrect"}]}';
BEGIN
 IF public.read_director_experiment(actor,org,'s048-receipt-proof')<>'[]'::jsonb THEN RAISE EXCEPTION 'Invented empty cohort'; END IF;
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 SELECT collection_epoch INTO other_epoch FROM public.telemetry_consent WHERE user_id=org;
 FOR n IN 41..43 LOOP
   r_id := ('00000000-0048-4000-8000-0000000000'||n)::uuid;
   PERFORM public.begin_director_receipt(actor,org,'s048-receipt-proof','s048-receipt-scene',r_id,'a');
   PERFORM public.select_director_receipt(actor,r_id,'a','observed-pattern',1,0,12);
   PERFORM public.finish_director_receipt(actor,r_id,'completed');
 END LOOP;
 -- The same IDs cannot bind another account, another scene or an unfinished receipt.
 PERFORM public.record_consented_discussion(org,'s048-receipt-proof',org,other_epoch,obs);
 IF EXISTS(SELECT 1 FROM qalem_telemetry_private.director_receipts WHERE discussion_pattern_id IS NOT NULL) THEN RAISE EXCEPTION 'Other account bound'; END IF;
 PERFORM public.record_consented_discussion(actor,'s048-receipt-proof',org,epoch,jsonb_set(jsonb_set(obs,'{discussionId}','"00000000-0048-4000-8000-000000000052"'),'{sceneId}','"s048-receipt-quiz"'));
 IF EXISTS(SELECT 1 FROM qalem_telemetry_private.director_receipts WHERE discussion_pattern_id IS NOT NULL) THEN RAISE EXCEPTION 'Other scene bound'; END IF;
 PERFORM public.record_consented_discussion(actor,'s048-receipt-proof',org,epoch,obs);
 SELECT id INTO d_id FROM public.discussion_patterns WHERE subject_hash IN (SELECT subject_hash FROM qalem_telemetry_private.subjects WHERE user_id=actor) AND discussion_id=(obs->>'discussionId')::uuid;
 IF (SELECT count(*) FROM qalem_telemetry_private.director_receipts WHERE discussion_pattern_id=d_id)<>2 THEN RAISE EXCEPTION 'Missing exact message links'; END IF;
 first_claim := public.begin_classroom_quiz_attempt(actor,org,'s048-receipt-proof','s048-receipt-quiz',gen_random_uuid(),'{"q":"a"}');
 IF (SELECT discussion_pattern_id FROM public.classroom_quiz_attempts WHERE id=(first_claim->>'id')::uuid) IS DISTINCT FROM d_id THEN RAISE EXCEPTION 'Missing native quiz link'; END IF;
 -- A new discussion reusing IDs must not steal an existing association.
 PERFORM public.record_consented_discussion(actor,'s048-receipt-proof',org,epoch,jsonb_set(obs,'{discussionId}','"00000000-0048-4000-8000-000000000053"'));
 IF (SELECT count(*) FROM qalem_telemetry_private.director_receipts WHERE discussion_pattern_id=d_id)<>2 THEN RAISE EXCEPTION 'Receipt reused'; END IF;
 -- Later completed quiz must not hide the first pending submission.
 obs := jsonb_set(jsonb_set(obs,'{discussionId}','"00000000-0048-4000-8000-000000000054"'),'{turns}',jsonb_build_array(jsonb_set(obs->'turns'->0,'{id}','"assistant-00000000-0048-4000-8000-000000000043"')));
 PERFORM public.record_consented_discussion(actor,'s048-receipt-proof',org,epoch,obs);
 second_claim := public.begin_classroom_quiz_attempt(actor,org,'s048-receipt-proof','s048-receipt-quiz',gen_random_uuid(),'{"q":"a"}');
 PERFORM public.complete_classroom_quiz_attempt(actor,(second_claim->>'id')::uuid,(second_claim->>'leaseId')::uuid,jsonb_set(grade,'{score}','100'));
 report := public.read_director_experiment(actor,org,'s048-receipt-proof');
 SELECT value INTO treatment FROM jsonb_array_elements(report) WHERE value->>'cohort'='data-driven';
 IF (treatment->>'assignedUnits')::integer<>1 OR (treatment->>'decisions')::integer<>3 OR treatment->'meanQuizScore'<>'null'::jsonb THEN RAISE EXCEPTION 'Pending first quiz or unit counting lost'; END IF;
 PERFORM public.complete_classroom_quiz_attempt(actor,(first_claim->>'id')::uuid,(first_claim->>'leaseId')::uuid,grade);
 -- Another treatment unit without a quiz remains in the denominator.
 PERFORM public.begin_director_receipt(other,org,'s048-receipt-proof','s048-receipt-scene','00000000-0048-4000-8000-000000000044','a');
 SELECT collection_epoch INTO other_epoch FROM public.telemetry_consent WHERE user_id=other;
 PERFORM public.record_consented_discussion(other,'s048-receipt-proof',org,other_epoch,
   jsonb_set(jsonb_set(obs,'{discussionId}','"00000000-0048-4000-8000-000000000055"'),'{turns}',
     jsonb_build_array(jsonb_set(obs->'turns'->0,'{id}','"assistant-00000000-0048-4000-8000-000000000044"'))));
 IF EXISTS(SELECT 1 FROM qalem_telemetry_private.director_receipts WHERE id='00000000-0048-4000-8000-000000000044' AND discussion_pattern_id IS NOT NULL) THEN RAISE EXCEPTION 'Unfinished receipt bound'; END IF;
 -- The classic arm remains independent, including its native score.
 PERFORM public.begin_director_receipt(org,org,'s048-receipt-proof','s048-receipt-scene','00000000-0048-4000-8000-000000000045','a');
 PERFORM public.select_director_receipt(org,'00000000-0048-4000-8000-000000000045','a','control',NULL,NULL,0);
 PERFORM public.finish_director_receipt(org,'00000000-0048-4000-8000-000000000045','completed');
 SELECT collection_epoch INTO other_epoch FROM public.telemetry_consent WHERE user_id=org;
 PERFORM public.record_consented_discussion(org,'s048-receipt-proof',org,other_epoch,
   jsonb_set(jsonb_set(obs,'{discussionId}','"00000000-0048-4000-8000-000000000056"'),'{turns}',
     jsonb_build_array(jsonb_set(obs->'turns'->0,'{id}','"assistant-00000000-0048-4000-8000-000000000045"'))));
 control_claim := public.begin_classroom_quiz_attempt(org,org,'s048-receipt-proof','s048-receipt-quiz',gen_random_uuid(),'{"q":"a"}');
 PERFORM public.complete_classroom_quiz_attempt(org,(control_claim->>'id')::uuid,(control_claim->>'leaseId')::uuid,jsonb_set(grade,'{score}','100'));
 report := public.read_director_experiment(actor,org,'s048-receipt-proof');
 SELECT value INTO control_row FROM jsonb_array_elements(report) WHERE value->>'cohort'='classic';
 IF (control_row->>'assignedUnits')::integer IS DISTINCT FROM 1 OR (control_row->>'meanQuizScore')::numeric IS DISTINCT FROM 1::numeric OR
   (control_row->>'suggestionSelections')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Classic arm contaminated'; END IF;
 SELECT value INTO treatment FROM jsonb_array_elements(report) WHERE value->>'cohort'='data-driven';
 IF (treatment->>'assignedUnits')::integer<>2 OR (treatment->>'unitsWithQuiz')::integer<>1 OR
   (treatment->>'missingQuizUnits')::integer<>1 OR (treatment->>'meanQuizScore')::numeric IS DISTINCT FROM 0::numeric OR
   (treatment->>'decisions')::integer<>4 THEN RAISE EXCEPTION 'Biased denominator or zero score lost'; END IF;
 IF report::text LIKE '%subject_hash%' OR report::text LIKE '%user_id%' THEN RAISE EXCEPTION 'Identity leaked'; END IF;
 BEGIN
   PERFORM public.read_director_experiment(org,org,'s048-receipt-proof'); RAISE EXCEPTION 'Learner read report';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.read_director_experiment(actor,org,'foreign-stage'); RAISE EXCEPTION 'Foreign stage read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.read_account_director_export_page(actor,'director_receipts')) e
   WHERE e->'value'->>'discussion_pattern_id'=d_id::text) THEN RAISE EXCEPTION 'Association absent from personal export'; END IF;
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 report := public.read_director_experiment(actor,org,'s048-receipt-proof');
 SELECT value INTO treatment FROM jsonb_array_elements(report) WHERE value->>'cohort'='data-driven';
 IF (treatment->>'assignedUnits')::integer<>1 OR (treatment->>'unitsWithQuiz')::integer<>0 THEN RAISE EXCEPTION 'Revoked cohort residue'; END IF;
 IF EXISTS(SELECT 1 FROM public.classroom_quiz_attempts WHERE user_id=actor AND discussion_pattern_id IS NOT NULL) THEN RAISE EXCEPTION 'Revoked quiz linkage'; END IF;
 IF has_function_privilege('authenticated','public.read_director_experiment(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Public report actor spoofable'; END IF;
END $$;
RESET ROLE;
