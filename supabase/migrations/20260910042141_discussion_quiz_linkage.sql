-- Server receipt order only. Historical discussions are never backfilled.
ALTER TABLE public.discussion_patterns ADD COLUMN recorded_at timestamptz;
ALTER TABLE public.classroom_quiz_attempts ADD COLUMN discussion_pattern_id uuid
  REFERENCES public.discussion_patterns(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX classroom_quiz_first_discussion ON public.classroom_quiz_attempts(discussion_pattern_id);
CREATE INDEX discussion_receipt_scope ON public.discussion_patterns(subject_hash,stage_id,recorded_at DESC,id);

CREATE FUNCTION qalem_telemetry_private.stamp_discussion_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.recorded_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.stamp_discussion_receipt() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER stamp_discussion_receipt BEFORE INSERT ON public.discussion_patterns
FOR EACH ROW EXECUTE FUNCTION qalem_telemetry_private.stamp_discussion_receipt();

CREATE FUNCTION qalem_quiz_private.capture_preceding_discussion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean; candidate uuid;
BEGIN
  -- Consent row also serializes first-attempt selection for concurrent submissions.
  SELECT pedagogy_consent INTO allowed FROM public.telemetry_consent WHERE user_id=NEW.user_id FOR UPDATE;
  NEW.discussion_pattern_id := NULL;
  IF allowed IS DISTINCT FROM true THEN RETURN NEW; END IF;
  SELECT d.id INTO candidate FROM public.discussion_patterns d
    JOIN qalem_telemetry_private.subjects s ON s.subject_hash=d.subject_hash
    WHERE s.user_id=NEW.user_id AND s.org_id=NEW.org_id AND d.org_id=NEW.org_id
      AND d.stage_id=NEW.stage_id AND d.observation IS NOT NULL
      AND d.recorded_at<=NEW.submitted_at
    ORDER BY d.recorded_at DESC,d.id DESC LIMIT 1;
  -- Never skip a consumed latest discussion to attach to an older one.
  IF candidate IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classroom_quiz_attempts WHERE discussion_pattern_id=candidate
  ) THEN NEW.discussion_pattern_id := candidate; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qalem_quiz_private.capture_preceding_discussion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_preceding_discussion BEFORE INSERT ON public.classroom_quiz_attempts
FOR EACH ROW EXECUTE FUNCTION qalem_quiz_private.capture_preceding_discussion();

CREATE FUNCTION qalem_quiz_private.publish_discussion_quiz_score()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE public.discussion_patterns SET post_discussion_quiz_score=NULL WHERE id=OLD.discussion_pattern_id;
    RETURN OLD;
  END IF;
  IF OLD.result IS NOT NULL OR NEW.result IS NULL OR NEW.discussion_pattern_id IS NULL THEN RETURN NEW; END IF;
  SELECT pedagogy_consent INTO allowed FROM public.telemetry_consent WHERE user_id=NEW.user_id FOR UPDATE;
  IF allowed IS DISTINCT FROM true THEN RETURN NEW; END IF;
  UPDATE public.discussion_patterns d SET post_discussion_quiz_score=(NEW.result->>'score')::real/100
    FROM qalem_telemetry_private.subjects s WHERE d.id=NEW.discussion_pattern_id
      AND s.subject_hash=d.subject_hash AND s.user_id=NEW.user_id AND s.org_id=NEW.org_id
      AND d.org_id=NEW.org_id AND d.stage_id=NEW.stage_id AND d.recorded_at<=NEW.submitted_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION qalem_quiz_private.publish_discussion_quiz_score() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER publish_discussion_quiz_score AFTER UPDATE OF result ON public.classroom_quiz_attempts
FOR EACH ROW EXECUTE FUNCTION qalem_quiz_private.publish_discussion_quiz_score();
CREATE TRIGGER erase_discussion_quiz_score AFTER DELETE ON public.classroom_quiz_attempts
FOR EACH ROW EXECUTE FUNCTION qalem_quiz_private.publish_discussion_quiz_score();

