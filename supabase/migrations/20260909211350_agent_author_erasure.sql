-- Retain shared assets without changing publication or granting another user ownership.
ALTER TABLE public.agent_configs
  DROP CONSTRAINT agent_configs_owner_id_fkey,
  ADD CONSTRAINT agent_configs_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Never sweep pre-existing unowned/system agents. Only mark a transition from
-- owned to detached. The Auth FK action can assign NEW without extra grants.
ALTER TABLE public.agent_configs
  ADD COLUMN personal_erasure_pending boolean NOT NULL DEFAULT false;
CREATE INDEX agent_configs_personal_erasure_pending_idx ON public.agent_configs(id)
  WHERE personal_erasure_pending;
CREATE FUNCTION public.mark_detached_personal_agent()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.personal_erasure_pending := true;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.mark_detached_personal_agent() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mark_detached_personal_agent
BEFORE UPDATE OF owner_id ON public.agent_configs FOR EACH ROW
WHEN (OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL
  AND NEW.org_id IS NULL AND NOT COALESCE(NEW.is_published,false))
EXECUTE FUNCTION public.mark_detached_personal_agent();

-- The existing server retention worker drains this queue; Auth needs no DELETE
-- privilege. Recheck privacy and ownership at deletion, not just at marking.
CREATE FUNCTION public.purge_detached_personal_agents()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE removed integer;
BEGIN
  WITH pending AS (
    SELECT id FROM public.agent_configs
    WHERE personal_erasure_pending AND owner_id IS NULL AND org_id IS NULL
      AND NOT COALESCE(is_published,false)
    ORDER BY id LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.agent_configs ac USING pending WHERE ac.id=pending.id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END; $$;
REVOKE ALL ON FUNCTION public.purge_detached_personal_agents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_detached_personal_agents() TO service_role;
