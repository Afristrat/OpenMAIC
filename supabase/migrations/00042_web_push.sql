-- S3-002 — Web Push subscriptions and auditable delivery attempts.

CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE
    CHECK (char_length(endpoint) BETWEEN 16 AND 2048 AND endpoint ~ '^https://'),
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) = 87),
  auth TEXT NOT NULL CHECK (char_length(auth) = 22),
  expiration_time BIGINT CHECK (expiration_time IS NULL OR expiration_time >= 0),
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user
  ON public.push_subscriptions(user_id);

CREATE TRIGGER set_updated_at_push_subscriptions
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_insert_own"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_update_own"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE public.web_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  target_url TEXT NOT NULL
    CHECK (
      char_length(target_url) BETWEEN 1 AND 1024
      AND (target_url = '/' OR target_url ~ '^/[^/]')
    ),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'failed', 'expired')),
  push_service_status INTEGER CHECK (push_service_status BETWEEN 100 AND 599),
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_web_push_deliveries_user_created
  ON public.web_push_deliveries(user_id, created_at DESC);

ALTER TABLE public.web_push_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "web_push_deliveries_select_own"
  ON public.web_push_deliveries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "web_push_deliveries_insert_service_only"
  ON public.web_push_deliveries FOR INSERT
  WITH CHECK (false);

CREATE POLICY "web_push_deliveries_update_service_only"
  ON public.web_push_deliveries FOR UPDATE
  USING (false);

CREATE POLICY "web_push_deliveries_delete_service_only"
  ON public.web_push_deliveries FOR DELETE
  USING (false);
