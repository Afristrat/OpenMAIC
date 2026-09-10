-- Experiment evidence is server-owned and erased with the existing tenant pseudonym.
CREATE TABLE qalem_telemetry_private.director_receipts (
  id uuid PRIMARY KEY,
  subject_hash text NOT NULL REFERENCES qalem_telemetry_private.subjects(subject_hash) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id text NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  scene_id text NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  collection_epoch uuid NOT NULL,
  experiment text NOT NULL DEFAULT 'qalem-director-v1' CHECK (experiment='qalem-director-v1'),
  cohort text NOT NULL CHECK (cohort IN ('classic','data-driven')),
  language text CHECK (language IN ('fr-FR','ar-MA','en-US')),
  classic_agent text NOT NULL,
  selected_agent text,
  reason text CHECK (reason IN ('control','observed-pattern','no-compatible-pattern','unavailable-context')),
  sample_size integer CHECK (sample_size BETWEEN 1 AND 1000),
  observed_score numeric CHECK (observed_score BETWEEN 0 AND 1),
  lookup_ms integer CHECK (lookup_ms BETWEEN 0 AND 86400000),
  generation_outcome text CHECK (generation_outcome IN ('completed','empty','failed','aborted')),
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  selected_at timestamptz,
  generated_at timestamptz,
  CHECK ((reason='observed-pattern' AND sample_size IS NOT NULL AND observed_score IS NOT NULL)
    OR (reason IS DISTINCT FROM 'observed-pattern' AND sample_size IS NULL AND observed_score IS NULL)),
  CHECK (reason IS NULL OR (cohort='classic' AND reason='control') OR (cohort='data-driven' AND reason<>'control')),
  CHECK ((selected_agent IS NULL AND selected_at IS NULL AND reason IS NULL AND lookup_ms IS NULL)
    OR (selected_agent IS NOT NULL AND selected_at IS NOT NULL AND reason IS NOT NULL AND lookup_ms IS NOT NULL)),
  CHECK ((generation_outcome IS NULL AND generated_at IS NULL)
    OR (generation_outcome IS NOT NULL AND generated_at IS NOT NULL AND selected_at IS NOT NULL))
);
ALTER TABLE qalem_telemetry_private.director_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qalem_telemetry_private.director_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON qalem_telemetry_private.director_receipts TO service_role;
CREATE INDEX director_receipts_subject ON qalem_telemetry_private.director_receipts(subject_hash,stage_id,assigned_at);
CREATE INDEX director_receipts_org ON qalem_telemetry_private.director_receipts(org_id,stage_id,cohort);
CREATE INDEX director_receipts_scene ON qalem_telemetry_private.director_receipts(scene_id);

