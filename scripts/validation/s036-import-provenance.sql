-- Candidate course-author erasure, export, Storage schema and provenance required. ROLLBACK only.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000391');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0036-4000-8000-000000000393','Import source',10),('00000000-0036-4000-8000-000000000394','Other tenant',10);
INSERT INTO public.org_members(org_id,user_id,role) VALUES
 ('00000000-0036-4000-8000-000000000393','00000000-0036-4000-8000-000000000391','formateur'),
 ('00000000-0036-4000-8000-000000000394','00000000-0036-4000-8000-000000000391','formateur');
INSERT INTO public.course_imports(id,owner_id,source_org_id,original_filename,storage_path,validation_status) VALUES
 ('00000000-0036-4000-8000-000000000395','00000000-0036-4000-8000-000000000391','00000000-0036-4000-8000-000000000393','Rejected.pdf','00000000-0036-4000-8000-000000000391/course-imports/00000000-0036-4000-8000-000000000395.pdf','rejected'),
 ('00000000-0036-4000-8000-000000000396','00000000-0036-4000-8000-000000000391','00000000-0036-4000-8000-000000000393','Absent.pdf','00000000-0036-4000-8000-000000000391/course-imports/00000000-0036-4000-8000-000000000396.pdf','rejected');
-- Metadata fixture only, no physical file exists or is removed by SQL.
INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at) VALUES
 ('00000000-0036-4000-8000-000000000395','classroom-media','00000000-0036-4000-8000-000000000391/course-imports/00000000-0036-4000-8000-000000000395.pdf',now()-interval '2 hours',now()-interval '2 hours');
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '00000000-0036-4000-8000-000000000391'; item uuid := '00000000-0036-4000-8000-000000000395';
BEGIN
 IF public.read_account_import_download(actor,item) IS NULL OR jsonb_array_length(public.read_account_export_page(actor,'course_imports'))<>2 THEN RAISE EXCEPTION 'Rejected tenant import inaccessible'; END IF;
 BEGIN
  UPDATE public.course_imports SET source_org_id='00000000-0036-4000-8000-000000000394' WHERE id=item;
  RAISE EXCEPTION 'Changed provenance accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  UPDATE public.course_imports SET storage_path='another/path' WHERE id=item;
  RAISE EXCEPTION 'Changed path accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  INSERT INTO public.courses(owner_id,org_id,title,language,source_kind,import_id,status)
  VALUES(actor,'00000000-0036-4000-8000-000000000394','Cross tenant','fr-FR','imported',item,'draft');
  RAISE EXCEPTION 'Cross tenant import accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 DELETE FROM public.org_members WHERE user_id=actor AND org_id='00000000-0036-4000-8000-000000000393';
 IF public.read_account_import_download(actor,item) IS NOT NULL OR public.read_account_export_page(actor,'course_imports')<>'[]'::jsonb THEN RAISE EXCEPTION 'Former member accessed unlinked import'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claims='{"sub":"00000000-0036-4000-8000-000000000391","role":"authenticated"}';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.course_imports WHERE id='00000000-0036-4000-8000-000000000395') THEN RAISE EXCEPTION 'RLS bypass'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE supabase_auth_admin;
SET LOCAL request.jwt.claims='{}';
DELETE FROM auth.users WHERE id='00000000-0036-4000-8000-000000000391';
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.course_imports WHERE id='00000000-0036-4000-8000-000000000395' AND owner_id IS NULL AND source_org_id='00000000-0036-4000-8000-000000000393') THEN RAISE EXCEPTION 'Tenant provenance lost on account deletion'; END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id='00000000-0036-4000-8000-000000000395') OR public.purge_detached_course_import_records()<>0 THEN RAISE EXCEPTION 'Live tenant lost its import'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.organizations WHERE id='00000000-0036-4000-8000-000000000393';
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id='00000000-0036-4000-8000-000000000395') THEN RAISE EXCEPTION 'Detached file not selected'; END IF;
 IF public.purge_detached_course_import_records()<>1 THEN RAISE EXCEPTION 'Missing object record not removed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_imports WHERE id='00000000-0036-4000-8000-000000000395') THEN RAISE EXCEPTION 'Record removed before Storage'; END IF;
END $$;
RESET ROLE;
