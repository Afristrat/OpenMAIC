-- Apply author-erasure + recovery candidates inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000421'),('00000000-0036-4000-8000-000000000422'),('00000000-0036-4000-8000-000000000424');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0036-4000-8000-000000000423','Agent reclaim proof',10);
INSERT INTO public.org_members(org_id,user_id,role) VALUES
 ('00000000-0036-4000-8000-000000000423','00000000-0036-4000-8000-000000000421','admin'),
 ('00000000-0036-4000-8000-000000000423','00000000-0036-4000-8000-000000000422','admin'),
 ('00000000-0036-4000-8000-000000000423','00000000-0036-4000-8000-000000000424','manager');
INSERT INTO public.agent_configs(id,owner_id,org_id,name,role,persona,is_published) VALUES
 ('s036-reclaim-private','00000000-0036-4000-8000-000000000421','00000000-0036-4000-8000-000000000423','Private','teacher','Retained persona',false),
 ('s036-reclaim-published','00000000-0036-4000-8000-000000000421','00000000-0036-4000-8000-000000000423','Published','teacher','Published persona',true),
 ('s036-reclaim-never-owned',NULL,'00000000-0036-4000-8000-000000000423','System','teacher','System persona',false),
 ('s036-reclaim-owned','00000000-0036-4000-8000-000000000422','00000000-0036-4000-8000-000000000423','Owned','teacher','Other persona',false);
SET LOCAL ROLE supabase_auth_admin;
SET LOCAL request.jwt.claims='{}';
DELETE FROM auth.users WHERE id='00000000-0036-4000-8000-000000000421';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE actor uuid:='00000000-0036-4000-8000-000000000422'; org uuid:='00000000-0036-4000-8000-000000000423'; page jsonb; identifier text;
BEGIN
 page:=public.list_recoverable_tenant_agents(actor,org);
 IF jsonb_array_length(page->'agents')<>1 OR page->'agents'->0->>'id'<>'s036-reclaim-private' THEN RAISE EXCEPTION 'Recovery discovery incorrect'; END IF;
 IF public.list_recoverable_tenant_agents('00000000-0036-4000-8000-000000000424',org) IS NOT NULL
 OR public.reclaim_detached_tenant_agent('00000000-0036-4000-8000-000000000424',org,'s036-reclaim-private') IS NOT NULL
 OR public.reclaim_detached_tenant_agent(actor,'00000000-0036-4000-8000-000000000429','s036-reclaim-private') IS NOT NULL THEN RAISE EXCEPTION 'Unauthorized recovery'; END IF;
 UPDATE public.organizations SET status='suspended' WHERE id=org;
 IF public.reclaim_detached_tenant_agent(actor,org,'s036-reclaim-private') IS NOT NULL THEN RAISE EXCEPTION 'Suspended recovery'; END IF;
 UPDATE public.organizations SET status='active' WHERE id=org;
 FOREACH identifier IN ARRAY ARRAY['s036-reclaim-owned','s036-reclaim-never-owned','s036-reclaim-published'] LOOP
  IF public.reclaim_detached_tenant_agent(actor,org,identifier) IS NOT NULL THEN RAISE EXCEPTION 'Protected agent reclaimed'; END IF;
 END LOOP;
 IF public.reclaim_detached_tenant_agent(actor,org,'s036-reclaim-private')<>'s036-reclaim-private' THEN RAISE EXCEPTION 'Recovery failed'; END IF;
 IF public.reclaim_detached_tenant_agent(actor,org,'s036-reclaim-private') IS NOT NULL THEN RAISE EXCEPTION 'Repeated takeover'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_configs WHERE id='s036-reclaim-private' AND owner_id=actor AND org_id=org AND NOT is_published AND persona='Retained persona' AND NOT tenant_reclaim_pending) THEN RAISE EXCEPTION 'Configuration changed'; END IF;
 IF (SELECT count(*) FROM public.tenant_admin_audit WHERE tenant_id=org AND action='agent_ownership_reclaimed')<>1 THEN RAISE EXCEPTION 'Audit not atomic'; END IF;
 IF has_function_privilege('authenticated','public.reclaim_detached_tenant_agent(uuid,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.list_recoverable_tenant_agents(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Actor spoofing RPC exposed'; END IF;
END $$;
RESET ROLE;
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000425');
INSERT INTO public.agent_configs(id,owner_id,org_id,name,role,persona,is_published)
 SELECT 's036-reclaim-batch-'||lpad(n::text,3,'0'),'00000000-0036-4000-8000-000000000425','00000000-0036-4000-8000-000000000423','Batch','teacher','Synthetic',false FROM generate_series(1,51) n;
SET LOCAL ROLE supabase_auth_admin;
SET LOCAL request.jwt.claims='{}';
DELETE FROM auth.users WHERE id='00000000-0036-4000-8000-000000000425';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE page jsonb; actor uuid:='00000000-0036-4000-8000-000000000422'; org uuid:='00000000-0036-4000-8000-000000000423'; BEGIN
 page:=public.list_recoverable_tenant_agents(actor,org);
 IF jsonb_array_length(page->'agents')<>50 OR page->>'nextCursor' IS NULL THEN RAISE EXCEPTION 'Page bound failed'; END IF;
 page:=public.list_recoverable_tenant_agents(actor,org,page->>'nextCursor');
 IF jsonb_array_length(page->'agents')<>1 OR page->>'nextCursor' IS NOT NULL THEN RAISE EXCEPTION 'Second page failed'; END IF;
 DELETE FROM public.org_members WHERE user_id=actor AND org_id=org;
 IF public.list_recoverable_tenant_agents(actor,org) IS NOT NULL OR public.reclaim_detached_tenant_agent(actor,org,'s036-reclaim-batch-001') IS NOT NULL THEN RAISE EXCEPTION 'Former admin recovered'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0036-4000-8000-000000000422","role":"authenticated"}';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.agent_configs WHERE id='s036-reclaim-private') THEN RAISE EXCEPTION 'New owner cannot read'; END IF;
 BEGIN
 UPDATE public.agent_configs SET owner_id='00000000-0036-4000-8000-000000000424' WHERE id='s036-reclaim-private';
 RAISE EXCEPTION 'Direct reassignment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
