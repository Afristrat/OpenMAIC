-- No historical reconstruction: only new, authenticated discussion receipts bind.
ALTER TABLE qalem_telemetry_private.director_receipts
  ADD COLUMN discussion_pattern_id uuid REFERENCES public.discussion_patterns(id) ON DELETE CASCADE,
  ADD COLUMN reported_turn_outcome text CHECK (reported_turn_outcome IN ('completed','interrupted','failed')),
  ADD COLUMN discussion_linked_at timestamptz;
CREATE INDEX director_receipts_discussion ON qalem_telemetry_private.director_receipts(discussion_pattern_id);

CREATE FUNCTION qalem_telemetry_private.bind_director_discussion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  -- record_consented_discussion already locks consent; the join also excludes
  -- direct service inserts without valid provenance or a current consent epoch.
  UPDATE qalem_telemetry_private.director_receipts r
    SET discussion_pattern_id=NEW.id,reported_turn_outcome=t.value->>'outcome',discussion_linked_at=clock_timestamp()
    FROM qalem_telemetry_private.subjects s
      JOIN public.telemetry_consent c ON c.user_id=s.user_id AND c.pedagogy_consent,
      jsonb_array_elements(NEW.observation->'turns') t(value)
    WHERE r.subject_hash=NEW.subject_hash AND s.subject_hash=r.subject_hash
      AND s.org_id=NEW.org_id AND r.org_id=NEW.org_id AND r.stage_id=NEW.stage_id
      AND r.scene_id=NEW.observation->>'sceneId' AND r.collection_epoch=c.collection_epoch
      AND r.discussion_pattern_id IS NULL AND r.generated_at<=NEW.recorded_at
      AND r.generation_outcome IS NOT NULL AND r.selected_agent=t.value->>'agentId'
      AND t.value->>'id'='assistant-' || r.id::text;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.bind_director_discussion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bind_director_discussion AFTER INSERT ON public.discussion_patterns
FOR EACH ROW EXECUTE FUNCTION qalem_telemetry_private.bind_director_discussion();

CREATE FUNCTION public.read_director_experiment(p_actor uuid,p_org uuid,p_stage text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE source_org uuid; rows jsonb;
BEGIN
  IF p_actor IS NULL OR p_org IS NULL OR p_stage IS NULL OR p_stage !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'Invalid experiment scope' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.user_id=p_actor AND m.org_id=p_org AND m.role IN ('admin','manager') AND o.status='active') THEN
    RAISE EXCEPTION 'Experiment report denied' USING ERRCODE='42501'; END IF;
  SELECT org_id INTO source_org FROM public.stages WHERE id=p_stage;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experiment stage denied' USING ERRCODE='42501'; END IF;
  IF source_org IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=source_org AND status='active') THEN
    RAISE EXCEPTION 'Experiment source inactive' USING ERRCODE='42501'; END IF;
  IF source_org IS DISTINCT FROM p_org AND NOT EXISTS(SELECT 1 FROM public.shared_classrooms
    WHERE org_id=p_org AND stage_id=p_stage AND authorization_verified AND visibility IN ('organization','public')) THEN
    RAISE EXCEPTION 'Experiment stage denied' USING ERRCODE='42501'; END IF;

  WITH retained AS MATERIALIZED (
    SELECT r.*,s.user_id FROM qalem_telemetry_private.director_receipts r
      JOIN qalem_telemetry_private.subjects s ON s.subject_hash=r.subject_hash AND s.org_id=r.org_id
      JOIN public.telemetry_consent c ON c.user_id=s.user_id AND c.pedagogy_consent AND c.collection_epoch=r.collection_epoch
      WHERE r.org_id=p_org AND r.stage_id=p_stage AND r.experiment='qalem-director-v1'
  ), first_quiz AS (
    -- Include pending first submissions; a later completed attempt must not win.
    SELECT DISTINCT ON (r.subject_hash) r.subject_hash,q.result,q.completed_at
      FROM retained r JOIN public.discussion_patterns d ON d.id=r.discussion_pattern_id
        AND d.subject_hash=r.subject_hash AND d.org_id=r.org_id AND d.stage_id=r.stage_id
      JOIN public.classroom_quiz_attempts q ON q.discussion_pattern_id=d.id
        AND q.user_id=r.user_id AND q.org_id=r.org_id AND q.stage_id=r.stage_id
      WHERE r.generated_at<=d.recorded_at AND d.recorded_at<=q.submitted_at
      ORDER BY r.subject_hash,q.submitted_at,q.id
  ), units AS (
    SELECT r.subject_hash,r.cohort,
      CASE WHEN count(DISTINCT r.language)=1 AND count(r.language)=count(*) THEN min(r.language) END AS language,
      count(*) AS decisions,count(r.selected_at) AS selections,
      count(*) FILTER (WHERE r.reason='observed-pattern') AS suggestion_selections,
      count(*) FILTER (WHERE r.reason='observed-pattern' AND r.selected_agent<>r.classic_agent) AS changed_selections,
      count(*) FILTER (WHERE r.generation_outcome='completed') AS completed_generations,
      count(*) FILTER (WHERE r.generation_outcome='failed') AS failed_generations,
      count(*) FILTER (WHERE r.generation_outcome='empty') AS empty_generations,
      count(*) FILTER (WHERE r.generation_outcome='aborted') AS aborted_generations,
      count(*) FILTER (WHERE r.generation_outcome IS NULL) AS pending_generations,
      count(r.discussion_pattern_id) AS linked_turns,
      sum(r.lookup_ms) AS lookup_sum,count(r.lookup_ms) AS lookup_count,
      bool_or(r.discussion_pattern_id IS NOT NULL) AS has_reported_turns,
      CASE WHEN q.completed_at IS NOT NULL THEN (q.result->>'score')::numeric/100 END AS score
      FROM retained r LEFT JOIN first_quiz q ON q.subject_hash=r.subject_hash
      GROUP BY r.subject_hash,r.cohort,q.completed_at,q.result
  )
  SELECT coalesce(jsonb_agg(value ORDER BY language NULLS LAST,cohort),'[]'::jsonb) INTO rows FROM (
    SELECT cohort,language,jsonb_build_object(
      'cohort',cohort,'language',language,'assignedUnits',count(*),'unitsWithQuiz',count(score),
      'missingQuizUnits',count(*)-count(score),'meanQuizScore',avg(score),
      'unitsWithReportedTurns',count(*) FILTER(WHERE has_reported_turns),
      'decisions',sum(decisions),'selections',sum(selections),'suggestionSelections',sum(suggestion_selections),
      'changedSelections',sum(changed_selections),'completedGenerations',sum(completed_generations),
      'failedGenerations',sum(failed_generations),'emptyGenerations',sum(empty_generations),
      'abortedGenerations',sum(aborted_generations),'pendingGenerations',sum(pending_generations),
      'linkedTurns',sum(linked_turns),'meanLookupMs',sum(lookup_sum)/nullif(sum(lookup_count),0)
    ) AS value FROM units GROUP BY cohort,language
  ) grouped;
  RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.read_director_experiment(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_director_experiment(uuid,uuid,text) TO service_role;
