-- S3-013 — Serialize reminder pressure by learner, then let the most useful
-- eligible solicitation win independently of worker arrival order.
CREATE OR REPLACE FUNCTION public.course_notification_candidate_eligible(
  target_user_id UUID,
  target_course_id UUID,
  target_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (preference.paused_until IS NULL OR preference.paused_until <= target_time)
    AND (
      preference.minimum_interval_hours IS NULL
      OR cadence.last_claimed_at IS NULL
      OR cadence.last_claimed_at
        + make_interval(hours => preference.minimum_interval_hours) <= target_time
    )
    AND (
      preference.daily_cap IS NULL
      OR COALESCE(budget.consumed, 0) < preference.daily_cap
    )
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.course_notification_preferences preference
    ON preference.course_id = target_course_id AND preference.user_id = target_user_id
  LEFT JOIN public.course_notification_delivery_cadences cadence
    ON cadence.course_id = target_course_id AND cadence.user_id = target_user_id
  LEFT JOIN public.course_notification_delivery_budgets budget
    ON budget.course_id = target_course_id
   AND budget.user_id = target_user_id
   AND budget.local_day = (
     target_time AT TIME ZONE COALESCE(
       (SELECT global_preference.timezone
        FROM public.review_notification_preferences global_preference
        WHERE global_preference.user_id = target_user_id),
       'UTC'
     )
   )::DATE;
$$;

CREATE OR REPLACE FUNCTION public.notification_delivery_priority(
  target_source TEXT,
  target_source_id UUID
)
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE target_source
    WHEN 'course_resume_delivery' THEN 10::SMALLINT
    WHEN 'review_notification' THEN 30::SMALLINT
    WHEN 'anchor_delivery' THEN (
      SELECT CASE delivery.delivery_kind
        WHEN 'cold_eval' THEN 20::SMALLINT
        WHEN 'quiz_reminder' THEN 30::SMALLINT
        ELSE 40::SMALLINT
      END
      FROM public.anchor_deliveries delivery
      WHERE delivery.id = target_source_id
    )
    ELSE NULL::SMALLINT
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_higher_priority_notification(
  target_user_id UUID,
  current_priority SMALLINT,
  target_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_resume_deliveries delivery
    WHERE current_priority > 10
      AND delivery.user_id = target_user_id
      AND delivery.sent_at IS NULL
      AND delivery.cancelled_at IS NULL
      AND delivery.attempt_count < 5
      AND delivery.scheduled_for <= target_time
      AND public.course_notification_candidate_eligible(
        target_user_id,
        delivery.course_id,
        target_time
      )
    UNION ALL
    SELECT 1
    FROM public.anchor_deliveries delivery
    JOIN public.anchor_plans plan ON plan.id = delivery.plan_id
    JOIN public.live_sessions session ON session.id = plan.session_id
    WHERE CASE delivery.delivery_kind
        WHEN 'cold_eval' THEN 20
        WHEN 'quiz_reminder' THEN 30
        ELSE 40
      END < current_priority
      AND plan.user_id = target_user_id
      AND plan.paused = false
      AND plan.ends_at >= target_time
      AND delivery.sent_at IS NULL
      AND delivery.attempt_count < 5
      AND delivery.scheduled_for <= target_time
      AND public.course_notification_candidate_eligible(
        target_user_id,
        session.course_id,
        target_time
      )
    UNION ALL
    SELECT 1
    FROM public.review_notification_deliveries delivery
    JOIN public.review_notification_preferences preference
      ON preference.user_id = delivery.user_id
    WHERE current_priority > 30
      AND delivery.user_id = target_user_id
      AND delivery.status IN ('pending', 'failed')
      AND delivery.attempt_count < 5
      AND CASE delivery.channel
        WHEN 'email' THEN preference.email_enabled
        WHEN 'whatsapp' THEN preference.whatsapp_enabled
          AND preference.whatsapp_number IS NOT NULL
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION public.course_notification_candidate_eligible(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_delivery_priority(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_higher_priority_notification(UUID, SMALLINT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_course_notification_delivery_slot(
  target_user_id UUID,
  target_course_id UUID,
  target_source TEXT,
  target_source_id UUID,
  target_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  preference_timezone TEXT := 'UTC'; preference_daily_cap INTEGER := 3;
  preference_quiet_start TIME; preference_quiet_end TIME;
  preference_paused_until TIMESTAMPTZ; course_daily_cap INTEGER;
  course_paused_until TIMESTAMPTZ; course_interval_hours SMALLINT;
  target_local_day DATE; local_clock TIME;
  global_consumed INTEGER; course_consumed INTEGER;
  last_claimed_at TIMESTAMPTZ; current_priority SMALLINT;
BEGIN
  IF target_source NOT IN ('anchor_delivery', 'course_resume_delivery') THEN
    RAISE EXCEPTION 'Unsupported course notification delivery source' USING ERRCODE = '22023';
  END IF;
  SELECT timezone, quiet_start, quiet_end, daily_cap, paused_until
    INTO preference_timezone, preference_quiet_start, preference_quiet_end,
         preference_daily_cap, preference_paused_until
  FROM public.review_notification_preferences WHERE user_id = target_user_id;
  IF NOT FOUND THEN preference_timezone := 'UTC'; preference_daily_cap := 3; END IF;
  SELECT daily_cap, paused_until, minimum_interval_hours
    INTO course_daily_cap, course_paused_until, course_interval_hours
  FROM public.course_notification_preferences WHERE course_id = target_course_id AND user_id = target_user_id;
  local_clock := (target_time AT TIME ZONE preference_timezone)::TIME;
  IF course_paused_until > target_time
     OR preference_paused_until > target_time
     OR (preference_quiet_start IS NOT NULL AND preference_quiet_end IS NOT NULL
       AND preference_quiet_start <> preference_quiet_end AND
       CASE
         WHEN preference_quiet_start < preference_quiet_end
           THEN local_clock >= preference_quiet_start AND local_clock < preference_quiet_end
         ELSE local_clock >= preference_quiet_start OR local_clock < preference_quiet_end
       END) THEN
    RETURN FALSE;
  END IF;
  current_priority := public.notification_delivery_priority(target_source, target_source_id);
  IF current_priority IS NULL THEN RETURN FALSE; END IF;
  target_local_day := (target_time AT TIME ZONE preference_timezone)::DATE;
  INSERT INTO public.notification_delivery_budgets(user_id, local_day) VALUES (target_user_id, target_local_day) ON CONFLICT DO NOTHING;
  SELECT consumed INTO global_consumed FROM public.notification_delivery_budgets AS budget
    WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.notification_delivery_slots WHERE source_type = target_source AND source_id = target_source_id) THEN RETURN TRUE; END IF;
  IF public.has_higher_priority_notification(target_user_id, current_priority, target_time) THEN RETURN FALSE; END IF;
  IF global_consumed >= preference_daily_cap THEN RETURN FALSE; END IF;
  IF course_daily_cap IS NOT NULL THEN
    INSERT INTO public.course_notification_delivery_budgets(course_id, user_id, local_day) VALUES (target_course_id, target_user_id, target_local_day) ON CONFLICT DO NOTHING;
    SELECT consumed INTO course_consumed FROM public.course_notification_delivery_budgets AS budget
      WHERE budget.course_id = target_course_id AND budget.user_id = target_user_id AND budget.local_day = target_local_day FOR UPDATE;
    IF course_consumed >= course_daily_cap THEN RETURN FALSE; END IF;
  END IF;
  IF course_interval_hours IS NOT NULL THEN
    INSERT INTO public.course_notification_delivery_cadences(course_id, user_id) VALUES (target_course_id, target_user_id) ON CONFLICT DO NOTHING;
    SELECT cadence.last_claimed_at INTO last_claimed_at FROM public.course_notification_delivery_cadences AS cadence
      WHERE cadence.course_id = target_course_id AND cadence.user_id = target_user_id FOR UPDATE;
    IF last_claimed_at + make_interval(hours => course_interval_hours) > target_time THEN RETURN FALSE; END IF;
  END IF;
  INSERT INTO public.notification_delivery_slots(source_type, source_id, user_id, local_day) VALUES (target_source, target_source_id, target_user_id, target_local_day);
  UPDATE public.notification_delivery_budgets AS budget SET consumed = consumed + 1 WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day;
  IF course_daily_cap IS NOT NULL THEN
    UPDATE public.course_notification_delivery_budgets AS budget SET consumed = consumed + 1
    WHERE budget.course_id = target_course_id AND budget.user_id = target_user_id AND budget.local_day = target_local_day;
  END IF;
  IF course_interval_hours IS NOT NULL THEN
    UPDATE public.course_notification_delivery_cadences AS cadence SET last_claimed_at = target_time
    WHERE cadence.course_id = target_course_id AND cadence.user_id = target_user_id;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_notification_delivery_slot(
  target_user_id UUID,
  target_source TEXT,
  target_source_id UUID,
  target_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  preference_timezone TEXT := 'UTC'; preference_quiet_start TIME;
  preference_quiet_end TIME; preference_daily_cap INTEGER := 3;
  preference_paused_until TIMESTAMPTZ; target_local_day DATE;
  local_clock TIME; current_consumed INTEGER; current_priority SMALLINT;
BEGIN
  IF target_source NOT IN ('anchor_delivery', 'course_resume_delivery', 'review_notification') THEN
    RAISE EXCEPTION 'Unsupported notification delivery source' USING ERRCODE = '22023';
  END IF;
  SELECT timezone, quiet_start, quiet_end, daily_cap, paused_until
    INTO preference_timezone, preference_quiet_start, preference_quiet_end,
         preference_daily_cap, preference_paused_until
  FROM public.review_notification_preferences WHERE user_id = target_user_id;
  IF NOT FOUND THEN preference_timezone := 'UTC'; preference_daily_cap := 3; END IF;
  target_local_day := (target_time AT TIME ZONE preference_timezone)::DATE;
  local_clock := (target_time AT TIME ZONE preference_timezone)::TIME;
  IF preference_paused_until > target_time
     OR (preference_quiet_start IS NOT NULL AND preference_quiet_end IS NOT NULL
       AND preference_quiet_start <> preference_quiet_end AND
       CASE
         WHEN preference_quiet_start < preference_quiet_end
           THEN local_clock >= preference_quiet_start AND local_clock < preference_quiet_end
         ELSE local_clock >= preference_quiet_start OR local_clock < preference_quiet_end
       END) THEN
    RETURN FALSE;
  END IF;
  current_priority := public.notification_delivery_priority(target_source, target_source_id);
  IF current_priority IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.notification_delivery_budgets(user_id, local_day)
  VALUES (target_user_id, target_local_day) ON CONFLICT DO NOTHING;
  SELECT consumed INTO current_consumed FROM public.notification_delivery_budgets AS budget
  WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.notification_delivery_slots WHERE source_type = target_source AND source_id = target_source_id) THEN RETURN TRUE; END IF;
  IF public.has_higher_priority_notification(target_user_id, current_priority, target_time) THEN RETURN FALSE; END IF;
  IF current_consumed >= preference_daily_cap THEN RETURN FALSE; END IF;
  INSERT INTO public.notification_delivery_slots(source_type, source_id, user_id, local_day)
  VALUES (target_source, target_source_id, target_user_id, target_local_day);
  UPDATE public.notification_delivery_budgets AS budget SET consumed = consumed + 1
  WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day;
  RETURN TRUE;
END;
$$;
