-- The free plan is a tenant-wide discovery allowance, not an unlicensed state.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('free', 'unlicensed', 'pro', 'enterprise'));

ALTER TABLE public.organizations
  ALTER COLUMN plan SET DEFAULT 'free';

UPDATE public.organizations
SET plan = 'free', subscription_status = 'inactive'
WHERE plan = 'unlicensed';
