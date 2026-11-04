-- Partage d'UNE formation avec une adresse qui n'a pas encore de compte.
--
-- L'inscription est sur invitation seule : toute invitation d'organisation crée une adhésion et
-- consomme une place. Une invitation PAR FORMATION crée à la place un droit de lecture
-- (stage_grants) : l'invité n'entre dans aucune organisation et ne voit que cette formation.
-- Le même jeton sert à l'inscription (déclencheur sur auth.users) et à la réclamation par un
-- compte existant dont l'adresse correspond.

CREATE TABLE public.stage_grant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  used_at TIMESTAMPTZ
);

-- Une seule invitation en attente par formation et par adresse.
CREATE UNIQUE INDEX stage_grant_invitations_one_pending
  ON public.stage_grant_invitations(stage_id, email) WHERE used_at IS NULL;
CREATE INDEX stage_grant_invitations_stage ON public.stage_grant_invitations(stage_id, created_at DESC);

ALTER TABLE public.stage_grant_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stage_grant_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stage_grant_invitations TO service_role;

COMMENT ON TABLE public.stage_grant_invitations IS
  'Invitation à lire UNE formation sans adhésion à l''organisation ; serveur seul, jeton à usage unique.';

-- Inscription : une invitation d'organisation reste prioritaire ; à défaut, une invitation de formation.
CREATE OR REPLACE FUNCTION public.claim_invitation_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  invitation_token TEXT := COALESCE(
    NEW.raw_app_meta_data ->> 'qalem_invitation_token',
    NEW.raw_user_meta_data ->> 'qalem_invitation_token'
  );
  invitation public.org_invitations%ROWTYPE;
  stage_invitation public.stage_grant_invitations%ROWTYPE;
BEGIN
  IF invitation_token IS NULL OR invitation_token = '' THEN RETURN NEW; END IF;

  SELECT * INTO invitation FROM public.org_invitations
  WHERE token = invitation_token FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO stage_invitation FROM public.stage_grant_invitations
    WHERE token = invitation_token FOR UPDATE;
    IF NOT FOUND OR stage_invitation.used_at IS NOT NULL OR stage_invitation.expires_at <= now()
      OR lower(stage_invitation.email) <> lower(NEW.email)
    THEN
      RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.stage_grant_invitations SET used_at = now() WHERE id = stage_invitation.id;
    INSERT INTO public.stage_grants (stage_id, user_id, granted_by)
    VALUES (stage_invitation.stage_id, NEW.id, stage_invitation.created_by)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  IF invitation.used_at IS NOT NULL OR invitation.expires_at <= now()
    OR lower(invitation.email) <> lower(NEW.email)
  THEN
    RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.org_invitations SET used_at = now() WHERE id = invitation.id;
  INSERT INTO public.org_members (user_id, org_id, role)
  VALUES (NEW.id, invitation.org_id, invitation.role);
  RETURN NEW;
END;
$function$;

-- Compte existant : même jeton, réclamé après connexion. Pour une invitation de formation,
-- org_id et role restent NULL (aucune adhésion).
CREATE OR REPLACE FUNCTION public.claim_invitation_for_existing_user(
  invitation_token TEXT,
  invited_user_id UUID,
  invited_email TEXT
)
RETURNS TABLE(org_id UUID, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  invitation public.org_invitations%ROWTYPE;
  stage_invitation public.stage_grant_invitations%ROWTYPE;
BEGIN
  SELECT * INTO invitation FROM public.org_invitations
  WHERE token = invitation_token FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO stage_invitation FROM public.stage_grant_invitations
    WHERE token = invitation_token FOR UPDATE;
    IF NOT FOUND OR stage_invitation.used_at IS NOT NULL OR stage_invitation.expires_at <= now()
      OR lower(stage_invitation.email) <> lower(invited_email)
      OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = invited_user_id AND lower(email) = lower(invited_email))
    THEN
      RAISE EXCEPTION 'INVALID_QALEM_INVITATION' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.stage_grant_invitations SET used_at = now() WHERE id = stage_invitation.id;
    INSERT INTO public.stage_grants (stage_id, user_id, granted_by)
    VALUES (stage_invitation.stage_id, invited_user_id, stage_invitation.created_by)
    ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  IF invitation.used_at IS NOT NULL OR invitation.expires_at <= now()
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
$function$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_invitation_for_existing_user(TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_existing_user(TEXT, UUID, TEXT) TO service_role;
