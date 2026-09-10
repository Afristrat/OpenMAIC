CREATE OR REPLACE FUNCTION qalem_telemetry_private.project_course_xapi()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  destination text; scene jsonb; summary jsonb; attempt_index integer; result jsonb; verbs text[]; verb text;
BEGIN
  IF NEW.scene_observations IS NULL OR NEW.subject_hash IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM qalem_telemetry_private.subjects subject JOIN public.telemetry_consent consent
    ON consent.user_id=subject.user_id AND consent.xapi_consent
    WHERE subject.subject_hash=NEW.subject_hash AND subject.org_id=NEW.org_id FOR SHARE OF consent;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.feature_flags WHERE flag_name='xapi_emission' AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT endpoint INTO destination FROM public.organization_lrs_configs
    WHERE org_id=NEW.org_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- Admission is part of the same consent-locked collection transaction.
  PERFORM 1 FROM qalem_telemetry_private.subjects s
    JOIN public.telemetry_consent c ON c.user_id=s.user_id
    JOIN public.org_members m ON m.user_id=s.user_id AND m.org_id=s.org_id
    JOIN public.organizations o ON o.id=m.org_id
    WHERE s.subject_hash=NEW.subject_hash AND s.org_id=NEW.org_id
      AND c.pedagogy_consent AND o.status='active' FOR SHARE OF c,m,o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course xAPI consent unavailable' USING ERRCODE='42501'; END IF;
  FOR summary IN SELECT value FROM jsonb_array_elements(NEW.scene_observations) LOOP
    attempt_index := 0;
    FOR scene IN SELECT CASE WHEN summary ? 'attempts'
      THEN summary || jsonb_build_object('score',a) ELSE summary END
      FROM jsonb_array_elements(CASE WHEN summary ? 'attempts'
        THEN summary->'attempts' ELSE '[null]'::jsonb END) a LOOP
    attempt_index := attempt_index + 1;
    verbs := ARRAY[]::text[];
    result := jsonb_build_object('duration','PT' || (scene->>'seconds') || 'S',
      'completion',(scene->>'completed')::boolean);
    IF scene->>'type'='slide' AND (scene->>'seconds')::integer>0 THEN
      verbs := ARRAY['experienced'];
    ELSIF scene->>'type'='quiz' AND scene->'score'<>'null'::jsonb THEN
      verbs := ARRAY['answered',CASE WHEN (scene->>'score')::numeric>=0.7 THEN 'passed' ELSE 'failed' END];
      result := result || jsonb_build_object('score',jsonb_build_object(
        'scaled',(scene->>'score')::numeric,'raw',(scene->>'score')::numeric*100,'max',100),
        'success',(scene->>'score')::numeric>=0.7);
    ELSIF scene->>'type'='pbl' AND (scene->>'completed')::boolean THEN
      verbs := ARRAY['completed'];
    END IF;
    -- No invented per-attempt duration: only the overall scene summary knows dwell time.
    IF summary ? 'attempts' THEN result := result - 'duration'; END IF;
    FOREACH verb IN ARRAY verbs LOOP
      INSERT INTO public.xapi_outbox(org_id,learning_observation_id,dedupe_key,lrs_target,statement)
      VALUES(NEW.org_id,NEW.id,'course:' || NEW.id::text || ':' || (scene->>'id') || ':' || verb || CASE WHEN summary ? 'attempts' THEN ':attempt:' || attempt_index::text ELSE '' END,
        destination,jsonb_build_object(
          'actor',jsonb_build_object('objectType','Agent','mbox','mailto:' || NEW.subject_hash || '@qalem.invalid'),
          'verb',jsonb_build_object('id','http://adlnet.gov/expapi/verbs/' || verb,'display',jsonb_build_object('en-US',verb)),
          'object',jsonb_build_object('id','https://qalem.ma/stages/' || NEW.stage_id || '/scenes/' || (scene->>'id'),
            'definition',jsonb_build_object('type','http://adlnet.gov/expapi/activities/' ||
              CASE scene->>'type' WHEN 'quiz' THEN 'assessment' WHEN 'slide' THEN 'lesson' ELSE 'interaction' END)),
          'result',result,
          'context',jsonb_build_object('contextActivities',jsonb_build_object('parent',jsonb_build_array(
            jsonb_build_object('id','https://qalem.ma/stages/' || NEW.stage_id))),
            'extensions',jsonb_build_object('https://qalem.ma/xapi/scene-type',scene->>'type',
              'https://qalem.ma/xapi/measurement',CASE WHEN summary ? 'attempts'
                THEN 'ordered-quiz-submission' ELSE 'end-of-session-scene-summary' END) ||
              CASE WHEN summary ? 'attempts' THEN jsonb_build_object(
                'https://qalem.ma/xapi/attempt',attempt_index) ELSE '{}'::jsonb END),
          'timestamp',NEW.created_at
        )) ON CONFLICT(org_id,dedupe_key) DO NOTHING;
    END LOOP;
    END LOOP;
    IF coalesce((summary->>'discussionMessages')::integer,0)>0 THEN
      INSERT INTO public.xapi_outbox(org_id,learning_observation_id,dedupe_key,lrs_target,statement)
      VALUES(NEW.org_id,NEW.id,'course:' || NEW.id::text || ':' || (summary->>'id') || ':discussion',
        destination,jsonb_build_object(
          'actor',jsonb_build_object('objectType','Agent','mbox','mailto:' || NEW.subject_hash || '@qalem.invalid'),
          'verb',jsonb_build_object('id','http://adlnet.gov/expapi/verbs/attempted',
            'display',jsonb_build_object('en-US','attempted')),
          'object',jsonb_build_object('id','https://qalem.ma/stages/' || NEW.stage_id || '/scenes/' ||
            (summary->>'id') || '/discussion','definition',
            jsonb_build_object('type','http://adlnet.gov/expapi/activities/interaction')),
          'context',jsonb_build_object('contextActivities',jsonb_build_object('parent',jsonb_build_array(
            jsonb_build_object('id','https://qalem.ma/stages/' || NEW.stage_id))),
            'extensions',jsonb_build_object('https://qalem.ma/xapi/scene-type',summary->>'type',
              'https://qalem.ma/xapi/measurement','accepted-user-messages',
              'https://qalem.ma/xapi/message-count',(summary->>'discussionMessages')::integer)),
          'timestamp',NEW.created_at)) ON CONFLICT(org_id,dedupe_key) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.project_course_xapi() FROM PUBLIC,anon,authenticated;



