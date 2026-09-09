-- A destination role alone never authorizes publication of a source classroom.
CREATE SCHEMA IF NOT EXISTS qalem_sharing_private;
REVOKE ALL ON SCHEMA qalem_sharing_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION qalem_sharing_private.guard_share()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); reducing boolean := false;
BEGIN
  -- Trusted server/admin writes and FK attribution cleanup remain possible.
  -- Browser writes are constrained even when another permissive policy exists.
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF actor IS NULL OR current_user='anon' THEN
    RAISE EXCEPTION 'Share requires an authenticated actor' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.stage_id,NEW.org_id,NEW.shared_by) IS DISTINCT FROM
       (OLD.stage_id,OLD.org_id,OLD.shared_by) THEN
      RAISE EXCEPTION 'Share provenance is immutable' USING ERRCODE='42501';
    END IF;
    reducing := (OLD.visibility='public' AND NEW.visibility IN ('organization','private'))
      OR (OLD.visibility='organization' AND NEW.visibility='private');
  ELSE
    IF NEW.shared_by IS NOT NULL AND NEW.shared_by<>actor THEN
      RAISE EXCEPTION 'Share author mismatch' USING ERRCODE='42501';
    END IF;
    NEW.shared_by := actor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.org_id=NEW.org_id AND m.user_id=actor
      AND m.role IN ('admin','manager','formateur') AND o.status='active') THEN
    RAISE EXCEPTION 'Destination publication denied' USING ERRCODE='42501';
  END IF;
  -- Destination administrators can reduce exposure, never expand another grant.
  IF NOT reducing AND NOT EXISTS (SELECT 1 FROM public.stages s
    WHERE s.id=NEW.stage_id
      AND (s.org_id IS NULL OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=s.org_id AND o.status='active'))
      AND (s.owner_id=actor OR EXISTS (SELECT 1 FROM public.org_members m
        WHERE m.org_id=s.org_id AND m.user_id=actor AND m.role IN ('admin','manager')))) THEN
    RAISE EXCEPTION 'Source publication denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_sharing_private.guard_share() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shared_classroom_authority BEFORE INSERT OR UPDATE ON public.shared_classrooms
FOR EACH ROW EXECUTE FUNCTION qalem_sharing_private.guard_share();

ALTER POLICY shared_classrooms_insert_formateur ON public.shared_classrooms TO authenticated;
ALTER POLICY shared_classrooms_update ON public.shared_classrooms TO authenticated
WITH CHECK (shared_by=(SELECT auth.uid()) OR EXISTS (
  SELECT 1 FROM public.org_members m WHERE m.org_id=shared_classrooms.org_id
    AND m.user_id=(SELECT auth.uid()) AND m.role='admin'));

-- No SELECT expansion: historical shares must be reconciled before granting
-- recipients new stage/scene access. Existing attribution is not a proof of consent.
