-- Access follows the live session, not a stale JWT folder prefix alone.
DROP POLICY session_audio_select_own ON storage.objects;
CREATE POLICY session_audio_select_own ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='session-audio' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND EXISTS(SELECT 1 FROM public.live_sessions s WHERE s.id::text=(storage.foldername(name))[2] AND s.user_id=(SELECT auth.uid()) AND s.recorded));
-- The verified server uploads without individual Storage ownership, avoiding new
-- account-deletion blockers. Existing user-owned objects require separate reconciliation.
DROP POLICY session_audio_insert_own ON storage.objects;
CREATE POLICY session_audio_insert_server_only ON storage.objects FOR INSERT TO authenticated WITH CHECK (false);

CREATE FUNCTION qalem_storage_private.guard_session_audio_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owner_id uuid;
BEGIN
 IF NEW.audio_path IS NULL THEN RETURN NEW; END IF;
 SELECT user_id INTO owner_id FROM public.live_sessions WHERE id=NEW.session_id AND recorded FOR SHARE;
 IF owner_id IS NULL OR NEW.audio_path !~ ('^'||owner_id::text||'/'||NEW.session_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](wav|ogg|mp3|webm)$') THEN
  RAISE EXCEPTION 'SESSION_AUDIO_SCOPE_INVALID';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION qalem_storage_private.guard_session_audio_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_session_audio_reference BEFORE INSERT ON public.session_events
 FOR EACH ROW EXECUTE FUNCTION qalem_storage_private.guard_session_audio_reference();
CREATE INDEX session_events_audio_path_idx ON public.session_events(audio_path) WHERE audio_path IS NOT NULL;

CREATE FUNCTION public.list_orphaned_session_audio()
RETURNS TABLE(object_id uuid,object_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT o.id,o.name FROM storage.objects o
 CROSS JOIN LATERAL regexp_match(o.name,
 '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](wav|ogg|mp3|webm)$') AS matched(parts)
 WHERE o.bucket_id='session-audio' AND matched.parts IS NOT NULL
 AND o.created_at<now()-interval '1 hour' AND o.updated_at<now()-interval '1 hour'
 AND NOT EXISTS(SELECT 1 FROM public.live_sessions s WHERE s.id=(matched.parts)[2]::uuid)
 AND NOT EXISTS(SELECT 1 FROM public.session_events e WHERE e.audio_path=o.name)
 ORDER BY o.id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.list_orphaned_session_audio() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphaned_session_audio() TO service_role;
