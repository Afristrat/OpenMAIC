-- S3-001 — Planned and completed anchoring deliveries.

CREATE TABLE public.anchor_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.anchor_plans(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES public.seeds(id) ON DELETE SET NULL,
  delivery_kind TEXT NOT NULL CHECK (delivery_kind IN ('seed', 'quiz_reminder', 'cold_eval')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  CHECK (opened_at IS NULL OR sent_at IS NOT NULL),
  CHECK (delivery_kind <> 'seed' OR seed_id IS NOT NULL),
  UNIQUE (plan_id, delivery_kind, scheduled_for)
);

CREATE INDEX anchor_deliveries_due_idx
  ON public.anchor_deliveries(scheduled_for)
  WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_anchor_delivery_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  plan_session_id UUID;
  plan_opted_in_at TIMESTAMPTZ;
  plan_ends_at TIMESTAMPTZ;
BEGIN
  SELECT plan.session_id, plan.opted_in_at, plan.ends_at
    INTO plan_session_id, plan_opted_in_at, plan_ends_at
  FROM public.anchor_plans plan
  WHERE plan.id = NEW.plan_id;

  IF NOT FOUND
     OR NEW.scheduled_for < plan_opted_in_at
     OR NEW.scheduled_for > plan_ends_at THEN
    RAISE EXCEPTION 'Delivery must stay inside its consented plan window'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.seed_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.seeds seed
    WHERE seed.id = NEW.seed_id AND seed.session_id = plan_session_id
  ) THEN
    RAISE EXCEPTION 'Delivery seed must belong to the plan session'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_anchor_delivery_contract
  BEFORE INSERT OR UPDATE OF plan_id, seed_id, scheduled_for
  ON public.anchor_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_anchor_delivery_contract();

ALTER TABLE public.anchor_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY anchor_deliveries_select_own ON public.anchor_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.anchor_plans plan
      WHERE plan.id = anchor_deliveries.plan_id
        AND plan.user_id = auth.uid()
    )
  );

CREATE POLICY anchor_deliveries_service_writes_only ON public.anchor_deliveries
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

