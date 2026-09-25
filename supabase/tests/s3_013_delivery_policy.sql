BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('31300000-0000-4000-8000-000000000001', 's3-013-learner@example.test');

INSERT INTO public.review_notification_preferences (
  user_id,
  timezone,
  quiet_start,
  quiet_end,
  daily_cap
)
VALUES (
  '31300000-0000-4000-8000-000000000001',
  'Africa/Casablanca',
  '22:00',
  '07:00',
  3
);

DO $$
BEGIN
  IF public.claim_course_notification_delivery_slot(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    'course_resume_delivery',
    '31300000-0000-4000-8000-000000000003',
    '2026-09-25T23:30:00+01:00'
  ) THEN
    RAISE EXCEPTION 'a course notification was reserved during the overnight quiet window';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_delivery_slots
    WHERE source_id = '31300000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'a rejected quiet-window notification consumed a delivery slot';
  END IF;
END
$$;

ROLLBACK;
SELECT 's3-013-delivery-policy-ok';
