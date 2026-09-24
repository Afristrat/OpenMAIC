-- Learning and UX analytics are an integral part of the authenticated Qalem
-- service. External xAPI/LRS sharing remains a separate, revocable choice.
UPDATE public.telemetry_consent
SET pedagogy_consent = true,
    pedagogy_consent_decided_at = COALESCE(pedagogy_consent_decided_at, statement_timestamp()),
    consented_at = COALESCE(consented_at, statement_timestamp());

INSERT INTO public.telemetry_consent (
  user_id,
  pedagogy_consent,
  xapi_consent,
  consented_at,
  pedagogy_consent_decided_at
)
SELECT id, true, false, statement_timestamp(), statement_timestamp()
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.telemetry_consent
  ALTER COLUMN pedagogy_consent SET DEFAULT true,
  ALTER COLUMN pedagogy_consent SET NOT NULL,
  ALTER COLUMN pedagogy_consent_decided_at SET DEFAULT statement_timestamp(),
  ALTER COLUMN pedagogy_consent_decided_at SET NOT NULL,
  ALTER COLUMN consented_at SET DEFAULT statement_timestamp(),
  ALTER COLUMN consented_at SET NOT NULL,
  ADD CONSTRAINT telemetry_learning_analytics_required CHECK (pedagogy_consent IS TRUE);

DROP POLICY IF EXISTS "Users manage own consent" ON public.telemetry_consent;

CREATE FUNCTION qalem_telemetry_private.provision_learning_analytics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telemetry_consent (
    user_id,
    pedagogy_consent,
    xapi_consent,
    consented_at,
    pedagogy_consent_decided_at
  ) VALUES (
    NEW.id,
    true,
    false,
    statement_timestamp(),
    statement_timestamp()
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION qalem_telemetry_private.provision_learning_analytics()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER provision_learning_analytics
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION qalem_telemetry_private.provision_learning_analytics();
