-- Qalem S4-008 — an author may design and generate organization classrooms.
ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_role_check;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('admin', 'manager', 'author', 'formateur', 'apprenant'));
