-- S3-009 — Organization-only anchoring aggregates, without individual drill-down.

CREATE OR REPLACE FUNCTION public.anchor_org_report(target_org_id UUID)
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
  delivery_open_rate NUMERIC
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
  WITH scoped_sessions AS (
    SELECT session.id, session.user_id
    FROM public.live_sessions session
    JOIN public.courses course ON course.id = session.course_id
    WHERE course.org_id = target_org_id
  ), scores AS (
    SELECT evaluation.session_id,
      max(evaluation.score) FILTER (WHERE evaluation.phase = 'hot') AS hot,
      max(evaluation.score) FILTER (WHERE evaluation.phase = 'cold_30') AS cold_30,
      max(evaluation.score) FILTER (WHERE evaluation.phase = 'cold_60') AS cold_60
    FROM public.evaluations evaluation
    JOIN scoped_sessions session ON session.id = evaluation.session_id
    GROUP BY evaluation.session_id
  ), delivery_totals AS (
    SELECT
      count(*) FILTER (WHERE delivery.sent_at IS NOT NULL) AS sent,
      count(*) FILTER (WHERE delivery.opened_at IS NOT NULL) AS opened
    FROM public.anchor_deliveries delivery
    JOIN public.anchor_plans plan ON plan.id = delivery.plan_id
    JOIN scoped_sessions session ON session.id = plan.session_id
  )
  SELECT
    count(DISTINCT session.user_id),
    count(DISTINCT plan.user_id),
    round(100 * count(DISTINCT plan.user_id)::numeric / nullif(count(DISTINCT session.user_id), 0), 2),
    count(scores.hot), count(scores.cold_30), count(scores.cold_60),
    round(avg(scores.hot), 2), round(avg(scores.cold_30), 2), round(avg(scores.cold_60), 2),
    round(avg(scores.cold_30 - scores.hot) FILTER (WHERE scores.hot IS NOT NULL AND scores.cold_30 IS NOT NULL), 2),
    round(avg(scores.cold_60 - scores.hot) FILTER (WHERE scores.hot IS NOT NULL AND scores.cold_60 IS NOT NULL), 2),
    delivery_totals.sent, delivery_totals.opened,
    round(100 * delivery_totals.opened::numeric / nullif(delivery_totals.sent, 0), 2)
  FROM scoped_sessions session
  LEFT JOIN public.anchor_plans plan ON plan.session_id = session.id
  LEFT JOIN scores ON scores.session_id = session.id
  CROSS JOIN delivery_totals
  GROUP BY delivery_totals.sent, delivery_totals.opened;
END;
$$;

REVOKE ALL ON FUNCTION public.anchor_org_report(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anchor_org_report(UUID) TO authenticated, service_role;
