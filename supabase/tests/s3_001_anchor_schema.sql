BEGIN;

INSERT INTO auth.users (id, email)
VALUES
  ('31000000-0000-4000-8000-000000000001', 's3001-admin@example.test'),
  ('31000000-0000-4000-8000-000000000002', 's3001-learner@example.test');

INSERT INTO public.profiles (id, nickname)
VALUES
  ('31000000-0000-4000-8000-000000000001', 'Administrateur S3-001'),
  ('31000000-0000-4000-8000-000000000002', 'Apprenant S3-001')
ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;

INSERT INTO public.organizations (id, name, seat_limit)
VALUES ('31000000-0000-4000-8000-000000000003', 'Organisation S3-001', 2);

INSERT INTO public.org_members (user_id, org_id, role)
VALUES
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'admin'),
  ('31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003', 'apprenant');

INSERT INTO public.stages (id, owner_id, org_id, name)
VALUES
  ('s3-001-admin', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'Classe administrateur'),
  ('s3-001-learner', '31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003', 'Classe apprenant');

INSERT INTO public.courses
  (id, owner_id, org_id, stage_id, title, language, source_kind, status)
VALUES
  ('31000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 's3-001-admin', 'Formation administrateur', 'fr-FR', 'generated', 'ready'),
  ('31000000-0000-4000-8000-000000000005', '31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003', 's3-001-learner', 'Formation apprenant', 'fr-FR', 'generated', 'ready');

INSERT INTO public.castings (id, user_id, course_id, lineup, lineup_hash)
VALUES
  ('31000000-0000-4000-8000-000000000006', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000004', '[]', repeat('a', 64)),
  ('31000000-0000-4000-8000-000000000007', '31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000005', '[]', repeat('b', 64));

INSERT INTO public.live_sessions (id, course_id, user_id, casting_id, recorded, ended_at)
VALUES
  ('31000000-0000-4000-8000-000000000008', '31000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000006', true, now()),
  ('31000000-0000-4000-8000-000000000009', '31000000-0000-4000-8000-000000000005', '31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000007', true, now());

INSERT INTO public.seeds (id, session_id, persona, kind, content)
VALUES
  ('31000000-0000-4000-8000-000000000010', '31000000-0000-4000-8000-000000000008', 'mentor-admin', 'highlight', '{"text":"A","scene_ref":"scene-a"}'),
  ('31000000-0000-4000-8000-000000000011', '31000000-0000-4000-8000-000000000009', 'mentor-learner', 'highlight', '{"text":"B","scene_ref":"scene-b"}');

INSERT INTO public.anchor_plans (id, session_id, user_id, opted_in_at, ends_at)
VALUES
  ('31000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000008', '31000000-0000-4000-8000-000000000001', now(), now() + interval '90 days'),
  ('31000000-0000-4000-8000-000000000013', '31000000-0000-4000-8000-000000000009', '31000000-0000-4000-8000-000000000002', now(), now() + interval '60 days');

INSERT INTO public.anchor_deliveries
  (id, plan_id, seed_id, delivery_kind, scheduled_for, sent_at, opened_at)
VALUES
  ('31000000-0000-4000-8000-000000000014', '31000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000010', 'seed', now() + interval '10 days', now(), now()),
  ('31000000-0000-4000-8000-000000000015', '31000000-0000-4000-8000-000000000013', '31000000-0000-4000-8000-000000000011', 'seed', now() + interval '10 days', now(), null);

INSERT INTO public.evaluations (session_id, user_id, phase, answers, score)
VALUES
  ('31000000-0000-4000-8000-000000000008', '31000000-0000-4000-8000-000000000001', 'hot', '{"useful":5}', 100),
  ('31000000-0000-4000-8000-000000000009', '31000000-0000-4000-8000-000000000002', 'hot', '{"useful":4}', 80);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.anchor_plans (session_id, user_id, opted_in_at, ends_at)
    VALUES (
      '31000000-0000-4000-8000-000000000008',
      '31000000-0000-4000-8000-000000000001',
      now(),
      now() + interval '91 days'
    );
    RAISE EXCEPTION 'a plan exceeded the hard J+90 boundary';
  EXCEPTION WHEN check_violation OR unique_violation THEN
    NULL;
  END;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  metrics record;
BEGIN
  IF (SELECT count(*) FROM public.seeds) <> 1 THEN
    RAISE EXCEPTION 'RLS exposed another user seed';
  END IF;
  IF (SELECT count(*) FROM public.anchor_plans) <> 1 THEN
    RAISE EXCEPTION 'RLS exposed another user plan';
  END IF;
  IF (SELECT count(*) FROM public.anchor_deliveries) <> 1 THEN
    RAISE EXCEPTION 'RLS exposed another user delivery';
  END IF;
  IF (SELECT count(*) FROM public.evaluations) <> 1 THEN
    RAISE EXCEPTION 'RLS exposed another user evaluation';
  END IF;

  SELECT * INTO metrics
  FROM public.anchor_org_metrics('31000000-0000-4000-8000-000000000003');
  IF metrics.participant_count <> 2 OR metrics.hot_response_count <> 2 THEN
    RAISE EXCEPTION 'organization aggregate is incomplete';
  END IF;
END
$$;

ROLLBACK;
SELECT 's3-001-db-contract-ok';
