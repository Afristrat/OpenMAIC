-- Historical imports remain unclassified, never guessed from filenames or the owner.
-- No FK: provenance survives organization deletion, like certificate issuance_org_id.
ALTER TABLE public.course_imports ADD COLUMN source_org_id uuid;
CREATE FUNCTION qalem_storage_private.guard_import_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.source_org_id IS DISTINCT FROM OLD.source_org_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
   RAISE EXCEPTION 'IMPORT_PROVENANCE_IMMUTABLE';
  END IF;
  IF NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.owner_id) THEN RETURN NEW; END IF;
 END IF;
 IF NEW.source_org_id IS NULL OR NEW.owner_id IS NULL THEN RAISE EXCEPTION 'IMPORT_PROVENANCE_REQUIRED'; END IF;
 PERFORM 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
 WHERE m.org_id=NEW.source_org_id AND m.user_id=NEW.owner_id AND o.status='active'
 AND m.role IN ('admin','manager','formateur') FOR SHARE OF m,o;
 IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_TENANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION qalem_storage_private.guard_import_provenance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_import_provenance BEFORE INSERT OR UPDATE ON public.course_imports
 FOR EACH ROW EXECUTE FUNCTION qalem_storage_private.guard_import_provenance();

CREATE FUNCTION qalem_storage_private.guard_course_import_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.import_id IS NOT DISTINCT FROM OLD.import_id AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.org_id IS NULL AND OLD.org_id IS NOT NULL
  AND NEW.import_id IS NOT DISTINCT FROM OLD.import_id
  AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.org_id) THEN RETURN NEW; END IF;
 IF NEW.import_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.course_imports i WHERE i.id=NEW.import_id AND i.source_org_id=NEW.org_id) THEN
  RAISE EXCEPTION 'COURSE_IMPORT_TENANT_MISMATCH';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION qalem_storage_private.guard_course_import_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_course_import_tenant BEFORE INSERT OR UPDATE OF import_id,org_id ON public.courses
 FOR EACH ROW EXECUTE FUNCTION qalem_storage_private.guard_course_import_tenant();

DROP POLICY course_imports_select_owner ON public.course_imports;
CREATE POLICY course_imports_select_owner ON public.course_imports FOR SELECT TO authenticated
 USING (owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id WHERE m.org_id=source_org_id AND m.user_id=(SELECT auth.uid()) AND o.status='active'));

CREATE OR REPLACE FUNCTION public.read_account_import_download(p_actor uuid, p_import uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'storagePath',t.storage_path)
 FROM public.course_imports t WHERE t.id=p_import AND t.owner_id=p_actor
 AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id WHERE m.org_id=t.source_org_id AND m.user_id=p_actor AND o.status='active')
 AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.import_id=t.id AND c.org_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id WHERE m.org_id=c.org_id AND m.user_id=p_actor AND o.status='active'));
$$;
REVOKE ALL ON FUNCTION public.read_account_import_download(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_import_download(uuid,uuid) TO service_role;

-- A retained import becomes disposable only after BOTH author and organization
-- have disappeared, with no course reference. Unknown historical provenance stays intact.
CREATE OR REPLACE FUNCTION public.list_orphaned_course_import_files()
RETURNS TABLE(object_id uuid, object_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT o.id,o.name FROM storage.objects o
 CROSS JOIN LATERAL regexp_match(o.name,
 '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/course-imports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](md|docx|pdf)$') AS matched(parts)
 WHERE o.bucket_id='classroom-media' AND matched.parts IS NOT NULL
 AND o.created_at<now()-interval '1 hour' AND o.updated_at<now()-interval '1 hour'
 AND (
  (NOT EXISTS(SELECT 1 FROM public.course_imports i WHERE i.storage_path=o.name)
   AND EXISTS(SELECT 1 FROM qalem_storage_private.deleted_accounts d WHERE d.account_hash=encode(sha256(convert_to((matched.parts)[1],'UTF8')),'hex')))
  OR EXISTS(SELECT 1 FROM public.course_imports i WHERE i.storage_path=o.name AND i.owner_id IS NULL
   AND i.source_org_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organizations org WHERE org.id=i.source_org_id)
   AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.import_id=i.id))
 ) ORDER BY o.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.list_orphaned_course_import_files() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphaned_course_import_files() TO service_role;

CREATE FUNCTION public.purge_detached_course_import_records()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE removed integer;
BEGIN
 WITH pending AS (
  SELECT i.id FROM public.course_imports i WHERE i.owner_id IS NULL AND i.source_org_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.organizations org WHERE org.id=i.source_org_id)
  AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.import_id=i.id)
  AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='classroom-media' AND o.name=i.storage_path)
  ORDER BY i.id LIMIT 100 FOR UPDATE OF i SKIP LOCKED
 ) DELETE FROM public.course_imports i USING pending WHERE i.id=pending.id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END; $$;
REVOKE ALL ON FUNCTION public.purge_detached_course_import_records() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_detached_course_import_records() TO service_role;
