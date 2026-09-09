-- Preserve old source-only callers through a default, without an ambiguous overload.
DROP FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid);
CREATE FUNCTION public.record_consented_learning(p_actor uuid, p_session uuid, p_stage text, p_payload jsonb, p_epoch uuid, p_org uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_consent boolean;
  v_epoch uuid;
  v_org uuid;
  v_source_org uuid;
  v_hash text;
  v_row public.pedagogy_telemetry;
BEGIN
  IF p_actor IS NULL OR p_session IS NULL OR p_stage IS NULL THEN
    RAISE EXCEPTION 'Invalid learning identity' USING ERRCODE = '22023';
  END IF;
  -- Serializes against consent UPDATE/DELETE, including direct RLS writes.
  SELECT pedagogy_consent, collection_epoch INTO v_consent, v_epoch FROM public.telemetry_consent
    WHERE user_id = p_actor FOR UPDATE;
  IF v_consent IS DISTINCT FROM true OR p_epoch IS DISTINCT FROM v_epoch THEN RETURN false; END IF;

  SELECT s.org_id INTO v_source_org FROM public.stages s WHERE s.id=p_stage FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  v_org := coalesce(p_org, v_source_org);
  PERFORM 1 FROM public.organizations o
    JOIN public.org_members m ON m.org_id=o.id AND m.user_id=p_actor
    WHERE o.id=v_org AND o.status='active' FOR SHARE OF o,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  IF v_source_org IS DISTINCT FROM v_org THEN
    PERFORM 1 FROM public.shared_classrooms sh
      WHERE sh.stage_id=p_stage AND sh.org_id=v_org AND sh.authorization_verified
        AND sh.visibility IN ('organization','public')
      LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  -- The consent lock serializes all collection calls for this actor.
  IF EXISTS (
    SELECT 1 FROM public.pedagogy_telemetry t
      JOIN qalem_telemetry_private.subjects subject ON subject.subject_hash=t.subject_hash
      WHERE subject.user_id=p_actor AND t.session_id=p_session
        AND (t.org_id IS DISTINCT FROM v_org OR t.stage_id IS DISTINCT FROM p_stage)
  ) THEN
    RAISE EXCEPTION 'Learning session scope is immutable' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'Invalid learning payload' USING ERRCODE = '22023';
  END IF;
  v_row := jsonb_populate_record(NULL::public.pedagogy_telemetry, p_payload);
  IF coalesce(cardinality(v_row.scene_sequence), 0) NOT BETWEEN 1 AND 256
    OR cardinality(v_row.scene_durations) IS DISTINCT FROM cardinality(v_row.scene_sequence)
    OR v_row.completion_rate IS NULL OR NOT (v_row.completion_rate BETWEEN 0 AND 1)
    OR v_row.total_duration IS NULL OR NOT (v_row.total_duration BETWEEN 0 AND 86400)
    OR coalesce(cardinality(v_row.quiz_scores), 0) > 512
    OR EXISTS (SELECT 1 FROM unnest(v_row.quiz_scores) x WHERE x IS NULL OR NOT (x BETWEEN 0 AND 1))
    OR EXISTS (SELECT 1 FROM unnest(v_row.scene_durations) x WHERE x IS NULL OR NOT (x BETWEEN 0 AND 86400)) THEN
    RAISE EXCEPTION 'Invalid learning measures' USING ERRCODE = '22023';
  END IF;
  INSERT INTO qalem_telemetry_private.subjects(user_id, org_id) VALUES(p_actor, v_org)
    ON CONFLICT(user_id, org_id) DO NOTHING;
  SELECT subject_hash INTO v_hash FROM qalem_telemetry_private.subjects WHERE user_id=p_actor AND org_id=v_org;
  INSERT INTO public.pedagogy_telemetry (
    user_hash, subject_hash, session_id, org_id, stage_id, scene_sequence, scene_durations,
    quiz_scores, completion_rate, total_duration, subject_tags, language, level, agent_count, action_counts
  ) VALUES (
    v_hash, v_hash, p_session, v_org, p_stage, v_row.scene_sequence, v_row.scene_durations,
    v_row.quiz_scores, v_row.completion_rate, v_row.total_duration, v_row.subject_tags,
    v_row.language, v_row.level, v_row.agent_count, coalesce(v_row.action_counts, '{}'::jsonb)
  ) ON CONFLICT(subject_hash, session_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid, uuid) TO service_role;


-- Analytics belong to the recipient; training metadata belongs to the source course.
-- Browser measures do not define the training context used by analytics.
CREATE OR REPLACE FUNCTION qalem_telemetry_private.derive_learning_context()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  course_language text;
  source_org uuid;
  context jsonb;
  tags jsonb;
BEGIN
  NEW.subject_tags := ARRAY[]::text[];
  NEW.language := NULL;
  NEW.level := NULL;
  SELECT cardinality(s.agent_ids),s.org_id INTO NEW.agent_count,source_org FROM public.stages s
    WHERE s.id=NEW.stage_id;
  -- No course, or ambiguous courses: retain measures but do not invent context.
  BEGIN
    SELECT c.language,c.outline->'analyticsContext' INTO STRICT course_language,context
      FROM public.courses c
      WHERE c.stage_id=NEW.stage_id AND c.org_id IS NOT DISTINCT FROM source_org AND c.status='ready'
      FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RETURN NEW;
  END;
  IF course_language IN ('fr-FR','ar-MA','en-US') THEN NEW.language := course_language; END IF;
  IF context->>'level' IN ('beginner','intermediate','advanced') THEN
    NEW.level := context->>'level';
  END IF;
  tags := context->'subjectTags';
  IF jsonb_typeof(tags) = 'array' THEN
    IF jsonb_array_length(tags) <= 20 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(tags) t
      WHERE jsonb_typeof(t) <> 'string' OR length(t #>> '{}') NOT BETWEEN 1 AND 256
        OR (t #>> '{}') !~ '^[A-Za-z0-9_:-]+$'
    ) THEN
      SELECT coalesce(array_agg(value ORDER BY ordinal),ARRAY[]::text[]) INTO NEW.subject_tags
      FROM jsonb_array_elements_text(tags) WITH ORDINALITY t(value,ordinal);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.derive_learning_context() FROM PUBLIC,anon,authenticated;
