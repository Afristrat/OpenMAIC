-- Execute after 20260925120000_classroom_edit_delegations.sql in one transaction.
-- The caller MUST roll back.
INSERT INTO auth.users(id) VALUES
  ('00000000-6032-4000-8000-000000000001'),
  ('00000000-6032-4000-8000-000000000002'),
  ('00000000-6032-4000-8000-000000000003');
INSERT INTO public.profiles(id, nickname) VALUES
  ('00000000-6032-4000-8000-000000000001', 'Formateur A'),
  ('00000000-6032-4000-8000-000000000002', 'Formateur B'),
  ('00000000-6032-4000-8000-000000000003', 'Manager')
ON CONFLICT (id) DO UPDATE SET nickname=EXCLUDED.nickname;
INSERT INTO public.organizations(id, name, seat_limit) VALUES
  ('00000000-6032-4000-8000-000000000010', 'S6032 tenant', 10),
  ('00000000-6032-4000-8000-000000000011', 'S6032 foreign tenant', 10);
INSERT INTO public.org_members(user_id, org_id, role) VALUES
  ('00000000-6032-4000-8000-000000000001', '00000000-6032-4000-8000-000000000010', 'formateur'),
  ('00000000-6032-4000-8000-000000000002', '00000000-6032-4000-8000-000000000010', 'formateur'),
  ('00000000-6032-4000-8000-000000000003', '00000000-6032-4000-8000-000000000010', 'manager');
INSERT INTO public.stages(id, org_id, name) VALUES
  ('s6032-stage', '00000000-6032-4000-8000-000000000010', 'Delegated course'),
  ('s6032-foreign', '00000000-6032-4000-8000-000000000011', 'Foreign course');

INSERT INTO public.classroom_edit_delegations(stage_id, org_id, requester_id)
VALUES ('s6032-stage', '00000000-6032-4000-8000-000000000010', '00000000-6032-4000-8000-000000000001');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.classroom_edit_delegations(stage_id, org_id, requester_id)
    VALUES ('s6032-stage', '00000000-6032-4000-8000-000000000010', '00000000-6032-4000-8000-000000000001');
    RAISE EXCEPTION 'Duplicate pending request accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.classroom_edit_delegations(stage_id, org_id, requester_id)
    VALUES ('s6032-foreign', '00000000-6032-4000-8000-000000000010', '00000000-6032-4000-8000-000000000001');
    RAISE EXCEPTION 'Cross-tenant request accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

UPDATE public.classroom_edit_delegations
SET status='approved',
    decided_by='00000000-6032-4000-8000-000000000003',
    decided_at=now(),
    expires_at=now()+interval '24 hours'
WHERE stage_id='s6032-stage' AND requester_id='00000000-6032-4000-8000-000000000001';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.classroom_edit_delegations delegation
    JOIN public.org_members member
      ON member.org_id=delegation.org_id AND member.user_id=delegation.requester_id
    JOIN public.organizations organization ON organization.id=delegation.org_id
    WHERE delegation.stage_id='s6032-stage' AND delegation.status='approved'
      AND delegation.expires_at>now() AND member.role='formateur'
      AND organization.status='active'
  ) THEN RAISE EXCEPTION 'Approved delegation is not effective';
  END IF;
END $$;

INSERT INTO public.classroom_edit_delegations(stage_id, org_id, requester_id)
VALUES ('s6032-stage', '00000000-6032-4000-8000-000000000010', '00000000-6032-4000-8000-000000000002');
DO $$
BEGIN
  BEGIN
    UPDATE public.classroom_edit_delegations
    SET status='approved',
        decided_by='00000000-6032-4000-8000-000000000003',
        decided_at=now(),
        expires_at=now()+interval '31 days'
    WHERE stage_id='s6032-stage' AND requester_id='00000000-6032-4000-8000-000000000002';
    RAISE EXCEPTION 'Delegation longer than thirty days accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Delegation longer than thirty days accepted' THEN RAISE; END IF;
  END;
END $$;

UPDATE public.classroom_edit_delegations
SET status='revoked',
    revoked_by='00000000-6032-4000-8000-000000000003',
    revoked_at=now()
WHERE stage_id='s6032-stage' AND requester_id='00000000-6032-4000-8000-000000000001';

DO $$
DECLARE privilege_name TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.classroom_edit_delegations
    WHERE stage_id='s6032-stage' AND requester_id='00000000-6032-4000-8000-000000000001'
      AND status='approved'
  ) THEN RAISE EXCEPTION 'Revoked delegation remains approved';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.classroom_edit_delegations'::regclass) THEN
    RAISE EXCEPTION 'RLS is disabled';
  END IF;
  FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('authenticated','public.classroom_edit_delegations',privilege_name) THEN
      RAISE EXCEPTION 'Authenticated role retains privilege %', privilege_name;
    END IF;
  END LOOP;
END $$;

SELECT 'S6032_CLASSROOM_EDIT_DELEGATIONS_PROOF_OK';
