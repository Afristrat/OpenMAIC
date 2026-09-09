-- Apply candidate agent publication RLS and author erasure, BEGIN/ROLLBACK only.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000161'),
 ('00000000-0036-4000-8000-000000000162');
DO $$
DECLARE
 a uuid := '00000000-0036-4000-8000-000000000161';
 b uuid := '00000000-0036-4000-8000-000000000162';
 org uuid := '00000000-0036-4000-8000-000000000163';
 snapshot jsonb;
BEGIN
 INSERT INTO public.organizations(id,name,status,seat_limit) VALUES(org,'S036 agent rollback','active',2);
 INSERT INTO public.org_members(user_id,org_id,role) VALUES(a,org,'admin'),(b,org,'admin');
 INSERT INTO public.agent_configs(id,owner_id,org_id,name,role,persona,is_published) VALUES
 ('s036-agent-published',a,org,'Published','teacher','Shared profile',true),
 ('s036-agent-tenant-private',a,org,'Tenant private','teacher','Tenant profile',false),
 ('s036-agent-personal',a,NULL,'Personal','teacher','Personal profile',false),
 ('s036-agent-global',a,NULL,'Published personal','teacher','Published profile',true),
 ('s036-agent-never-owned',NULL,NULL,'Never owned','teacher','System profile',false),
 ('s036-agent-other',b,org,'Other owner','teacher','Other profile',false);
 INSERT INTO public.agent_reviews(agent_id,user_id,rating) VALUES('s036-agent-published',b,5);
 SELECT jsonb_agg(to_jsonb(ac)-ARRAY['owner_id','updated_at'] ORDER BY id) INTO snapshot
 FROM public.agent_configs ac WHERE id IN('s036-agent-published','s036-agent-tenant-private','s036-agent-global');
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id=a;
 RESET ROLE;
 IF (SELECT jsonb_agg(to_jsonb(ac)-ARRAY['owner_id','updated_at'] ORDER BY id)
   FROM public.agent_configs ac WHERE id IN('s036-agent-published','s036-agent-tenant-private','s036-agent-global')) IS DISTINCT FROM snapshot
 OR EXISTS(SELECT 1 FROM public.agent_configs WHERE id IN('s036-agent-published','s036-agent-tenant-private','s036-agent-global') AND owner_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Shared agent lost or changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_configs WHERE id='s036-agent-personal'
   AND owner_id IS NULL AND personal_erasure_pending)
 THEN RAISE EXCEPTION 'Personal agent not queued'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_configs WHERE id='s036-agent-other' AND owner_id=b)
 OR NOT EXISTS(SELECT 1 FROM public.agent_reviews WHERE agent_id='s036-agent-published' AND user_id=b AND rating=5)
 THEN RAISE EXCEPTION 'Other actor or review lost'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF (SELECT count(*) FROM public.agent_configs WHERE id IN('s036-agent-published','s036-agent-global','s036-agent-other'))<>3
 OR EXISTS(SELECT 1 FROM public.agent_configs WHERE id IN('s036-agent-tenant-private','s036-agent-personal'))
 THEN RAISE EXCEPTION 'Publication/private boundary changed'; END IF;
 UPDATE public.agent_configs SET is_published=true WHERE id='s036-agent-tenant-private';
 IF FOUND THEN RAISE EXCEPTION 'Unowned private agent published by another actor'; END IF;
 BEGIN
   UPDATE public.agent_configs SET owner_id=b WHERE id='s036-agent-published';
   RAISE EXCEPTION 'Ownership takeover allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 SET LOCAL ROLE service_role;
 IF public.purge_detached_personal_agents()<>1 OR public.purge_detached_personal_agents()<>0
 THEN RAISE EXCEPTION 'Personal purge count or idempotence incorrect'; END IF;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM public.agent_configs WHERE id='s036-agent-personal')
 OR NOT EXISTS(SELECT 1 FROM public.agent_configs WHERE id='s036-agent-never-owned' AND NOT personal_erasure_pending)
 OR (SELECT count(*) FROM public.agent_configs WHERE id LIKE 's036-agent-%')<>5
 THEN RAISE EXCEPTION 'Purge scope incorrect'; END IF;
 -- A stale marker cannot override current ownership, tenant or publication.
 UPDATE public.agent_configs SET personal_erasure_pending=true
 WHERE id IN('s036-agent-published','s036-agent-tenant-private','s036-agent-other');
 INSERT INTO public.agent_configs(id,name,role,persona,personal_erasure_pending,is_published)
 SELECT 's036-agent-batch-'||n,'Batch','teacher','Synthetic',true,false
 FROM generate_series(1,1001) n;
 SET LOCAL ROLE service_role;
 IF public.purge_detached_personal_agents()<>1000
 OR public.purge_detached_personal_agents()<>1
 OR public.purge_detached_personal_agents()<>0
 THEN RAISE EXCEPTION 'Batch bound or guard incorrect'; END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM public.agent_configs WHERE id LIKE 's036-agent-%')<>5
 THEN RAISE EXCEPTION 'Guarded agents lost'; END IF;
 IF has_function_privilege('authenticated','public.purge_detached_personal_agents()','EXECUTE')
 OR has_function_privilege('anon','public.purge_detached_personal_agents()','EXECUTE')
 OR (SELECT prosecdef FROM pg_proc WHERE oid='public.mark_detached_personal_agent()'::regprocedure)
 OR (SELECT prosecdef FROM pg_proc WHERE oid='public.purge_detached_personal_agents()'::regprocedure)
 THEN RAISE EXCEPTION 'Cleanup privilege exposed'; END IF;
END; $$;
