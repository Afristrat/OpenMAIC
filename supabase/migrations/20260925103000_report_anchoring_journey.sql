-- S3-013 — Journey indicators with explicit cohort windows and denominators.

DROP FUNCTION IF EXISTS public.anchor_org_report(UUID);

CREATE FUNCTION public.anchor_org_report(
  target_org_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  session_participant_count BIGINT,
  opted_in_participant_count BIGINT,
  participation_rate NUMERIC,
  hot_response_count BIGINT,
  cold_30_response_count BIGINT,
  cold_60_response_count BIGINT,
  hot_average_score NUMERIC,
  cold_30_average_score NUMERIC,
  cold_60_average_score NUMERIC,
  cold_30_retention_delta NUMERIC,
  cold_60_retention_delta NUMERIC,
  sent_delivery_count BIGINT,
  opened_delivery_count BIGINT,
  delivery_open_rate NUMERIC,
  hot_decline_count BIGINT,
  cold_decline_count BIGINT,
  hot_relevance_response_count BIGINT,
  hot_relevance_average NUMERIC,
  hot_return_intent_response_count BIGINT,
  hot_return_intent_average NUMERIC,
  cold_application_response_count BIGINT,
  cold_application_average NUMERIC,
  resume_sent_count BIGINT,
  resume_opened_count BIGINT,
  resume_open_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'Invalid anchoring report window' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members member
    WHERE member.org_id = target_org_id
      AND member.user_id = auth.uid()
      AND member.role IN ('admin', 'manager', 'author', 'formateur')
  ) THEN
    RAISE EXCEPTION 'Organization aggregate access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped_sessions AS (
    SELECT session.id, session.user_id
    FROM public.live_sessions session
    JOIN public.courses course ON course.id = session.course_id
    WHERE course.org_id = target_org_id
      AND session.started_at >= p_from
      AND session.started_at < p_to
  ), normalized_evaluations AS (
    SELECT
      evaluation.session_id,
      evaluation.phase,
      evaluation.score,
      COALESCE((evaluation.answers->>'declined')::boolean, false) AS declined,
      CASE
        WHEN jsonb_typeof(evaluation.answers->'relevance') = 'number'
          THEN (evaluation.answers->>'relevance')::numeric
        WHEN jsonb_typeof(evaluation.answers->'useful') = 'number'
          THEN (evaluation.answers->>'useful')::numeric
      END AS relevance,
      CASE WHEN jsonb_typeof(evaluation.answers->'return_intent') = 'number'
        THEN (evaluation.answers->>'return_intent')::numeric END AS return_intent,
      CASE WHEN jsonb_typeof(evaluation.answers->'application') = 'number'
        THEN (evaluation.answers->>'application')::numeric END AS application
    FROM public.evaluations evaluation
    JOIN scoped_sessions session ON session.id = evaluation.session_id
  ), scores AS (
    SELECT evaluation.session_id,
      max(evaluation.score) FILTER (WHERE evaluation.phase = 'hot') AS hot,
      max(evaluation.score) FILTER (WHERE evaluation.phase = 'cold_30') AS cold_30,
      max(evaluation.score) FILTER (WHERE evaluation.phase = 'cold_60') AS cold_60
    FROM normalized_evaluations evaluation
    GROUP BY evaluation.session_id
  ), evaluation_totals AS (
    SELECT
      count(*) FILTER (WHERE phase = 'hot' AND NOT declined) AS hot_responses,
      count(*) FILTER (WHERE phase = 'cold_30' AND NOT declined) AS cold_30_responses,
      count(*) FILTER (WHERE phase = 'cold_60' AND NOT declined) AS cold_60_responses,
      count(*) FILTER (WHERE phase = 'hot' AND declined) AS hot_declines,
      count(*) FILTER (WHERE phase IN ('cold_30', 'cold_60') AND declined) AS cold_declines,
      count(relevance) FILTER (WHERE phase = 'hot' AND NOT declined) AS relevance_responses,
      round(avg(relevance) FILTER (WHERE phase = 'hot' AND NOT declined), 2) AS relevance_average,
      count(return_intent) FILTER (WHERE phase = 'hot' AND NOT declined) AS return_responses,
      round(avg(return_intent) FILTER (WHERE phase = 'hot' AND NOT declined), 2) AS return_average,
      count(application) FILTER (
        WHERE phase IN ('cold_30', 'cold_60') AND NOT declined
      ) AS application_responses,
      round(avg(application) FILTER (
        WHERE phase IN ('cold_30', 'cold_60') AND NOT declined
      ), 2) AS application_average
    FROM normalized_evaluations
  ), delivery_totals AS (
    SELECT
      count(*) FILTER (WHERE delivery.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE delivery.opened_at IS NOT NULL) AS opened
    FROM public.anchor_deliveries delivery
    JOIN public.anchor_plans plan ON plan.id = delivery.plan_id
    JOIN scoped_sessions session ON session.id = plan.session_id
  ), resume_totals AS (
    SELECT
      count(*) FILTER (WHERE delivery.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE delivery.opened_at IS NOT NULL) AS opened
    FROM public.course_resume_deliveries delivery
    JOIN public.learner_course_resumes resume
      ON resume.course_id = delivery.course_id AND resume.user_id = delivery.user_id
    WHERE resume.org_id = target_org_id
      AND delivery.sent_at >= p_from
      AND delivery.sent_at < p_to
  )
  SELECT
    count(DISTINCT session.user_id),
    count(DISTINCT plan.user_id),
    round(100 * count(DISTINCT plan.user_id)::numeric / nullif(count(DISTINCT session.user_id), 0), 2),
    evaluation_totals.hot_responses,
    evaluation_totals.cold_30_responses,
    evaluation_totals.cold_60_responses,
    round(avg(scores.hot), 2),
    round(avg(scores.cold_30), 2),
    round(avg(scores.cold_60), 2),
    round(avg(scores.cold_30 - scores.hot) FILTER (
      WHERE scores.hot IS NOT NULL AND scores.cold_30 IS NOT NULL
    ), 2),
    round(avg(scores.cold_60 - scores.hot) FILTER (
      WHERE scores.hot IS NOT NULL AND scores.cold_60 IS NOT NULL
    ), 2),
    delivery_totals.sent,
    delivery_totals.opened,
    round(100 * delivery_totals.opened::numeric / nullif(delivery_totals.sent, 0), 2),
    evaluation_totals.hot_declines,
    evaluation_totals.cold_declines,
    evaluation_totals.relevance_responses,
    evaluation_totals.relevance_average,
    evaluation_totals.return_responses,
    evaluation_totals.return_average,
    evaluation_totals.application_responses,
    evaluation_totals.application_average,
    resume_totals.sent,
    resume_totals.opened,
    round(100 * resume_totals.opened::numeric / nullif(resume_totals.sent, 0), 2)
  FROM scoped_sessions session
  LEFT JOIN public.anchor_plans plan ON plan.session_id = session.id
  LEFT JOIN scores ON scores.session_id = session.id
  CROSS JOIN evaluation_totals
  CROSS JOIN delivery_totals
  CROSS JOIN resume_totals
  GROUP BY
    evaluation_totals.hot_responses,
    evaluation_totals.cold_30_responses,
    evaluation_totals.cold_60_responses,
    evaluation_totals.hot_declines,
    evaluation_totals.cold_declines,
    evaluation_totals.relevance_responses,
    evaluation_totals.relevance_average,
    evaluation_totals.return_responses,
    evaluation_totals.return_average,
    evaluation_totals.application_responses,
    evaluation_totals.application_average,
    delivery_totals.sent,
    delivery_totals.opened,
    resume_totals.sent,
    resume_totals.opened;
END;
$$;

REVOKE ALL ON FUNCTION public.anchor_org_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anchor_org_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
