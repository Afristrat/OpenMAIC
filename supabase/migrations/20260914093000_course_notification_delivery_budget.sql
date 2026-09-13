-- S3-013 — A course cap is an additional limit, never a way to exceed the
-- learner-wide budget. Claim both reservations in one transaction so a
-- rejected course reminder does not consume the shared allowance.
CREATE TABLE public.course_notification_delivery_budgets (
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_day DATE NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  PRIMARY KEY (course_id, user_id, local_day)
);

ALTER TABLE public.course_notification_delivery_budgets ENABLE ROW LEVEL SECURITY;

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
  preference_timezone TEXT := 'UTC';
  preference_daily_cap INTEGER := 3;
  preference_paused_until TIMESTAMPTZ;
  course_daily_cap INTEGER;
  course_paused_until TIMESTAMPTZ;
  target_local_day DATE;
  global_consumed INTEGER;
  course_consumed INTEGER;
BEGIN
  IF target_source <> 'course_resume_delivery' THEN
    RAISE EXCEPTION 'Unsupported course notification delivery source' USING ERRCODE = '22023';
  END IF;

  SELECT timezone, daily_cap, paused_until
    INTO preference_timezone, preference_daily_cap, preference_paused_until
  FROM public.review_notification_preferences
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    preference_timezone := 'UTC';
    preference_daily_cap := 3;
  END IF;

  SELECT daily_cap, paused_until
    INTO course_daily_cap, course_paused_until
  FROM public.course_notification_preferences
  WHERE course_id = target_course_id AND user_id = target_user_id;

  IF course_paused_until > target_time OR preference_paused_until > target_time THEN
    RETURN FALSE;
  END IF;

  target_local_day := (target_time AT TIME ZONE preference_timezone)::DATE;
  INSERT INTO public.notification_delivery_budgets(user_id, local_day)
  VALUES (target_user_id, target_local_day)
  ON CONFLICT DO NOTHING;
  SELECT consumed INTO global_consumed
  FROM public.notification_delivery_budgets AS budget
  WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.notification_delivery_slots
    WHERE source_type = target_source AND source_id = target_source_id
  ) THEN
    RETURN TRUE;
  END IF;
  IF global_consumed >= preference_daily_cap THEN
    RETURN FALSE;
  END IF;

  IF course_daily_cap IS NOT NULL THEN
    INSERT INTO public.course_notification_delivery_budgets(course_id, user_id, local_day)
    VALUES (target_course_id, target_user_id, target_local_day)
    ON CONFLICT DO NOTHING;
    SELECT consumed INTO course_consumed
    FROM public.course_notification_delivery_budgets AS budget
    WHERE budget.course_id = target_course_id
      AND budget.user_id = target_user_id
      AND budget.local_day = target_local_day
    FOR UPDATE;
    IF course_consumed >= course_daily_cap THEN
      RETURN FALSE;
    END IF;
  END IF;

  INSERT INTO public.notification_delivery_slots(source_type, source_id, user_id, local_day)
  VALUES (target_source, target_source_id, target_user_id, target_local_day);
  UPDATE public.notification_delivery_budgets AS budget
  SET consumed = consumed + 1
  WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day;
  IF course_daily_cap IS NOT NULL THEN
    UPDATE public.course_notification_delivery_budgets AS budget
    SET consumed = consumed + 1
    WHERE budget.course_id = target_course_id
      AND budget.user_id = target_user_id
      AND budget.local_day = target_local_day;
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_course_notification_delivery_slot(UUID, UUID, TEXT, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_course_notification_delivery_slot(UUID, UUID, TEXT, UUID, TIMESTAMPTZ)
  TO service_role;
