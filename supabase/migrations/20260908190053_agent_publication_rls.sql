-- U-011: direct Data API access obeys the same tenant/owner boundary as the API.
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_configs FROM anon;
-- RLS does not protect TRUNCATE; application users need row operations only.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.agent_configs FROM authenticated;
-- agent_configs invokes this trigger on publication and withdrawal.
-- Its body uses only NEW and pg_catalog.now(), with no application lookup.
ALTER FUNCTION public.handle_updated_at() SET search_path = pg_catalog;

ALTER POLICY agent_configs_select_own ON public.agent_configs TO authenticated
  USING (owner_id = (SELECT auth.uid()));
ALTER POLICY agent_configs_select_published ON public.agent_configs TO authenticated
  USING (is_published = true);
ALTER POLICY agent_configs_delete_own ON public.agent_configs TO authenticated
  USING (owner_id = (SELECT auth.uid()));

ALTER POLICY agent_configs_insert_own ON public.agent_configs TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.org_members AS membership
      JOIN public.organizations AS tenant ON tenant.id = membership.org_id
      WHERE membership.org_id = agent_configs.org_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role IN ('admin', 'manager', 'author')
        AND tenant.status = 'active'
    )
  );

ALTER POLICY agent_configs_update_own ON public.agent_configs TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      NOT COALESCE(is_published, false)
      OR EXISTS (
        SELECT 1 FROM public.org_members AS membership
        JOIN public.organizations AS tenant ON tenant.id = membership.org_id
        WHERE membership.org_id = agent_configs.org_id
          AND membership.user_id = (SELECT auth.uid())
          AND membership.role IN ('admin', 'manager', 'author')
          AND tenant.status = 'active'
      )
    )
  );

-- No reassignment of identity or tenant through UPDATE, including on a withdrawn row.
-- Preserve the existing editable profile/review fields; privileged maintenance is unaffected.
REVOKE UPDATE ON public.agent_configs FROM authenticated;
REVOKE UPDATE (id, owner_id, org_id) ON public.agent_configs FROM authenticated;
GRANT UPDATE (
  name, role, persona, avatar, color, priority, allowed_actions, voice_config,
  is_published, created_at, updated_at, usage_count, avg_rating, tags, description,
  profile_extensions
) ON public.agent_configs TO authenticated;
