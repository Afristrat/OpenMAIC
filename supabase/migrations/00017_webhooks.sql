-- Webhook system tables for PaaS layer
-- Allows organizations to register HTTP endpoints for event notifications.

CREATE TABLE public.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage webhooks" ON public.webhook_configs
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = webhook_configs.org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'manager')
  ));

-- ---------------------------------------------------------------------------

CREATE TABLE public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.webhook_configs(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB,
  status_code INTEGER,
  response_body TEXT,
  attempt INTEGER DEFAULT 1,
  delivered_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view deliveries" ON public.webhook_deliveries
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.webhook_configs wc
    JOIN public.org_members om ON om.org_id = wc.org_id
    WHERE wc.id = webhook_deliveries.webhook_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'manager')
  ));
