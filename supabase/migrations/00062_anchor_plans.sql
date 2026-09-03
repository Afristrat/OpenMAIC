-- S3-001 — Explicit opt-in plans with a hard J+90 boundary.

CREATE TABLE public.anchor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_in_at TIMESTAMPTZ NOT NULL,
  paused BOOLEAN NOT NULL DEFAULT false,
  ends_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX anchor_plans_user_active_idx ON public.anchor_plans(user_id, paused, ends_at);

CREATE OR REPLACE FUNCTION public.enforce_anchor_plan_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_sessions session
    WHERE session.id = NEW.session_id
      AND session.user_id = NEW.user_id
      AND session.recorded = true
      AND session.ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Anchor plan requires the user''s completed recorded session'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.ends_at <= NEW.opted_in_at
     OR NEW.ends_at > NEW.opted_in_at + interval '90 days' THEN
    RAISE EXCEPTION 'Anchor plan must end after opt-in and no later than J+90'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.opted_in_at IS DISTINCT FROM OLD.opted_in_at
    OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
  ) THEN
    RAISE EXCEPTION 'Anchor plan identity and consent window are immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_anchor_plan_contract
  BEFORE INSERT OR UPDATE ON public.anchor_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_anchor_plan_contract();

ALTER TABLE public.anchor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY anchor_plans_select_own ON public.anchor_plans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY anchor_plans_insert_own ON public.anchor_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY anchor_plans_update_own ON public.anchor_plans
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY anchor_plans_delete_own ON public.anchor_plans
  FOR DELETE TO authenticated USING (user_id = auth.uid());

