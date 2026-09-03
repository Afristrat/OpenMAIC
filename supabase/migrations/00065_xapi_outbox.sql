-- S3-001 — Service-only xAPI outbox and disabled rollout flags.

CREATE TABLE public.xapi_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  statement JSONB NOT NULL CHECK (jsonb_typeof(statement) = 'object'),
  lrs_target TEXT NOT NULL CHECK (char_length(trim(lrs_target)) > 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX xapi_outbox_pending_idx ON public.xapi_outbox(status, created_at)
  WHERE status <> 'sent';

CREATE TRIGGER set_updated_at_xapi_outbox
  BEFORE UPDATE ON public.xapi_outbox
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.xapi_outbox ENABLE ROW LEVEL SECURITY;

INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES
  ('anchoring', false, 'global', 'Planification post-formation opt-in ; activation après validation du ton et des appareils.'),
  ('xapi_emission', false, 'global', 'Émission optionnelle vers le LRS chiffré de chaque organisation.')
ON CONFLICT (flag_name) DO NOTHING;
