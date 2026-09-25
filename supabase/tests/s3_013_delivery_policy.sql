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
  'admin'
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

INSERT INTO public.castings (id, user_id, course_id, lineup, lineup_hash)
VALUES (
  '31300000-0000-4000-8000-000000000011',
  '31300000-0000-4000-8000-000000000001',
  '31300000-0000-4000-8000-000000000002',
  '[]',
  repeat('a', 64)
);

INSERT INTO public.live_sessions (id, course_id, user_id, casting_id, recorded, ended_at)
VALUES (
  '31300000-0000-4000-8000-000000000012',
  '31300000-0000-4000-8000-000000000002',
  '31300000-0000-4000-8000-000000000001',
  '31300000-0000-4000-8000-000000000011',
  true,
  now()
);

INSERT INTO public.anchor_plans (id, session_id, user_id, opted_in_at, ends_at)
VALUES (
  '31300000-0000-4000-8000-000000000013',
  '31300000-0000-4000-8000-000000000012',
  '31300000-0000-4000-8000-000000000001',
  '2026-09-01T12:00:00Z',
  '2026-11-29T12:00:00Z'
);

INSERT INTO public.anchor_deliveries (
  id,
  plan_id,
  delivery_kind,
  scheduled_for,
  dedupe_key,
  payload
)
VALUES (
  '31300000-0000-4000-8000-000000000014',
  '31300000-0000-4000-8000-000000000013',
  'cold_eval',
  '2026-09-25T12:00:00Z',
  'cold_eval:cold_30',
  '{"phase":"cold_30"}'
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
  UPDATE public.review_notification_preferences
  SET quiet_start = NULL, quiet_end = NULL
  WHERE user_id = '31300000-0000-4000-8000-000000000001';
  INSERT INTO public.course_notification_preferences (
    course_id, user_id, timezone, quiet_start, quiet_end, disabled
  ) VALUES (
    '31300000-0000-4000-8000-000000000002',
    '31300000-0000-4000-8000-000000000001',
    'America/Toronto',
    '18:00',
    '19:00',
    false
  );
  IF public.claim_course_notification_delivery_slot(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    'course_resume_delivery',
    resume_delivery_id,
    '2026-09-25T22:30:00Z'
  ) THEN
    RAISE EXCEPTION 'a course reminder ignored its course-specific timezone and quiet window';
  END IF;
  UPDATE public.course_notification_preferences
  SET quiet_start = NULL, quiet_end = NULL, disabled = true
  WHERE course_id = '31300000-0000-4000-8000-000000000002'
    AND user_id = '31300000-0000-4000-8000-000000000001';
  IF public.claim_course_notification_delivery_slot(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    'course_resume_delivery',
    resume_delivery_id,
    '2026-09-25T12:00:00Z'
  ) THEN
    RAISE EXCEPTION 'a disabled course reserved a notification slot';
  END IF;
  IF (
    SELECT next_reminder_at IS NOT NULL
    FROM public.get_course_notification_preview(
      '31300000-0000-4000-8000-000000000001',
      '31300000-0000-4000-8000-000000000002',
      '2026-09-25T00:00:00Z'
    )
  ) THEN
    RAISE EXCEPTION 'a disabled course still exposed a next reminder';
  END IF;
  UPDATE public.course_notification_preferences
  SET disabled = false
  WHERE course_id = '31300000-0000-4000-8000-000000000002'
    AND user_id = '31300000-0000-4000-8000-000000000001';
  UPDATE public.course_resume_deliveries
  SET scheduled_for = '2026-09-25T12:00:00Z'
  WHERE id = resume_delivery_id;

  IF public.claim_course_notification_delivery_slot(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    'anchor_delivery',
    '31300000-0000-4000-8000-000000000014',
    '2026-09-25T12:00:00Z'
  ) THEN
    RAISE EXCEPTION 'a cold evaluation overtook a due course resume reminder';
  END IF;
  IF NOT public.claim_course_notification_delivery_slot(
    '31300000-0000-4000-8000-000000000001',
    '31300000-0000-4000-8000-000000000002',
    'course_resume_delivery',
    resume_delivery_id,
    '2026-09-25T12:00:00Z'
  ) THEN
    RAISE EXCEPTION 'the highest-priority due reminder did not reserve its slot';
  END IF;
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

UPDATE public.anchor_deliveries
SET sent_at = '2026-09-25T12:05:00Z', opened_at = '2026-09-25T12:06:00Z'
WHERE id = '31300000-0000-4000-8000-000000000014';

INSERT INTO public.evaluations (session_id, user_id, phase, answers, score)
VALUES
  (
    '31300000-0000-4000-8000-000000000012',
    '31300000-0000-4000-8000-000000000001',
    'hot',
    '{"relevance":5,"return_intent":1}',
    60
  ),
  (
    '31300000-0000-4000-8000-000000000012',
    '31300000-0000-4000-8000-000000000001',
    'cold_30',
    '{"relevance":4,"return_intent":2,"application":2}',
    53.33
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '31300000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  metrics record;
BEGIN
  SELECT * INTO metrics
  FROM public.anchor_org_report(
    '31300000-0000-4000-8000-000000000010',
    '2026-09-01T00:00:00Z',
    '2026-10-01T00:00:00Z'
  );
  IF metrics.hot_relevance_response_count <> 1 OR metrics.hot_relevance_average <> 5 THEN
    RAISE EXCEPTION 'declared relevance lost its response denominator';
  END IF;
  IF metrics.hot_return_intent_response_count <> 1 OR metrics.hot_return_intent_average <> 1 THEN
    RAISE EXCEPTION 'negative return intent was not retained';
  END IF;
  IF metrics.cold_application_response_count <> 1 OR metrics.cold_application_average <> 2 THEN
    RAISE EXCEPTION 'declared application lost its cold-response denominator';
  END IF;
  IF metrics.resume_sent_count <> 1 OR metrics.resume_opened_count <> 1
    OR metrics.resume_open_rate <> 100 THEN
    RAISE EXCEPTION 'effective authenticated resumption has an invalid denominator';
  END IF;
END
$$;

ROLLBACK;
SELECT 's3-013-delivery-policy-ok';
