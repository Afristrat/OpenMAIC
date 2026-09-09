-- Run after quiz-tenant and LTI-reporting candidates within BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES('00000000-0036-4000-8000-000000000241');
INSERT INTO public.organizations(id,name) VALUES('00000000-0036-4000-8000-000000000242','LTI reporting proof');
INSERT INTO public.org_members(user_id,org_id) VALUES('00000000-0036-4000-8000-000000000241','00000000-0036-4000-8000-000000000242');
INSERT INTO public.stages(id,org_id,name) VALUES('s036-lti-report','00000000-0036-4000-8000-000000000242','LTI reporting proof');
INSERT INTO public.scenes(id,stage_id,type,"order",content) VALUES('s036-lti-quiz','s036-lti-report','quiz',0,'{"type":"quiz","questions":[{"id":"q","type":"single","question":"Proof","answer":["a"]}]}');
INSERT INTO public.lti_registrations(client_id,issuer,jwks_url,auth_url,token_url,deployment_id,org_id)
VALUES('s036-lti-report','https://lms.example.org','https://lms.example.org/jwks','https://lms.example.org/auth','https://lms.example.org/token','proof','00000000-0036-4000-8000-000000000242');
INSERT INTO public.lti_resource_bindings(id,client_id,org_id,resource_link_id,stage_id)
VALUES('00000000-0036-4000-8000-000000000244','s036-lti-report','00000000-0036-4000-8000-000000000242','proof','s036-lti-report');
INSERT INTO public.lti_user_bindings(id,client_id,org_id,lms_subject,user_id)
VALUES('00000000-0036-4000-8000-000000000245','s036-lti-report','00000000-0036-4000-8000-000000000242','opaque','00000000-0036-4000-8000-000000000241');
INSERT INTO public.lti_launch_sessions(token_hash,client_id,org_id,resource_binding_id,user_binding_id,expires_at,line_item_url,ags_scopes)
VALUES(repeat('b',64),'s036-lti-report','00000000-0036-4000-8000-000000000242','00000000-0036-4000-8000-000000000244','00000000-0036-4000-8000-000000000245',now()+interval '1 hour','https://lms.example.org/item',ARRAY['https://purl.imsglobal.org/spec/lti-ags/scope/score']);
SET LOCAL ROLE service_role;
DO $$ DECLARE claim jsonb; delivery uuid; grade jsonb := '{"score":75,"results":[{"questionId":"q","correct":true,"earned":0.75,"status":"correct"}]}'; BEGIN
  claim:=public.begin_lti_quiz_attempt(repeat('b',64),'00000000-0036-4000-8000-000000000241','s036-lti-report','s036-lti-quiz','00000000-0036-4000-8000-000000000246','{"q":"a"}');
  -- Force the projection to fail after enqueue, proving transaction-wide rollback.
  INSERT INTO public.quiz_results(id,user_id,org_id,stage_id,scene_id,answers,score)
  VALUES((claim->>'id')::uuid,'00000000-0036-4000-8000-000000000241','00000000-0036-4000-8000-000000000242','s036-lti-report','s036-lti-quiz','[]',0);
  BEGIN
    PERFORM public.complete_lti_quiz_attempt(repeat('b',64),'00000000-0036-4000-8000-000000000241',(claim->>'id')::uuid,(claim->>'leaseId')::uuid,grade);
    RAISE EXCEPTION 'Projection collision accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.lti_grade_outbox WHERE request_id='00000000-0036-4000-8000-000000000246')
    OR EXISTS(SELECT 1 FROM public.lti_quiz_attempts WHERE id=(claim->>'id')::uuid AND result IS NOT NULL) THEN
    RAISE EXCEPTION 'Partial completion persisted'; END IF;
  DELETE FROM public.quiz_results WHERE id=(claim->>'id')::uuid;
  delivery:=public.complete_lti_quiz_attempt(repeat('b',64),'00000000-0036-4000-8000-000000000241',(claim->>'id')::uuid,(claim->>'leaseId')::uuid,grade);
  PERFORM public.complete_lti_quiz_attempt(repeat('b',64),'00000000-0036-4000-8000-000000000241',(claim->>'id')::uuid,(claim->>'leaseId')::uuid,grade);
  IF (SELECT count(*) FROM public.quiz_results WHERE stage_id='s036-lti-report' AND org_id='00000000-0036-4000-8000-000000000242' AND score=75 AND lti_attempt_id=(claim->>'id')::uuid) <> 1
    OR (SELECT count(*) FROM public.lti_grade_outbox WHERE request_id='00000000-0036-4000-8000-000000000246') <> 1 THEN
    RAISE EXCEPTION 'LTI reporting duplicated or misattributed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000241',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.quiz_results WHERE stage_id='s036-lti-report' AND score=75) <> 1 THEN RAISE EXCEPTION 'Own result unreadable'; END IF;
  BEGIN
    UPDATE public.quiz_results SET score=100 WHERE stage_id='s036-lti-report';
    RAISE EXCEPTION 'Browser changed LMS score';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
