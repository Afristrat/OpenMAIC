-- S3-011 — Every generated reminder must retain a verifiable, session-local origin.
-- Existing seeds deliberately remain legacy rows: they cannot enter a newly created plan.
ALTER TABLE public.seeds
  ADD COLUMN source_event_id BIGINT REFERENCES public.session_events(id) ON DELETE CASCADE,
  ADD COLUMN source_kind TEXT,
  ADD COLUMN source_version TEXT;

ALTER TABLE public.seeds
  ADD CONSTRAINT seeds_source_kind_check CHECK (
    source_kind IS NULL OR source_kind IN (
      'learner_proposition',
      'agent_proposition',
      'content_presented',
      'new_question'
    )
  ),
  ADD CONSTRAINT seeds_source_version_check CHECK (
    source_version IS NULL OR (char_length(source_version) BETWEEN 1 AND 512)
  );

CREATE INDEX seeds_session_provenance_idx
  ON public.seeds(session_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_anchor_seed_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.source_event_id IS NULL OR NEW.source_kind IS NULL OR NEW.source_version IS NULL THEN
    RAISE EXCEPTION 'Anchor seed provenance is required' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.session_events event
    WHERE event.id=NEW.source_event_id AND event.session_id=NEW.session_id
  ) THEN
    RAISE EXCEPTION 'Anchor seed source event is outside its session' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_anchor_seed_provenance() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_anchor_seed_provenance
  BEFORE INSERT OR UPDATE OF session_id, source_event_id, source_kind, source_version
  ON public.seeds
  FOR EACH ROW EXECUTE FUNCTION public.guard_anchor_seed_provenance();

CREATE TABLE public.anchor_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL UNIQUE REFERENCES public.anchor_deliveries(id) ON DELETE CASCADE,
  seed_id UUID NOT NULL REFERENCES public.seeds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_event_id BIGINT NOT NULL REFERENCES public.session_events(id) ON DELETE CASCADE,
  response_kind TEXT NOT NULL CHECK (response_kind IN ('active_recall', 'open_question', 'action_in_practice')),
  response_text TEXT NOT NULL CHECK (char_length(trim(response_text)) BETWEEN 1 AND 2000),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_event_id)
);

CREATE OR REPLACE FUNCTION public.guard_anchor_reflection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_seed uuid;
  v_user uuid;
  v_event bigint;
BEGIN
  SELECT delivery.seed_id, plan.user_id, seed.source_event_id
    INTO v_seed, v_user, v_event
  FROM public.anchor_deliveries delivery
  JOIN public.anchor_plans plan ON plan.id=delivery.plan_id
  JOIN public.seeds seed ON seed.id=delivery.seed_id
  WHERE delivery.id=NEW.delivery_id
    AND delivery.sent_at IS NOT NULL;
  IF NOT FOUND OR v_seed IS NULL OR v_event IS NULL
    OR NEW.seed_id IS DISTINCT FROM v_seed
    OR NEW.user_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Anchor reflection is outside its delivered learner scope' USING ERRCODE='42501';
  END IF;
  NEW.source_event_id := v_event;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_anchor_reflection() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_anchor_reflection
  BEFORE INSERT OR UPDATE OF delivery_id, seed_id, user_id
  ON public.anchor_reflections
  FOR EACH ROW EXECUTE FUNCTION public.guard_anchor_reflection();

ALTER TABLE public.anchor_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY anchor_reflections_select_own ON public.anchor_reflections
  FOR SELECT TO authenticated
  USING (user_id=auth.uid());

CREATE POLICY anchor_reflections_service_writes_only ON public.anchor_reflections
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.read_anchor_reflection_export_page(
  p_actor uuid,
  p_after uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'cursor', row.id::text,
    'value', jsonb_build_object(
      'id', row.id,
      'delivery_id', row.delivery_id,
      'seed_id', row.seed_id,
      'source_event_id', row.source_event_id::text,
      'response_kind', row.response_kind,
      'response_text', row.response_text,
      'resolved_at', row.resolved_at,
      'created_at', row.created_at
    )
  ) ORDER BY row.id), '[]'::jsonb)
  FROM (
    SELECT reflection.*
    FROM public.anchor_reflections reflection
    WHERE reflection.user_id=p_actor
      AND (p_after IS NULL OR reflection.id>p_after)
    ORDER BY reflection.id
    LIMIT 100
  ) row;
$$;
REVOKE ALL ON FUNCTION public.read_anchor_reflection_export_page(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_anchor_reflection_export_page(uuid,uuid) TO service_role;
