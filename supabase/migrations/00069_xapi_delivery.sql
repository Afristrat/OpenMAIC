-- S3-010 — Encrypted organization LRS configuration and retryable outbox delivery.

CREATE TABLE public.organization_lrs_configs (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  auth_ciphertext BYTEA NOT NULL,
  auth_iv BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_organization_lrs_configs
  BEFORE UPDATE ON public.organization_lrs_configs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.organization_lrs_configs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.xapi_outbox
  ADD COLUMN dedupe_key TEXT,
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN sent_at TIMESTAMPTZ,
  ADD COLUMN last_error TEXT;

UPDATE public.xapi_outbox SET dedupe_key = id::text WHERE dedupe_key IS NULL;
ALTER TABLE public.xapi_outbox ALTER COLUMN dedupe_key SET NOT NULL;
CREATE UNIQUE INDEX xapi_outbox_org_dedupe_idx ON public.xapi_outbox(org_id, dedupe_key);

CREATE INDEX xapi_outbox_retry_idx
  ON public.xapi_outbox(next_attempt_at, id)
  WHERE status <> 'sent';
