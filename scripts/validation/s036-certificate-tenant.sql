-- Run with the candidate migration in BEGIN/ROLLBACK only.
INSERT INTO auth.users(id) VALUES('00000000-0036-4000-8000-000000000231');
INSERT INTO public.organizations(id,name) VALUES
 ('00000000-0036-4000-8000-000000000232','Certificate A'),
 ('00000000-0036-4000-8000-000000000233','Certificate B');
INSERT INTO public.stages(id,owner_id,name) VALUES
 ('s036-certificate-tenant','00000000-0036-4000-8000-000000000231','Certificate proof');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000231',true);
INSERT INTO public.certificates(user_id,stage_id,course_name,learner_name,score,verification_code,org_id) VALUES
 ('00000000-0036-4000-8000-000000000231','s036-certificate-tenant','Proof','Proof',80,'S036-CERT-A','00000000-0036-4000-8000-000000000232'),
 ('00000000-0036-4000-8000-000000000231','s036-certificate-tenant','Proof','Proof',90,'S036-CERT-B','00000000-0036-4000-8000-000000000233'),
 ('00000000-0036-4000-8000-000000000231','s036-certificate-tenant','Proof','Proof',70,'S036-CERT-P',NULL);
DO $$ DECLARE tenant uuid; BEGIN
  FOREACH tenant IN ARRAY ARRAY['00000000-0036-4000-8000-000000000232'::uuid,'00000000-0036-4000-8000-000000000233'::uuid,NULL::uuid] LOOP
    BEGIN
      INSERT INTO public.certificates(user_id,stage_id,course_name,learner_name,score,verification_code,org_id) VALUES
       ('00000000-0036-4000-8000-000000000231','s036-certificate-tenant','Proof','Proof',80,'S036-CERT-DUP',tenant);
      RAISE EXCEPTION 'Duplicate issuance accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
  IF (SELECT count(*) FROM public.certificates WHERE stage_id='s036-certificate-tenant') <> 3 THEN
    RAISE EXCEPTION 'Issuances not independently visible'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.organizations WHERE id IN ('00000000-0036-4000-8000-000000000232','00000000-0036-4000-8000-000000000233');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.certificates WHERE stage_id='s036-certificate-tenant' AND org_id IS NULL) <> 3
    OR (SELECT count(*) FROM public.certificates WHERE stage_id='s036-certificate-tenant' AND issuance_org_id IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'Organization removal lost issuance provenance'; END IF;
  BEGIN
    UPDATE public.certificates SET issuance_org_id=NULL WHERE verification_code='S036-CERT-A';
    RAISE EXCEPTION 'Issuance provenance changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
