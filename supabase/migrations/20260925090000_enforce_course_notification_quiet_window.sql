-- S3-013 — Keep the final course reservation authoritative when preferences
-- change between the worker preflight and the atomic database claim.
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
  last_claimed_at TIMESTAMPTZ;
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
  target_local_day := (target_time AT TIME ZONE preference_timezone)::DATE;
  INSERT INTO public.notification_delivery_budgets(user_id, local_day) VALUES (target_user_id, target_local_day) ON CONFLICT DO NOTHING;
  SELECT consumed INTO global_consumed FROM public.notification_delivery_budgets AS budget
    WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.notification_delivery_slots WHERE source_type = target_source AND source_id = target_source_id) THEN RETURN TRUE; END IF;
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
