-- Run with consent/share/discussion/native quiz candidates in BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0047-4000-8000-000000000021');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0047-4000-8000-000000000022','S047 link proof',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES ('00000000-0047-4000-8000-000000000021','00000000-0047-4000-8000-000000000022','formateur');
INSERT INTO public.stages(id,owner_id,org_id,name,language,agent_ids) VALUES
 ('s047-link-proof','00000000-0047-4000-8000-000000000021','00000000-0047-4000-8000-000000000022','Link proof','fr-FR',ARRAY['a']);
INSERT INTO public.scenes(id,stage_id,type,"order",content) VALUES
 ('s047-link-scene','s047-link-proof','quiz',0,'{"type":"quiz","questions":[{"id":"q","type":"single","question":"Choose","options":[{"label":"A","value":"a"}],"answer":["a"],"points":1}]}');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES ('00000000-0047-4000-8000-000000000021',true);
INSERT INTO public.courses(owner_id,org_id,stage_id,title,language,source_kind,status,outline) VALUES
 ('00000000-0047-4000-8000-000000000021','00000000-0047-4000-8000-000000000022','s047-link-proof','Context','fr-FR','generated','ready','{"analyticsContext":{"subjectTags":["SIPOC"]}}');
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '00000000-0047-4000-8000-000000000021';
 org uuid := '00000000-0047-4000-8000-000000000022'; epoch uuid; claim jsonb; first_id uuid; d_id uuid; rows jsonb;
 obs jsonb := '{"discussionId":"00000000-0047-4000-8000-000000000023","sceneId":"s047-link-scene","durationBasis":"client-monotonic-elapsed","classificationMethod":"text-heuristic-v1","turns":[{"id":"t","agentId":"a","interventionType":"question","durationMs":300,"outcome":"completed"}],"postDiscussionQuiz":null}';
 grade jsonb := '{"score":0,"results":[{"questionId":"q","earned":0,"correct":false,"status":"incorrect"}]}';
BEGIN
 SELECT collection_epoch INTO epoch FROM public.telemetry_consent WHERE user_id=actor;
 claim := public.begin_classroom_quiz_attempt(actor,org,'s047-link-proof','s047-link-scene',gen_random_uuid(),'{"q":"a"}');
 IF (SELECT discussion_pattern_id FROM public.classroom_quiz_attempts WHERE id=(claim->>'id')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Invented preceding discussion'; END IF;
 PERFORM public.record_consented_discussion(actor,'s047-link-proof',org,epoch,obs);
 PERFORM public.complete_classroom_quiz_attempt(actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,grade);
 SELECT id INTO STRICT d_id FROM public.discussion_patterns WHERE discussion_id=(obs->>'discussionId')::uuid;
 IF (SELECT post_discussion_quiz_score FROM public.discussion_patterns WHERE id=d_id) IS NOT NULL THEN RAISE EXCEPTION 'Retroactive chronology'; END IF;
 claim := public.begin_classroom_quiz_attempt(actor,org,'s047-link-proof','s047-link-scene',gen_random_uuid(),'{"q":"a"}');
 first_id := (claim->>'id')::uuid;
 IF (SELECT discussion_pattern_id FROM public.classroom_quiz_attempts WHERE id=first_id) IS DISTINCT FROM d_id THEN RAISE EXCEPTION 'Missing association'; END IF;
 PERFORM public.complete_classroom_quiz_attempt(actor,first_id,(claim->>'leaseId')::uuid,grade);
 IF (SELECT post_discussion_quiz_score FROM public.discussion_patterns WHERE id=d_id) IS DISTINCT FROM 0::real THEN RAISE EXCEPTION 'Zero score lost'; END IF;
 claim := public.begin_classroom_quiz_attempt(actor,org,'s047-link-proof','s047-link-scene',gen_random_uuid(),'{"q":"a"}');
 IF (SELECT discussion_pattern_id FROM public.classroom_quiz_attempts WHERE id=(claim->>'id')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Second attempt replaced first'; END IF;
 PERFORM public.complete_classroom_quiz_attempt(actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,jsonb_set(grade,'{score}','100'));
 IF (SELECT post_discussion_quiz_score FROM public.discussion_patterns WHERE id=d_id)<>0 THEN RAISE EXCEPTION 'Best score cherry picked'; END IF;
 rows := public.read_authorized_discussion_patterns(actor,org,ARRAY['s047-link-proof'],'SIPOC','fr-FR');
 IF jsonb_array_length(rows)<>1 OR (rows->0->>'post_discussion_quiz_score')::numeric IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'One zero observation excluded'; END IF;
 IF public.read_authorized_discussion_patterns(actor,org,ARRAY['foreign-stage'],'SIPOC','fr-FR')<>'[]'::jsonb THEN RAISE EXCEPTION 'Stage scope ignored'; END IF;
 BEGIN
   PERFORM public.read_authorized_discussion_patterns('00000000-0047-4000-8000-000000000099',org,ARRAY['s047-link-proof'],'SIPOC','fr-FR');
   RAISE EXCEPTION 'Foreign actor read cohort';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 rows := public.read_account_discussion_export_page(actor,'discussion_patterns');
 IF jsonb_array_length(rows)<>1 OR rows->0->'value'->>'quiz_attempt_id'<>first_id::text THEN RAISE EXCEPTION 'Incomplete discussion export'; END IF;
 rows := public.read_account_discussion_export_page(actor,'classroom_quiz_attempts');
 IF jsonb_array_length(rows)<>3 OR rows->0->'value' ? 'content' OR rows->0->'value' ? 'lease_id' THEN RAISE EXCEPTION 'Quiz export projection'; END IF;
 IF public.read_account_discussion_export_page('00000000-0047-4000-8000-000000000099','discussion_patterns')<>'[]'::jsonb THEN RAISE EXCEPTION 'Foreign export'; END IF;
 DELETE FROM public.classroom_quiz_attempts WHERE id=first_id;
 IF (SELECT post_discussion_quiz_score FROM public.discussion_patterns WHERE id=d_id) IS NOT NULL THEN RAISE EXCEPTION 'Deleted evidence retained score'; END IF;
 -- Reclaim an ungraded first attempt, then withdraw while it is pending.
 claim := public.begin_classroom_quiz_attempt(actor,org,'s047-link-proof','s047-link-scene',gen_random_uuid(),'{"q":"a"}');
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 IF EXISTS(SELECT 1 FROM public.discussion_patterns WHERE id=d_id) OR
   EXISTS(SELECT 1 FROM public.classroom_quiz_attempts WHERE discussion_pattern_id=d_id) THEN RAISE EXCEPTION 'Withdrawal retained linkage'; END IF;
 PERFORM public.complete_classroom_quiz_attempt(actor,(claim->>'id')::uuid,(claim->>'leaseId')::uuid,grade);
 IF (SELECT result FROM public.classroom_quiz_attempts WHERE id=(claim->>'id')::uuid) IS NULL THEN RAISE EXCEPTION 'Functional correction blocked by refusal'; END IF;
 IF public.read_account_discussion_export_page(actor,'discussion_patterns')<>'[]'::jsonb THEN RAISE EXCEPTION 'Withdrawn export retained'; END IF;
 IF public.read_authorized_discussion_patterns(actor,org,ARRAY['s047-link-proof'],'SIPOC','fr-FR')<>'[]'::jsonb THEN RAISE EXCEPTION 'Withdrawn aggregate retained'; END IF;
 IF has_function_privilege('authenticated','public.read_account_discussion_export_page(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Export actor spoofable'; END IF;
END $$;
RESET ROLE;
SELECT 'S047 quiz linkage and personal export checks passed' AS proof;
