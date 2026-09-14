-- Qalem Local — appareil enrôlé et licences de paquets contrôlées.
-- Ces tables ne sont jamais accessibles directement depuis le Data API : les
-- routes serveur authentifiées portent l'autorisation et l'émission de licence.

CREATE TABLE public.local_client_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  encryption_public_key TEXT NOT NULL CHECK (
    char_length(encryption_public_key) = 43
    AND encryption_public_key ~ '^[A-Za-z0-9_-]+$'
  ),
  label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, org_id, device_id)
);

CREATE INDEX local_client_devices_user_org_active_idx
  ON public.local_client_devices (user_id, org_id)
  WHERE revoked_at IS NULL;

-- The browser never receives a decrypted source.  The opaque, encrypted
-- Qalem Local package is kept in a private bucket and can only be mediated by
-- an authenticated server route after it has checked the device licence.
CREATE TABLE public.local_content_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL,
  source_manifest_id UUID,
  source_content_sha256 TEXT NOT NULL CHECK (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_sha256 TEXT NOT NULL CHECK (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_path TEXT NOT NULL UNIQUE CHECK (
    artifact_path = org_id::text || '/' || id::text || '.qalempkg'
  ),
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes BETWEEN 1 AND 5242880),
  format_version SMALLINT NOT NULL DEFAULT 1 CHECK (format_version = 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, org_id)
    REFERENCES public.organization_sources(id, org_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_manifest_id, org_id)
    REFERENCES public.formation_source_manifests(id, org_id) ON DELETE RESTRICT
);

CREATE INDEX local_content_packages_org_source_idx
  ON public.local_content_packages (org_id, source_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.assert_local_content_package_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_sources AS source
    WHERE source.id = NEW.source_id
      AND source.org_id = NEW.org_id
      AND source.status = 'ready'
      AND source.content_hash = NEW.source_content_sha256
  ) THEN
    RAISE EXCEPTION 'Local package must reference a ready source at its exact content hash'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source_manifest_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.formation_source_manifests AS manifest
    WHERE manifest.id = NEW.source_manifest_id
      AND manifest.org_id = NEW.org_id
      AND NEW.source_id = ANY (manifest.source_ids)
  ) THEN
    RAISE EXCEPTION 'Local package source must belong to its source manifest'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER assert_local_content_package_integrity
  BEFORE INSERT OR UPDATE OF org_id, source_id, source_manifest_id, source_content_sha256
  ON public.local_content_packages
  FOR EACH ROW EXECUTE FUNCTION public.assert_local_content_package_integrity();

CREATE TABLE public.local_content_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.local_client_devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.local_content_packages(id) ON DELETE RESTRICT,
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  signed_manifest JSONB NOT NULL,
  key_envelope TEXT NOT NULL CHECK (char_length(key_envelope) > 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at),
  UNIQUE (device_id, package_id)
);

CREATE INDEX local_content_licenses_device_active_idx
  ON public.local_content_licenses (device_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.local_client_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_content_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_content_licenses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.local_client_devices FROM anon, authenticated;
REVOKE ALL ON TABLE public.local_content_packages FROM anon, authenticated;
REVOKE ALL ON TABLE public.local_content_licenses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.local_client_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.local_content_packages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.local_content_licenses TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'local-content-packages',
  'local-content-packages',
  false,
  5242880,
  ARRAY['application/octet-stream']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "local_content_packages_select_service_only"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'local-content-packages' AND false);

CREATE POLICY "local_content_packages_insert_service_only"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'local-content-packages' AND false);

CREATE POLICY "local_content_packages_update_service_only"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'local-content-packages' AND false);

CREATE POLICY "local_content_packages_delete_service_only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'local-content-packages' AND false);
