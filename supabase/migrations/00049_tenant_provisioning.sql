-- S6-022 — tenant lifecycle, reserved seats and auditable administration.

ALTER TABLE public.organizations
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN seat_limit INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT organizations_status_check CHECK (status IN ('active', 'suspended')),
  ADD CONSTRAINT organizations_seat_limit_check CHECK (seat_limit > 0);

ALTER TABLE public.org_invitations
  ADD CONSTRAINT org_invitations_role_check
  CHECK (role IN ('admin', 'manager', 'author', 'formateur', 'apprenant'));

CREATE TABLE public.tenant_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_value JSONB,
  next_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tenant_admin_audit_tenant_created_idx
  ON public.tenant_admin_audit(tenant_id, created_at DESC);

ALTER TABLE public.tenant_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.tenant_admin_audit FOR ALL USING (false);

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

CREATE TRIGGER audit_tenant_controls
  AFTER INSERT OR UPDATE OF status, seat_limit ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_tenant_administration();

CREATE TRIGGER audit_tenant_members
  AFTER INSERT OR UPDATE OF role OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_tenant_administration();

CREATE TRIGGER audit_tenant_invitations
  AFTER INSERT OR UPDATE OF role, used_at OR DELETE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_tenant_administration();

CREATE OR REPLACE FUNCTION public.enforce_tenant_seat_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant public.organizations%ROWTYPE;
  occupied_seats INTEGER;
BEGIN
  SELECT * INTO tenant
  FROM public.organizations
  WHERE id = NEW.org_id
  FOR UPDATE;

  IF NOT FOUND OR tenant.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    (SELECT count(*) FROM public.org_members WHERE org_id = NEW.org_id)
    +
    (SELECT count(*) FROM public.org_invitations
      WHERE org_id = NEW.org_id AND used_at IS NULL AND expires_at > now())
  INTO occupied_seats;

  IF occupied_seats >= tenant.seat_limit THEN
    RAISE EXCEPTION 'TENANT_SEAT_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tenant_seat_capacity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_member_seat_capacity
  BEFORE INSERT ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_seat_capacity();

CREATE TRIGGER enforce_invitation_seat_capacity
  BEFORE INSERT ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_seat_capacity();

