-- Synthetic metadata only; no real file is created/deleted. BEGIN/ROLLBACK required.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000371');
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000379');
SET LOCAL ROLE supabase_auth_admin;
DELETE FROM auth.users WHERE id='00000000-0036-4000-8000-000000000379';
RESET ROLE;
INSERT INTO public.course_imports(id,owner_id,original_filename,storage_path) VALUES
 ('00000000-0036-4000-8000-000000000372','00000000-0036-4000-8000-000000000371','Retained.pdf','00000000-0036-4000-8000-000000000379/course-imports/00000000-0036-4000-8000-000000000372.pdf');
INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at) VALUES
 ('00000000-0036-4000-8000-000000000372','classroom-media','00000000-0036-4000-8000-000000000379/course-imports/00000000-0036-4000-8000-000000000372.pdf',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000373','classroom-media','00000000-0036-4000-8000-000000000371/course-imports/00000000-0036-4000-8000-000000000373.pdf',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000374','classroom-media','00000000-0036-4000-8000-000000000379/course-imports/00000000-0036-4000-8000-000000000374.md',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000375','classroom-media','00000000-0036-4000-8000-000000000379/course-imports/00000000-0036-4000-8000-000000000375.docx',now()-interval '2 hours',now()),
 ('00000000-0036-4000-8000-000000000376','exports','00000000-0036-4000-8000-000000000379/course-imports/00000000-0036-4000-8000-000000000376.pdf',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000377','classroom-media','arbitrary/path.pdf',now()-interval '2 hours',now()-interval '2 hours');
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id='00000000-0036-4000-8000-000000000374')
 OR EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id IN ('00000000-0036-4000-8000-000000000372','00000000-0036-4000-8000-000000000373','00000000-0036-4000-8000-000000000375','00000000-0036-4000-8000-000000000376','00000000-0036-4000-8000-000000000377')) THEN RAISE EXCEPTION 'Import cleanup scope incorrect'; END IF;
 IF has_function_privilege('anon','public.list_orphaned_course_import_files()','EXECUTE') OR has_function_privilege('authenticated','public.list_orphaned_course_import_files()','EXECUTE') THEN RAISE EXCEPTION 'Cleanup exposed to clients'; END IF;
END $$;
RESET ROLE;
-- A restored UUID clears its tombstone; service cannot forge one.
SET LOCAL ROLE supabase_auth_admin;
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000379');
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id='00000000-0036-4000-8000-000000000374') THEN RAISE EXCEPTION 'Restored account selected'; END IF;
 IF has_table_privilege('service_role','qalem_storage_private.deleted_accounts','INSERT') OR has_table_privilege('authenticated','qalem_storage_private.deleted_accounts','SELECT') THEN RAISE EXCEPTION 'Lifecycle privileges exposed'; END IF;
END $$;
RESET ROLE;
-- Removing the file's original account makes its previously unreferenced file eligible.
-- Keep the separate persisted reference under a different account for the retention proof.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000378');
UPDATE public.course_imports SET owner_id='00000000-0036-4000-8000-000000000378' WHERE id='00000000-0036-4000-8000-000000000372';
SET LOCAL ROLE supabase_auth_admin;
DELETE FROM auth.users WHERE id='00000000-0036-4000-8000-000000000371';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id='00000000-0036-4000-8000-000000000373') THEN RAISE EXCEPTION 'Deleted account file not selected'; END IF;
 IF EXISTS(SELECT 1 FROM public.list_orphaned_course_import_files() WHERE object_id='00000000-0036-4000-8000-000000000372') THEN RAISE EXCEPTION 'Reclaimed import selected'; END IF;
END $$;
RESET ROLE;
INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at)
 SELECT ('00000000-0036-4000-8001-'||lpad(n::text,12,'0'))::uuid,'classroom-media',
 '00000000-0036-4000-8000-000000000371/course-imports/00000000-0036-4000-8001-'||lpad(n::text,12,'0')||'.pdf',
 now()-interval '2 hours',now()-interval '2 hours' FROM generate_series(1,101) n;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.list_orphaned_course_import_files())<>100 THEN RAISE EXCEPTION 'Cleanup batch not bounded'; END IF;
END $$;
RESET ROLE;
