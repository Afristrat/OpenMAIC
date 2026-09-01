-- S6-022 — audit rows must outlive tenant deletion. A foreign key cannot do so
-- safely because cascading invitation/member deletes emit audit rows while the
-- parent organization is already being removed by the same statement.

ALTER TABLE public.tenant_admin_audit
  DROP CONSTRAINT tenant_admin_audit_tenant_id_fkey;
