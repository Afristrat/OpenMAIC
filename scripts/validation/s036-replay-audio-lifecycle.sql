-- Synthetic metadata only. Apply candidates and this proof inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000401');
INSERT INTO public.courses(id,owner_id,title,language,source_kind,status) VALUES
 ('00000000-0036-4000-8000-000000000403','00000000-0036-4000-8000-000000000401','Replay proof','fr-FR','generated','draft');
INSERT INTO public.castings(id,user_id,course_id,lineup,lineup_hash) VALUES
 ('00000000-0036-4000-8000-000000000404','00000000-0036-4000-8000-000000000401','00000000-0036-4000-8000-000000000403','[]','replay-proof');
INSERT INTO public.live_sessions(id,user_id,course_id,casting_id,recorded) VALUES
 ('00000000-0036-4000-8000-000000000402','00000000-0036-4000-8000-000000000401','00000000-0036-4000-8000-000000000403','00000000-0036-4000-8000-000000000404',true);
INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at) VALUES
 ('00000000-0036-4000-8000-000000000405','session-audio','00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000402/00000000-0036-4000-8000-000000000405.wav',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000406','session-audio','00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000402/00000000-0036-4000-8000-000000000406.wav',now(),now()),
 ('00000000-0036-4000-8000-000000000407','exports','00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000402/00000000-0036-4000-8000-000000000407.wav',now()-interval '2 hours',now()-interval '2 hours'),
 ('00000000-0036-4000-8000-000000000408','session-audio','arbitrary/replay.wav',now()-interval '2 hours',now()-interval '2 hours');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0036-4000-8000-000000000401","role":"authenticated"}';
INSERT INTO public.session_events(id,session_id,ts_ms,actor,event_type,payload,audio_path,audio_bytes) OVERRIDING SYSTEM VALUE VALUES
 (9007199254741401,'00000000-0036-4000-8000-000000000402',0,'user','speech','{}','00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000402/00000000-0036-4000-8000-000000000405.wav',5);
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE id='00000000-0036-4000-8000-000000000405')<>1 THEN RAISE EXCEPTION 'Own replay inaccessible'; END IF;
 BEGIN
  INSERT INTO public.session_events(id,session_id,ts_ms,actor,event_type,payload,audio_path,audio_bytes) OVERRIDING SYSTEM VALUE VALUES
   (9007199254741402,'00000000-0036-4000-8000-000000000402',0,'user','speech','{}','00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000499/00000000-0036-4000-8000-000000000405.wav',5);
  RAISE EXCEPTION 'Foreign reference accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'SESSION_AUDIO_SCOPE_INVALID' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES ('session-audio','00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000402/00000000-0036-4000-8000-000000000409.wav');
  RAISE EXCEPTION 'Direct client upload accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- A late orphan becomes eligible once older than the upload safety window.
INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at)
 SELECT ('00000000-0036-4000-8002-'||lpad(n::text,12,'0'))::uuid,'session-audio',
 '00000000-0036-4000-8000-000000000401/00000000-0036-4000-8000-000000000499/00000000-0036-4000-8002-'||lpad(n::text,12,'0')||'.wav',
 now()-interval '2 hours',now()-interval '2 hours' FROM generate_series(1,101) n;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.list_orphaned_session_audio())<>100 THEN RAISE EXCEPTION 'Replay batch not bounded'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.list_orphaned_session_audio() WHERE object_id='00000000-0036-4000-8000-000000000405') THEN RAISE EXCEPTION 'Live replay selected'; END IF;
 IF has_function_privilege('authenticated','public.list_orphaned_session_audio()','EXECUTE') THEN RAISE EXCEPTION 'Cleanup exposed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DELETE FROM public.live_sessions WHERE id='00000000-0036-4000-8000-000000000402';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE id='00000000-0036-4000-8000-000000000405') THEN RAISE EXCEPTION 'Deleted replay still readable'; END IF;
 IF EXISTS(SELECT 1 FROM public.session_events WHERE id=9007199254741401) THEN RAISE EXCEPTION 'Events not cascaded'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.list_orphaned_session_audio() WHERE object_id='00000000-0036-4000-8000-000000000405') THEN RAISE EXCEPTION 'Orphan missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.list_orphaned_session_audio() WHERE object_id IN ('00000000-0036-4000-8000-000000000406','00000000-0036-4000-8000-000000000407','00000000-0036-4000-8000-000000000408')) THEN RAISE EXCEPTION 'Unsafe selection'; END IF;
END $$;
RESET ROLE;
