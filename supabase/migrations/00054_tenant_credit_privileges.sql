-- S6-023 — RLS is the row boundary; table grants are the operation boundary.
-- Authenticated tenant administrators may read through the SELECT policies,
-- while every mutation remains confined to service-only RPCs.

REVOKE ALL ON TABLE public.tenant_credit_wallets FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_credit_ledger FROM anon, authenticated;
GRANT SELECT ON TABLE public.tenant_credit_wallets TO authenticated;
GRANT SELECT ON TABLE public.tenant_credit_ledger TO authenticated;
