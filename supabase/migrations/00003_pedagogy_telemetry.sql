-- =============================================================================
-- Qalem — Pedagogy Telemetry & Consent Tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Anonymized pedagogy session data (Pedagogy Genome pipeline)
-- ---------------------------------------------------------------------------
CREATE TABLE public.pedagogy_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Anonymized user hash (SHA-256 of user_id + salt) — no PII stored
  user_hash TEXT NOT NULL,
  stage_id TEXT,

  -- Session data
  scene_sequence TEXT[],       -- ordered scene types: ['slide','quiz','interactive','slide']
  scene_durations INTEGER[],   -- seconds per scene
  quiz_scores REAL[],          -- scores per quiz scene (0.0–1.0)
  completion_rate REAL,        -- 0.0–1.0
  total_duration INTEGER,      -- seconds

  -- Context
  subject_tags TEXT[],
  language TEXT,
  level TEXT,                  -- beginner, intermediate, advanced
  agent_count INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pedagogy_telemetry ENABLE ROW LEVEL SECURITY;

-- Only the service role can read/write (anonymized data, no user access)
CREATE POLICY "Service role only"
  ON public.pedagogy_telemetry
  FOR ALL
  USING (false);

-- ---------------------------------------------------------------------------
-- User consent tracking
-- ---------------------------------------------------------------------------
CREATE TABLE public.telemetry_consent (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pedagogy_consent BOOLEAN DEFAULT false,
  xapi_consent BOOLEAN DEFAULT false,
  consented_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.telemetry_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own consent"
  ON public.telemetry_consent
  FOR ALL
  USING (auth.uid() = user_id);
