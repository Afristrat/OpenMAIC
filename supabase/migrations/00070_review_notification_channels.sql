-- S6-011 — Opt-in email and WhatsApp batches for due review cards.

CREATE TABLE public.review_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_number TEXT,
  locale TEXT NOT NULL DEFAULT 'fr-FR'
    CHECK (locale IN ('fr-FR', 'ar-MA', 'en-US')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    whatsapp_number IS NULL
    OR whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CHECK (NOT whatsapp_enabled OR whatsapp_number IS NOT NULL)
);

CREATE TRIGGER set_updated_at_review_notification_preferences
  BEFORE UPDATE ON public.review_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.review_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_notification_preferences_select_own
  ON public.review_notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY review_notification_preferences_insert_own
  ON public.review_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY review_notification_preferences_update_own
  ON public.review_notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY review_notification_preferences_delete_own
  ON public.review_notification_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.review_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  batch_key DATE NOT NULL,
  due_count INTEGER NOT NULL CHECK (due_count > 0),
  review_card_id UUID REFERENCES public.review_cards(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_message_id TEXT CHECK (
    provider_message_id IS NULL OR char_length(provider_message_id) <= 255
  ),
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, batch_key),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX review_notification_deliveries_user_created_idx
  ON public.review_notification_deliveries(user_id, created_at DESC);

ALTER TABLE public.review_notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_notification_deliveries_select_own
  ON public.review_notification_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY review_notification_deliveries_insert_service_only
  ON public.review_notification_deliveries FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY review_notification_deliveries_update_service_only
  ON public.review_notification_deliveries FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY review_notification_deliveries_delete_service_only
  ON public.review_notification_deliveries FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.claim_due_review_notifications(target_time TIMESTAMPTZ)
RETURNS TABLE (delivery_id UUID, delivery_channel TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH due AS (
    SELECT
      preference.user_id,
      count(card.id)::INTEGER AS due_count,
      (array_agg(card.id ORDER BY card.due_date, card.id))[1] AS review_card_id,
      preference.email_enabled,
      preference.whatsapp_enabled
    FROM public.review_notification_preferences preference
    JOIN public.review_cards card ON card.user_id = preference.user_id
    WHERE card.due_date <= target_time
      AND (preference.email_enabled OR preference.whatsapp_enabled)
    GROUP BY
      preference.user_id,
      preference.email_enabled,
      preference.whatsapp_enabled
  ), channels AS (
    SELECT user_id, due_count, review_card_id, 'email'::TEXT AS channel
    FROM due WHERE email_enabled
    UNION ALL
    SELECT user_id, due_count, review_card_id, 'whatsapp'::TEXT AS channel
    FROM due WHERE whatsapp_enabled
  ), inserted AS (
    INSERT INTO public.review_notification_deliveries (
      user_id,
      channel,
      batch_key,
      due_count,
      review_card_id
    )
    SELECT
      user_id,
      channel,
      (target_time AT TIME ZONE 'UTC')::DATE,
      due_count,
      review_card_id
    FROM channels
    ON CONFLICT (user_id, channel, batch_key) DO NOTHING
    RETURNING id, channel
  )
  SELECT id, channel FROM inserted;
$$;

REVOKE ALL ON FUNCTION public.claim_due_review_notifications(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_review_notifications(TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_review_notification_failure(
  target_delivery_id UUID,
  failure_code TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.review_notification_deliveries
  SET status = 'failed',
      attempt_count = attempt_count + 1,
      error_code = left(failure_code, 64),
      provider_message_id = NULL,
      sent_at = NULL
  WHERE id = target_delivery_id AND status <> 'sent';
$$;

REVOKE ALL ON FUNCTION public.record_review_notification_failure(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_review_notification_failure(UUID, TEXT)
  TO service_role;
