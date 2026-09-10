-- Invoker/RLS: the caller can page only their own recorded session.
CREATE INDEX session_events_cursor_idx ON public.session_events(session_id,id);
CREATE FUNCTION public.read_session_replay_page(p_session uuid, p_after bigint DEFAULT 0, p_upper bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE ceiling bigint; rows jsonb; last_id bigint; more boolean;
BEGIN
 IF p_after IS NULL OR p_after<0 OR p_upper<0 THEN RAISE EXCEPTION 'INVALID_REPLAY_CURSOR' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.live_sessions WHERE id=p_session AND user_id=(SELECT auth.uid()) AND recorded) THEN RETURN NULL; END IF;
 SELECT COALESCE(p_upper,max(id),0) INTO ceiling FROM public.session_events WHERE session_id=p_session;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id::text,'ts_ms',ts_ms,'actor',actor,
   'event_type',event_type,'payload',payload,'audio_path',audio_path,'audio_bytes',audio_bytes) ORDER BY id),'[]'),max(id)
 INTO rows,last_id FROM (SELECT * FROM public.session_events WHERE session_id=p_session AND id>p_after AND id<=ceiling ORDER BY id LIMIT 100) page;
 SELECT EXISTS(SELECT 1 FROM public.session_events WHERE session_id=p_session AND id>last_id AND id<=ceiling) INTO more;
 RETURN jsonb_build_object('events',rows,'nextCursor',CASE WHEN more THEN last_id::text END,'upperBound',ceiling::text);
END; $$;
REVOKE ALL ON FUNCTION public.read_session_replay_page(uuid,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_session_replay_page(uuid,bigint,bigint) TO authenticated;
