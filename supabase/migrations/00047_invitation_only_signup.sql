-- Public sign-up is disabled at the GoTrue runtime. New identities are created
-- by the service-role invitation endpoint with this one-time token in their
-- metadata. Claiming the invitation in the auth.users transaction prevents a
-- half-created account or a half-consumed invitation.

UPDATE public.org_invitations
SET
  email = 'revoked-anonymous+' || id::text || '@qalem.invalid',
  used_at = COALESCE(used_at, now())
WHERE email IS NULL;

ALTER TABLE public.org_invitations
  ALTER COLUMN email SET NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_invitation_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_token TEXT := NEW.raw_app_meta_data ->> 'qalem_invitation_token';
  invitation public.org_invitations%ROWTYPE;
BEGIN
  IF invitation_token IS NULL OR invitation_token = '' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO invitation
  FROM public.org_invitations
  WHERE token = invitation_token
  FOR UPDATE;

  IF NOT FOUND
    OR invitation.used_at IS NOT NULL
    OR invitation.expires_at <= now()
    OR lower(invitation.email) <> lower(NEW.email)
  THEN
    RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.org_members (user_id, org_id, role)
  VALUES (NEW.id, invitation.org_id, invitation.role);

  UPDATE public.org_invitations
  SET used_at = now()
  WHERE id = invitation.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS join_org_from_invitation_on_auth_user ON auth.users;
CREATE TRIGGER join_org_from_invitation_on_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.claim_invitation_for_auth_user();

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
  SELECT *
  INTO invitation
  FROM public.org_invitations
  WHERE token = invitation_token
  FOR UPDATE;

  IF NOT FOUND
    OR invitation.used_at IS NOT NULL
    OR invitation.expires_at <= now()
    OR lower(invitation.email) <> lower(invited_email)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = invited_user_id AND lower(email) = lower(invited_email))
  THEN
    RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.org_members (user_id, org_id, role)
  VALUES (invited_user_id, invitation.org_id, invitation.role)
  ON CONFLICT ON CONSTRAINT org_members_user_id_org_id_key DO NOTHING;

  UPDATE public.org_invitations
  SET used_at = now()
  WHERE id = invitation.id;

  RETURN QUERY SELECT invitation.org_id, invitation.role;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_existing_user(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_existing_user(TEXT, UUID, TEXT)
  TO service_role;