-- Lock consent before the attempt row: withdrawal cascades clear its association.
ALTER FUNCTION public.complete_classroom_quiz_attempt(uuid,uuid,uuid,jsonb) SET SCHEMA qalem_quiz_private;
CREATE FUNCTION public.complete_classroom_quiz_attempt(p_actor uuid,p_id uuid,p_lease uuid,p_result jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.telemetry_consent WHERE user_id=p_actor FOR UPDATE;
  RETURN qalem_quiz_private.complete_classroom_quiz_attempt(p_actor,p_id,p_lease,p_result);
END $$;
REVOKE ALL ON FUNCTION public.complete_classroom_quiz_attempt(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_classroom_quiz_attempt(uuid,uuid,uuid,jsonb) TO service_role;

-- Extend the existing streamed account download without duplicating its other sections.
CREATE FUNCTION public.read_account_discussion_export_page(p_actor uuid,p_section text,p_after text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Actor required' USING ERRCODE='22023'; END IF;
  IF p_section='classroom_quiz_attempts' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('cursor',id::text,'value',value) ORDER BY id),'[]'::jsonb) INTO rows
      FROM (SELECT t.id,jsonb_build_object('id',t.id,'org_id',t.org_id,'stage_id',t.stage_id,'scene_id',t.scene_id,
        'answers',t.answers,'language',t.language,'result',t.result,'submitted_at',t.submitted_at,
        'completed_at',t.completed_at,'discussion_pattern_id',t.discussion_pattern_id) AS value
        FROM public.classroom_quiz_attempts t WHERE t.user_id=p_actor AND (p_after IS NULL OR t.id>p_after::uuid)
        ORDER BY t.id LIMIT 100) page;
  ELSIF p_section='discussion_patterns' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('cursor',id::text,'value',value) ORDER BY id),'[]'::jsonb) INTO rows
      FROM (SELECT d.id,jsonb_build_object('id',d.id,'org_id',d.org_id,'stage_id',d.stage_id,
        'discussion_id',d.discussion_id,'observation',d.observation,'recorded_at',d.recorded_at,
        'post_discussion_quiz_score',d.post_discussion_quiz_score,
        'quiz_attempt_id',q.id,'quiz_scene_id',q.scene_id,'quiz_submitted_at',q.submitted_at,
        'quiz_completed_at',q.completed_at,'association_method','first-submission-after-server-receipt-v1') AS value
        FROM public.discussion_patterns d JOIN qalem_telemetry_private.subjects s ON s.subject_hash=d.subject_hash
        LEFT JOIN public.classroom_quiz_attempts q ON q.discussion_pattern_id=d.id
        WHERE s.user_id=p_actor AND (p_after IS NULL OR d.id>p_after::uuid)
        ORDER BY d.id LIMIT 100) page;
  ELSE RAISE EXCEPTION 'Unknown section' USING ERRCODE='22023'; END IF;
  RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.read_account_discussion_export_page(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_discussion_export_page(uuid,text,text) TO service_role;

CREATE FUNCTION public.read_authorized_discussion_patterns(p_actor uuid,p_org uuid,p_stages text[],p_subject text,p_language text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb;
BEGIN
  IF p_actor IS NULL OR p_org IS NULL OR coalesce(cardinality(p_stages),0) NOT BETWEEN 1 AND 1000
    OR length(btrim(p_subject)) NOT BETWEEN 1 AND 256 OR p_subject IS NULL
    OR p_language IS NULL OR p_language NOT IN ('fr-FR','ar-MA','en-US') THEN
    RAISE EXCEPTION 'Invalid pattern scope' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.user_id=p_actor AND m.org_id=p_org AND o.status='active') THEN
    RAISE EXCEPTION 'Pattern scope denied' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY recorded_at DESC,id DESC),'[]'::jsonb) INTO rows
    FROM (SELECT d.id,d.recorded_at,jsonb_build_object('agent_sequence',d.agent_sequence,
      'intervention_types',d.intervention_types,'post_discussion_quiz_score',(q.result->>'score')::numeric/100) AS value
      FROM public.discussion_patterns d
      JOIN qalem_telemetry_private.subjects s ON s.subject_hash=d.subject_hash AND s.org_id=p_org
      JOIN public.telemetry_consent c ON c.user_id=s.user_id AND c.pedagogy_consent
      JOIN public.classroom_quiz_attempts q ON q.discussion_pattern_id=d.id AND q.user_id=s.user_id AND q.org_id=p_org AND q.stage_id=d.stage_id
      JOIN public.stages stage ON stage.id=d.stage_id
      WHERE d.org_id=p_org AND d.stage_id=ANY(p_stages) AND d.language=p_language
        AND d.subject_tags @> ARRAY[btrim(p_subject)] AND q.result IS NOT NULL
        AND q.completed_at IS NOT NULL AND d.recorded_at<=q.submitted_at
        AND (stage.org_id=p_org OR (EXISTS(SELECT 1 FROM public.shared_classrooms sh
          WHERE sh.org_id=p_org AND sh.stage_id=stage.id AND sh.authorization_verified
            AND sh.visibility IN ('organization','public'))
          AND (stage.org_id IS NULL OR EXISTS(SELECT 1 FROM public.organizations source WHERE source.id=stage.org_id AND source.status='active'))))
      ORDER BY d.recorded_at DESC,d.id DESC LIMIT 1000) page;
  RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.read_authorized_discussion_patterns(uuid,uuid,text[],text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_authorized_discussion_patterns(uuid,uuid,text[],text,text) TO service_role;
