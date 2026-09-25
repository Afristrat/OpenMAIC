-- S3-013 — Complete per-course reminder controls and enforce them atomically.

ALTER TABLE public.course_notification_preferences
  ADD COLUMN timezone TEXT,
  ADD COLUMN quiet_start TIME,
  ADD COLUMN quiet_end TIME,
  ADD COLUMN disabled BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT course_notification_quiet_window_complete
    CHECK ((quiet_start IS NULL) = (quiet_end IS NULL));

CREATE OR REPLACE FUNCTION public.assert_course_notification_preference_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.courses course
    JOIN public.organizations organization
      ON organization.id = course.org_id AND organization.status = 'active'
    JOIN public.org_members member
      ON member.org_id = course.org_id AND member.user_id = NEW.user_id
    WHERE course.id = NEW.course_id AND course.status = 'ready' AND course.catalog_visible
  ) THEN
    RAISE EXCEPTION 'Course notification preference is unavailable' USING ERRCODE = '42501';
  END IF;
  IF NEW.timezone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name
    WHERE timezone_name.name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'Invalid course notification timezone' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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
    NOT COALESCE(preference.disabled, false)
    AND (preference.paused_until IS NULL OR preference.paused_until <= target_time)
    AND (
      preference.quiet_start IS NULL
      OR preference.quiet_start = preference.quiet_end
      OR NOT CASE
        WHEN preference.quiet_start < preference.quiet_end THEN
          (target_time AT TIME ZONE COALESCE(preference.timezone, global_preference.timezone, 'UTC'))::TIME
            >= preference.quiet_start
          AND (target_time AT TIME ZONE COALESCE(preference.timezone, global_preference.timezone, 'UTC'))::TIME
            < preference.quiet_end
        ELSE
          (target_time AT TIME ZONE COALESCE(preference.timezone, global_preference.timezone, 'UTC'))::TIME
            >= preference.quiet_start
          OR (target_time AT TIME ZONE COALESCE(preference.timezone, global_preference.timezone, 'UTC'))::TIME
            < preference.quiet_end
      END
    )
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
  LEFT JOIN public.review_notification_preferences global_preference
    ON global_preference.user_id = target_user_id
  LEFT JOIN public.course_notification_preferences preference
    ON preference.course_id = target_course_id AND preference.user_id = target_user_id
  LEFT JOIN public.course_notification_delivery_cadences cadence
    ON cadence.course_id = target_course_id AND cadence.user_id = target_user_id
  LEFT JOIN public.course_notification_delivery_budgets budget
    ON budget.course_id = target_course_id
   AND budget.user_id = target_user_id
   AND budget.local_day = (
     target_time AT TIME ZONE COALESCE(preference.timezone, global_preference.timezone, 'UTC')
   )::DATE;
