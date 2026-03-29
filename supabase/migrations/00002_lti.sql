-- =============================================================================
-- LTI 1.3 Tool Provider — Tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LTI Platform Registrations
-- Stores configuration for each LMS platform that can launch Qalem
-- ---------------------------------------------------------------------------
CREATE TABLE public.lti_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     TEXT NOT NULL UNIQUE,
  issuer        TEXT NOT NULL,
  jwks_url      TEXT NOT NULL,
  auth_url      TEXT NOT NULL,
  token_url     TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lti_registrations ENABLE ROW LEVEL SECURITY;

-- Only the service role can manage LTI registrations (admin-only via backend)
CREATE POLICY "Service role manages LTI registrations"
  ON public.lti_registrations
  FOR ALL
  USING (false);

-- ---------------------------------------------------------------------------
-- LTI Nonces — Replay protection for OIDC launches
-- ---------------------------------------------------------------------------
CREATE TABLE public.lti_nonces (
  nonce      TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES public.lti_registrations(client_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lti_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages LTI nonces"
  ON public.lti_nonces
  FOR ALL
  USING (false);

-- Auto-clean expired nonces (manual cleanup via cron or scheduled function)
CREATE INDEX idx_lti_nonces_expires ON public.lti_nonces (expires_at) WHERE consumed = false;

-- ---------------------------------------------------------------------------
-- LTI Grade Submissions — Audit log for grades sent back to LMS
-- ---------------------------------------------------------------------------
CREATE TABLE public.lti_grade_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id        TEXT NOT NULL REFERENCES public.lti_registrations(client_id) ON DELETE CASCADE,
  resource_link_id TEXT NOT NULL,
  line_item_url    TEXT NOT NULL,
  score_given      NUMERIC(5,2) NOT NULL,
  score_maximum    NUMERIC(5,2) NOT NULL DEFAULT 100,
  activity_progress TEXT NOT NULL,
  grading_progress  TEXT NOT NULL,
  success          BOOLEAN NOT NULL DEFAULT false,
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lti_grade_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages LTI grade submissions"
  ON public.lti_grade_submissions
  FOR ALL
  USING (false);

CREATE INDEX idx_lti_grade_submissions_user ON public.lti_grade_submissions (user_id, created_at DESC);
