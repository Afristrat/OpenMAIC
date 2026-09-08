-- S-034: server-managed bindings. Legacy registrations remain unbound until
-- explicitly assigned; never infer a tenant or account from an LMS email.
ALTER TABLE public.lti_registrations
  ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT lti_registration_tenant_key UNIQUE (client_id, org_id);

ALTER TABLE public.stages ADD CONSTRAINT lti_stage_tenant_key UNIQUE (id, org_id);

CREATE TABLE public.lti_resource_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  resource_link_id TEXT NOT NULL CHECK (length(resource_link_id) BETWEEN 1 AND 4096),
  stage_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, resource_link_id),
  UNIQUE (id, client_id, org_id),
  FOREIGN KEY (client_id, org_id) REFERENCES public.lti_registrations(client_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id, org_id) REFERENCES public.stages(id, org_id) ON DELETE CASCADE
);
CREATE INDEX lti_resource_stage_idx ON public.lti_resource_bindings(stage_id, org_id);

CREATE TABLE public.lti_user_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  lms_subject TEXT NOT NULL CHECK (length(lms_subject) BETWEEN 1 AND 4096),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, lms_subject),
  UNIQUE (id, client_id, org_id),
  FOREIGN KEY (client_id, org_id) REFERENCES public.lti_registrations(client_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, org_id) REFERENCES public.org_members(user_id, org_id) ON DELETE CASCADE
);
CREATE INDEX lti_user_membership_idx ON public.lti_user_bindings(user_id, org_id);

CREATE TABLE public.lti_launch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  client_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  resource_binding_id UUID NOT NULL,
  user_binding_id UUID NOT NULL,
  line_item_url TEXT CHECK (line_item_url IS NULL OR length(line_item_url) BETWEEN 1 AND 4096),
  ags_scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
  FOREIGN KEY (resource_binding_id, client_id, org_id) REFERENCES public.lti_resource_bindings(id, client_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (user_binding_id, client_id, org_id) REFERENCES public.lti_user_bindings(id, client_id, org_id) ON DELETE CASCADE
);
CREATE INDEX lti_launch_resource_idx ON public.lti_launch_sessions(resource_binding_id, client_id, org_id);
CREATE INDEX lti_launch_user_idx ON public.lti_launch_sessions(user_binding_id, client_id, org_id);
CREATE INDEX lti_launch_expiry_idx ON public.lti_launch_sessions(expires_at);

ALTER TABLE public.lti_resource_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_user_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_launch_sessions ENABLE ROW LEVEL SECURITY;

-- No browser operation on trust bindings or session capabilities. Backend
-- routes must authenticate and authorize before using the service client.
REVOKE ALL ON public.lti_resource_bindings, public.lti_user_bindings,
  public.lti_launch_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.lti_resource_bindings, public.lti_user_bindings,
  public.lti_launch_sessions FROM service_role;
-- Rebinding means delete + insert: cascading invalidation prevents an old
-- launch from silently acquiring a different classroom or LMS identity.
GRANT SELECT, INSERT, DELETE ON public.lti_resource_bindings,
  public.lti_user_bindings, public.lti_launch_sessions TO service_role;

-- Existing tables also had broad default grants despite deny-all policies.
REVOKE ALL ON public.lti_registrations, public.lti_nonces,
  public.lti_grade_submissions FROM PUBLIC, anon, authenticated;
