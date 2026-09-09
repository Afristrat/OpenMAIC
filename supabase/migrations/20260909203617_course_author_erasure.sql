ALTER TABLE public.courses
  ALTER COLUMN owner_id DROP NOT NULL,
  DROP CONSTRAINT courses_owner_id_fkey,
  ADD CONSTRAINT courses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.course_imports
  ALTER COLUMN owner_id DROP NOT NULL,
  DROP CONSTRAINT course_imports_owner_id_fkey,
  ADD CONSTRAINT course_imports_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE FUNCTION public.require_course_import_author()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.owner_id IS NULL THEN RAISE EXCEPTION 'COURSE_IMPORT_AUTHOR_REQUIRED'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.require_course_import_author() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_course_import_author BEFORE INSERT ON public.course_imports
 FOR EACH ROW EXECUTE FUNCTION public.require_course_import_author();

CREATE OR REPLACE FUNCTION public.assert_course_tenant_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stage_org_id uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
   AND (to_jsonb(NEW)-'owner_id')=(to_jsonb(OLD)-'owner_id')
   AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.owner_id)
 THEN RETURN NEW; END IF;
 IF NEW.owner_id IS NULL THEN RAISE EXCEPTION 'COURSE_AUTHOR_REQUIRED'; END IF;
 IF NEW.org_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.org_members WHERE org_id=NEW.org_id AND user_id=NEW.owner_id
 ) THEN RAISE EXCEPTION 'Course owner is not a member of the organization'; END IF;
 IF NEW.stage_id IS NOT NULL THEN
   SELECT org_id INTO stage_org_id FROM public.stages WHERE id=NEW.stage_id;
   IF stage_org_id IS DISTINCT FROM NEW.org_id THEN
     RAISE EXCEPTION 'Course and classroom must belong to the same organization';
   END IF;
 END IF;
 IF NEW.import_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.course_imports WHERE id=NEW.import_id AND owner_id=NEW.owner_id
 ) THEN RAISE EXCEPTION 'Course import does not belong to the course owner'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.assert_course_tenant_integrity() FROM PUBLIC, anon, authenticated;

-- The server supplies the verified actor. No takeover of another live author's course.
CREATE FUNCTION public.reclaim_orphaned_course(p_actor uuid, p_course uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 target public.courses;
 original_manifest public.formation_source_manifests;
 replacement public.formation_source_manifests;
BEGIN
 SELECT * INTO target FROM public.courses WHERE id=p_course FOR UPDATE;
 IF NOT FOUND OR target.org_id IS NULL THEN
   RAISE EXCEPTION 'COURSE_RECLAIM_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
   WHERE m.org_id=target.org_id AND m.user_id=p_actor AND m.role='admin' AND o.status='active'
   FOR SHARE OF m,o;
 IF NOT FOUND THEN RAISE EXCEPTION 'COURSE_RECLAIM_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF target.owner_id=p_actor THEN
   RETURN jsonb_build_object('courseId',target.id,'sourceManifestId',target.source_manifest_id);
 END IF;
 IF target.owner_id IS NOT NULL THEN
   RAISE EXCEPTION 'COURSE_ALREADY_OWNED' USING ERRCODE='42501';
 END IF;
 IF target.import_id IS NOT NULL THEN
   UPDATE public.course_imports SET owner_id=p_actor WHERE id=target.import_id AND owner_id IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'COURSE_IMPORT_ALREADY_OWNED' USING ERRCODE='42501'; END IF;
 END IF;
 IF target.source_manifest_id IS NOT NULL THEN
   SELECT * INTO original_manifest FROM public.formation_source_manifests
     WHERE id=target.source_manifest_id AND org_id=target.org_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'COURSE_MANIFEST_UNAVAILABLE'; END IF;
   SELECT * INTO replacement FROM public.replace_formation_source_manifest(
     target.org_id,p_actor,original_manifest.source_ids,NULL,original_manifest.diwan_references);
 END IF;
 UPDATE public.courses SET owner_id=p_actor,
   source_manifest_id=COALESCE(replacement.id,target.source_manifest_id) WHERE id=target.id;
 UPDATE public.stages SET owner_id=p_actor
   WHERE id=target.stage_id AND org_id=target.org_id AND owner_id IS NULL;
 RETURN jsonb_build_object('courseId',target.id,'sourceManifestId',COALESCE(replacement.id,target.source_manifest_id));
END; $$;
REVOKE ALL ON FUNCTION public.reclaim_orphaned_course(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_orphaned_course(uuid,uuid) TO service_role;
