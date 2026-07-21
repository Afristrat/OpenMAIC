-- Qalem has no free or trial offer. Preserve the access of active organizations
-- created before this commercial model by moving them to Studio. Any inactive,
-- incomplete or trial record becomes unlicensed.
UPDATE public.organizations
SET plan = 'pro'
WHERE plan = 'free' AND subscription_status = 'active';

UPDATE public.organizations
SET
  plan = 'unlicensed',
  subscription_status = 'inactive'
WHERE
  plan IS NULL
  OR plan = 'free'
  OR subscription_status IS NULL
  OR subscription_status = 'trialing';

ALTER TABLE public.organizations
  ALTER COLUMN plan SET DEFAULT 'unlicensed',
  ALTER COLUMN subscription_status SET DEFAULT 'inactive';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('unlicensed', 'pro', 'enterprise'));

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'canceled'));
