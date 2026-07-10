-- 00006_marketplace.sql
-- Agent marketplace: reviews table + marketplace fields on agent_configs

CREATE TABLE public.agent_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES public.agent_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, user_id)
);

ALTER TABLE public.agent_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reviews" ON public.agent_reviews FOR SELECT USING (true);
CREATE POLICY "Users manage own reviews" ON public.agent_reviews
  FOR ALL USING (auth.uid() = user_id);

-- Add marketplace fields to agent_configs
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS avg_rating REAL DEFAULT 0;
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for marketplace search
CREATE INDEX IF NOT EXISTS idx_agent_configs_published ON public.agent_configs(is_published) WHERE is_published = true;
