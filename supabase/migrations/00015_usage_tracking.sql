-- =============================================================================
-- Migration 00015: Usage Tracking
-- Tracks per-org / per-user consumption of billable resources.
-- =============================================================================

CREATE TABLE public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metric TEXT NOT NULL, -- 'tts_minutes', 'api_calls', 'ai_tokens', 'storage_mb'
  quantity NUMERIC NOT NULL,
  billing_period TEXT NOT NULL, -- e.g. '2026-03'
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_usage_org_period ON public.usage_records(org_id, billing_period);
CREATE INDEX idx_usage_user_period ON public.usage_records(user_id, billing_period);

-- RLS: only service role can read/write usage records
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.usage_records FOR ALL USING (false);

-- Aggregation view for dashboards
CREATE VIEW public.usage_summary AS
SELECT
  org_id,
  user_id,
  billing_period,
  SUM(CASE WHEN metric = 'tts_minutes' THEN quantity ELSE 0 END) AS tts_minutes,
  SUM(CASE WHEN metric = 'api_calls' THEN quantity ELSE 0 END) AS api_calls,
  SUM(CASE WHEN metric = 'ai_tokens' THEN quantity ELSE 0 END) AS ai_tokens,
  SUM(CASE WHEN metric = 'storage_mb' THEN quantity ELSE 0 END) AS storage_mb
FROM public.usage_records
GROUP BY org_id, user_id, billing_period;
