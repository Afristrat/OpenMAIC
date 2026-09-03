-- S3-001 — Hot and cold evaluations plus aggregate-only organization reporting.

CREATE TABLE public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('hot', 'cold_30', 'cold_60')),
  answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  score NUMERIC CHECK (score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id, phase)
);

CREATE INDEX evaluations_user_created_idx ON public.evaluations(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_evaluation_session_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_sessions session
    WHERE session.id = NEW.session_id AND session.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Evaluation user must own the live session'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_evaluation_session_owner
  BEFORE INSERT OR UPDATE OF session_id, user_id ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_evaluation_session_owner();

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluations_select_own ON public.evaluations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY evaluations_insert_own ON public.evaluations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY evaluations_update_own ON public.evaluations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.anchor_org_metrics(target_org_id UUID)
RETURNS TABLE (
  participant_count BIGINT,
  hot_response_count BIGINT,
  cold_30_response_count BIGINT,
  cold_60_response_count BIGINT,
  hot_average_score NUMERIC,
  cold_30_average_score NUMERIC,
  cold_60_average_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members member
    WHERE member.org_id = target_org_id
      AND member.user_id = auth.uid()
      AND member.role IN ('admin', 'manager', 'author', 'formateur')
  ) THEN
    RAISE EXCEPTION 'Organization aggregate access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    count(DISTINCT session.user_id),
    count(*) FILTER (WHERE evaluation.phase = 'hot'),
    count(*) FILTER (WHERE evaluation.phase = 'cold_30'),
    count(*) FILTER (WHERE evaluation.phase = 'cold_60'),
    avg(evaluation.score) FILTER (WHERE evaluation.phase = 'hot'),
    avg(evaluation.score) FILTER (WHERE evaluation.phase = 'cold_30'),
    avg(evaluation.score) FILTER (WHERE evaluation.phase = 'cold_60')
  FROM public.live_sessions session
  JOIN public.courses course ON course.id = session.course_id
  LEFT JOIN public.evaluations evaluation ON evaluation.session_id = session.id
  WHERE course.org_id = target_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.anchor_org_metrics(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anchor_org_metrics(UUID) TO authenticated, service_role;

