-- Execute after account_shared_references inside BEGIN ... ROLLBACK only.
INSERT INTO auth.users(id) VALUES
  ('00000000-0036-4000-8000-000000000101'),
  ('00000000-0036-4000-8000-000000000102');
DO $$
DECLARE
  actor uuid := '00000000-0036-4000-8000-000000000101';
  other_actor uuid := '00000000-0036-4000-8000-000000000102';
  org uuid := '00000000-0036-4000-8000-000000000103';
  resource record;
  before_rows jsonb := '{}'::jsonb;
  row_before jsonb;
  row_after jsonb;
  attribution uuid;
BEGIN
  INSERT INTO public.organizations(id,name,status,seat_limit)
    VALUES(org,'S-036 rollback shared references','active',3);
  INSERT INTO public.org_members(user_id,org_id,role)
    VALUES(actor,org,'admin'),(other_actor,org,'apprenant');
  INSERT INTO public.stages(id,owner_id,org_id,name)
    VALUES('s036-ref-from',actor,org,'Source'),('s036-ref-to',other_actor,org,'Target');
  INSERT INTO public.classroom_templates(name,sector,requirements,org_id,created_by)
    VALUES('S-036 retained template','test','{}',org,actor);
  INSERT INTO public.curriculum_links(from_stage_id,to_stage_id,relation_type,org_id,created_by)
    VALUES('s036-ref-from','s036-ref-to','follows',org,actor);
  INSERT INTO public.org_invitations(org_id,email,created_by)
    VALUES(org,'s036-rollback@example.invalid',actor);
  INSERT INTO public.payments(user_id,org_id,provider,amount,currency)
    VALUES(actor,org,'test',10,'MAD');
  INSERT INTO public.shared_classrooms(stage_id,org_id,shared_by)
    VALUES('s036-ref-from',org,actor);

  FOR resource IN SELECT * FROM (VALUES
    ('classroom_templates','created_by'),('curriculum_links','created_by'),
    ('org_invitations','created_by'),('payments','user_id'),('shared_classrooms','shared_by')
  ) AS refs(table_name,column_name) LOOP
    EXECUTE format('SELECT to_jsonb(r) - %L FROM public.%I r WHERE org_id=$1',resource.column_name,resource.table_name)
      INTO row_before USING org;
    before_rows := before_rows || jsonb_build_object(resource.table_name,row_before);
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=resource.table_name AND c.relrowsecurity)
    THEN RAISE EXCEPTION 'Shared resource lacks RLS'; END IF;
  END LOOP;

  DELETE FROM auth.users WHERE id=actor;
  FOR resource IN SELECT * FROM (VALUES
    ('classroom_templates','created_by'),('curriculum_links','created_by'),
    ('org_invitations','created_by'),('payments','user_id'),('shared_classrooms','shared_by')
  ) AS refs(table_name,column_name) LOOP
    EXECUTE format('SELECT to_jsonb(r) - %L, %I FROM public.%I r WHERE org_id=$1',
      resource.column_name,resource.column_name,resource.table_name)
      INTO row_after,attribution USING org;
    IF row_after IS DISTINCT FROM before_rows->resource.table_name OR attribution IS NOT NULL
    THEN RAISE EXCEPTION 'Shared resource changed beyond author removal: %',resource.table_name; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=actor)
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=other_actor)
    OR NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-ref-from' AND owner_id IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-ref-to' AND owner_id=other_actor)
  THEN RAISE EXCEPTION 'Actor isolation or tenant resource preservation failed'; END IF;
END;
$$;
