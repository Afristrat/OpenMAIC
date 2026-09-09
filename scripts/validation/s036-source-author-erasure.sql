-- With Diwan + source-author migrations, as supabase_admin, BEGIN/ROLLBACK only.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000131'),
 ('00000000-0036-4000-8000-000000000132');
DO $$
DECLARE
 a uuid := '00000000-0036-4000-8000-000000000131';
 b uuid := '00000000-0036-4000-8000-000000000132';
 org uuid := '00000000-0036-4000-8000-000000000133';
 source_id uuid;
 manifest_id uuid;
 before_source jsonb;
 before_manifest jsonb;
 visible integer;
BEGIN
 INSERT INTO public.organizations(id,name,status,seat_limit) VALUES(org,'S036 source rollback','active',2);
 INSERT INTO public.org_members(user_id,org_id,role) VALUES(a,org,'admin'),(b,org,'admin');
 INSERT INTO public.organization_sources(org_id,owner_id,name,mime_type,size_bytes,content_hash,parser_id,text_content)
 VALUES(org,a,'Test','text/plain',4,repeat('a',64),'test','Text') RETURNING id INTO source_id;
 INSERT INTO public.formation_source_manifests(org_id,owner_id,version,source_ids)
 VALUES(org,a,1,ARRAY[source_id]) RETURNING id INTO manifest_id;
 SELECT to_jsonb(s)-ARRAY['owner_id','updated_at'] INTO before_source FROM public.organization_sources s WHERE id=source_id;
 SELECT to_jsonb(m)-'owner_id' INTO before_manifest FROM public.formation_source_manifests m WHERE id=manifest_id;
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id=a;
 RESET ROLE;
 IF (SELECT to_jsonb(s)-ARRAY['owner_id','updated_at'] FROM public.organization_sources s WHERE id=source_id) IS DISTINCT FROM before_source
 OR (SELECT to_jsonb(m)-'owner_id' FROM public.formation_source_manifests m WHERE id=manifest_id) IS DISTINCT FROM before_manifest
 OR EXISTS(SELECT 1 FROM public.organization_sources WHERE id=source_id AND owner_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.formation_source_manifests WHERE id=manifest_id AND owner_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Source or manifest erased or changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO visible FROM public.organization_sources WHERE id=source_id;
 IF visible<>1 THEN RAISE EXCEPTION 'Remaining member lost source access'; END IF;
 SELECT count(*) INTO visible FROM public.formation_source_manifests WHERE id=manifest_id;
 IF visible<>1 THEN RAISE EXCEPTION 'Remaining member lost manifest access'; END IF;
 RESET ROLE;
 BEGIN
   UPDATE public.formation_source_manifests SET source_ids='{}' WHERE id=manifest_id;
   RAISE EXCEPTION 'Authorless manifest became mutable';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 DELETE FROM public.org_members WHERE org_id=org AND user_id=b;
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO visible FROM public.organization_sources WHERE id=source_id;
 IF visible<>0 THEN RAISE EXCEPTION 'Former member retained access'; END IF;
 RESET ROLE;
END;
$$;
