-- =============================================================================
-- Migration 00016: Billing — Stripe integration fields on organizations
-- =============================================================================

-- Add billing fields to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Index for fast Stripe customer lookups (webhook processing)
CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer
  ON public.organizations(stripe_customer_id);

-- Index for subscription status filtering
CREATE INDEX IF NOT EXISTS idx_orgs_plan
  ON public.organizations(plan);
