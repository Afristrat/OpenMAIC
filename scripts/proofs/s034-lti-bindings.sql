-- Execute after the migration in a transaction; caller MUST roll back.
INSERT INTO auth.users(id) VALUES ('00000000-0034-4000-8000-000000000001');
INSERT INTO public.profiles(id) VALUES ('00000000-0034-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations(id,name) VALUES
('00000000-0034-4000-8000-000000000002','S034 fixture'),
('00000000-0034-4000-8000-000000000003','S034 foreign fixture');
INSERT INTO public.org_members(user_id,org_id) VALUES
('00000000-0034-4000-8000-000000000001','00000000-0034-4000-8000-000000000002');
INSERT INTO public.stages(id,org_id,name) VALUES
('s034-stage','00000000-0034-4000-8000-000000000002','Fixture'),
('s034-foreign','00000000-0034-4000-8000-000000000003','Foreign');
INSERT INTO public.lti_registrations(client_id,issuer,jwks_url,auth_url,token_url,deployment_id,org_id)
VALUES ('s034-client','https://lms.example.org','https://lms.example.org/jwks','https://lms.example.org/auth','https://lms.example.org/token','deployment','00000000-0034-4000-8000-000000000002');
INSERT INTO public.lti_resource_bindings(id,client_id,org_id,resource_link_id,stage_id)
VALUES ('00000000-0034-4000-8000-000000000004','s034-client','00000000-0034-4000-8000-000000000002','assignment','s034-stage');
INSERT INTO public.lti_user_bindings(id,client_id,org_id,lms_subject,user_id)
VALUES ('00000000-0034-4000-8000-000000000005','s034-client','00000000-0034-4000-8000-000000000002','opaque-lms-id','00000000-0034-4000-8000-000000000001');
INSERT INTO public.lti_launch_sessions(token_hash,client_id,org_id,resource_binding_id,user_binding_id,expires_at)
VALUES (repeat('a',64),'s034-client','00000000-0034-4000-8000-000000000002','00000000-0034-4000-8000-000000000004','00000000-0034-4000-8000-000000000005',now()+interval '1 hour');

DO $$ DECLARE tab text; role_name text; privilege_name text; BEGIN
  FOREACH tab IN ARRAY ARRAY['lti_registrations','lti_nonces','lti_grade_submissions','lti_resource_bindings','lti_user_bindings','lti_launch_sessions'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||tab)::regclass) THEN RAISE EXCEPTION 'RLS missing: %', tab; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name,'public.'||tab,privilege_name) THEN RAISE EXCEPTION 'Exposed grant: % % %', role_name,tab,privilege_name; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['lti_resource_bindings','lti_user_bindings','lti_launch_sessions'] LOOP
    IF has_table_privilege('service_role','public.'||tab,'UPDATE') THEN RAISE EXCEPTION 'Mutable launch identity: %',tab; END IF;
  END LOOP;
  BEGIN
    UPDATE public.lti_resource_bindings SET stage_id='s034-foreign' WHERE resource_link_id='assignment' AND client_id='s034-client';
    RAISE EXCEPTION 'Foreign stage accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE public.lti_user_bindings SET user_id='00000000-0034-4000-8000-000000000099' WHERE client_id='s034-client';
    RAISE EXCEPTION 'Non-member accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE public.lti_launch_sessions SET org_id='00000000-0034-4000-8000-000000000003' WHERE client_id='s034-client';
    RAISE EXCEPTION 'Cross-tenant launch accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE public.lti_launch_sessions SET expires_at=now()+interval '25 hours' WHERE client_id='s034-client';
    RAISE EXCEPTION 'Unbounded lifetime accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
DELETE FROM public.org_members WHERE user_id='00000000-0034-4000-8000-000000000001';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.lti_user_bindings WHERE client_id='s034-client') OR EXISTS (SELECT 1 FROM public.lti_launch_sessions WHERE client_id='s034-client') THEN RAISE EXCEPTION 'Removed membership retained LTI access'; END IF;
END $$;
SELECT 'S034_BINDINGS_PROOF_OK';