CREATE OR REPLACE FUNCTION public.provision_tenant_with_admin_invitation(
  actor_user_id UUID,
  tenant_name TEXT,
  tenant_sector TEXT,
  tenant_locale TEXT,
  tenant_seat_limit INTEGER,
  administrator_email TEXT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  sector TEXT,
  default_locale TEXT,
  status TEXT,
  seat_limit INTEGER,
  invitation_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_tenant public.organizations;
  created_invitation public.org_invitations;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = actor_user_id) THEN
    RAISE EXCEPTION 'INVALID_TENANT_ACTOR' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(tenant_name)) = 0
    OR tenant_seat_limit < 1
    OR tenant_locale NOT IN ('fr-FR', 'ar-MA', 'en-US')
    OR tenant_sector NOT IN ('healthcare', 'legal', 'tech', 'finance', 'education', 'industry')
    OR administrator_email IS NULL
  THEN
    RAISE EXCEPTION 'INVALID_TENANT_PROVISIONING' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('qalem.actor_id', actor_user_id::TEXT, true);

  INSERT INTO public.organizations (name, sector, default_locale, status, seat_limit)
  VALUES (trim(tenant_name), tenant_sector, tenant_locale, 'active', tenant_seat_limit)
  RETURNING * INTO created_tenant;

  INSERT INTO public.org_invitations (org_id, role, email, created_by)
  VALUES (created_tenant.id, 'admin', lower(trim(administrator_email)), actor_user_id)
  RETURNING * INTO created_invitation;

  RETURN QUERY SELECT
    created_tenant.id,
    created_tenant.name,
    created_tenant.sector,
    created_tenant.default_locale,
    created_tenant.status,
    created_tenant.seat_limit,
    created_invitation.token;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant_with_admin_invitation(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_with_admin_invitation(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.update_tenant_controls(
  actor_user_id UUID,
  tenant_id UUID,
  next_status TEXT DEFAULT NULL,
  next_seat_limit INTEGER DEFAULT NULL
)
RETURNS SETOF public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant public.organizations%ROWTYPE;
  occupied_seats INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = actor_user_id) THEN
    RAISE EXCEPTION 'INVALID_TENANT_ACTOR' USING ERRCODE = '42501';
  END IF;
  IF next_status IS NOT NULL AND next_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'INVALID_TENANT_STATUS' USING ERRCODE = '22023';
  END IF;
  IF next_seat_limit IS NOT NULL AND next_seat_limit < 1 THEN
    RAISE EXCEPTION 'INVALID_TENANT_SEAT_LIMIT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO tenant FROM public.organizations WHERE id = tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    (SELECT count(*) FROM public.org_members WHERE org_id = tenant_id)
    +
    (SELECT count(*) FROM public.org_invitations
      WHERE org_id = tenant_id AND used_at IS NULL AND expires_at > now())
  INTO occupied_seats;

  IF next_seat_limit IS NOT NULL AND next_seat_limit < occupied_seats THEN
    RAISE EXCEPTION 'TENANT_SEAT_LIMIT_BELOW_OCCUPANCY' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('qalem.actor_id', actor_user_id::TEXT, true);
  RETURN QUERY
  UPDATE public.organizations
  SET
    status = COALESCE(next_status, organizations.status),
    seat_limit = COALESCE(next_seat_limit, organizations.seat_limit),
    updated_at = now()
  WHERE organizations.id = tenant_id
  RETURNING organizations.*;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_controls(UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_controls(UUID, UUID, TEXT, INTEGER)
  TO service_role;

-- Consuming an invitation releases its reserved seat before inserting the
-- member. Both operations remain in the auth.users transaction and roll back
-- together on any error.
CREATE OR REPLACE FUNCTION public.claim_invitation_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_token TEXT := COALESCE(
    NEW.raw_app_meta_data ->> 'qalem_invitation_token',
    NEW.raw_user_meta_data ->> 'qalem_invitation_token'
  );
  invitation public.org_invitations%ROWTYPE;
BEGIN
  IF invitation_token IS NULL OR invitation_token = '' THEN RETURN NEW; END IF;

  SELECT * INTO invitation FROM public.org_invitations
  WHERE token = invitation_token FOR UPDATE;
  IF NOT FOUND OR invitation.used_at IS NOT NULL OR invitation.expires_at <= now()
    OR lower(invitation.email) <> lower(NEW.email)
  THEN
    RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.org_invitations SET used_at = now() WHERE id = invitation.id;
  INSERT INTO public.org_members (user_id, org_id, role)
  VALUES (NEW.id, invitation.org_id, invitation.role);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_auth_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_invitation_for_existing_user(
  invitation_token TEXT,
  invited_user_id UUID,
  invited_email TEXT
)
RETURNS TABLE (org_id UUID, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation public.org_invitations%ROWTYPE;
BEGIN
  SELECT * INTO invitation FROM public.org_invitations
  WHERE token = invitation_token FOR UPDATE;
  IF NOT FOUND OR invitation.used_at IS NOT NULL OR invitation.expires_at <= now()
    OR lower(invitation.email) <> lower(invited_email)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = invited_user_id AND lower(email) = lower(invited_email))
  THEN
    RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.org_invitations SET used_at = now() WHERE id = invitation.id;
  INSERT INTO public.org_members (user_id, org_id, role)
  VALUES (invited_user_id, invitation.org_id, invitation.role)
  ON CONFLICT ON CONSTRAINT org_members_user_id_org_id_key DO NOTHING;
  RETURN QUERY SELECT invitation.org_id, invitation.role;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_existing_user(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_existing_user(TEXT, UUID, TEXT)
  TO service_role;
