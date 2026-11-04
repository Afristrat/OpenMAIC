-- Test de l'invitation par formation (stage_grant_invitations).
-- À jouer APRÈS les migrations 20261103120000 et 20261104090000, dans une transaction annulée :
--   BEGIN; \i migrations/20261103120000_stage_grants.sql; \i migrations/20261104090000_stage_grant_invitations.sql;
--   \i tests/stage_grant_invitations.sql; ROLLBACK;

DO $$
DECLARE
  stage TEXT;
  tok_ok TEXT; tok_other TEXT; tok_expired TEXT; tok_existing TEXT;
  new_id UUID := 'bbbbbbbb-0000-4000-8000-000000000001';
  existing_id UUID := 'bbbbbbbb-0000-4000-8000-000000000009';
  raised BOOLEAN;
  claimed RECORD;
  members_before INT;
BEGIN
  SELECT id INTO stage FROM public.stages ORDER BY id LIMIT 1;
  SELECT count(*) INTO members_before FROM public.org_members;

  INSERT INTO public.stage_grant_invitations (stage_id, email) VALUES (stage, 'inv-ok@qalem.invalid')
    RETURNING token INTO tok_ok;
  INSERT INTO public.stage_grant_invitations (stage_id, email) VALUES (stage, 'inv-other@qalem.invalid')
    RETURNING token INTO tok_other;
  INSERT INTO public.stage_grant_invitations (stage_id, email, expires_at)
    VALUES (stage, 'inv-expired@qalem.invalid', now() - INTERVAL '1 minute') RETURNING token INTO tok_expired;
  INSERT INTO public.stage_grant_invitations (stage_id, email) VALUES (stage, 'inv-existing@qalem.invalid')
    RETURNING token INTO tok_existing;

  -- 1) Inscription valide : droit créé, aucune adhésion, invitation consommée.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (new_id, 'inv-ok@qalem.invalid', jsonb_build_object('qalem_invitation_token', tok_ok));
  IF NOT EXISTS (SELECT 1 FROM public.stage_grants WHERE stage_id = stage AND user_id = new_id) THEN
    RAISE EXCEPTION 'Le droit de lecture n''a pas été créé à l''inscription';
  END IF;
  IF EXISTS (SELECT 1 FROM public.org_members WHERE user_id = new_id) THEN
    RAISE EXCEPTION 'L''invité de formation a été rattaché à une organisation';
  END IF;
  IF (SELECT used_at FROM public.stage_grant_invitations WHERE token = tok_ok) IS NULL THEN
    RAISE EXCEPTION 'L''invitation n''a pas été consommée';
  END IF;

  -- 2) Adresse différente de celle invitée : refusé.
  raised := false;
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('bbbbbbbb-0000-4000-8000-000000000002', 'intrus@qalem.invalid',
              jsonb_build_object('qalem_invitation_token', tok_other));
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Une autre adresse a pu utiliser l''invitation'; END IF;

  -- 3) Jeton déjà utilisé : refusé.
  raised := false;
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('bbbbbbbb-0000-4000-8000-000000000003', 'inv-ok@qalem.invalid',
              jsonb_build_object('qalem_invitation_token', tok_ok));
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Un jeton déjà consommé a été accepté'; END IF;

  -- 4) Jeton expiré : refusé.
  raised := false;
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('bbbbbbbb-0000-4000-8000-000000000004', 'inv-expired@qalem.invalid',
              jsonb_build_object('qalem_invitation_token', tok_expired));
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Un jeton expiré a été accepté'; END IF;

  -- 5) Jeton inconnu : refusé.
  raised := false;
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('bbbbbbbb-0000-4000-8000-000000000005', 'inconnu@qalem.invalid',
              jsonb_build_object('qalem_invitation_token', 'jeton-qui-n-existe-pas'));
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Un jeton inconnu a été accepté'; END IF;

  -- 6) Compte existant : réclamation par la fonction serveur, sans adhésion.
  INSERT INTO auth.users (id, email) VALUES (existing_id, 'inv-existing@qalem.invalid');
  SELECT * INTO claimed FROM public.claim_invitation_for_existing_user(
    tok_existing, existing_id, 'inv-existing@qalem.invalid');
  IF claimed.org_id IS NOT NULL OR claimed.role IS NOT NULL THEN
    RAISE EXCEPTION 'Une invitation de formation a renvoyé une organisation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stage_grants WHERE stage_id = stage AND user_id = existing_id) THEN
    RAISE EXCEPTION 'Le compte existant n''a pas reçu le droit';
  END IF;

  -- 7) Compte existant, mauvaise adresse : refusé.
  raised := false;
  BEGIN
    PERFORM * FROM public.claim_invitation_for_existing_user(tok_other, existing_id, 'inv-existing@qalem.invalid');
  EXCEPTION WHEN OTHERS THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'Un compte existant a pu réclamer l''invitation d''une autre adresse'; END IF;

  -- Aucune adhésion créée par tout ce qui précède.
  IF (SELECT count(*) FROM public.org_members) <> members_before THEN
    RAISE EXCEPTION 'Des adhésions ont été créées par des invitations de formation';
  END IF;
END $$;

SELECT 'INVITATIONS DE FORMATION OK' AS resultat;
