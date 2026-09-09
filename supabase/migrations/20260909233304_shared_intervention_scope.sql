CREATE OR REPLACE FUNCTION public.validate_classroom_intervention_decision_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.org_id,NEW.learner_user_id,NEW.classroom_id,NEW.interaction_id,NEW.turn_index)
    IS DISTINCT FROM (OLD.org_id,OLD.learner_user_id,OLD.classroom_id,OLD.interaction_id,OLD.turn_index) THEN
    RAISE EXCEPTION 'Intervention provenance is immutable' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stages s WHERE s.id=NEW.classroom_id AND (
    s.org_id=NEW.org_id OR EXISTS (
      SELECT 1 FROM public.shared_classrooms c
      JOIN public.organizations o ON o.id=c.org_id
      JOIN public.org_members m ON m.org_id=c.org_id
      WHERE c.stage_id=s.id AND c.org_id=NEW.org_id AND c.authorization_verified
        AND c.visibility IN ('organization','public') AND o.status='active'
        AND m.user_id=NEW.learner_user_id))) THEN
    RAISE EXCEPTION 'Intervention classroom access denied' USING ERRCODE='42501';
  END IF;
  IF NEW.scene_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.scenes s WHERE s.id=NEW.scene_id AND s.stage_id=NEW.classroom_id
  ) THEN RAISE EXCEPTION 'Intervention scene mismatch'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_classroom_intervention_decision_scope() FROM PUBLIC,anon,authenticated;

ALTER POLICY classroom_intervention_decisions_select_author ON public.classroom_intervention_decisions
TO authenticated USING (EXISTS (
  SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
  WHERE m.org_id=classroom_intervention_decisions.org_id AND m.user_id=(SELECT auth.uid())
    AND o.status='active' AND (m.role IN ('admin','manager') OR EXISTS (
      SELECT 1 FROM public.stages s WHERE s.id=classroom_intervention_decisions.classroom_id
        AND s.org_id=classroom_intervention_decisions.org_id AND s.owner_id=(SELECT auth.uid())
    ))
));