$$;

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
  preference_paused_until TIMESTAMPTZ;
  course_timezone TEXT; course_quiet_start TIME; course_quiet_end TIME;
  course_disabled BOOLEAN := false; course_daily_cap INTEGER;
  course_paused_until TIMESTAMPTZ; course_interval_hours SMALLINT;
  global_local_day DATE; course_local_day DATE;
  global_clock TIME; course_clock TIME;
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
  SELECT timezone, quiet_start, quiet_end, disabled, daily_cap, paused_until,
         minimum_interval_hours
    INTO course_timezone, course_quiet_start, course_quiet_end, course_disabled,
         course_daily_cap, course_paused_until, course_interval_hours
  FROM public.course_notification_preferences
  WHERE course_id = target_course_id AND user_id = target_user_id;
  course_disabled := COALESCE(course_disabled, false);
  course_timezone := COALESCE(course_timezone, preference_timezone, 'UTC');
  global_clock := (target_time AT TIME ZONE preference_timezone)::TIME;
  course_clock := (target_time AT TIME ZONE course_timezone)::TIME;
  IF course_disabled
     OR course_paused_until > target_time
     OR preference_paused_until > target_time
     OR (preference_quiet_start IS NOT NULL AND preference_quiet_end IS NOT NULL
       AND preference_quiet_start <> preference_quiet_end AND
       CASE
         WHEN preference_quiet_start < preference_quiet_end
           THEN global_clock >= preference_quiet_start AND global_clock < preference_quiet_end
         ELSE global_clock >= preference_quiet_start OR global_clock < preference_quiet_end
       END)
     OR (course_quiet_start IS NOT NULL AND course_quiet_end IS NOT NULL
       AND course_quiet_start <> course_quiet_end AND
       CASE
         WHEN course_quiet_start < course_quiet_end
           THEN course_clock >= course_quiet_start AND course_clock < course_quiet_end
         ELSE course_clock >= course_quiet_start OR course_clock < course_quiet_end
       END) THEN
    RETURN FALSE;
  END IF;
  current_priority := public.notification_delivery_priority(target_source, target_source_id);
  IF current_priority IS NULL THEN RETURN FALSE; END IF;
  global_local_day := (target_time AT TIME ZONE preference_timezone)::DATE;
  course_local_day := (target_time AT TIME ZONE course_timezone)::DATE;
  INSERT INTO public.notification_delivery_budgets(user_id, local_day)
  VALUES (target_user_id, global_local_day) ON CONFLICT DO NOTHING;
  SELECT consumed INTO global_consumed FROM public.notification_delivery_budgets AS budget
    WHERE budget.user_id = target_user_id AND budget.local_day = global_local_day FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.notification_delivery_slots
    WHERE source_type = target_source AND source_id = target_source_id
  ) THEN RETURN TRUE; END IF;
  IF public.has_higher_priority_notification(target_user_id, current_priority, target_time) THEN
    RETURN FALSE;
  END IF;
  IF global_consumed >= preference_daily_cap THEN RETURN FALSE; END IF;
  IF course_daily_cap IS NOT NULL THEN
    INSERT INTO public.course_notification_delivery_budgets(course_id, user_id, local_day)
    VALUES (target_course_id, target_user_id, course_local_day) ON CONFLICT DO NOTHING;
    SELECT consumed INTO course_consumed
    FROM public.course_notification_delivery_budgets AS budget
    WHERE budget.course_id = target_course_id
      AND budget.user_id = target_user_id
      AND budget.local_day = course_local_day
    FOR UPDATE;
    IF course_consumed >= course_daily_cap THEN RETURN FALSE; END IF;
  END IF;
  IF course_interval_hours IS NOT NULL THEN
    INSERT INTO public.course_notification_delivery_cadences(course_id, user_id)
    VALUES (target_course_id, target_user_id) ON CONFLICT DO NOTHING;
    SELECT cadence.last_claimed_at INTO last_claimed_at
    FROM public.course_notification_delivery_cadences AS cadence
    WHERE cadence.course_id = target_course_id AND cadence.user_id = target_user_id
    FOR UPDATE;
    IF last_claimed_at + make_interval(hours => course_interval_hours) > target_time THEN
      RETURN FALSE;
    END IF;
  END IF;
  INSERT INTO public.notification_delivery_slots(source_type, source_id, user_id, local_day)
  VALUES (target_source, target_source_id, target_user_id, global_local_day);
  UPDATE public.notification_delivery_budgets AS budget SET consumed = consumed + 1
  WHERE budget.user_id = target_user_id AND budget.local_day = global_local_day;
  IF course_daily_cap IS NOT NULL THEN
    UPDATE public.course_notification_delivery_budgets AS budget SET consumed = consumed + 1
    WHERE budget.course_id = target_course_id
      AND budget.user_id = target_user_id
      AND budget.local_day = course_local_day;
  END IF;
  IF course_interval_hours IS NOT NULL THEN
    UPDATE public.course_notification_delivery_cadences AS cadence SET last_claimed_at = target_time
    WHERE cadence.course_id = target_course_id AND cadence.user_id = target_user_id;
  END IF;
  RETURN TRUE;
END;
$$;

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
    JOIN public.organizations organization
      ON organization.id = course.org_id AND organization.status = 'active'
    JOIN public.org_members member
      ON member.org_id = course.org_id AND member.user_id = target_user_id
    WHERE course.id = target_course_id AND course.status = 'ready' AND course.catalog_visible
  ) THEN
    RAISE EXCEPTION 'Course notification preview is unavailable' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.course_notification_preferences preference
    WHERE preference.course_id = target_course_id
      AND preference.user_id = target_user_id
      AND (preference.disabled OR preference.paused_until > target_time)
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

NOTIFY pgrst, 'reload schema';
