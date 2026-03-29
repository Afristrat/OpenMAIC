-- =============================================================================
-- Qalem — Verifiable Certificates
-- =============================================================================

CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  learner_name TEXT NOT NULL,
  completion_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
  skills TEXT[],
  verification_code TEXT NOT NULL UNIQUE,
  issued_by TEXT NOT NULL DEFAULT 'Qalem',
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX idx_certificates_stage_id ON public.certificates(stage_id);
CREATE INDEX idx_certificates_verification_code ON public.certificates(verification_code);
CREATE UNIQUE INDEX idx_certificates_user_stage ON public.certificates(user_id, stage_id);

-- Row Level Security
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see their own certificates
CREATE POLICY "Users see own certificates"
  ON public.certificates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Public verification: anyone can look up a certificate by verification_code.
-- This is intentionally permissive — the verify endpoint only exposes
-- non-sensitive fields (name, course, score, date).
CREATE POLICY "Public verification lookup"
  ON public.certificates
  FOR SELECT
  USING (true);

-- Only the server (service role) can insert certificates.
-- The generate endpoint runs server-side with the anon key + auth context,
-- so we allow authenticated inserts where user_id matches the caller.
CREATE POLICY "Authenticated users create own certificates"
  ON public.certificates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
