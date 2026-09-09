-- Run as supabase_admin, with migration, inside BEGIN ... ROLLBACK only.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000121'),
 ('00000000-0036-4000-8000-000000000122'),
 ('00000000-0036-4000-8000-000000000123');
DO $$
DECLARE
 a uuid := '00000000-0036-4000-8000-000000000121';
 b uuid := '00000000-0036-4000-8000-000000000122';
 c uuid := '00000000-0036-4000-8000-000000000123';
 org uuid := '00000000-0036-4000-8000-000000000124';
 visible integer;
 actor uuid;
BEGIN
 INSERT INTO public.organizations(id,name,status,seat_limit) VALUES(org,'S036 rollback transmission','active',3);
 INSERT INTO public.org_members(user_id,org_id,role) VALUES(a,org,'admin'),(b,org,'apprenant'),(c,org,'apprenant');
 INSERT INTO public.stages(id,owner_id,org_id,name) VALUES('s036-transmission',a,org,'Test');
 INSERT INTO public.transmissions(stage_id,sender_user_id,recipient_user_id)
   VALUES('s036-transmission',a,b),('s036-transmission',b,a);
 BEGIN
   UPDATE public.transmissions SET sender_user_id=NULL WHERE stage_id='s036-transmission' AND sender_user_id=a;
   RAISE EXCEPTION 'Live sender erased';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'Transmission sender is not a member%' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO public.transmissions(stage_id,sender_user_id,recipient_user_id) VALUES('s036-transmission',a,NULL);
   RAISE EXCEPTION 'Missing recipient accepted';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'Transmission recipient is not a member%' THEN RAISE; END IF;
 END;
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id=a;
 RESET ROLE;
 IF (SELECT count(*) FROM public.transmissions WHERE stage_id='s036-transmission')<>2
   OR EXISTS(SELECT 1 FROM public.transmissions WHERE stage_id='s036-transmission' AND (sender_user_id=a OR recipient_user_id=a))
 THEN RAISE EXCEPTION 'Transmission preservation or attribution removal failed'; END IF;
 FOREACH actor IN ARRAY ARRAY[a,b,c] LOOP
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   SET LOCAL ROLE authenticated;
   SELECT count(*) INTO visible FROM public.transmissions WHERE stage_id='s036-transmission';
   RESET ROLE;
   IF visible <> (CASE WHEN actor=b THEN 2 ELSE 0 END) THEN
     RAISE EXCEPTION 'Remaining party, deleted actor or third party visibility failed';
   END IF;
 END LOOP;
 SET LOCAL ROLE supabase_auth_admin;
 DELETE FROM auth.users WHERE id=b;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM public.transmissions WHERE stage_id='s036-transmission'
   AND (sender_user_id IS NOT NULL OR recipient_user_id IS NOT NULL)) THEN
   RAISE EXCEPTION 'Second erasure failed';
 END IF;
END;
$$;
