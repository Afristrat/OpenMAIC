-- Diwan + source erasure + course erasure candidates, supabase_admin, BEGIN/ROLLBACK only.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000141'),
 ('00000000-0036-4000-8000-000000000142'),
 ('00000000-0036-4000-8000-000000000143');
DO $$
DECLARE
 a uuid := '00000000-0036-4000-8000-000000000141';
 b uuid := '00000000-0036-4000-8000-000000000142';
 c uuid := '00000000-0036-4000-8000-000000000143';
 org uuid := '00000000-0036-4000-8000-000000000144';
 import_id uuid;
 manifest_id uuid;
 course_id uuid;
 draft_id uuid;
 result jsonb;
BEGIN
 INSERT INTO public.organizations(id,name,status,seat_limit) VALUES(org,'S036 course rollback','active',3);
 INSERT INTO public.org_members(user_id,org_id,role) VALUES(a,org,'admin'),(b,org,'admin'),(c,org,'apprenant');
 INSERT INTO public.stages(id,owner_id,org_id,name) VALUES('s036-course-reclaim',a,org,'Test');
 INSERT INTO public.course_imports(owner_id,original_filename,storage_path)
   VALUES(a,'test.txt','s036-rollback/test.txt') RETURNING id INTO import_id;
 INSERT INTO public.formation_source_manifests(owner_id,org_id,version) VALUES(a,org,1) RETURNING id INTO manifest_id;
 INSERT INTO public.courses(owner_id,org_id,stage_id,title,language,source_kind,import_id,source_manifest_id,status)
   VALUES(a,org,'s036-course-reclaim','Test','fr-FR','imported',import_id,manifest_id,'ready') RETURNING id INTO course_id;
 INSERT INTO public.courses(owner_id,org_id,title,language,source_kind,status)
   VALUES(a,org,'Orphaned draft','fr-FR','generated','draft') RETURNING id INTO draft_id;
 BEGIN
   PERFORM public.reclaim_orphaned_course(b,course_id);
   RAISE EXCEPTION 'Live owner takeover accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id=a;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course_id AND owner_id IS NULL AND source_kind='imported')
   OR NOT EXISTS(SELECT 1 FROM public.course_imports WHERE id=import_id AND owner_id IS NULL)
 THEN RAISE EXCEPTION 'Course or import not preserved'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF (SELECT count(*) FROM public.courses WHERE org_id=org AND owner_id IS NULL AND id IN(course_id,draft_id))<>2
 THEN RAISE EXCEPTION 'Admin cannot discover ready course and draft via RLS'; END IF;
 IF EXISTS(SELECT 1 FROM public.courses WHERE org_id='00000000-0036-4000-8000-000000000145' AND owner_id IS NULL AND id IN(course_id,draft_id))
 THEN RAISE EXCEPTION 'Tenant filter ineffective'; END IF;
 RESET ROLE;
 BEGIN
   PERFORM public.reclaim_orphaned_course(c,course_id);
   RAISE EXCEPTION 'Learner takeover accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SET LOCAL ROLE service_role;
 result := public.reclaim_orphaned_course(b,course_id);
 IF result IS DISTINCT FROM public.reclaim_orphaned_course(b,course_id) THEN
   RAISE EXCEPTION 'Retry created another manifest';
 END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course_id AND owner_id=b AND source_manifest_id=(result->>'sourceManifestId')::uuid)
   OR NOT EXISTS(SELECT 1 FROM public.course_imports WHERE id=import_id AND owner_id=b)
   OR NOT EXISTS(SELECT 1 FROM public.formation_source_manifests WHERE id=manifest_id AND owner_id IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.formation_source_manifests WHERE id=(result->>'sourceManifestId')::uuid AND owner_id=b AND org_id=org)
   OR NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-course-reclaim' AND owner_id=b)
 THEN RAISE EXCEPTION 'Takeover incomplete'; END IF;
 IF has_function_privilege('authenticated','public.reclaim_orphaned_course(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Privileged takeover exposed'; END IF;
END; $$;
