-- Qalem S4-008 — durable, auditable live intervention decisions.
CREATE TABLE public.classroom_intervention_decisions (
  decision_id TEXT PRIMARY KEY CHECK (char_length(trim(decision_id)) BETWEEN 1 AND 160),
  classroom_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  learner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interaction_id TEXT NOT NULL CHECK (char_length(trim(interaction_id)) BETWEEN 1 AND 160),
  scene_id TEXT REFERENCES public.scenes(id) ON DELETE SET NULL,
  turn_index INTEGER NOT NULL CHECK (turn_index BETWEEN 0 AND 100),
  agent_id TEXT NOT NULL CHECK (char_length(trim(agent_id)) BETWEEN 1 AND 160),
  agent_name TEXT NOT NULL CHECK (char_length(trim(agent_name)) BETWEEN 1 AND 120),
  trigger TEXT NOT NULL CHECK (trigger IN (
    'play', 'learner-answer', 'learner-question', 'hesitation', 'silence',
    'misconception', 'confusion', 'cognitive-overload', 'high-confidence',
    'low-confidence', 'topic-transition', 'transfer-opportunity', 'unaddressed-risk'
  )),
  form TEXT NOT NULL CHECK (form IN (
    'question', 'objection', 'synthesis', 'example', 'feedback', 'use-case',
    'anecdote', 'humor', 'disagreement', 'blind-spot', 'clarification',
    'challenge', 'regulation'
  )),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 8 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, interaction_id, turn_index)
);

CREATE INDEX idx_classroom_intervention_decisions_classroom_created
  ON public.classroom_intervention_decisions(classroom_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_classroom_intervention_decision_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stages
    WHERE stages.id = NEW.classroom_id
      AND stages.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Intervention organization does not own the classroom';
  END IF;

  IF NEW.scene_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.scenes
    WHERE scenes.id = NEW.scene_id
      AND scenes.stage_id = NEW.classroom_id
  ) THEN
    RAISE EXCEPTION 'Intervention scene does not belong to the classroom';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_classroom_intervention_decision_scope
  BEFORE INSERT OR UPDATE ON public.classroom_intervention_decisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_classroom_intervention_decision_scope();

ALTER TABLE public.classroom_intervention_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom_intervention_decisions_select_author"
  ON public.classroom_intervention_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stages
      WHERE stages.id = classroom_intervention_decisions.classroom_id
        AND (
          stages.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.org_members
            WHERE org_members.org_id = classroom_intervention_decisions.org_id
              AND org_members.user_id = auth.uid()
              AND org_members.role IN ('admin', 'manager')
          )
        )
    )
  );

CREATE POLICY "classroom_intervention_decisions_insert_service_only"
  ON public.classroom_intervention_decisions FOR INSERT WITH CHECK (false);
CREATE POLICY "classroom_intervention_decisions_update_service_only"
  ON public.classroom_intervention_decisions FOR UPDATE USING (false);
CREATE POLICY "classroom_intervention_decisions_delete_service_only"
  ON public.classroom_intervention_decisions FOR DELETE USING (false);
