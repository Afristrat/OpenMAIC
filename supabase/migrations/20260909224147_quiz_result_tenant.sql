-- Legacy/personal results remain unassigned; never infer historical provenance.
ALTER TABLE public.quiz_results ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE INDEX quiz_results_org_stage_completed_idx ON public.quiz_results(org_id,stage_id,completed_at,id);

CREATE SCHEMA IF NOT EXISTS qalem_quiz_private;
REVOKE ALL ON SCHEMA qalem_quiz_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION qalem_quiz_private.check_result_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.org_id,NEW.user_id,NEW.stage_id,NEW.scene_id)
    IS DISTINCT FROM (OLD.org_id,OLD.user_id,OLD.stage_id,OLD.scene_id) THEN
    RAISE EXCEPTION 'Quiz provenance is immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.org_id=NEW.org_id AND m.user_id=NEW.user_id AND o.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz tenant denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.stages s WHERE s.id=NEW.stage_id AND
    (s.org_id=NEW.org_id OR EXISTS (SELECT 1 FROM public.shared_classrooms c
      WHERE c.stage_id=s.id AND c.org_id=NEW.org_id AND c.visibility IN ('organization','public')));
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz stage denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.scenes s WHERE s.id=NEW.scene_id AND s.stage_id=NEW.stage_id AND s.type='quiz';
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz scene denied' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_quiz_private.check_result_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER quiz_result_tenant_guard BEFORE INSERT OR UPDATE ON public.quiz_results
FOR EACH ROW EXECUTE FUNCTION qalem_quiz_private.check_result_tenant();
