-- S6-025 — Preserve economic history while allowing an organization cascade to
-- remove its tenant-scoped burn-rate versions.

CREATE OR REPLACE FUNCTION public.protect_economic_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME IN (
      'tenant_sell_prices',
      'tenant_credit_burn_rates',
      'valued_billable_usage'
    ) AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ECONOMIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.valid_to IS NULL
    AND NEW.valid_to IS NOT NULL
    AND NEW.valid_to > OLD.valid_from
    AND (to_jsonb(NEW) - 'valid_to') = (to_jsonb(OLD) - 'valid_to')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ECONOMIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
