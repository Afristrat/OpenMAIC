-- =============================================================================
-- S2-010 — Transmissions de supports par destinataire
-- =============================================================================

CREATE TABLE public.transmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  watermark_id TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex')
    CHECK (watermark_id ~ '^[0-9a-f]{32}$'),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  source_artifact_path TEXT,
  audio_watermark_path TEXT,
  visual_watermark_path TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transmissions_sender_is_not_recipient
    CHECK (sender_user_id <> recipient_user_id),
  CONSTRAINT transmissions_source_artifact_matches_status
    CHECK ((status = 'done') = (source_artifact_path IS NOT NULL)),
  CONSTRAINT transmissions_one_delivery_per_recipient
    UNIQUE (stage_id, sender_user_id, recipient_user_id)
);

CREATE INDEX idx_transmissions_recipient_created_at
  ON public.transmissions(recipient_user_id, created_at DESC);
CREATE INDEX idx_transmissions_sender_created_at
  ON public.transmissions(sender_user_id, created_at DESC);

CREATE TRIGGER set_updated_at_transmissions
  BEFORE UPDATE ON public.transmissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- A transmission is tenant-bound even when it is created through the
-- service-role API. This closes the cross-tenant bypass at the database edge.
CREATE OR REPLACE FUNCTION public.assert_transmission_tenant_membership()
RETURNS TRIGGER AS $$
DECLARE
  transmission_org_id UUID;
BEGIN
  SELECT org_id INTO transmission_org_id
  FROM public.stages
  WHERE id = NEW.stage_id;

  IF transmission_org_id IS NULL THEN
    RAISE EXCEPTION 'Transmission requires a classroom scoped to an organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = transmission_org_id AND user_id = NEW.sender_user_id
  ) THEN
    RAISE EXCEPTION 'Transmission sender is not a member of the classroom organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = transmission_org_id AND user_id = NEW.recipient_user_id
  ) THEN
    RAISE EXCEPTION 'Transmission recipient is not a member of the classroom organization';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assert_transmission_tenant_membership
  BEFORE INSERT OR UPDATE OF stage_id, sender_user_id, recipient_user_id
  ON public.transmissions
  FOR EACH ROW EXECUTE FUNCTION public.assert_transmission_tenant_membership();

ALTER TABLE public.transmissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transmissions_select_sender_or_recipient"
  ON public.transmissions FOR SELECT
  USING (auth.uid() = sender_user_id OR auth.uid() = recipient_user_id);

CREATE POLICY "transmissions_insert_service_only"
  ON public.transmissions FOR INSERT
  WITH CHECK (false);

CREATE POLICY "transmissions_update_service_only"
  ON public.transmissions FOR UPDATE
  USING (false);

CREATE POLICY "transmissions_delete_service_only"
  ON public.transmissions FOR DELETE
  USING (false);

INSERT INTO storage.buckets (id, name, public)
VALUES ('transmissions', 'transmissions', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "transmission_files_select_service_only"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'transmissions' AND false);

CREATE POLICY "transmission_files_insert_service_only"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'transmissions' AND false);

CREATE POLICY "transmission_files_update_service_only"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'transmissions' AND false);

CREATE POLICY "transmission_files_delete_service_only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'transmissions' AND false);
