-- Usage is server-only. RLS alone does not revoke privileges such as TRUNCATE,
-- and an owner-privileged view must not bypass the underlying table's policy.
ALTER VIEW public.usage_summary SET (security_invoker = true);
REVOKE ALL ON public.usage_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.usage_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.usage_summary TO service_role;

-- The helper only reads the caller's memberships; it needs no owner privilege.
-- All referenced tables/auth functions are already explicitly schema-qualified.
ALTER FUNCTION public.get_user_org_ids() SECURITY INVOKER;
ALTER FUNCTION public.get_user_org_ids() SET search_path = '';
REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated, service_role;

-- Existing scene triggers keep their identity and timestamp semantics.
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
