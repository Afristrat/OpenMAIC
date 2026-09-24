-- Account deletion cascades through telemetry_consent after the Auth identity has
-- already been removed. The ownership check is relevant to a direct consent
-- update, but must not turn the database-managed DELETE cascade into a blocker.
CREATE OR REPLACE FUNCTION qalem_telemetry_private.withdraw_anchor_xapi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'DELETE'
    AND auth.uid() IS NOT NULL
    AND auth.uid() IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Consent owner required' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' OR NEW.xapi_consent IS DISTINCT FROM true THEN
    DELETE FROM public.xapi_outbox x
    USING public.pedagogy_telemetry t, qalem_telemetry_private.subjects subject
    WHERE x.learning_observation_id = t.id
      AND t.subject_hash = subject.subject_hash
      AND subject.user_id = OLD.user_id;

    DELETE FROM public.xapi_outbox x
    USING public.live_sessions session
    WHERE x.anchor_session_id = session.id
      AND session.user_id = OLD.user_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION qalem_telemetry_private.withdraw_anchor_xapi()
  FROM PUBLIC, anon, authenticated;
