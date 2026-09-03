-- S2-004/S2-006 — consented, append-only live-session replays.

CREATE TABLE public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  casting_id UUID NOT NULL REFERENCES public.castings(id) ON DELETE RESTRICT,
  recorded BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  last_position_ms INTEGER NOT NULL DEFAULT 0 CHECK (last_position_ms >= 0),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX live_sessions_user_started_idx
  ON public.live_sessions(user_id, started_at DESC);

CREATE TABLE public.session_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  ts_ms INTEGER NOT NULL CHECK (ts_ms >= 0),
  actor TEXT NOT NULL CHECK (actor IN ('agent', 'user', 'system')),
  event_type TEXT NOT NULL CHECK (char_length(trim(event_type)) BETWEEN 1 AND 80),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  audio_path TEXT,
  audio_bytes BIGINT NOT NULL DEFAULT 0 CHECK (audio_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((audio_path IS NULL) = (audio_bytes = 0))
);

CREATE INDEX session_events_replay_idx ON public.session_events(session_id, ts_ms, id);

CREATE OR REPLACE FUNCTION public.protect_live_session_identity_and_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.course_id IS DISTINCT FROM OLD.course_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.casting_id IS DISTINCT FROM OLD.casting_id
     OR NEW.recorded IS DISTINCT FROM OLD.recorded
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Live session identity and consent are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_live_session_identity_and_consent
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_live_session_identity_and_consent();

CREATE OR REPLACE FUNCTION public.reject_session_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'session_events is append-only' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER reject_session_event_update
  BEFORE UPDATE ON public.session_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_session_event_update();

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_sessions_select_own ON public.live_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY live_sessions_insert_own ON public.live_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid() AND recorded = true);
CREATE POLICY live_sessions_update_own ON public.live_sessions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY live_sessions_delete_own ON public.live_sessions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY session_events_select_own ON public.session_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions session
      WHERE session.id = session_events.session_id AND session.user_id = auth.uid()
    )
  );
CREATE POLICY session_events_insert_recorded_own ON public.session_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions session
      WHERE session.id = session_events.session_id
        AND session.user_id = auth.uid()
        AND session.recorded = true
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('session-audio', 'session-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY session_audio_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'session-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY session_audio_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'session-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY session_audio_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'session-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

REVOKE UPDATE, DELETE ON public.session_events FROM authenticated;

INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES (
  'live_recording',
  false,
  'global',
  'Enregistrement consenti des sessions live ; activation production après formalité CNDP consignée.'
)
ON CONFLICT (flag_name) DO NOTHING;
