-- S3-001 — Session-bound anchoring seed stock.

CREATE TABLE public.seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  persona TEXT NOT NULL CHECK (char_length(trim(persona)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('anecdote', 'highlight', 'joke', 'quiz_reminder')),
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'sent', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX seeds_session_status_idx ON public.seeds(session_id, status, created_at);

ALTER TABLE public.seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY seeds_select_own ON public.seeds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.live_sessions session
      WHERE session.id = seeds.session_id
        AND session.user_id = auth.uid()
    )
  );

CREATE POLICY seeds_service_writes_only ON public.seeds
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

