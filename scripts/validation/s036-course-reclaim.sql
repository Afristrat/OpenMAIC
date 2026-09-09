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
 source_id uuid;
 course_id uuid;
 draft_id uuid;
 result jsonb;
 saved_outline jsonb := '{"scenes":[],"plan":{"courseTitle":"Test","languageDirective":"Français","syllabus":{"audience":"Adultes","prerequisites":"Aucun","overallObjective":"Décider","learningObjectives":["Comparer"],"totalDurationMinutes":15,"deliveryMode":"Classe","assessmentStrategy":"Cas","expectedDeliverable":"Décision"},"outlines":[{"id":"one","type":"slide","title":"Cas","description":"Décider","keyPoints":["Comparer"],"order":1}]}}';
BEGIN
 INSERT INTO public.organizations(id,name,status,seat_limit) VALUES(org,'S036 course rollback','active',3);
 INSERT INTO public.org_members(user_id,org_id,role) VALUES(a,org,'admin'),(b,org,'admin'),(c,org,'apprenant');
 INSERT INTO public.stages(id,owner_id,org_id,name) VALUES('s036-course-reclaim',a,org,'Test');
 INSERT INTO public.course_imports(owner_id,original_filename,storage_path,validation_status)
   VALUES(a,'canvas.md','s036-rollback/canvas.md','conform') RETURNING id INTO import_id;
 INSERT INTO public.organization_sources(org_id,owner_id,name,mime_type,size_bytes,content_hash,parser_id,text_content)
   VALUES(org,a,'canvas.md','text/markdown',4,repeat('b',64),'test','Retained canvas') RETURNING id INTO source_id;
 INSERT INTO public.formation_source_manifests(owner_id,org_id,version,source_ids) VALUES(a,org,1,ARRAY[source_id]) RETURNING id INTO manifest_id;
 INSERT INTO public.courses(owner_id,org_id,stage_id,title,language,source_kind,import_id,source_manifest_id,status)
   VALUES(a,org,'s036-course-reclaim','Test','fr-FR','imported',import_id,manifest_id,'ready') RETURNING id INTO course_id;
 INSERT INTO public.courses(owner_id,org_id,title,language,source_kind,status,outline)
   VALUES(a,org,'Orphaned draft','fr-FR','generated','draft',saved_outline) RETURNING id INTO draft_id;
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
 PERFORM public.reclaim_orphaned_course(b,draft_id);
 IF result IS DISTINCT FROM public.reclaim_orphaned_course(b,course_id) THEN
   RAISE EXCEPTION 'Retry created another manifest';
 END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=draft_id AND owner_id=b AND outline=saved_outline)
 THEN RAISE EXCEPTION 'Saved plan lost during takeover'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE org_id=org AND (owner_id IS NULL OR (owner_id=b AND status='draft')) AND id=draft_id)
 THEN RAISE EXCEPTION 'Owned draft lost from resume list'; END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course_id AND owner_id=b AND source_manifest_id=(result->>'sourceManifestId')::uuid)
   OR NOT EXISTS(SELECT 1 FROM public.course_imports WHERE id=import_id AND owner_id=b)
   OR NOT EXISTS(SELECT 1 FROM public.formation_source_manifests WHERE id=manifest_id AND owner_id IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.formation_source_manifests WHERE id=(result->>'sourceManifestId')::uuid AND owner_id=b AND org_id=org)
   OR NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-course-reclaim' AND owner_id=b)
 THEN RAISE EXCEPTION 'Takeover incomplete'; END IF;
 UPDATE public.courses SET status='draft' WHERE id=course_id;
 SET LOCAL ROLE service_role;
 IF NOT EXISTS(
   SELECT 1 FROM public.courses cr
   JOIN public.course_imports ci ON ci.id=cr.import_id AND ci.owner_id=b AND ci.validation_status='conform'
   JOIN public.formation_source_manifests fm ON fm.id=cr.source_manifest_id AND fm.org_id=org AND fm.owner_id=b
   JOIN public.organization_sources os ON os.id=ANY(fm.source_ids) AND os.org_id=org AND os.status='ready' AND os.name=ci.original_filename
   WHERE cr.id=course_id AND cr.org_id=org AND cr.owner_id=b AND cr.status='draft'
     AND cardinality(fm.source_ids)=1 AND fm.diwan_references='[]'::jsonb AND os.text_content='Retained canvas'
 ) THEN RAISE EXCEPTION 'Linked canvas unavailable after takeover'; END IF;
 RESET ROLE;
 IF has_function_privilege('authenticated','public.reclaim_orphaned_course(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Privileged takeover exposed'; END IF;
END; $$;
