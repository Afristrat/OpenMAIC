-- After collection + export migrations, inside BEGIN ... ROLLBACK only.
INSERT INTO auth.users(id) VALUES('00000000-0036-4000-8000-000000000081'),('00000000-0036-4000-8000-000000000082');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := '00000000-0036-4000-8000-000000000081';
  other_actor uuid := '00000000-0036-4000-8000-000000000082';
  org uuid := '00000000-0036-4000-8000-000000000083';
  own_hash text;
  other_hash text;
  rows jsonb;
  page_cursor text := NULL;
  exported integer := 0;
  section text;
BEGIN
  INSERT INTO public.organizations(id,name,status,seat_limit) VALUES(org,'S-036 rollback export','active',2);
  INSERT INTO public.org_members(user_id,org_id,role) VALUES(actor,org,'apprenant'),(other_actor,org,'apprenant');
  INSERT INTO public.stages(id,owner_id,org_id,name) VALUES('s036-export-own',actor,org,'Own'),('s036-export-other',other_actor,org,'Other');
  INSERT INTO public.scenes(id,stage_id,type,"order") VALUES('s036-scene-own','s036-export-own','slide',0),('s036-scene-other','s036-export-other','slide',0);
  INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES(actor,true),(other_actor,true);
  INSERT INTO qalem_telemetry_private.subjects(user_id,org_id) VALUES(actor,org) RETURNING subject_hash INTO own_hash;
  INSERT INTO qalem_telemetry_private.subjects(user_id,org_id) VALUES(other_actor,org) RETURNING subject_hash INTO other_hash;
  INSERT INTO public.pedagogy_telemetry(user_hash,subject_hash,session_id)
    SELECT own_hash,own_hash,gen_random_uuid() FROM generate_series(1,1001);
  INSERT INTO public.pedagogy_telemetry(user_hash,subject_hash,session_id) VALUES(other_hash,other_hash,gen_random_uuid());
  INSERT INTO public.pedagogy_telemetry(user_hash) VALUES(own_hash);
  LOOP
    rows := public.read_account_export_page(actor,'pedagogy_telemetry',page_cursor);
    IF jsonb_array_length(rows)>100 THEN RAISE EXCEPTION 'Export page unbounded'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->'value'->>'subject_hash' IS DISTINCT FROM own_hash) THEN
      RAISE EXCEPTION 'Export crossed an actor boundary';
    END IF;
    exported := exported + jsonb_array_length(rows);
    EXIT WHEN jsonb_array_length(rows)<100;
    page_cursor := rows->99->>'cursor';
  END LOOP;
  IF exported<>1001 THEN RAISE EXCEPTION 'Export truncated or included unlinked rows'; END IF;
  rows := public.read_account_export_page(actor,'stages');
  IF jsonb_array_length(rows)<>1 OR rows->0->'value'->>'id'<>'s036-export-own' THEN RAISE EXCEPTION 'Stage ownership failed'; END IF;
  rows := public.read_account_export_page(actor,'scenes');
  IF jsonb_array_length(rows)<>1 OR rows->0->'value'->>'id'<>'s036-scene-own' THEN RAISE EXCEPTION 'Scene ownership failed'; END IF;
  FOREACH section IN ARRAY ARRAY['profiles','org_members','quiz_results','review_cards','certificates','payments','usage_records','telemetry_consent'] LOOP
    PERFORM public.read_account_export_page(actor,section);
  END LOOP;
  DELETE FROM public.org_members WHERE user_id=actor AND org_id=org;
  IF public.read_account_export_page(actor,'stages')<>'[]'::jsonb OR public.read_account_export_page(actor,'scenes')<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Former membership retained tenant content access';
  END IF;
  BEGIN
    PERFORM public.read_account_export_page(actor,'organizations');
    RAISE EXCEPTION 'Arbitrary table export accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF has_function_privilege('anon','public.read_account_export_page(uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.read_account_export_page(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Service export exposed publicly';
  END IF;
END; $$;
RESET ROLE;
