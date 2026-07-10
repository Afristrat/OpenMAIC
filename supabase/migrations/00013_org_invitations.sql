CREATE TABLE public.org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role TEXT NOT NULL DEFAULT 'apprenant',
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage invitations" ON public.org_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = org_invitations.org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );
