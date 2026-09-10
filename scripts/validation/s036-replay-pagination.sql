-- Synthetic records, BEGIN/ROLLBACK required. Explicit identity avoids sequence changes.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000411');
INSERT INTO public.courses(id,owner_id,title,language,source_kind,status) VALUES
 ('00000000-0036-4000-8000-000000000413','00000000-0036-4000-8000-000000000411','Replay paging','fr-FR','generated','draft');
INSERT INTO public.castings(id,user_id,course_id,lineup,lineup_hash) VALUES
 ('00000000-0036-4000-8000-000000000414','00000000-0036-4000-8000-000000000411','00000000-0036-4000-8000-000000000413','[]','replay-paging');
INSERT INTO public.live_sessions(id,user_id,course_id,casting_id,recorded) VALUES
 ('00000000-0036-4000-8000-000000000412','00000000-0036-4000-8000-000000000411','00000000-0036-4000-8000-000000000413','00000000-0036-4000-8000-000000000414',true);
INSERT INTO public.session_events(id,session_id,ts_ms,actor,event_type,payload) OVERRIDING SYSTEM VALUE
 SELECT 9007199254750000+n,'00000000-0036-4000-8000-000000000412',n,'user','text','{}' FROM generate_series(1,1001) n;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0036-4000-8000-000000000411","role":"authenticated"}';
DO $$ DECLARE page jsonb; cursor_value bigint:=0; ceiling bigint; total integer:=0;
BEGIN
 LOOP
  page:=public.read_session_replay_page('00000000-0036-4000-8000-000000000412',cursor_value,ceiling);
  IF page IS NULL OR jsonb_array_length(page->'events')>100 THEN RAISE EXCEPTION 'Page invalid'; END IF;
  ceiling:=(page->>'upperBound')::bigint;
  IF ceiling<>9007199254751001 THEN RAISE EXCEPTION 'Ceiling incorrect'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(page->'events') e WHERE jsonb_typeof(e->'id')<>'string' OR (e->>'id')::bigint<=cursor_value) THEN RAISE EXCEPTION 'Precision/order lost'; END IF;
  total:=total+jsonb_array_length(page->'events');
  EXIT WHEN page->>'nextCursor' IS NULL;
  cursor_value:=(page->>'nextCursor')::bigint;
 END LOOP;
 IF total<>1001 THEN RAISE EXCEPTION 'Replay truncated'; END IF;
 page:=public.read_session_replay_page('00000000-0036-4000-8000-000000000412',0,9007199254750001);
 IF jsonb_array_length(page->'events')<>1 THEN RAISE EXCEPTION 'Ceiling not applied'; END IF;
END $$;
SET LOCAL request.jwt.claims='{"sub":"00000000-0036-4000-8000-000000000419","role":"authenticated"}';
DO $$ BEGIN
 IF public.read_session_replay_page('00000000-0036-4000-8000-000000000412') IS NOT NULL THEN RAISE EXCEPTION 'Cross-user replay exposed'; END IF;
 IF has_function_privilege('anon','public.read_session_replay_page(uuid,bigint,bigint)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC exposed'; END IF;
END $$;
RESET ROLE;
