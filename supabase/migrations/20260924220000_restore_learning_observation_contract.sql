-- Production drift repair: keep the final quiz-attempt and discussion fields in
-- the collector contract. The xAPI projection trigger is intentionally left
-- untouched because its later consent-aware definition is already authoritative.
CREATE OR REPLACE FUNCTION public.record_consented_learning(
  p_actor uuid,
  p_session uuid,
  p_stage text,
  p_payload jsonb,
  p_epoch uuid,
  p_org uuid DEFAULT NULL
)
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
  SELECT pedagogy_consent, collection_epoch INTO v_consent, v_epoch
    FROM public.telemetry_consent WHERE user_id = p_actor FOR UPDATE;
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
        AND sh.visibility IN ('organization','public') LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  END IF;
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
  IF v_row.scene_observations IS NOT NULL THEN
    IF jsonb_typeof(v_row.scene_observations) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid scene observations' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(v_row.scene_observations) NOT BETWEEN 1 AND 256 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
        OR NOT (e ?& ARRAY['id','type','seconds','completed','score'])
        OR (e - ARRAY['id','type','seconds','completed','score','attempts','discussionMessages']) <> '{}'::jsonb
        OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string'
        OR (e->>'id') !~ '^[A-Za-z0-9_-]{1,128}$'
        OR jsonb_typeof(e->'type') IS DISTINCT FROM 'string'
        OR jsonb_typeof(e->'seconds') IS DISTINCT FROM 'number'
        OR (e->>'seconds') !~ '^[0-9]+$'
        OR jsonb_typeof(e->'completed') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(e->'score') NOT IN ('number','null')
    ) THEN RAISE EXCEPTION 'Invalid scene observations' USING ERRCODE='22023'; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE (e->>'seconds')::numeric NOT BETWEEN 0 AND 86400
        OR (e->'score' <> 'null'::jsonb AND (
          (e->>'score')::numeric NOT BETWEEN 0 AND 1 OR e->>'type' <> 'quiz'
          OR (e->>'completed')::boolean IS DISTINCT FROM true))
        OR NOT EXISTS (SELECT 1 FROM public.scenes s WHERE s.id=e->>'id'
          AND s.stage_id=p_stage AND s.type=e->>'type')
    ) OR (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(v_row.scene_observations) e)
      <> jsonb_array_length(v_row.scene_observations)
      OR (SELECT sum((e->>'seconds')::numeric) FROM jsonb_array_elements(v_row.scene_observations) e)
        IS DISTINCT FROM v_row.total_duration::numeric THEN
      RAISE EXCEPTION 'Scene observation scope or measures invalid' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE e ? 'attempts' AND (e->>'type'<>'quiz'
        OR jsonb_typeof(e->'attempts') IS DISTINCT FROM 'array'))
    THEN RAISE EXCEPTION 'Invalid quiz attempts' USING ERRCODE='22023'; END IF;
    IF (SELECT coalesce(sum(jsonb_array_length(e->'attempts')),0)
      FROM jsonb_array_elements(v_row.scene_observations) e WHERE e ? 'attempts')>512
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e,
        jsonb_array_elements(e->'attempts') a WHERE jsonb_typeof(a) IS DISTINCT FROM 'number')
    THEN RAISE EXCEPTION 'Invalid quiz attempts' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e,
      jsonb_array_elements(e->'attempts') a WHERE a::numeric NOT BETWEEN 0 AND 1)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
        WHERE e ? 'attempts' AND (CASE WHEN jsonb_array_length(e->'attempts')=0
          THEN e->'score'<>'null'::jsonb ELSE e->'attempts'->-1 IS DISTINCT FROM e->'score' END))
    THEN RAISE EXCEPTION 'Quiz attempts do not match summary' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE e ? 'discussionMessages' AND (
        jsonb_typeof(e->'discussionMessages') IS DISTINCT FROM 'number'
        OR (e->>'discussionMessages') !~ '^[0-9]+$'))
    THEN RAISE EXCEPTION 'Invalid discussion count' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE (e->>'discussionMessages')::numeric NOT BETWEEN 0 AND 512)
    THEN RAISE EXCEPTION 'Invalid discussion count' USING ERRCODE='22023'; END IF;
  END IF;
  IF coalesce(cardinality(v_row.scene_sequence), 0) NOT BETWEEN 1 AND 256
    OR cardinality(v_row.scene_durations) IS DISTINCT FROM cardinality(v_row.scene_sequence)
    OR v_row.completion_rate IS NULL OR NOT (v_row.completion_rate BETWEEN 0 AND 1)
    OR v_row.total_duration IS NULL OR NOT (v_row.total_duration BETWEEN 0 AND 86400)
    OR coalesce(cardinality(v_row.quiz_scores), 0) > 512
    OR EXISTS (SELECT 1 FROM unnest(v_row.quiz_scores) x WHERE x IS NULL OR NOT (x BETWEEN 0 AND 1))
    OR EXISTS (SELECT 1 FROM unnest(v_row.scene_durations) x WHERE x IS NULL OR NOT (x BETWEEN 0 AND 86400))
  THEN RAISE EXCEPTION 'Invalid learning measures' USING ERRCODE = '22023'; END IF;
  INSERT INTO qalem_telemetry_private.subjects(user_id, org_id) VALUES(p_actor, v_org)
    ON CONFLICT(user_id, org_id) DO NOTHING;
  SELECT subject_hash INTO v_hash FROM qalem_telemetry_private.subjects
    WHERE user_id=p_actor AND org_id=v_org;
  INSERT INTO public.pedagogy_telemetry (
    user_hash, subject_hash, session_id, org_id, stage_id, scene_sequence, scene_durations,
    quiz_scores, completion_rate, total_duration, subject_tags, language, level, agent_count,
    action_counts, scene_observations
  ) VALUES (
    v_hash, v_hash, p_session, v_org, p_stage, v_row.scene_sequence, v_row.scene_durations,
    v_row.quiz_scores, v_row.completion_rate, v_row.total_duration, v_row.subject_tags,
    v_row.language, v_row.level, v_row.agent_count, coalesce(v_row.action_counts, '{}'::jsonb),
    v_row.scene_observations
  ) ON CONFLICT(subject_hash, session_id) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid, uuid)
  TO service_role;

