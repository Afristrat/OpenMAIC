-- Completion, LMS outbox and reporting projection commit or roll back together.
ALTER TABLE public.quiz_results ADD COLUMN lti_attempt_id uuid UNIQUE
REFERENCES public.lti_quiz_attempts(id) ON DELETE CASCADE;

CREATE FUNCTION qalem_quiz_private.protect_lti_result()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF (NEW.lti_attempt_id IS NOT NULL OR (TG_OP='UPDATE' AND OLD.lti_attempt_id IS NOT NULL))
    AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'LTI result is server-owned' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_quiz_private.protect_lti_result() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER quiz_result_lti_guard BEFORE INSERT OR UPDATE ON public.quiz_results
FOR EACH ROW EXECUTE FUNCTION qalem_quiz_private.protect_lti_result();

CREATE FUNCTION qalem_quiz_private.project_lti_result()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid; recorded_answers jsonb;
BEGIN
  IF NEW.result IS NULL OR (TG_OP='UPDATE' AND OLD.result IS NOT NULL) THEN RETURN NEW; END IF;
  SELECT user_id INTO STRICT actor FROM public.lti_user_bindings
    WHERE id=NEW.user_binding_id AND org_id=NEW.org_id AND client_id=NEW.client_id;
  SELECT jsonb_agg(jsonb_build_object(
    'questionId',r->>'questionId','userAnswer',COALESCE(NEW.answers->>(r->>'questionId'),''),
    'correct',COALESCE((r->>'correct')::boolean,false),'timestamp',now()))
    INTO recorded_answers FROM jsonb_array_elements(NEW.result->'results') r;
  INSERT INTO public.quiz_results(id,lti_attempt_id,user_id,org_id,stage_id,scene_id,answers,score,completed_at)
    VALUES(NEW.id,NEW.id,actor,NEW.org_id,NEW.stage_id,NEW.scene_id,
      COALESCE(recorded_answers,'[]'::jsonb),(NEW.result->>'score')::real,now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_quiz_private.project_lti_result() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER lti_quiz_reporting AFTER INSERT OR UPDATE OF result ON public.lti_quiz_attempts
FOR EACH ROW EXECUTE FUNCTION qalem_quiz_private.project_lti_result();
