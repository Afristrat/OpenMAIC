-- Only a real owner-loss transition is recoverable; never infer ownership of
-- pre-existing system/unowned agents from owner_id IS NULL alone.
ALTER TABLE public.agent_configs ADD COLUMN tenant_reclaim_pending boolean NOT NULL DEFAULT false;
CREATE INDEX agent_configs_tenant_reclaim_idx ON public.agent_configs(org_id,id) WHERE tenant_reclaim_pending;
CREATE FUNCTION public.mark_detached_tenant_agent()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN NEW.tenant_reclaim_pending:=true; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.mark_detached_tenant_agent() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mark_detached_tenant_agent BEFORE UPDATE OF owner_id ON public.agent_configs
 FOR EACH ROW WHEN (OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL AND NEW.org_id IS NOT NULL AND NOT COALESCE(NEW.is_published,false))
 EXECUTE FUNCTION public.mark_detached_tenant_agent();

CREATE FUNCTION public.list_recoverable_tenant_agents(p_actor uuid,p_org uuid,p_after text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb; last_id text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
   WHERE m.user_id=p_actor AND m.org_id=p_org AND m.role='admin' AND o.status='active') THEN RETURN NULL; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id COLLATE "C"),'[]'),max(id COLLATE "C") INTO rows,last_id
 FROM (SELECT id,name FROM public.agent_configs WHERE org_id=p_org AND owner_id IS NULL AND tenant_reclaim_pending
   AND NOT COALESCE(is_published,false) AND id COLLATE "C">COALESCE(p_after,'') COLLATE "C" ORDER BY id COLLATE "C" LIMIT 50) a;
 RETURN jsonb_build_object('agents',rows,'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM public.agent_configs WHERE org_id=p_org
   AND owner_id IS NULL AND tenant_reclaim_pending AND NOT COALESCE(is_published,false) AND id COLLATE "C">last_id COLLATE "C") THEN last_id END);
END; $$;

CREATE FUNCTION public.reclaim_detached_tenant_agent(p_actor uuid,p_org uuid,p_agent text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE claimed text;
BEGIN
 -- Locks protect membership and tenant status until the ownership/audit commit.
 PERFORM 1 FROM public.organizations WHERE id=p_org AND status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.org_members WHERE org_id=p_org AND user_id=p_actor AND role='admin' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.agent_configs SET owner_id=p_actor,tenant_reclaim_pending=false
 WHERE id=p_agent AND org_id=p_org AND owner_id IS NULL AND tenant_reclaim_pending AND NOT COALESCE(is_published,false)
 RETURNING id INTO claimed;
 IF claimed IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.tenant_admin_audit(tenant_id,actor_user_id,action,previous_value,next_value)
 VALUES(p_org,p_actor,'agent_ownership_reclaimed',jsonb_build_object('agentId',claimed,'ownerId',NULL),jsonb_build_object('agentId',claimed,'ownerId',p_actor));
 RETURN claimed;
END; $$;
REVOKE ALL ON FUNCTION public.list_recoverable_tenant_agents(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reclaim_detached_tenant_agent(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_recoverable_tenant_agents(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_detached_tenant_agent(uuid,uuid,text) TO service_role;
