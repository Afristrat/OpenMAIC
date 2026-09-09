-- Synthetic fixtures only; execute inside BEGIN/ROLLBACK as supabase_admin.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000171');
DO $$
DECLARE
 actor uuid := '00000000-0036-4000-8000-000000000171';
 tenant uuid := '00000000-0036-4000-8000-000000000172';
BEGIN
 INSERT INTO public.organizations(id,name,status,seat_limit)
 VALUES(tenant,'S036 author rollback','active',1);
 INSERT INTO public.org_members(user_id,org_id,role) VALUES(actor,tenant,'author');
 INSERT INTO public.classroom_generation_jobs(id,owner_id,org_id,status,payload)
 VALUES('s036-author-job',actor,tenant,'queued','{}');
 INSERT INTO public.video_generation_jobs(id,owner_id,org_id,provider_id,request)
 VALUES('00000000-0036-4000-8000-000000000181',actor,tenant,'test','{}');
 SET LOCAL ROLE service_role;
 UPDATE public.video_generation_jobs SET status='generating'
 WHERE id='00000000-0036-4000-8000-000000000181'
 AND owner_id=actor AND org_id=tenant AND status='queued';
 IF NOT FOUND THEN RAISE EXCEPTION 'Video not claimed'; END IF;
 UPDATE public.video_generation_jobs SET status='generating'
 WHERE id='00000000-0036-4000-8000-000000000181'
 AND owner_id=actor AND org_id=tenant AND status='queued';
 IF FOUND THEN RAISE EXCEPTION 'Video claimed twice'; END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM public.org_members m
 JOIN public.organizations o ON o.id=m.org_id
 WHERE m.user_id=actor AND m.org_id=tenant AND o.status='active'
 AND m.role IN('admin','manager','author'))
 THEN RAISE EXCEPTION 'Active author not found'; END IF;
 UPDATE public.org_members SET role='apprenant' WHERE user_id=actor AND org_id=tenant;
 IF EXISTS(SELECT 1 FROM public.org_members m
 JOIN public.organizations o ON o.id=m.org_id
 WHERE m.user_id=actor AND m.org_id=tenant AND o.status='active'
 AND m.role IN('admin','manager','author'))
 THEN RAISE EXCEPTION 'Downgraded actor still authorized'; END IF;
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id=actor;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM public.org_members WHERE user_id=actor)
 OR EXISTS(SELECT 1 FROM public.classroom_generation_jobs WHERE id='s036-author-job')
 OR EXISTS(SELECT 1 FROM public.video_generation_jobs WHERE id='00000000-0036-4000-8000-000000000181')
 THEN RAISE EXCEPTION 'Deleted actor retains membership or durable job'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=tenant)
 THEN RAISE EXCEPTION 'Tenant removed'; END IF;
END; $$;
