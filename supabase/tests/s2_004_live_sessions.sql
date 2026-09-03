BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('24000000-0000-4000-8000-000000000001', 's2004@example.test');
INSERT INTO public.profiles (id, nickname)
VALUES ('24000000-0000-4000-8000-000000000001', 'Apprenant S2-004')
ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;
INSERT INTO public.organizations (id, name)
VALUES ('24000000-0000-4000-8000-000000000002', 'Organisation S2-004');
INSERT INTO public.org_members (user_id, org_id, role)
VALUES (
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000002',
  'admin'
);
INSERT INTO public.stages (id, owner_id, org_id, name)
VALUES (
  's2-004-contract',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000002',
  'Classe S2-004'
);
INSERT INTO public.courses
  (id, owner_id, org_id, stage_id, title, language, source_kind, status)
VALUES (
  '24000000-0000-4000-8000-000000000003',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000002',
  's2-004-contract',
  'Formation S2-004',
  'fr-FR',
  'generated',
  'ready'
);
INSERT INTO public.castings (id, user_id, course_id, lineup, lineup_hash)
VALUES (
  '24000000-0000-4000-8000-000000000004',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000003',
  '[]'::jsonb,
  repeat('a', 64)
);

INSERT INTO public.live_sessions
  (id, course_id, user_id, casting_id, recorded)
VALUES (
  '24000000-0000-4000-8000-000000000005',
  '24000000-0000-4000-8000-000000000003',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000004',
  false
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.session_events (session_id, ts_ms, actor, event_type, payload)
    VALUES (
      '24000000-0000-4000-8000-000000000005', 0, 'user', 'user_message', '{"text":"non"}'
    );
    RAISE EXCEPTION 'event unexpectedly persisted without consent';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

INSERT INTO public.live_sessions
  (id, course_id, user_id, casting_id, recorded)
VALUES (
  '24000000-0000-4000-8000-000000000006',
  '24000000-0000-4000-8000-000000000003',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000004',
  true
);
INSERT INTO public.session_events
  (session_id, ts_ms, actor, event_type, payload, audio_path, audio_bytes)
VALUES
  ('24000000-0000-4000-8000-000000000006', 0, 'system', 'scene_change', '{"sceneId":"scene-1"}', null, 0),
  ('24000000-0000-4000-8000-000000000006', 100, 'agent', 'speech', '{"text":"Bonjour"}', '24000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000006/agent.wav', 1048576),
  ('24000000-0000-4000-8000-000000000006', 200, 'user', 'user_message', '{"text":"Question"}', null, 0);

DO $$
BEGIN
  BEGIN
    UPDATE public.session_events SET ts_ms = 300
    WHERE session_id = '24000000-0000-4000-8000-000000000006';
    RAISE EXCEPTION 'append-only event unexpectedly updated';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.session_events) <> 3 THEN
    RAISE EXCEPTION 'recorded session does not expose its complete event stream';
  END IF;
  IF (SELECT sum(audio_bytes) FROM public.session_events) <> 1048576 THEN
    RAISE EXCEPTION 'persisted audio bytes are not measurable';
  END IF;
END
$$;

DELETE FROM public.live_sessions
WHERE id = '24000000-0000-4000-8000-000000000006';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.session_events
    WHERE session_id = '24000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'session deletion left replay events behind';
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
SELECT 's2-004-db-contract-ok';
