-- S6-022 — invitation tokens are credentials, not audit attributes. Remove
-- them from existing snapshots and redact them before every future insert.

UPDATE public.tenant_admin_audit
SET
  previous_value = previous_value - 'token',
  next_value = next_value - 'token'
WHERE action LIKE 'org_invitations.%';

CREATE OR REPLACE FUNCTION public.audit_tenant_administration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant UUID;
  previous_record JSONB;
  next_record JSONB;
  actor UUID := COALESCE(
    NULLIF(current_setting('qalem.actor_id', true), '')::UUID,
    auth.uid()
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    tenant := COALESCE(to_jsonb(OLD) ->> 'org_id', to_jsonb(OLD) ->> 'id')::UUID;
  ELSE
    tenant := COALESCE(to_jsonb(NEW) ->> 'org_id', to_jsonb(NEW) ->> 'id')::UUID;
  END IF;

  previous_record := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  next_record := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 'org_invitations' THEN
    previous_record := previous_record - 'token';
    next_record := next_record - 'token';
  END IF;

  INSERT INTO public.tenant_admin_audit (
    tenant_id,
    actor_user_id,
    action,
    previous_value,
    next_value
  ) VALUES (
    tenant,
    actor,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    previous_record,
    next_record
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_tenant_administration() FROM PUBLIC, anon, authenticated;
