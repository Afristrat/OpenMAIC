-- Run with the candidate function inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000351'),('00000000-0036-4000-8000-000000000352');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0036-4000-8000-000000000353','Import proof',10);
INSERT INTO public.org_members(org_id,user_id,role) VALUES ('00000000-0036-4000-8000-000000000353','00000000-0036-4000-8000-000000000351','formateur');
INSERT INTO public.course_imports(id,owner_id,original_filename,storage_path,validation_status) VALUES
 ('00000000-0036-4000-8000-000000000354','00000000-0036-4000-8000-000000000351','Proof.pdf','00000000-0036-4000-8000-000000000352/course-imports/00000000-0036-4000-8000-000000000354.pdf','conform');
INSERT INTO public.courses(id,owner_id,org_id,title,language,source_kind,import_id,status) VALUES
 ('00000000-0036-4000-8000-000000000355','00000000-0036-4000-8000-000000000351','00000000-0036-4000-8000-000000000353','Proof','fr-FR','imported','00000000-0036-4000-8000-000000000354','draft');
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '00000000-0036-4000-8000-000000000351'; item uuid := '00000000-0036-4000-8000-000000000354'; result jsonb;
BEGIN
 result:=public.read_account_import_download(actor,item);
 IF result->>'id' IS DISTINCT FROM item::text THEN RAISE EXCEPTION 'Owned import missing'; END IF;
 IF result->>'storagePath' NOT LIKE '00000000-0036-4000-8000-000000000352/%' THEN RAISE EXCEPTION 'Old path lost'; END IF;
 IF public.read_account_import_download('00000000-0036-4000-8000-000000000352',item) IS NOT NULL THEN RAISE EXCEPTION 'Path prefix granted ownership'; END IF;
 UPDATE public.organizations SET status='suspended' WHERE id='00000000-0036-4000-8000-000000000353';
 IF public.read_account_import_download(actor,item) IS NOT NULL THEN RAISE EXCEPTION 'Suspension bypass'; END IF;
 UPDATE public.organizations SET status='active' WHERE id='00000000-0036-4000-8000-000000000353';
 DELETE FROM public.org_members WHERE user_id=actor;
 IF public.read_account_import_download(actor,item) IS NOT NULL THEN RAISE EXCEPTION 'Membership bypass'; END IF;
 IF has_function_privilege('authenticated','public.read_account_import_download(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.read_account_import_download(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Actor spoofing exposed'; END IF;
END $$;
RESET ROLE;
