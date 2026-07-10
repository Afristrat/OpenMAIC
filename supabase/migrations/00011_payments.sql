-- ---------------------------------------------------------------------------
-- Payments table for mobile money & local payment aggregators
-- Providers: CinetPay, Orange Money, Wave, PayPal
-- ---------------------------------------------------------------------------

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  org_id UUID REFERENCES public.organizations(id),
  provider TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by transaction_id (used by webhook processing)
CREATE INDEX idx_payments_transaction_id ON public.payments (transaction_id);

-- Index for user payment history
CREATE INDEX idx_payments_user_id ON public.payments (user_id);

-- Row Level Security
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can see their own payments
CREATE POLICY "Users see own payments"
  ON public.payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (via API routes)
CREATE POLICY "Service role manages"
  ON public.payments
  FOR ALL
  USING (false);
