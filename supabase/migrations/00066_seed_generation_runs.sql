-- S3-004 — One and only one metered seed-generation call per session.

CREATE TABLE public.seed_generation_runs (
  session_id UUID PRIMARY KEY REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  usage_operation_key TEXT NOT NULL UNIQUE,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.seed_generation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY seed_generation_runs_select_own ON public.seed_generation_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

