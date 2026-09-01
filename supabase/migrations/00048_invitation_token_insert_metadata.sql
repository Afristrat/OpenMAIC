-- GoTrue's admin create-user flow persists raw_user_meta_data in the initial
-- auth.users INSERT, while raw_app_meta_data may only be completed afterwards.
-- Public sign-up remains disabled and the token is still constrained by its
-- one-time value, expiry and exact invited email.

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
