-- S-034: durable, ordered delivery. This does not itself send any score.
CREATE TABLE public.lti_grade_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  resource_binding_id UUID NOT NULL,
  user_binding_id UUID NOT NULL,
  scene_id TEXT NOT NULL,
  line_item_url TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  score_changed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_binding_id, user_binding_id, request_id),
  FOREIGN KEY (resource_binding_id,client_id,org_id) REFERENCES public.lti_resource_bindings(id,client_id,org_id) ON DELETE CASCADE,
  FOREIGN KEY (user_binding_id,client_id,org_id) REFERENCES public.lti_user_bindings(id,client_id,org_id) ON DELETE CASCADE,
  CHECK ((status = 'processing') = (lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((lease_id IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);
CREATE INDEX lti_outbox_due_idx ON public.lti_grade_outbox(next_attempt_at,sequence) WHERE status IN ('pending','processing');
CREATE INDEX lti_outbox_user_idx ON public.lti_grade_outbox(user_binding_id,client_id,org_id);
ALTER TABLE public.lti_grade_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lti_grade_outbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON public.lti_grade_outbox TO service_role;
REVOKE UPDATE ON public.lti_grade_outbox FROM service_role;
GRANT UPDATE (status,attempt_count,next_attempt_at,lease_id,lease_expires_at,last_error,sent_at) ON public.lti_grade_outbox TO service_role;
REVOKE ALL ON SEQUENCE public.lti_grade_outbox_sequence_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SEQUENCE public.lti_grade_outbox_sequence_seq TO service_role;

-- Only an authenticated server route may provide p_user_id and its own score.
-- Browser roles cannot call this function or write the outbox directly.
CREATE FUNCTION public.enqueue_lti_grade(
  p_token_hash TEXT, p_user_id UUID, p_stage_id TEXT, p_scene_id TEXT,
  p_score NUMERIC, p_request_id UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE binding RECORD; existing public.lti_grade_outbox; changed_at TIMESTAMPTZ; result_id UUID;
BEGIN
  IF p_score IS NULL OR NOT (p_score BETWEEN 0 AND 100) OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid LTI score';
  END IF;
  SELECT s.client_id,s.org_id,s.resource_binding_id,s.user_binding_id,s.line_item_url
    INTO binding FROM public.lti_launch_sessions s
    JOIN public.lti_resource_bindings r ON r.id=s.resource_binding_id
    JOIN public.lti_user_bindings u ON u.id=s.user_binding_id
    JOIN public.organizations o ON o.id=s.org_id
    WHERE s.token_hash=p_token_hash AND s.expires_at>now()
      AND u.user_id=p_user_id AND r.stage_id=p_stage_id AND o.status='active'
      AND s.line_item_url IS NOT NULL
      AND 'https://purl.imsglobal.org/spec/lti-ags/scope/score'=ANY(s.ags_scopes)
      AND EXISTS (SELECT 1 FROM public.scenes q WHERE q.id=p_scene_id AND q.stage_id=r.stage_id AND q.type='quiz');
  IF NOT FOUND THEN RAISE EXCEPTION 'LTI launch does not authorize this quiz'; END IF;
  -- Serialize timestamp allocation for a platform, including distinct resource
  -- links sharing the same gradebook destination. No application lock needed.
  PERFORM 1 FROM public.lti_registrations WHERE client_id=binding.client_id FOR UPDATE;
  SELECT * INTO existing FROM public.lti_grade_outbox
    WHERE resource_binding_id=binding.resource_binding_id AND user_binding_id=binding.user_binding_id AND request_id=p_request_id;
  IF FOUND THEN
    IF existing.scene_id<>p_scene_id OR existing.score<>round(p_score,2) OR existing.line_item_url<>binding.line_item_url THEN
      RAISE EXCEPTION 'LTI request replay differs';
    END IF;
    RETURN existing.id;
  END IF;
  SELECT greatest(date_trunc('milliseconds',clock_timestamp()),max(score_changed_at)+interval '1 millisecond')
    INTO changed_at FROM public.lti_grade_outbox
    WHERE client_id=binding.client_id AND user_binding_id=binding.user_binding_id AND line_item_url=binding.line_item_url;
  INSERT INTO public.lti_grade_outbox(request_id,client_id,org_id,resource_binding_id,user_binding_id,scene_id,line_item_url,score,score_changed_at)
    VALUES(p_request_id,binding.client_id,binding.org_id,binding.resource_binding_id,binding.user_binding_id,p_scene_id,binding.line_item_url,round(p_score,2),changed_at)
    RETURNING id INTO result_id;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_lti_grade(TEXT,UUID,TEXT,TEXT,NUMERIC,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lti_grade(TEXT,UUID,TEXT,TEXT,NUMERIC,UUID) TO service_role;

CREATE FUNCTION public.claim_lti_grade() RETURNS SETOF public.lti_grade_outbox
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH candidate AS (
    SELECT q.id FROM public.lti_grade_outbox q
    WHERE ((q.status='pending' AND q.next_attempt_at<=now()) OR (q.status='processing' AND q.lease_expires_at<=now()))
      AND NOT EXISTS (
        SELECT 1 FROM public.lti_grade_outbox older
        WHERE older.client_id=q.client_id AND older.user_binding_id=q.user_binding_id AND older.line_item_url=q.line_item_url
          AND older.sequence<q.sequence AND older.status IN ('pending','processing')
      )
    ORDER BY q.sequence FOR UPDATE OF q SKIP LOCKED LIMIT 1
  )
  UPDATE public.lti_grade_outbox q SET status='processing',attempt_count=q.attempt_count+1,
    lease_id=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes'
  FROM candidate WHERE q.id=candidate.id RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_lti_grade() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lti_grade() TO service_role;
