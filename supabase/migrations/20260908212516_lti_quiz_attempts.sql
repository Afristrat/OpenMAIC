-- Quiz correction is distinct from network delivery: retries reuse its result.
CREATE TABLE public.lti_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  resource_binding_id UUID NOT NULL,
  user_binding_id UUID NOT NULL,
  stage_id TEXT NOT NULL,
  scene_id TEXT NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  line_item_url TEXT NOT NULL,
  answers JSONB NOT NULL CHECK (jsonb_typeof(answers)='object' AND octet_length(answers::text)<=2097152),
  content JSONB NOT NULL CHECK (jsonb_typeof(content)='object'),
  result JSONB,
  outbox_id UUID REFERENCES public.lti_grade_outbox(id),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource_binding_id,user_binding_id,request_id),
  FOREIGN KEY(resource_binding_id,client_id,org_id) REFERENCES public.lti_resource_bindings(id,client_id,org_id) ON DELETE CASCADE,
  FOREIGN KEY(user_binding_id,client_id,org_id) REFERENCES public.lti_user_bindings(id,client_id,org_id) ON DELETE CASCADE,
  CHECK ((result IS NULL)=(outbox_id IS NULL)),
  CHECK ((lease_id IS NULL)=(lease_expires_at IS NULL)),
  CHECK (result IS NULL OR (jsonb_typeof(result)='object' AND lease_id IS NULL))
);
CREATE INDEX lti_attempt_user_idx ON public.lti_quiz_attempts(user_binding_id,client_id,org_id);
CREATE INDEX lti_attempt_scene_idx ON public.lti_quiz_attempts(scene_id);
CREATE INDEX lti_attempt_outbox_idx ON public.lti_quiz_attempts(outbox_id);
ALTER TABLE public.lti_quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lti_quiz_attempts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON public.lti_quiz_attempts TO service_role;
GRANT UPDATE(result,outbox_id,lease_id,lease_expires_at) ON public.lti_quiz_attempts TO service_role;

