ALTER TABLE public.transmissions
  ALTER COLUMN sender_user_id DROP NOT NULL,
  ALTER COLUMN recipient_user_id DROP NOT NULL,
  DROP CONSTRAINT transmissions_sender_user_id_fkey,
  DROP CONSTRAINT transmissions_recipient_user_id_fkey,
  ADD CONSTRAINT transmissions_sender_user_id_fkey
    FOREIGN KEY (sender_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT transmissions_recipient_user_id_fkey
    FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.assert_transmission_tenant_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE transmission_org_id uuid;
BEGIN
  -- A profile cascade only removes attribution, never retargets a delivery.
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD)-ARRAY['sender_user_id','recipient_user_id'])
         = (to_jsonb(NEW)-ARRAY['sender_user_id','recipient_user_id'])
      AND (OLD.sender_user_id IS DISTINCT FROM NEW.sender_user_id
        OR OLD.recipient_user_id IS DISTINCT FROM NEW.recipient_user_id)
      AND (OLD.sender_user_id IS NOT DISTINCT FROM NEW.sender_user_id
        OR (NEW.sender_user_id IS NULL AND OLD.sender_user_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.sender_user_id)))
      AND (OLD.recipient_user_id IS NOT DISTINCT FROM NEW.recipient_user_id
        OR (NEW.recipient_user_id IS NULL AND OLD.recipient_user_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.recipient_user_id)))
    THEN RETURN NEW; END IF;
  END IF;
  SELECT org_id INTO transmission_org_id FROM public.stages WHERE id=NEW.stage_id;
  IF transmission_org_id IS NULL THEN
    RAISE EXCEPTION 'Transmission requires a classroom scoped to an organization';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_members
    WHERE org_id=transmission_org_id AND user_id=NEW.sender_user_id) THEN
    RAISE EXCEPTION 'Transmission sender is not a member of the classroom organization';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_members
    WHERE org_id=transmission_org_id AND user_id=NEW.recipient_user_id) THEN
    RAISE EXCEPTION 'Transmission recipient is not a member of the classroom organization';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_transmission_tenant_membership() FROM PUBLIC, anon, authenticated;
