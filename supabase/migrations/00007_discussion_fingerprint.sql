-- =============================================================================
-- Qalem — Discussion Fingerprint
-- Collects multi-agent discussion patterns for data-driven orchestration.
-- =============================================================================

CREATE TABLE public.discussion_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_hash TEXT NOT NULL,
  stage_id TEXT,
  -- Discussion data
  agent_sequence TEXT[], -- ordered agent IDs who spoke
  intervention_types TEXT[], -- parallel array: 'question', 'answer', 'counter_argument', 'synthesis', 'joke', 'example'
  turn_durations INTEGER[], -- seconds per turn
  total_turns INTEGER,
  -- Outcome
  post_discussion_quiz_score REAL, -- quiz score AFTER the discussion (0.0-1.0)
  engagement_score REAL, -- computed from user message count/length
  -- Context
  subject_tags TEXT[],
  language TEXT,
  agent_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.discussion_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.discussion_patterns FOR ALL USING (false);

CREATE INDEX idx_discussion_patterns_subject ON public.discussion_patterns USING gin(subject_tags);