-- Preserve every export section added over time while repairing only the stale
-- xAPI ownership predicate. A fresh database already has the current predicate;
-- an unexpected definition fails closed instead of silently rewriting it.
DO $repair_xapi_export$
DECLARE
  definition text;
  legacy_scope text := $legacy$v_scope := '(t.statement->''actor''->>''mbox'') IN (''mailto:'' || $1::text || ''@qalem.local'',''mailto:'' || $1::text || ''@qalem.invalid'')';$legacy$;
  current_scope text := $current$v_scope := '((t.statement->''actor''->>''mbox'') IN (''mailto:'' || $1::text || ''@qalem.local'',''mailto:'' || $1::text || ''@qalem.invalid'') OR EXISTS (SELECT 1 FROM public.pedagogy_telemetry observation JOIN qalem_telemetry_private.subjects subject ON subject.subject_hash=observation.subject_hash WHERE observation.id=t.learning_observation_id AND subject.user_id=$1) OR EXISTS(SELECT 1 FROM public.live_sessions a WHERE a.id=t.anchor_session_id AND a.user_id=$1))';$current$;
BEGIN
  SELECT pg_get_functiondef(
    'public.read_account_export_page(uuid,text,text)'::regprocedure
  ) INTO STRICT definition;
  IF position(current_scope IN definition) > 0 THEN RETURN; END IF;
  IF position(legacy_scope IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected account export definition; xAPI scope was not rewritten';
  END IF;
  EXECUTE replace(definition, legacy_scope, current_scope);
END;
$repair_xapi_export$;
