CREATE TABLE IF NOT EXISTS public.design_system_generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Generation telemetry is written before the completed stage is persisted.
  -- Keep this as an opaque identifier so failed generations remain measurable.
  stage_id TEXT,
  scene_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('llm_call', 'lint_issue', 'layout_fallback')),
  rule_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  prompt_chars INTEGER CHECK (prompt_chars IS NULL OR prompt_chars >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0),
  provider_cost_microunits BIGINT CHECK (provider_cost_microunits IS NULL OR provider_cost_microunits >= 0),
  provider_cost_currency TEXT CHECK (provider_cost_currency IS NULL OR provider_cost_currency ~ '^[A-Z]{3}$'),
  valuation_status TEXT CHECK (valuation_status IS NULL OR valuation_status IN ('valued', 'pending_configuration', 'unmetered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_system_generation_events_org_date_idx
  ON public.design_system_generation_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS design_system_generation_events_org_stage_idx
  ON public.design_system_generation_events (org_id, stage_id, scene_id);

ALTER TABLE public.design_system_generation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.design_system_generation_events FROM anon, authenticated;
GRANT ALL ON TABLE public.design_system_generation_events TO service_role;
