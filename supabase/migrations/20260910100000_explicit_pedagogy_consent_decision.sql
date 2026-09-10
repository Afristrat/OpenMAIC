-- A default false value is not an explicit refusal.  Preserve a ternary state
-- (undecided / refused / accepted) so the private-app banner can request a
-- decision while every collector still admits only explicit true.
ALTER TABLE public.telemetry_consent
  ADD COLUMN pedagogy_consent_decided_at timestamptz;

-- A historical true value could only have resulted from an affirmative action:
-- the former column default was false.  Historical false rows are made
-- undecided.  This keeps collection disabled and asks for a fresh decision.
UPDATE public.telemetry_consent
SET pedagogy_consent_decided_at = consented_at
WHERE pedagogy_consent IS TRUE;

UPDATE public.telemetry_consent
SET pedagogy_consent = NULL
WHERE pedagogy_consent IS FALSE
  AND pedagogy_consent_decided_at IS NULL;

ALTER TABLE public.telemetry_consent
  ALTER COLUMN pedagogy_consent DROP DEFAULT,
  ALTER COLUMN consented_at DROP DEFAULT;
