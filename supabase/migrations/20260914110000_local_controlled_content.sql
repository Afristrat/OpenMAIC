-- Qalem Local — appareil enrôlé et licences de paquets contrôlées.
-- Ces tables ne sont jamais accessibles directement depuis le Data API : les
-- routes serveur authentifiées portent l'autorisation et l'émission de licence.

CREATE TABLE public.local_client_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  public_key TEXT NOT NULL CHECK (
    char_length(public_key) = 43
    AND public_key ~ '^[A-Za-z0-9_-]+$'
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

CREATE TABLE public.local_content_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.local_client_devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL,
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
ALTER TABLE public.local_content_licenses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.local_client_devices FROM anon, authenticated;
REVOKE ALL ON TABLE public.local_content_licenses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.local_client_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.local_content_licenses TO service_role;
