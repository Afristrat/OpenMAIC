CREATE TABLE public.video_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  model_id TEXT,
  request JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'done', 'error')),
  storage_path TEXT,
  result_metadata JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_generation_jobs_owner_id
  ON public.video_generation_jobs(owner_id);
CREATE INDEX idx_video_generation_jobs_updated_at
  ON public.video_generation_jobs(updated_at);

CREATE TRIGGER set_updated_at_video_generation_jobs
  BEFORE UPDATE ON public.video_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_generation_jobs_select_owner"
  ON public.video_generation_jobs FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "video_generation_jobs_insert_service_only"
  ON public.video_generation_jobs FOR INSERT
  WITH CHECK (false);

CREATE POLICY "video_generation_jobs_update_service_only"
  ON public.video_generation_jobs FOR UPDATE
  USING (false);

CREATE POLICY "video_generation_jobs_delete_service_only"
  ON public.video_generation_jobs FOR DELETE
  USING (false);