CREATE FUNCTION qalem_telemetry_private.director_scope(p_actor uuid,p_org uuid,p_stage text,p_scene text,p_agent text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE source_org uuid; agents text[];
BEGIN
  SELECT org_id,agent_ids INTO source_org,agents FROM public.stages WHERE id=p_stage FOR SHARE;
  IF NOT FOUND OR NOT coalesce(p_agent=ANY(agents),false) THEN RETURN false; END IF;
  PERFORM 1 FROM public.scenes WHERE id=p_scene AND stage_id=p_stage FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
    WHERE m.user_id=p_actor AND o.id=p_org AND o.status='active' FOR SHARE OF m,o;
  IF NOT FOUND THEN RETURN false; END IF;
  IF source_org IS NOT NULL THEN
    PERFORM 1 FROM public.organizations WHERE id=source_org AND status='active' FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  IF source_org IS DISTINCT FROM p_org THEN
    PERFORM 1 FROM public.shared_classrooms WHERE stage_id=p_stage AND org_id=p_org
      AND authorization_verified AND visibility IN ('organization','public') LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION qalem_telemetry_private.director_scope(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION qalem_telemetry_private.director_scope(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.begin_director_receipt(p_actor uuid,p_org uuid,p_stage text,p_scene text,p_id uuid,p_classic text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean; epoch uuid; hash text; arm text; lang text;
BEGIN
  IF p_actor IS NULL OR p_org IS NULL OR p_id IS NULL OR p_stage IS NULL
    OR p_stage !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'Invalid Director scope' USING ERRCODE='22023'; END IF;
  SELECT pedagogy_consent,collection_epoch INTO allowed,epoch FROM public.telemetry_consent WHERE user_id=p_actor FOR UPDATE;
  IF allowed IS DISTINCT FROM true THEN RETURN NULL; END IF;
  IF NOT qalem_telemetry_private.director_scope(p_actor,p_org,p_stage,p_scene,p_classic) THEN
    RAISE EXCEPTION 'Director scope denied' USING ERRCODE='42501'; END IF;
  INSERT INTO qalem_telemetry_private.subjects(user_id,org_id) VALUES(p_actor,p_org) ON CONFLICT DO NOTHING;
  SELECT subject_hash INTO hash FROM qalem_telemetry_private.subjects WHERE user_id=p_actor AND org_id=p_org;
  -- Matches the JavaScript JSON tuple and SHA-256 uint32 parity exactly.
  arm := CASE WHEN get_byte(sha256(convert_to('qalem-director-v1:' ||
    format('["%s","%s","%s"]',p_actor,p_org,p_stage),'UTF8')),3)%2=0 THEN 'data-driven' ELSE 'classic' END;
  SELECT CASE WHEN count(*)=1 THEN max(c.language) END INTO lang FROM public.courses c
    JOIN public.stages s ON s.id=c.stage_id AND c.org_id IS NOT DISTINCT FROM s.org_id
    WHERE c.stage_id=p_stage AND c.status='ready';
  IF lang NOT IN ('fr-FR','ar-MA','en-US') THEN lang := NULL; END IF;
  INSERT INTO qalem_telemetry_private.director_receipts(id,subject_hash,org_id,stage_id,scene_id,collection_epoch,cohort,language,classic_agent)
    VALUES(p_id,hash,p_org,p_stage,p_scene,epoch,arm,lang,p_classic) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM qalem_telemetry_private.director_receipts r WHERE r.id=p_id
    AND r.subject_hash=hash AND r.org_id=p_org AND r.stage_id=p_stage AND r.scene_id=p_scene
    AND r.collection_epoch=epoch AND r.classic_agent=p_classic AND r.cohort=arm) THEN
    RAISE EXCEPTION 'Director receipt is immutable' USING ERRCODE='22023'; END IF;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_director_receipt(uuid,uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_director_receipt(uuid,uuid,text,text,uuid,text) TO service_role;

CREATE FUNCTION public.select_director_receipt(p_actor uuid,p_id uuid,p_selected text,p_reason text,p_sample integer,p_score numeric,p_lookup_ms integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean; epoch uuid; r qalem_telemetry_private.director_receipts;
BEGIN
  SELECT pedagogy_consent,collection_epoch INTO allowed,epoch FROM public.telemetry_consent WHERE user_id=p_actor FOR UPDATE;
  IF allowed IS DISTINCT FROM true THEN RETURN false; END IF;
  SELECT d.* INTO r FROM qalem_telemetry_private.director_receipts d
    JOIN qalem_telemetry_private.subjects s ON s.subject_hash=d.subject_hash
    WHERE d.id=p_id AND s.user_id=p_actor FOR UPDATE OF d;
  IF NOT FOUND OR r.collection_epoch<>epoch THEN RETURN false; END IF;
  IF NOT qalem_telemetry_private.director_scope(p_actor,r.org_id,r.stage_id,r.scene_id,p_selected) THEN
    RAISE EXCEPTION 'Director scope denied' USING ERRCODE='42501'; END IF;
  IF p_selected IS NULL OR p_reason IS NULL OR p_lookup_ms IS NULL THEN
    RAISE EXCEPTION 'Director selection required' USING ERRCODE='22023'; END IF;
  IF r.selected_at IS NOT NULL THEN
    IF r.selected_agent IS DISTINCT FROM p_selected OR r.reason IS DISTINCT FROM p_reason
      OR r.sample_size IS DISTINCT FROM p_sample OR r.observed_score IS DISTINCT FROM p_score
      OR r.lookup_ms IS DISTINCT FROM p_lookup_ms THEN
      RAISE EXCEPTION 'Director selection is immutable' USING ERRCODE='22023'; END IF;
    RETURN true;
  END IF;
  UPDATE qalem_telemetry_private.director_receipts SET selected_agent=p_selected,reason=p_reason,
    sample_size=p_sample,observed_score=p_score,lookup_ms=p_lookup_ms,selected_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.select_director_receipt(uuid,uuid,text,text,integer,numeric,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.select_director_receipt(uuid,uuid,text,text,integer,numeric,integer) TO service_role;

CREATE FUNCTION public.finish_director_receipt(p_actor uuid,p_id uuid,p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed boolean; epoch uuid; r qalem_telemetry_private.director_receipts;
BEGIN
  SELECT pedagogy_consent,collection_epoch INTO allowed,epoch FROM public.telemetry_consent WHERE user_id=p_actor FOR UPDATE;
  IF allowed IS DISTINCT FROM true THEN RETURN false; END IF;
  SELECT d.* INTO r FROM qalem_telemetry_private.director_receipts d
    JOIN qalem_telemetry_private.subjects s ON s.subject_hash=d.subject_hash
    WHERE d.id=p_id AND s.user_id=p_actor FOR UPDATE OF d;
  IF NOT FOUND OR r.collection_epoch<>epoch OR r.selected_at IS NULL THEN RETURN false; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('completed','empty','failed','aborted') THEN
    RAISE EXCEPTION 'Invalid generation outcome' USING ERRCODE='22023'; END IF;
  IF r.generation_outcome IS NOT NULL THEN
    IF r.generation_outcome<>p_outcome THEN RAISE EXCEPTION 'Generation outcome is immutable' USING ERRCODE='22023'; END IF;
    RETURN true;
  END IF;
  UPDATE qalem_telemetry_private.director_receipts SET generation_outcome=p_outcome,generated_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_director_receipt(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_director_receipt(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.read_account_director_export_page(p_actor uuid,p_section text,p_after text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb;
BEGIN
  IF p_actor IS NULL OR p_section IS DISTINCT FROM 'director_receipts' THEN RAISE EXCEPTION 'Invalid export scope' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('cursor',id::text,'value',value) ORDER BY id),'[]'::jsonb) INTO rows
    FROM (SELECT d.id,to_jsonb(d)-ARRAY['subject_hash','collection_epoch'] AS value
      FROM qalem_telemetry_private.director_receipts d JOIN qalem_telemetry_private.subjects s ON s.subject_hash=d.subject_hash
      WHERE s.user_id=p_actor AND (p_after IS NULL OR d.id>p_after::uuid) ORDER BY d.id LIMIT 100) page;
  RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.read_account_director_export_page(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_director_export_page(uuid,text,text) TO service_role;
