-- S3-013 — The preview is authoritative: it only exposes a learner's own
-- accessible course and combines the two durable reminder streams.
CREATE OR REPLACE FUNCTION public.get_course_notification_preview(
  target_user_id UUID,
  target_course_id UUID,
  target_time TIMESTAMPTZ
)
RETURNS TABLE(next_reminder_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.courses course
    JOIN public.organizations organization ON organization.id = course.org_id AND organization.status = 'active'
    JOIN public.org_members member ON member.org_id = course.org_id AND member.user_id = target_user_id
    WHERE course.id = target_course_id AND course.status = 'ready' AND course.catalog_visible
  ) THEN
    RAISE EXCEPTION 'Course notification preview is unavailable' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.course_notification_preferences preference
    WHERE preference.course_id = target_course_id
      AND preference.user_id = target_user_id
      AND preference.paused_until > target_time
  ) THEN
    RETURN QUERY SELECT NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT MIN(candidate.scheduled_for)
  FROM (
    SELECT delivery.scheduled_for
    FROM public.course_resume_deliveries delivery
    WHERE delivery.course_id = target_course_id
      AND delivery.user_id = target_user_id
      AND delivery.sent_at IS NULL
      AND delivery.cancelled_at IS NULL
      AND delivery.scheduled_for >= target_time
    UNION ALL
    SELECT delivery.scheduled_for
    FROM public.anchor_deliveries delivery
    JOIN public.anchor_plans plan ON plan.id = delivery.plan_id
    JOIN public.live_sessions session ON session.id = plan.session_id
    WHERE session.course_id = target_course_id
      AND plan.user_id = target_user_id
      AND plan.paused = false
      AND plan.ends_at >= target_time
      AND delivery.sent_at IS NULL
      AND delivery.scheduled_for >= target_time
  ) AS candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.get_course_notification_preview(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_notification_preview(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
