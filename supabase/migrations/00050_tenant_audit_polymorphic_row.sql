-- S6-022 — a generic trigger cannot reference a column absent from one of its
-- target tables, even inside a CASE branch. Extract the tenant identifier from
-- the row JSON so the same audited function works for organizations,
-- org_members and org_invitations.

CREATE OR REPLACE FUNCTION public.audit_tenant_administration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant UUID;
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
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_tenant_administration() FROM PUBLIC, anon, authenticated;
