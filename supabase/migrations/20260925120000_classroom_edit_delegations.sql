-- Per-classroom, time-limited edit delegations requested by tenant trainers.
-- The table is server-only: every transition is authorized by the API and
-- revalidated here against the current tenant membership.

CREATE TABLE public.classroom_edit_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classroom_edit_delegations_stage_tenant_fkey
    FOREIGN KEY (stage_id, org_id)
    REFERENCES public.stages(id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT classroom_edit_delegations_decision_shape CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL AND expires_at IS NULL
      AND revoked_by IS NULL AND revoked_at IS NULL)
    OR (status = 'approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      AND expires_at IS NOT NULL AND revoked_by IS NULL AND revoked_at IS NULL)
    OR (status = 'rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      AND expires_at IS NULL AND revoked_by IS NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      AND expires_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX classroom_edit_delegations_one_pending
  ON public.classroom_edit_delegations(stage_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX classroom_edit_delegations_active_lookup
  ON public.classroom_edit_delegations(stage_id, requester_id, expires_at DESC)
  WHERE status = 'approved';

CREATE INDEX classroom_edit_delegations_management
  ON public.classroom_edit_delegations(org_id, stage_id, requested_at DESC);

CREATE OR REPLACE FUNCTION public.validate_classroom_edit_delegation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_role TEXT;
  requester_tenant_status TEXT;
  decision_role TEXT;
  decision_tenant_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.stage_id, NEW.org_id, NEW.requester_id, NEW.requested_at)
      IS DISTINCT FROM (OLD.stage_id, OLD.org_id, OLD.requester_id, OLD.requested_at) THEN
      RAISE EXCEPTION 'Classroom edit delegation identity is immutable';
    END IF;
    IF OLD.status = 'pending' AND NEW.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Pending delegation can only be approved or rejected';
    ELSIF OLD.status = 'approved' AND NEW.status <> 'revoked' THEN
      RAISE EXCEPTION 'Approved delegation can only be revoked';
    ELSIF OLD.status IN ('rejected', 'revoked') THEN
      RAISE EXCEPTION 'Terminal delegation cannot be changed';
    END IF;
  END IF;

  SELECT member.role, organization.status
    INTO requester_role, requester_tenant_status
  FROM public.org_members AS member
  JOIN public.organizations AS organization ON organization.id = member.org_id
  WHERE member.org_id = NEW.org_id AND member.user_id = NEW.requester_id;

  IF requester_role IS DISTINCT FROM 'formateur' OR requester_tenant_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Requester must be an active tenant trainer';
  END IF;

  IF NEW.status IN ('approved', 'rejected', 'revoked') THEN
    SELECT member.role, organization.status
      INTO decision_role, decision_tenant_status
    FROM public.org_members AS member
    JOIN public.organizations AS organization ON organization.id = member.org_id
    WHERE member.org_id = NEW.org_id
      AND member.user_id = CASE WHEN NEW.status = 'revoked' THEN NEW.revoked_by ELSE NEW.decided_by END;

    IF decision_role NOT IN ('admin', 'manager') OR decision_tenant_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Decision actor must be an active tenant administrator or manager';
    END IF;
  END IF;

  IF NEW.status IN ('approved', 'revoked') AND (
    NEW.expires_at <= NEW.decided_at OR NEW.expires_at > NEW.decided_at + INTERVAL '30 days'
  ) THEN
    RAISE EXCEPTION 'Delegation duration must be greater than zero and at most 30 days';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_classroom_edit_delegation
  BEFORE INSERT OR UPDATE ON public.classroom_edit_delegations
  FOR EACH ROW EXECUTE FUNCTION public.validate_classroom_edit_delegation();

ALTER TABLE public.classroom_edit_delegations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classroom_edit_delegations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.classroom_edit_delegations TO service_role;

COMMENT ON TABLE public.classroom_edit_delegations IS
  'Audited, per-classroom edit requests and time-limited trainer delegations; server-only.';
