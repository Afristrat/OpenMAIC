-- Metadata selection only. Objects are removed through the Storage API by the worker.
CREATE INDEX video_generation_jobs_storage_path_idx
  ON public.video_generation_jobs(storage_path) WHERE storage_path IS NOT NULL;

CREATE FUNCTION public.list_orphaned_managed_videos()
RETURNS TABLE(object_id uuid, object_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT o.id, o.name FROM storage.objects o
  CROSS JOIN LATERAL regexp_match(o.name,
    '^generated-video/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?[.](mp4|webm)$') AS matched(parts)
  WHERE o.bucket_id='exports' AND matched.parts IS NOT NULL
    AND o.created_at < now()-interval '1 hour' AND o.updated_at < now()-interval '1 hour'
    AND NOT EXISTS(SELECT 1 FROM public.video_generation_jobs j WHERE j.id=(matched.parts)[2]::uuid)
    AND NOT EXISTS(SELECT 1 FROM public.video_generation_jobs j WHERE j.storage_path=o.name)
  ORDER BY o.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.list_orphaned_managed_videos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphaned_managed_videos() TO service_role;
