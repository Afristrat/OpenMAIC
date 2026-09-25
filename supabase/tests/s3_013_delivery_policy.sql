BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('31300000-0000-4000-8000-000000000001', 's3-013-learner@example.test');

INSERT INTO public.profiles (id, nickname)
VALUES ('31300000-0000-4000-8000-000000000001', 'Apprenant S3-013')
ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;

INSERT INTO public.organizations (id, name, seat_limit)
VALUES ('31300000-0000-4000-8000-000000000010', 'Organisation S3-013', 1);

INSERT INTO public.org_members (user_id, org_id, role)
VALUES (
  '31300000-0000-4000-8000-000000000001',
  '31300000-0000-4000-8000-000000000010',
  'apprenant'
);

INSERT INTO public.stages (id, owner_id, org_id, name)
VALUES (
  's3-013-stage',
  '31300000-0000-4000-8000-000000000001',
  '31300000-0000-4000-8000-000000000010',
  'Classe S3-013'
);

INSERT INTO public.scenes (id, stage_id, type, title, "order")
VALUES ('s3-013-scene', 's3-013-stage', 'quiz', 'Quiz S3-013', 0);

INSERT INTO public.courses (
  id,
  owner_id,
  org_id,
  stage_id,
  title,
  language,
  source_kind,
  status,
  catalog_visible
)
VALUES (
  '31300000-0000-4000-8000-000000000002',
  '31300000-0000-4000-8000-000000000001',
  '31300000-0000-4000-8000-000000000010',
  's3-013-stage',
  'Formation S3-013',
  'fr-FR',
  'generated',
  'ready',
  true
);

INSERT INTO public.learner_course_resumes (
  course_id,
  org_id,
  user_id,
  stage_id,
  scene_id,
  activity,
  activity_state,
  position_ms
)
VALUES (
  '31300000-0000-4000-8000-000000000002',
  '31300000-0000-4000-8000-000000000010',
  '31300000-0000-4000-8000-000000000001',
  's3-013-stage',
  's3-013-scene',
  'quiz',
  '{"draftAnswer":"B"}',
  0
);

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
DECLARE
  resume_delivery_id UUID;
  first_opened_at TIMESTAMPTZ;
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

  SELECT id INTO resume_delivery_id
  FROM public.course_resume_deliveries
  WHERE course_id = '31300000-0000-4000-8000-000000000002'
    AND user_id = '31300000-0000-4000-8000-000000000001';
  UPDATE public.course_resume_deliveries
  SET sent_at = '2026-09-25T12:00:00Z'
  WHERE id = resume_delivery_id;

  IF NOT public.mark_course_resume_delivery_opened(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    resume_delivery_id
  ) THEN
    RAISE EXCEPTION 'an authenticated delivered reminder was not marked opened';
  END IF;
  SELECT opened_at INTO first_opened_at
  FROM public.course_resume_deliveries WHERE id = resume_delivery_id;
  PERFORM pg_sleep(0.01);
  PERFORM public.mark_course_resume_delivery_opened(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    resume_delivery_id
  );
  IF (SELECT opened_at FROM public.course_resume_deliveries WHERE id = resume_delivery_id)
     IS DISTINCT FROM first_opened_at THEN
    RAISE EXCEPTION 'a repeated opening replaced the first attested timestamp';
  END IF;
END
$$;

ROLLBACK;
SELECT 's3-013-delivery-policy-ok';
