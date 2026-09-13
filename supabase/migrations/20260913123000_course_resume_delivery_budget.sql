-- S3-012 — A course-resume reminder is subject to the same atomic daily
-- budget as anchoring and review reminders. Keep this additive: the original
-- policy migration may already be applied in an environment.
ALTER TABLE public.notification_delivery_slots
  DROP CONSTRAINT IF EXISTS notification_delivery_slots_source_type_check;

ALTER TABLE public.notification_delivery_slots
  ADD CONSTRAINT notification_delivery_slots_source_type_check
  CHECK (source_type IN ('anchor_delivery', 'course_resume_delivery', 'review_notification'));

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
  preference_timezone TEXT := 'UTC';
  preference_quiet_start TIME;
  preference_quiet_end TIME;
  preference_daily_cap INTEGER := 3;
  preference_paused_until TIMESTAMPTZ;
  target_local_day DATE;
  local_clock TIME;
  current_consumed INTEGER;
BEGIN
  IF target_source NOT IN ('anchor_delivery', 'course_resume_delivery', 'review_notification') THEN
    RAISE EXCEPTION 'Unsupported notification delivery source' USING ERRCODE = '22023';
  END IF;

  SELECT timezone, quiet_start, quiet_end, daily_cap, paused_until
    INTO preference_timezone, preference_quiet_start, preference_quiet_end,
         preference_daily_cap, preference_paused_until
  FROM public.review_notification_preferences
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    preference_timezone := 'UTC';
    preference_daily_cap := 3;
  END IF;

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

  INSERT INTO public.notification_delivery_budgets(user_id, local_day)
  VALUES (target_user_id, target_local_day)
  ON CONFLICT DO NOTHING;
  SELECT consumed INTO current_consumed
  FROM public.notification_delivery_budgets AS budget
  WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.notification_delivery_slots
    WHERE source_type = target_source AND source_id = target_source_id
  ) THEN
    RETURN TRUE;
  END IF;
  IF current_consumed >= preference_daily_cap THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.notification_delivery_slots(source_type, source_id, user_id, local_day)
  VALUES (target_source, target_source_id, target_user_id, target_local_day);
  UPDATE public.notification_delivery_budgets AS budget
  SET consumed = consumed + 1
  WHERE budget.user_id = target_user_id AND budget.local_day = target_local_day;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_delivery_slot(UUID, TEXT, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_delivery_slot(UUID, TEXT, UUID, TIMESTAMPTZ)
  TO service_role;