CREATE OR REPLACE FUNCTION public.authorize_xapi_delivery(p_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.xapi_outbox x
      JOIN public.organizations o ON o.id=x.org_id AND o.status='active'
      JOIN public.feature_flags f ON f.flag_name='xapi_emission' AND f.enabled
    WHERE x.id=p_id AND x.status<>'sent' AND (
      (x.anchor_session_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.live_sessions a JOIN public.courses course ON course.id=a.course_id
          JOIN public.telemetry_consent consent ON consent.user_id=a.user_id AND consent.xapi_consent
          JOIN public.org_members member ON member.user_id=a.user_id AND member.org_id=x.org_id
        WHERE a.id=x.anchor_session_id AND course.org_id=x.org_id
      )) OR EXISTS (
        SELECT 1 FROM public.pedagogy_telemetry t
          JOIN qalem_telemetry_private.subjects s ON s.subject_hash=t.subject_hash AND s.org_id=t.org_id
          JOIN public.telemetry_consent c ON c.user_id=s.user_id AND c.pedagogy_consent AND c.xapi_consent
          JOIN public.org_members m ON m.user_id=s.user_id AND m.org_id=t.org_id
          JOIN public.stages stage ON stage.id=t.stage_id
        WHERE t.id=x.learning_observation_id AND t.org_id=x.org_id AND (
          stage.org_id=t.org_id OR EXISTS (
            SELECT 1 FROM public.shared_classrooms sh WHERE sh.stage_id=t.stage_id
              AND sh.org_id=t.org_id AND sh.authorization_verified AND sh.visibility IN ('organization','public')
          )
        )
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.authorize_xapi_delivery(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_xapi_delivery(bigint) TO service_role;

CREATE OR REPLACE FUNCTION qalem_telemetry_private.withdraw_anchor_xapi()
-- Narrow elevation for direct RLS withdrawal: fixed OLD identity, no callable RPC.
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
   RAISE EXCEPTION 'Consent owner required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' OR NEW.xapi_consent IS DISTINCT FROM true THEN
   DELETE FROM public.xapi_outbox x USING public.pedagogy_telemetry t, qalem_telemetry_private.subjects subject
     WHERE x.learning_observation_id=t.id AND t.subject_hash=subject.subject_hash AND subject.user_id=OLD.user_id;
   DELETE FROM public.xapi_outbox x USING public.live_sessions s
     WHERE x.anchor_session_id=s.id AND s.user_id=OLD.user_id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.withdraw_anchor_xapi() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION qalem_telemetry_private.version_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.collection_epoch := gen_random_uuid();
  ELSIF NEW.pedagogy_consent IS DISTINCT FROM OLD.pedagogy_consent OR NEW.xapi_consent IS DISTINCT FROM OLD.xapi_consent THEN
    NEW.collection_epoch := gen_random_uuid();
  ELSE
    -- Even a direct RLS update cannot restore a previously issued epoch.
    NEW.collection_epoch := OLD.collection_epoch;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.version_consent() FROM PUBLIC, anon, authenticated;
