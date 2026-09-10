-- Distinct immutable submissions; historical browser summaries are not backfilled.
CREATE TABLE public.classroom_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id text NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  scene_id text NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object' AND octet_length(answers::text)<=2097152),
  content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
  language text NOT NULL,
  partial_results jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  lease_id uuid,
  lease_expires_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE(user_id,request_id),
  CHECK ((result IS NULL)=(completed_at IS NULL)),
  CHECK ((lease_id IS NULL)=(lease_expires_at IS NULL)),
  CHECK (result IS NULL OR (jsonb_typeof(result)='object' AND lease_id IS NULL))
);
CREATE INDEX classroom_quiz_attempts_scope ON public.classroom_quiz_attempts(user_id,org_id,stage_id,submitted_at,id);
CREATE INDEX classroom_quiz_attempts_scene ON public.classroom_quiz_attempts(scene_id);
ALTER TABLE public.classroom_quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classroom_quiz_attempts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON public.classroom_quiz_attempts TO service_role;
GRANT UPDATE(partial_results,result,lease_id,lease_expires_at,completed_at) ON public.classroom_quiz_attempts TO service_role;

CREATE SCHEMA IF NOT EXISTS qalem_quiz_private;
REVOKE ALL ON SCHEMA qalem_quiz_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA qalem_quiz_private TO service_role;
CREATE FUNCTION qalem_quiz_private.authorized_content(p_actor uuid,p_org uuid,p_stage text,p_scene text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE source_org uuid; quiz jsonb; lang text;
BEGIN
  SELECT org_id,language INTO source_org,lang FROM public.stages WHERE id=p_stage FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz scope denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.user_id=p_actor AND m.org_id=p_org AND o.status='active' FOR SHARE OF m,o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz scope denied' USING ERRCODE='42501'; END IF;
  IF source_org IS DISTINCT FROM p_org THEN
    IF source_org IS NOT NULL THEN
      PERFORM 1 FROM public.organizations WHERE id=source_org AND status='active' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Quiz source denied' USING ERRCODE='42501'; END IF;
    END IF;
    PERFORM 1 FROM public.shared_classrooms s WHERE s.org_id=p_org AND s.stage_id=p_stage
      AND s.authorization_verified AND s.visibility IN ('organization','public') LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quiz scope denied' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT content INTO quiz FROM public.scenes WHERE id=p_scene AND stage_id=p_stage AND type='quiz' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz scene denied' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('content',quiz,'language',CASE WHEN lang IN ('fr-FR','ar-MA','en-US') THEN lang ELSE 'en-US' END);
END $$;
REVOKE ALL ON FUNCTION qalem_quiz_private.authorized_content(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION qalem_quiz_private.authorized_content(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION public.begin_classroom_quiz_attempt(p_actor uuid,p_org uuid,p_stage text,p_scene text,p_request uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE context jsonb; attempt public.classroom_quiz_attempts;
BEGIN
  IF p_actor IS NULL OR p_request IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object'
    OR octet_length(p_answers::text)>2097152 THEN RAISE EXCEPTION 'Invalid quiz answers' USING ERRCODE='22023'; END IF;
  context := qalem_quiz_private.authorized_content(p_actor,p_org,p_stage,p_scene);
  -- Serializes creation/reclaim for this immutable request, not all learners.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,47));
  SELECT * INTO attempt FROM public.classroom_quiz_attempts WHERE user_id=p_actor AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF (attempt.org_id,attempt.stage_id,attempt.scene_id,attempt.answers,attempt.content)
      IS DISTINCT FROM (p_org,p_stage,p_scene,p_answers,context->'content') THEN
      RAISE EXCEPTION 'Quiz attempt changed' USING ERRCODE='22023';
    END IF;
    IF attempt.result IS NOT NULL THEN
      RETURN jsonb_build_object('status','completed','attemptId',attempt.id,'result',attempt.result);
    END IF;
    IF attempt.lease_expires_at>clock_timestamp() THEN RETURN jsonb_build_object('status','busy'); END IF;
    UPDATE public.classroom_quiz_attempts SET lease_id=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '4 minutes'
      WHERE id=attempt.id RETURNING * INTO attempt;
  ELSE
    INSERT INTO public.classroom_quiz_attempts(user_id,org_id,stage_id,scene_id,request_id,answers,content,language,lease_id,lease_expires_at)
      VALUES(p_actor,p_org,p_stage,p_scene,p_request,p_answers,context->'content',context->>'language',gen_random_uuid(),clock_timestamp()+interval '4 minutes')
      RETURNING * INTO attempt;
  END IF;
  RETURN jsonb_build_object('status','claimed','id',attempt.id,'leaseId',attempt.lease_id,
    'content',attempt.content,'answers',attempt.answers,'language',attempt.language,'partialResults',attempt.partial_results);
END $$;
REVOKE ALL ON FUNCTION public.begin_classroom_quiz_attempt(uuid,uuid,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_classroom_quiz_attempt(uuid,uuid,text,text,uuid,jsonb) TO service_role;

CREATE FUNCTION public.checkpoint_classroom_quiz_answer(p_actor uuid,p_id uuid,p_lease uuid,p_question text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE attempt public.classroom_quiz_attempts; context jsonb; question jsonb;
BEGIN
  SELECT * INTO attempt FROM public.classroom_quiz_attempts WHERE id=p_id AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt denied' USING ERRCODE='42501'; END IF;
  context := qalem_quiz_private.authorized_content(p_actor,attempt.org_id,attempt.stage_id,attempt.scene_id);
  SELECT * INTO attempt FROM public.classroom_quiz_attempts WHERE id=p_id AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt denied' USING ERRCODE='42501'; END IF;
  IF attempt.content IS DISTINCT FROM context->'content' OR attempt.lease_id IS DISTINCT FROM p_lease
    OR p_lease IS NULL OR attempt.lease_expires_at<=clock_timestamp() OR attempt.result IS NOT NULL THEN
    RAISE EXCEPTION 'Quiz checkpoint conflict' USING ERRCODE='40001';
  END IF;
  SELECT q INTO question FROM jsonb_array_elements(attempt.content->'questions') q
    WHERE q->>'id'=p_question AND q->>'type'='short_answer';
  IF question IS NULL OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
    OR p_result->>'questionId' IS DISTINCT FROM p_question
    OR jsonb_typeof(p_result->'earned') IS DISTINCT FROM 'number'
    OR octet_length(p_result::text)>16384 THEN RAISE EXCEPTION 'Invalid quiz checkpoint' USING ERRCODE='22023'; END IF;
  IF (p_result->>'earned')::numeric NOT BETWEEN 0 AND coalesce((question->>'points')::numeric,1) THEN
    RAISE EXCEPTION 'Invalid quiz points' USING ERRCODE='22023';
  END IF;
  IF attempt.partial_results ? p_question AND attempt.partial_results->p_question IS DISTINCT FROM p_result THEN
    RAISE EXCEPTION 'Quiz checkpoint changed' USING ERRCODE='22023';
  END IF;
  UPDATE public.classroom_quiz_attempts SET partial_results=jsonb_set(partial_results,ARRAY[p_question],p_result) WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.checkpoint_classroom_quiz_answer(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_classroom_quiz_answer(uuid,uuid,uuid,text,jsonb) TO service_role;

CREATE FUNCTION public.complete_classroom_quiz_attempt(p_actor uuid,p_id uuid,p_lease uuid,p_result jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE attempt public.classroom_quiz_attempts; context jsonb;
BEGIN
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR jsonb_typeof(p_result->'score') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_result->'results') IS DISTINCT FROM 'array' OR octet_length(p_result::text)>1048576 THEN
    RAISE EXCEPTION 'Invalid quiz correction' USING ERRCODE='22023';
  END IF;
  IF (p_result->>'score')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Invalid quiz score' USING ERRCODE='22023'; END IF;
  SELECT * INTO attempt FROM public.classroom_quiz_attempts WHERE id=p_id AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt denied' USING ERRCODE='42501'; END IF;
  context := qalem_quiz_private.authorized_content(p_actor,attempt.org_id,attempt.stage_id,attempt.scene_id);
  SELECT * INTO attempt FROM public.classroom_quiz_attempts WHERE id=p_id AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt denied' USING ERRCODE='42501'; END IF;
  IF attempt.content IS DISTINCT FROM context->'content' THEN RAISE EXCEPTION 'Quiz content changed' USING ERRCODE='22023'; END IF;
  IF attempt.result IS NOT NULL THEN
    IF attempt.result<>p_result THEN RAISE EXCEPTION 'Quiz result changed' USING ERRCODE='22023'; END IF;
    RETURN attempt.id;
  END IF;
  IF p_lease IS NULL OR attempt.lease_id IS DISTINCT FROM p_lease OR attempt.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'Quiz lease expired' USING ERRCODE='40001';
  END IF;
  UPDATE public.classroom_quiz_attempts SET result=p_result,completed_at=clock_timestamp(),lease_id=NULL,lease_expires_at=NULL WHERE id=p_id;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.complete_classroom_quiz_attempt(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_classroom_quiz_attempt(uuid,uuid,uuid,jsonb) TO service_role;
