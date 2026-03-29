-- Allow org members to read profiles of co-members in the same organization.
-- This policy is OR'd with the existing "own profile" policy.
CREATE POLICY "profiles_select_org_comember"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om1
      JOIN public.org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id
    )
  );
