-- S3-005 — Durable, idempotent delivery jobs for the consented anchoring plan.

ALTER TABLE public.anchor_deliveries
  ADD COLUMN dedupe_key TEXT,
  ADD COLUMN payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN last_error TEXT;

UPDATE public.anchor_deliveries
SET dedupe_key = id::text
WHERE dedupe_key IS NULL;

ALTER TABLE public.anchor_deliveries
  ALTER COLUMN dedupe_key SET NOT NULL;

CREATE UNIQUE INDEX anchor_deliveries_plan_dedupe_idx
  ON public.anchor_deliveries(plan_id, dedupe_key);

CREATE INDEX anchor_deliveries_plan_pending_idx
  ON public.anchor_deliveries(plan_id, scheduled_for)
  WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_anchor_delivery_failure(
  target_delivery_id UUID,
  failure_message TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.anchor_deliveries
  SET attempt_count = attempt_count + 1,
      last_error = left(failure_message, 1000)
  WHERE id = target_delivery_id AND sent_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.record_anchor_delivery_failure(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_anchor_delivery_failure(UUID, TEXT) TO service_role;
