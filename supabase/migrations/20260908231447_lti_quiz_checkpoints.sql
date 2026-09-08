-- Persist each model correction independently of the final score/outbox transaction.
ALTER TABLE public.lti_quiz_attempts ADD COLUMN partial_results JSONB NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof(partial_results)='object' AND octet_length(partial_results::text)<=1048576);
GRANT UPDATE(partial_results) ON public.lti_quiz_attempts TO service_role;

CREATE FUNCTION public.checkpoint_lti_quiz_answer(p_id UUID,p_lease UUID,p_question_id TEXT,p_result JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE attempt public.lti_quiz_attempts; question JSONB; points NUMERIC; earned NUMERIC;
BEGIN
  SELECT * INTO attempt FROM public.lti_quiz_attempts WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR p_lease IS NULL OR attempt.result IS NOT NULL
    OR attempt.lease_id IS DISTINCT FROM p_lease OR attempt.lease_expires_at IS NULL
    OR attempt.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'LTI correction lease expired' USING ERRCODE='40001';
  END IF;
  SELECT value INTO question FROM jsonb_array_elements(attempt.content->'questions')
    WHERE value->>'id'=p_question_id AND value->>'type'='short_answer';
  IF NOT FOUND OR p_result IS NULL OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
    OR p_result->>'questionId' IS DISTINCT FROM p_question_id
    OR jsonb_typeof(p_result->'earned') IS DISTINCT FROM 'number'
    OR octet_length(p_result::text)>20000 THEN
    RAISE EXCEPTION 'Invalid LTI checkpoint' USING ERRCODE='22023';
  END IF;
  points:=coalesce((question->>'points')::numeric,1); earned:=(p_result->>'earned')::numeric;
  IF earned<0 OR earned>points
    OR p_result->'correct' IS DISTINCT FROM to_jsonb(earned>=points*0.8)
    OR p_result->>'status' IS DISTINCT FROM (CASE WHEN earned>=points*0.8 THEN 'correct' ELSE 'incorrect' END) THEN
    RAISE EXCEPTION 'Invalid LTI checkpoint grade' USING ERRCODE='22023';
  END IF;
  IF attempt.partial_results ? p_question_id THEN
    IF attempt.partial_results->p_question_id<>p_result THEN
      RAISE EXCEPTION 'LTI checkpoint replay differs' USING ERRCODE='22023';
    END IF;
    RETURN true;
  END IF;
  UPDATE public.lti_quiz_attempts SET partial_results=partial_results || jsonb_build_object(p_question_id,p_result)
    WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.checkpoint_lti_quiz_answer(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_lti_quiz_answer(UUID,UUID,TEXT,JSONB) TO service_role;
