-- Preserve every persisted import, including tenant-held and reclaimed documents.
-- Auth emits the deletion fact transactionally; the service gains no auth.users access.
CREATE SCHEMA qalem_storage_private;
REVOKE ALL ON SCHEMA qalem_storage_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA qalem_storage_private TO service_role,supabase_auth_admin;
CREATE TABLE qalem_storage_private.deleted_accounts (
 account_hash text PRIMARY KEY CHECK (account_hash ~ '^[0-9a-f]{64}$'),
 deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE qalem_storage_private.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qalem_storage_private.deleted_accounts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON qalem_storage_private.deleted_accounts TO service_role;
GRANT SELECT,INSERT,DELETE ON qalem_storage_private.deleted_accounts TO supabase_auth_admin;
CREATE POLICY auth_lifecycle ON qalem_storage_private.deleted_accounts TO supabase_auth_admin USING (true) WITH CHECK (true);
CREATE FUNCTION qalem_storage_private.record_account_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  INSERT INTO qalem_storage_private.deleted_accounts(account_hash)
   VALUES (encode(sha256(convert_to(OLD.id::text,'UTF8')),'hex')) ON CONFLICT DO NOTHING;
  RETURN OLD;
 END IF;
 -- Restoring the same UUID must not leave an active account marked as deleted.
 DELETE FROM qalem_storage_private.deleted_accounts
  WHERE account_hash=encode(sha256(convert_to(NEW.id::text,'UTF8')),'hex');
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION qalem_storage_private.record_account_lifecycle() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER record_storage_account_lifecycle AFTER INSERT OR DELETE ON auth.users
 FOR EACH ROW EXECUTE FUNCTION qalem_storage_private.record_account_lifecycle();

-- The existing UNIQUE(storage_path) index supports the reference check.
CREATE FUNCTION public.list_orphaned_course_import_files()
RETURNS TABLE(object_id uuid, object_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT o.id,o.name FROM storage.objects o
 CROSS JOIN LATERAL regexp_match(o.name,
  '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/course-imports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](md|docx|pdf)$') AS matched(parts)
 WHERE o.bucket_id='classroom-media' AND matched.parts IS NOT NULL
 AND o.created_at < now()-interval '1 hour' AND o.updated_at < now()-interval '1 hour'
 AND EXISTS(SELECT 1 FROM qalem_storage_private.deleted_accounts d
  WHERE d.account_hash=encode(sha256(convert_to((matched.parts)[1],'UTF8')),'hex'))
 AND NOT EXISTS(SELECT 1 FROM public.course_imports i WHERE i.storage_path=o.name)
 ORDER BY o.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.list_orphaned_course_import_files() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphaned_course_import_files() TO service_role;
