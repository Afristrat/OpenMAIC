-- Misc indexes for query performance
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.org_invitations(org_id);
