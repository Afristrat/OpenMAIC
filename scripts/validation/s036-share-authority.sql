-- Apply the candidate migration, then this proof, all inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000251'),('00000000-0036-4000-8000-000000000252'),
 ('00000000-0036-4000-8000-000000000253'),('00000000-0036-4000-8000-000000000254');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0036-4000-8000-000000000255','Share source',10),
 ('00000000-0036-4000-8000-000000000256','Share destination',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0036-4000-8000-000000000251','00000000-0036-4000-8000-000000000255','formateur'),
 ('00000000-0036-4000-8000-000000000251','00000000-0036-4000-8000-000000000256','formateur'),
 ('00000000-0036-4000-8000-000000000252','00000000-0036-4000-8000-000000000256','admin'),
 ('00000000-0036-4000-8000-000000000253','00000000-0036-4000-8000-000000000255','admin'),
 ('00000000-0036-4000-8000-000000000253','00000000-0036-4000-8000-000000000256','manager');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s036-share-source','00000000-0036-4000-8000-000000000251','00000000-0036-4000-8000-000000000255','Share source'),
 ('s036-share-foreign','00000000-0036-4000-8000-000000000254',NULL,'Foreign classroom');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000252',true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.shared_classrooms(stage_id,org_id,visibility) VALUES
      ('s036-share-foreign','00000000-0036-4000-8000-000000000256','public');
    RAISE EXCEPTION 'Destination role published foreign classroom';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000251',true);
INSERT INTO public.shared_classrooms(id,stage_id,org_id,visibility) VALUES
 ('00000000-0036-4000-8000-000000000258','s036-share-source','00000000-0036-4000-8000-000000000256','public');
DO $$ BEGIN
  IF (SELECT shared_by FROM public.shared_classrooms WHERE id='00000000-0036-4000-8000-000000000258')
    IS DISTINCT FROM '00000000-0036-4000-8000-000000000251'::uuid THEN RAISE EXCEPTION 'Actor not stamped'; END IF;
  BEGIN
    INSERT INTO public.shared_classrooms(stage_id,org_id,shared_by) VALUES
      ('s036-share-source','00000000-0036-4000-8000-000000000256','00000000-0036-4000-8000-000000000252');
    RAISE EXCEPTION 'Spoofed author accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.shared_classrooms SET stage_id='s036-share-foreign' WHERE id='00000000-0036-4000-8000-000000000258';
    RAISE EXCEPTION 'Source retarget accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.shared_classrooms SET org_id='00000000-0036-4000-8000-000000000255' WHERE id='00000000-0036-4000-8000-000000000258';
    RAISE EXCEPTION 'Destination retarget accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000252',true);
UPDATE public.shared_classrooms SET visibility='private' WHERE id='00000000-0036-4000-8000-000000000258';
DO $$ BEGIN
  IF (SELECT visibility FROM public.shared_classrooms WHERE id='00000000-0036-4000-8000-000000000258') IS DISTINCT FROM 'private'
    THEN RAISE EXCEPTION 'Destination admin cannot reduce exposure'; END IF;
  BEGIN
    UPDATE public.shared_classrooms SET visibility='public' WHERE id='00000000-0036-4000-8000-000000000258';
    RAISE EXCEPTION 'Destination admin expanded source access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000253',true);
INSERT INTO public.shared_classrooms(stage_id,org_id,visibility) VALUES
 ('s036-share-source','00000000-0036-4000-8000-000000000256','organization');
RESET ROLE;
UPDATE public.organizations SET status='suspended' WHERE id='00000000-0036-4000-8000-000000000256';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000251',true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.shared_classrooms(stage_id,org_id) VALUES
      ('s036-share-source','00000000-0036-4000-8000-000000000256');
    RAISE EXCEPTION 'Inactive destination accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
