-- Execute with candidates inside BEGIN/ROLLBACK, never on durable user data.
INSERT INTO auth.users(id) VALUES ('00000000-0048-4000-8000-000000000031');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0048-4000-8000-000000000032','S048 receipt proof',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES ('00000000-0048-4000-8000-000000000031','00000000-0048-4000-8000-000000000032','formateur');
INSERT INTO public.stages(id,owner_id,org_id,name,language,agent_ids) VALUES
 ('s048-receipt-proof','00000000-0048-4000-8000-000000000031','00000000-0048-4000-8000-000000000032','Receipt proof','fr-FR',ARRAY['a','b']);
INSERT INTO public.scenes(id,stage_id,type,"order",content) VALUES ('s048-receipt-scene','s048-receipt-proof','slide',0,'{}');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES ('00000000-0048-4000-8000-000000000031',false);
INSERT INTO auth.users(id) VALUES ('00000000-0048-4000-8000-000000000032');
INSERT INTO public.org_members(user_id,org_id,role) VALUES ('00000000-0048-4000-8000-000000000032','00000000-0048-4000-8000-000000000032','formateur');
INSERT INTO public.telemetry_consent(user_id,pedagogy_consent) VALUES ('00000000-0048-4000-8000-000000000032',true);
SET LOCAL ROLE service_role;
DO $$ <<proof>>
DECLARE actor uuid := '00000000-0048-4000-8000-000000000031'; org uuid := '00000000-0048-4000-8000-000000000032';
 id uuid := '00000000-0048-4000-8000-000000000033'; id2 uuid := '00000000-0048-4000-8000-000000000034';
 arm text; reason text; sample integer; score numeric; rows jsonb;
BEGIN
 IF public.begin_director_receipt(actor,org,'s048-receipt-proof','s048-receipt-scene',id,'a') IS NOT NULL THEN RAISE EXCEPTION 'Consent bypass'; END IF;
 UPDATE public.telemetry_consent SET pedagogy_consent=true WHERE user_id=actor;
 IF public.begin_director_receipt(actor,org,'s048-receipt-proof','s048-receipt-scene',id,'a')<>id THEN RAISE EXCEPTION 'Missing receipt'; END IF;
 PERFORM public.begin_director_receipt(actor,org,'s048-receipt-proof','s048-receipt-scene',id,'a');
 PERFORM public.begin_director_receipt(actor,org,'s048-receipt-proof','s048-receipt-scene',id2,'a');
 SELECT cohort INTO arm FROM qalem_telemetry_private.director_receipts WHERE director_receipts.id=proof.id;
 IF arm<>'data-driven' THEN RAISE EXCEPTION 'JavaScript cohort vector mismatch'; END IF;
 IF (SELECT cohort FROM qalem_telemetry_private.director_receipts WHERE director_receipts.id=proof.id2)<>arm THEN RAISE EXCEPTION 'Unstable assignment'; END IF;
 IF (SELECT generation_outcome FROM qalem_telemetry_private.director_receipts WHERE director_receipts.id=proof.id) IS NOT NULL THEN RAISE EXCEPTION 'Invented generation'; END IF;
 reason := CASE WHEN arm='classic' THEN 'control' ELSE 'observed-pattern' END;
 sample := CASE WHEN arm='classic' THEN NULL ELSE 1 END;
 score := CASE WHEN arm='classic' THEN NULL ELSE 0 END;
 IF public.select_director_receipt(gen_random_uuid(),id,'b',reason,sample,score,12) THEN RAISE EXCEPTION 'Other actor admitted'; END IF;
 BEGIN
   PERFORM public.select_director_receipt(actor,id,'unknown',reason,sample,score,12);
   RAISE EXCEPTION 'Unknown agent admitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.select_director_receipt(actor,id,'b',reason,sample,score,12);
 IF (SELECT observed_score FROM qalem_telemetry_private.director_receipts WHERE director_receipts.id=proof.id) IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Zero evidence lost'; END IF;
 PERFORM public.select_director_receipt(actor,id,'b',reason,sample,score,12);
 BEGIN
   PERFORM public.select_director_receipt(actor,id,'a',reason,sample,score,12);
   RAISE EXCEPTION 'Selection substituted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.finish_director_receipt(actor,id,'completed');
 PERFORM public.finish_director_receipt(actor,id,'completed');
 BEGIN
   PERFORM public.finish_director_receipt(actor,id,'failed');
   RAISE EXCEPTION 'Outcome substituted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 rows := public.read_account_director_export_page(actor,'director_receipts');
 IF jsonb_array_length(rows)<>2 OR rows::text LIKE '%subject_hash%' OR rows::text LIKE '%collection_epoch%' THEN RAISE EXCEPTION 'Invalid personal export'; END IF;
 IF public.read_account_director_export_page(gen_random_uuid(),'director_receipts')<>'[]'::jsonb THEN RAISE EXCEPTION 'Cross-account export'; END IF;
 IF has_table_privilege('authenticated','qalem_telemetry_private.director_receipts','SELECT') OR
    has_function_privilege('anon','public.begin_director_receipt(uuid,uuid,text,text,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Public access'; END IF;
 PERFORM public.begin_director_receipt(org,org,'s048-receipt-proof','s048-receipt-scene','00000000-0048-4000-8000-000000000035','a');
 IF (SELECT cohort FROM qalem_telemetry_private.director_receipts WHERE director_receipts.id='00000000-0048-4000-8000-000000000035')<>'classic' THEN RAISE EXCEPTION 'Classic vector mismatch'; END IF;
 BEGIN
   PERFORM public.select_director_receipt(org,'00000000-0048-4000-8000-000000000035','b','observed-pattern',1,0,12);
   RAISE EXCEPTION 'Classic arm contaminated';
 EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM public.select_director_receipt(org,'00000000-0048-4000-8000-000000000035','a','control',NULL,NULL,0);
 UPDATE public.telemetry_consent SET pedagogy_consent=false WHERE user_id=actor;
 IF EXISTS(SELECT 1 FROM qalem_telemetry_private.director_receipts WHERE director_receipts.id IN (proof.id,proof.id2)) THEN RAISE EXCEPTION 'Withdrawal residue'; END IF;
 UPDATE public.telemetry_consent SET pedagogy_consent=true WHERE user_id=actor;
 IF public.finish_director_receipt(actor,id,'completed') THEN RAISE EXCEPTION 'Old epoch resurrected'; END IF;
 IF public.read_account_director_export_page(actor,'director_receipts')<>'[]'::jsonb THEN RAISE EXCEPTION 'Export residue'; END IF;
 IF jsonb_array_length(public.read_account_director_export_page(org,'director_receipts'))<>1 THEN RAISE EXCEPTION 'Other actor erased'; END IF;
END $$;
RESET ROLE;
