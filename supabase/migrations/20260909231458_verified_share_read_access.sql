-- Historical attribution was client-controlled; never backfill approval from it.
ALTER TABLE public.shared_classrooms ADD COLUMN authorization_verified boolean NOT NULL DEFAULT false;

CREATE FUNCTION qalem_sharing_private.stamp_verified_share()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user='authenticated' THEN
    -- The alphabetically earlier authority trigger has already checked rights.
    -- Reducing visibility must not turn an unverified historical row into a grant.
    IF TG_OP='UPDATE' AND ((OLD.visibility='public' AND NEW.visibility IN ('organization','private'))
      OR (OLD.visibility='organization' AND NEW.visibility='private')) THEN
      NEW.authorization_verified := OLD.authorization_verified;
    ELSE
      NEW.authorization_verified := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_sharing_private.stamp_verified_share() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_shared_classroom_verified BEFORE INSERT OR UPDATE ON public.shared_classrooms
FOR EACH ROW EXECUTE FUNCTION qalem_sharing_private.stamp_verified_share();

CREATE POLICY stages_select_verified_recipient ON public.stages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shared_classrooms c
  JOIN public.org_members m ON m.org_id=c.org_id
  JOIN public.organizations o ON o.id=c.org_id
  WHERE c.stage_id=stages.id AND c.authorization_verified
    AND c.visibility IN ('organization','public')
    AND m.user_id=(SELECT auth.uid()) AND o.status='active'
));
CREATE POLICY scenes_select_verified_recipient ON public.scenes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shared_classrooms c
  JOIN public.org_members m ON m.org_id=c.org_id
  JOIN public.organizations o ON o.id=c.org_id
  WHERE c.stage_id=scenes.stage_id AND c.authorization_verified
    AND c.visibility IN ('organization','public')
    AND m.user_id=(SELECT auth.uid()) AND o.status='active'
));

CREATE OR REPLACE FUNCTION qalem_quiz_private.check_result_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
      WHERE c.stage_id=s.id AND c.org_id=NEW.org_id AND c.authorization_verified
        AND c.visibility IN ('organization','public')));
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz stage denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.scenes s WHERE s.id=NEW.scene_id AND s.stage_id=NEW.stage_id AND s.type='quiz';
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz scene denied' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
