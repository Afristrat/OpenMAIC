-- Run after both U-011 migrations inside a transaction; always roll back fixtures.
INSERT INTO auth.users (id) VALUES ('00000000-0011-4000-8000-000000000001');
INSERT INTO public.profiles (id) VALUES ('00000000-0011-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, name) VALUES
  ('00000000-0011-4000-8000-000000000002', 'U011 authorized fixture'),
  ('00000000-0011-4000-8000-000000000003', 'U011 foreign fixture');
INSERT INTO public.org_members (user_id, org_id, role) VALUES
  ('00000000-0011-4000-8000-000000000001', '00000000-0011-4000-8000-000000000002', 'author');
SELECT set_config('request.jwt.claim.sub', '00000000-0011-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF has_table_privilege(current_user, 'public.agent_configs', 'TRUNCATE')
    OR has_table_privilege(current_user, 'public.agent_configs', 'REFERENCES')
    OR has_table_privilege(current_user, 'public.agent_configs', 'TRIGGER') THEN
    RAISE EXCEPTION 'Non-row privileges exposed to authenticated';
  END IF;
END $$;
INSERT INTO public.agent_configs (id, owner_id, org_id, name, role, is_published, profile_extensions)
VALUES ('u011-proof', '00000000-0011-4000-8000-000000000001', '00000000-0011-4000-8000-000000000002', 'Fixture', 'student', false, '{"gender":"female"}');
UPDATE public.agent_configs SET is_published=true WHERE id='u011-proof';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_configs WHERE id='u011-proof' AND is_published AND profile_extensions->>'gender'='female') THEN
    RAISE EXCEPTION 'Authorized publication failed';
  END IF;
  BEGIN
    INSERT INTO public.agent_configs (id, owner_id, org_id, name, role)
    VALUES ('u011-foreign', '00000000-0011-4000-8000-000000000001', '00000000-0011-4000-8000-000000000003', 'Forbidden', 'student');
    RAISE EXCEPTION 'Foreign organization accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.agent_configs SET org_id='00000000-0011-4000-8000-000000000003' WHERE id='u011-proof';
    RAISE EXCEPTION 'Organization reassignment accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.organizations SET status='suspended' WHERE id='00000000-0011-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
UPDATE public.agent_configs SET is_published=false WHERE id='u011-proof';
DO $$ BEGIN
  BEGIN
    UPDATE public.agent_configs SET is_published=true WHERE id='u011-proof';
    RAISE EXCEPTION 'Suspended tenant publication accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.organizations SET status='active' WHERE id='00000000-0011-4000-8000-000000000002';
UPDATE public.agent_configs SET is_published=true WHERE id='u011-proof';
DELETE FROM public.org_members WHERE org_id='00000000-0011-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
UPDATE public.agent_configs SET is_published=false WHERE id='u011-proof';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_configs WHERE id='u011-proof' AND NOT is_published) THEN
    RAISE EXCEPTION 'Withdrawal after leaving tenant failed';
  END IF;
  BEGIN
    UPDATE public.agent_configs SET is_published=true WHERE id='u011-proof';
    RAISE EXCEPTION 'Former member publication accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0011-4000-8000-000000000004', true);
DO $$ DECLARE affected integer; BEGIN
  IF EXISTS (SELECT 1 FROM public.agent_configs WHERE id='u011-proof') THEN
    RAISE EXCEPTION 'Private row exposed to outsider';
  END IF;
  UPDATE public.agent_configs SET is_published=true WHERE id='u011-proof';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Foreign owner mutation accepted'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.agent_configs;
    RAISE EXCEPTION 'Anonymous table access accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'U011_RLS_PROOF_OK';
