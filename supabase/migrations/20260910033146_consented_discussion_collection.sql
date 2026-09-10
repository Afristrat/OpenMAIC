-- New observations reuse the erasable tenant pseudonym. Never infer ownership
-- of historical rows, nor accept a browser-provided quiz score as server evidence.
ALTER TABLE public.discussion_patterns
  ADD COLUMN subject_hash text REFERENCES qalem_telemetry_private.subjects(subject_hash) ON DELETE CASCADE,
  ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN discussion_id uuid,
  ADD COLUMN observation jsonb;
CREATE UNIQUE INDEX discussion_patterns_subject_discussion
  ON public.discussion_patterns(subject_hash,discussion_id);
CREATE INDEX discussion_patterns_org_created ON public.discussion_patterns(org_id,created_at);
ALTER TABLE public.discussion_patterns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discussion_patterns FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.discussion_patterns TO service_role;

CREATE FUNCTION public.record_consented_discussion(
  p_actor uuid, p_stage text, p_org uuid, p_epoch uuid, p_observation jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_consent boolean;
  v_epoch uuid;
  v_source_org uuid;
  v_agents text[];
  v_hash text;
  v_discussion uuid;
  v_previous public.discussion_patterns;
  v_language text;
  v_context jsonb;
  v_tags text[] := ARRAY[]::text[];
BEGIN
  IF p_actor IS NULL OR p_org IS NULL OR p_stage IS NULL
    OR p_stage !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'Invalid discussion identity' USING ERRCODE='22023';
  END IF;
  SELECT pedagogy_consent,collection_epoch INTO v_consent,v_epoch
    FROM public.telemetry_consent WHERE user_id=p_actor FOR UPDATE;
  IF v_consent IS DISTINCT FROM true OR p_epoch IS DISTINCT FROM v_epoch THEN RETURN false; END IF;

  SELECT org_id,agent_ids INTO v_source_org,v_agents FROM public.stages WHERE id=p_stage FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discussion scope forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.organizations o JOIN public.org_members m ON m.org_id=o.id
    WHERE o.id=p_org AND o.status='active' AND m.user_id=p_actor FOR SHARE OF o,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discussion scope forbidden' USING ERRCODE='42501'; END IF;
  IF v_source_org IS DISTINCT FROM p_org THEN
    PERFORM 1 FROM public.shared_classrooms sh WHERE sh.stage_id=p_stage AND sh.org_id=p_org
      AND sh.authorization_verified AND sh.visibility IN ('organization','public') LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Discussion scope forbidden' USING ERRCODE='42501'; END IF;
  END IF;

  IF jsonb_typeof(p_observation) IS DISTINCT FROM 'object' OR octet_length(p_observation::text)>131072 THEN
    RAISE EXCEPTION 'Invalid discussion observation' USING ERRCODE='22023';
  END IF;
  IF NOT (p_observation ?& ARRAY['discussionId','sceneId','durationBasis','classificationMethod','turns','postDiscussionQuiz'])
    OR (p_observation-ARRAY['discussionId','sceneId','durationBasis','classificationMethod','turns','postDiscussionQuiz']) <> '{}'::jsonb
    OR jsonb_typeof(p_observation->'discussionId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_observation->'sceneId') IS DISTINCT FROM 'string'
    OR length(p_observation->>'sceneId') NOT BETWEEN 1 AND 256
    OR p_observation->>'durationBasis' IS DISTINCT FROM 'client-monotonic-elapsed'
    OR p_observation->>'classificationMethod' IS DISTINCT FROM 'text-heuristic-v1'
    OR p_observation->'postDiscussionQuiz' IS DISTINCT FROM 'null'::jsonb
    OR jsonb_typeof(p_observation->'turns') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid discussion observation fields' USING ERRCODE='22023';
  END IF;
  v_discussion := (p_observation->>'discussionId')::uuid;
  PERFORM 1 FROM public.scenes s WHERE s.stage_id=p_stage AND s.id=p_observation->>'sceneId' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discussion scene forbidden' USING ERRCODE='42501'; END IF;
  IF jsonb_array_length(p_observation->'turns') NOT BETWEEN 1 AND 256 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_observation->'turns') t
    WHERE jsonb_typeof(t) IS DISTINCT FROM 'object'
      OR NOT (t ?& ARRAY['id','agentId','interventionType','durationMs','outcome'])
      OR (t-ARRAY['id','agentId','interventionType','durationMs','outcome']) <> '{}'::jsonb
      OR jsonb_typeof(t->'id') IS DISTINCT FROM 'string' OR length(btrim(t->>'id')) NOT BETWEEN 1 AND 256
      OR jsonb_typeof(t->'agentId') IS DISTINCT FROM 'string' OR length(btrim(t->>'agentId')) NOT BETWEEN 1 AND 256
      OR jsonb_typeof(t->'durationMs') IS DISTINCT FROM 'number' OR (t->>'durationMs') !~ '^[0-9]+$'
      OR coalesce(t->>'interventionType','') NOT IN ('question','answer','counter_argument','synthesis','joke','example','unknown')
      OR coalesce(t->>'outcome','') NOT IN ('completed','interrupted','failed')
  ) THEN RAISE EXCEPTION 'Invalid discussion turns' USING ERRCODE='22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_observation->'turns') t
    WHERE (t->>'durationMs')::numeric NOT BETWEEN 0 AND 86400000
      OR NOT coalesce((t->>'agentId')=ANY(v_agents),false)
      OR (t->>'outcome'<>'completed' AND t->>'interventionType'<>'unknown')
  ) OR (SELECT count(DISTINCT t->>'id') FROM jsonb_array_elements(p_observation->'turns') t)
    <> jsonb_array_length(p_observation->'turns') THEN
    RAISE EXCEPTION 'Invalid discussion measures or agents' USING ERRCODE='22023';
  END IF;

  SELECT t.* INTO v_previous FROM public.discussion_patterns t
    JOIN qalem_telemetry_private.subjects s ON s.subject_hash=t.subject_hash
    WHERE s.user_id=p_actor AND t.discussion_id=v_discussion LIMIT 1;
  IF FOUND THEN
    IF v_previous.org_id IS DISTINCT FROM p_org OR v_previous.stage_id IS DISTINCT FROM p_stage
      OR v_previous.observation IS DISTINCT FROM p_observation THEN
      RAISE EXCEPTION 'Discussion is immutable' USING ERRCODE='22023';
    END IF;
    RETURN true;
  END IF;
  -- Only unambiguous persisted course context can feed later aggregations.
  BEGIN
    SELECT c.language,c.outline->'analyticsContext' INTO STRICT v_language,v_context
      FROM public.courses c WHERE c.stage_id=p_stage AND c.org_id IS NOT DISTINCT FROM v_source_org
        AND c.status='ready' FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    v_language := NULL; v_context := NULL;
  END;
  IF v_language NOT IN ('fr-FR','ar-MA','en-US') THEN v_language := NULL; END IF;
  IF jsonb_typeof(v_context->'subjectTags')='array' THEN
    IF jsonb_array_length(v_context->'subjectTags')<=20 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_context->'subjectTags') t
      WHERE jsonb_typeof(t)<>'string' OR length(t #>> '{}') NOT BETWEEN 1 AND 256
        OR (t #>> '{}') !~ '^[A-Za-z0-9_:-]+$'
    ) THEN
      SELECT coalesce(array_agg(value ORDER BY ordinal),ARRAY[]::text[]) INTO v_tags
        FROM jsonb_array_elements_text(v_context->'subjectTags') WITH ORDINALITY t(value,ordinal);
    END IF;
  END IF;
  INSERT INTO qalem_telemetry_private.subjects(user_id,org_id) VALUES(p_actor,p_org)
    ON CONFLICT(user_id,org_id) DO NOTHING;
  SELECT subject_hash INTO v_hash FROM qalem_telemetry_private.subjects WHERE user_id=p_actor AND org_id=p_org;
  INSERT INTO public.discussion_patterns(
    user_hash,subject_hash,org_id,stage_id,discussion_id,observation,
    agent_sequence,intervention_types,turn_durations,total_turns,
    post_discussion_quiz_score,engagement_score,subject_tags,language,agent_count
  ) SELECT v_hash,v_hash,p_org,p_stage,v_discussion,p_observation,
    array_agg(t->>'agentId' ORDER BY ordinal),array_agg(t->>'interventionType' ORDER BY ordinal),
    -- Legacy column remains seconds. Exact milliseconds live in observation.
    array_agg(floor((t->>'durationMs')::numeric/1000)::integer ORDER BY ordinal),
    count(*)::integer,NULL,NULL,v_tags,v_language,cardinality(v_agents)
    FROM jsonb_array_elements(p_observation->'turns') WITH ORDINALITY e(t,ordinal);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_consented_discussion(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_consented_discussion(uuid,text,uuid,uuid,jsonb) TO service_role;
