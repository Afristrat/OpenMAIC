-- Exact import lookup; no client-supplied path or privileged arbitrary table read.
CREATE FUNCTION public.read_account_import_download(p_actor uuid, p_import uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'storagePath',t.storage_path)
 FROM public.course_imports t
 WHERE t.id=p_import AND t.owner_id=p_actor
 AND NOT EXISTS (
  SELECT 1 FROM public.courses c WHERE c.import_id=t.id AND c.org_id IS NOT NULL
  AND NOT EXISTS (
   SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
   WHERE m.org_id=c.org_id AND m.user_id=p_actor AND o.status='active'
  )
 );
$$;
REVOKE ALL ON FUNCTION public.read_account_import_download(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_import_download(uuid,uuid) TO service_role;
