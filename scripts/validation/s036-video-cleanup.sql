-- Synthetic metadata only, no real files; BEGIN/ROLLBACK required.
INSERT INTO auth.users(id) VALUES('00000000-0036-4000-8000-000000000191');
INSERT INTO public.video_generation_jobs(id,owner_id,provider_id,request,storage_path)
VALUES('00000000-0036-4000-8000-000000000192','00000000-0036-4000-8000-000000000191','test','{}',
 'generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000195.mp4');
INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at) VALUES
 ('00000000-0036-4000-8000-000000000192','exports','generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000192.mp4',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000193','exports','generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000193.mp4',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000194','exports','generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000194-00000000-0036-4000-8000-000000000199.webm',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000195','exports','generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000195.mp4',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000196','exports','generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000196.mp4',now()-interval '2 hours',now()),
 ('00000000-0036-4000-8000-000000000197','exports','other-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000197.mp4',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000198','exports','generated-video/not-a-uuid/arbitrary.mp4',now()-interval '2 hours',now()-interval '2 hours');
DO $$
BEGIN
 SET LOCAL ROLE service_role;
 IF (SELECT count(*) FROM public.list_orphaned_managed_videos() WHERE object_id IN(
 '00000000-0036-4000-8000-000000000193','00000000-0036-4000-8000-000000000194'))<>2
 OR EXISTS(SELECT 1 FROM public.list_orphaned_managed_videos() WHERE object_id IN(
 '00000000-0036-4000-8000-000000000192','00000000-0036-4000-8000-000000000195',
 '00000000-0036-4000-8000-000000000196','00000000-0036-4000-8000-000000000197','00000000-0036-4000-8000-000000000198'))
 THEN RAISE EXCEPTION 'Cleanup scope incorrect'; END IF;
 RESET ROLE;
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id='00000000-0036-4000-8000-000000000191';
 RESET ROLE;
 SET LOCAL ROLE service_role;
 IF NOT EXISTS(SELECT 1 FROM public.list_orphaned_managed_videos()
 WHERE object_id='00000000-0036-4000-8000-000000000192')
 THEN RAISE EXCEPTION 'Detached video not selected'; END IF;
 RESET ROLE;
 IF has_function_privilege('anon','public.list_orphaned_managed_videos()','EXECUTE')
 OR has_function_privilege('authenticated','public.list_orphaned_managed_videos()','EXECUTE')
 OR (SELECT prosecdef FROM pg_proc WHERE oid='public.list_orphaned_managed_videos()'::regprocedure)
 THEN RAISE EXCEPTION 'Cleanup RPC privilege exposed'; END IF;
END; $$;
