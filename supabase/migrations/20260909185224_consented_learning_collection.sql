-- New learning observations are linked to an erasable, tenant-specific pseudonym.
-- Historical unlinked rows are not attributed to a user by inference.
CREATE SCHEMA IF NOT EXISTS qalem_telemetry_private;
REVOKE ALL ON SCHEMA qalem_telemetry_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA qalem_telemetry_private TO service_role;

ALTER TABLE public.telemetry_consent ADD COLUMN collection_epoch uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION qalem_telemetry_private.version_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.collection_epoch := gen_random_uuid();
  ELSIF NEW.pedagogy_consent IS DISTINCT FROM OLD.pedagogy_consent THEN
    NEW.collection_epoch := gen_random_uuid();
  ELSE
    -- Even a direct RLS update cannot restore a previously issued epoch.
    NEW.collection_epoch := OLD.collection_epoch;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.version_consent() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER version_learning_consent BEFORE INSERT OR UPDATE ON public.telemetry_consent
  FOR EACH ROW EXECUTE FUNCTION qalem_telemetry_private.version_consent();

CREATE TABLE qalem_telemetry_private.subjects (
  user_id uuid NOT NULL REFERENCES public.telemetry_consent(user_id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_hash text NOT NULL UNIQUE DEFAULT encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
  PRIMARY KEY (user_id, org_id)
);
ALTER TABLE qalem_telemetry_private.subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qalem_telemetry_private.subjects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qalem_telemetry_private.subjects TO service_role;

ALTER TABLE public.pedagogy_telemetry
  ADD COLUMN subject_hash text REFERENCES qalem_telemetry_private.subjects(subject_hash) ON DELETE CASCADE,
  ADD COLUMN session_id uuid,
  ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN action_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX pedagogy_telemetry_subject_session
  ON public.pedagogy_telemetry(subject_hash, session_id);
CREATE INDEX pedagogy_telemetry_org_created ON public.pedagogy_telemetry(org_id, created_at);

-- A trigger needs narrowly elevated rights because a user may revoke through RLS.
-- It accepts no caller-controlled ID and cannot be called as a public RPC.
CREATE FUNCTION qalem_telemetry_private.erase_on_consent_withdrawal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.pedagogy_consent IS DISTINCT FROM true THEN
    DELETE FROM qalem_telemetry_private.subjects WHERE user_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.erase_on_consent_withdrawal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER erase_learning_on_withdrawal
  AFTER UPDATE OF pedagogy_consent ON public.telemetry_consent
  FOR EACH ROW EXECUTE FUNCTION qalem_telemetry_private.erase_on_consent_withdrawal();

-- Only the authenticated API's service client may supply the verified actor.
CREATE FUNCTION public.record_consented_learning(p_actor uuid, p_session uuid, p_stage text, p_payload jsonb, p_epoch uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_consent boolean;
  v_epoch uuid;
  v_org uuid;
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

  SELECT s.org_id INTO v_org FROM public.stages s
    JOIN public.organizations o ON o.id = s.org_id AND o.status = 'active'
    JOIN public.org_members m ON m.org_id = s.org_id AND m.user_id = p_actor
    WHERE s.id = p_stage FOR SHARE OF s, o, m;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE = '42501'; END IF;
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
REVOKE ALL ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid) TO service_role;