CREATE FUNCTION public.begin_lti_quiz_attempt(p_token_hash TEXT,p_user_id UUID,p_stage_id TEXT,p_scene_id TEXT,p_request_id UUID,p_answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE binding RECORD; attempt public.lti_quiz_attempts;
BEGIN
  IF p_request_id IS NULL OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'object' OR octet_length(p_answers::text)>2097152 THEN
    RAISE EXCEPTION 'Invalid LTI answers' USING ERRCODE='22023';
  END IF;
  SELECT s.*,q.content AS quiz_content INTO binding FROM public.lti_launch_sessions s
    JOIN public.lti_resource_bindings r ON r.id=s.resource_binding_id
    JOIN public.lti_user_bindings u ON u.id=s.user_binding_id
    JOIN public.organizations o ON o.id=s.org_id
    JOIN public.scenes q ON q.stage_id=r.stage_id AND q.id=p_scene_id AND q.type='quiz'
    JOIN public.lti_registrations registration ON registration.client_id=s.client_id
    WHERE s.token_hash=p_token_hash AND s.expires_at>now() AND u.user_id=p_user_id
      AND r.stage_id=p_stage_id AND o.status='active' AND s.line_item_url IS NOT NULL
      AND 'https://purl.imsglobal.org/spec/lti-ags/scope/score'=ANY(s.ags_scopes)
    FOR UPDATE OF registration;
  IF NOT FOUND THEN RAISE EXCEPTION 'LTI quiz access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO attempt FROM public.lti_quiz_attempts
    WHERE resource_binding_id=binding.resource_binding_id AND user_binding_id=binding.user_binding_id AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF attempt.answers<>p_answers OR attempt.scene_id<>p_scene_id OR attempt.stage_id<>p_stage_id OR attempt.line_item_url<>binding.line_item_url THEN
      RAISE EXCEPTION 'LTI attempt replay differs' USING ERRCODE='22023';
    END IF;
    IF attempt.result IS NOT NULL THEN
      RETURN jsonb_build_object('status','completed','result',attempt.result,'outboxId',attempt.outbox_id);
    END IF;
    IF attempt.lease_expires_at>now() THEN RETURN jsonb_build_object('status','busy'); END IF;
    UPDATE public.lti_quiz_attempts SET lease_id=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes'
      WHERE id=attempt.id RETURNING * INTO attempt;
  ELSE
    INSERT INTO public.lti_quiz_attempts(request_id,client_id,org_id,resource_binding_id,user_binding_id,stage_id,scene_id,line_item_url,answers,content,lease_id,lease_expires_at)
      VALUES(p_request_id,binding.client_id,binding.org_id,binding.resource_binding_id,binding.user_binding_id,p_stage_id,p_scene_id,binding.line_item_url,p_answers,binding.quiz_content,gen_random_uuid(),now()+interval '10 minutes')
      RETURNING * INTO attempt;
  END IF;
  RETURN jsonb_build_object('status','claimed','id',attempt.id,'leaseId',attempt.lease_id,'content',attempt.content,'answers',attempt.answers);
END $$;
REVOKE ALL ON FUNCTION public.begin_lti_quiz_attempt(TEXT,UUID,TEXT,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_lti_quiz_attempt(TEXT,UUID,TEXT,TEXT,UUID,JSONB) TO service_role;

-- Atomically persist the correction and enqueue its score. Lock order matches begin/enqueue.
CREATE FUNCTION public.complete_lti_quiz_attempt(p_token_hash TEXT,p_user_id UUID,p_id UUID,p_lease UUID,p_result JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE binding RECORD; attempt public.lti_quiz_attempts; delivery UUID;
BEGIN
  IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR jsonb_typeof(p_result->'score') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_result->'results') IS DISTINCT FROM 'array' OR octet_length(p_result::text)>1048576 THEN
    RAISE EXCEPTION 'Invalid LTI correction' USING ERRCODE='22023';
  END IF;
  SELECT s.* INTO binding FROM public.lti_launch_sessions s
    JOIN public.lti_user_bindings u ON u.id=s.user_binding_id
    JOIN public.organizations o ON o.id=s.org_id
    JOIN public.lti_registrations registration ON registration.client_id=s.client_id
    WHERE s.token_hash=p_token_hash AND s.expires_at>now() AND u.user_id=p_user_id AND o.status='active'
      AND s.line_item_url IS NOT NULL AND 'https://purl.imsglobal.org/spec/lti-ags/scope/score'=ANY(s.ags_scopes)
    FOR UPDATE OF registration;
  IF NOT FOUND THEN RAISE EXCEPTION 'LTI quiz access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO attempt FROM public.lti_quiz_attempts WHERE id=p_id
    AND resource_binding_id=binding.resource_binding_id AND user_binding_id=binding.user_binding_id
    AND line_item_url=binding.line_item_url FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LTI quiz access denied' USING ERRCODE='42501'; END IF;
  IF attempt.result IS NOT NULL THEN
    IF attempt.result<>p_result THEN RAISE EXCEPTION 'LTI attempt replay differs' USING ERRCODE='22023'; END IF;
    RETURN attempt.outbox_id;
  END IF;
  IF p_lease IS NULL OR attempt.lease_id IS NULL OR attempt.lease_expires_at IS NULL
    OR attempt.lease_id IS DISTINCT FROM p_lease OR attempt.lease_expires_at<=now() THEN
    RAISE EXCEPTION 'LTI correction lease expired' USING ERRCODE='40001';
  END IF;
  delivery:=public.enqueue_lti_grade(p_token_hash,p_user_id,attempt.stage_id,attempt.scene_id,(p_result->>'score')::numeric,attempt.request_id);
  UPDATE public.lti_quiz_attempts SET result=p_result,outbox_id=delivery,lease_id=NULL,lease_expires_at=NULL WHERE id=attempt.id;
  RETURN delivery;
END $$;
REVOKE ALL ON FUNCTION public.complete_lti_quiz_attempt(TEXT,UUID,UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lti_quiz_attempt(TEXT,UUID,UUID,UUID,JSONB) TO service_role;
