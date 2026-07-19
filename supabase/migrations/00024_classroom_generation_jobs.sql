CREATE TABLE public.classroom_generation_jobs (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_classroom_generation_jobs_owner_id ON public.classroom_generation_jobs(owner_id);
CREATE INDEX idx_classroom_generation_jobs_updated_at ON public.classroom_generation_jobs(updated_at);

ALTER TABLE public.classroom_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom_generation_jobs_select_owner"
  ON public.classroom_generation_jobs FOR SELECT
  USING (owner_id = auth.uid());
