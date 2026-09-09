-- Run after 20260909185224 inside BEGIN/ROLLBACK; no durable fixture.
SET LOCAL ROLE service_role;
INSERT INTO public.organizations(id, name) VALUES
 ('00000000-0036-4000-8000-000000000201', 'S036 optimizer tenant A'),
 ('00000000-0036-4000-8000-000000000202', 'S036 optimizer tenant B');
INSERT INTO public.pedagogy_telemetry(id,user_hash,org_id,stage_id,scene_sequence,quiz_scores,subject_tags,level,language) VALUES
 ('00000000-0036-4000-8000-000000000203','s036-test-a','00000000-0036-4000-8000-000000000201','s036-shared-stage',ARRAY['slide','quiz'],ARRAY[0.2],ARRAY['SIPOC'],'adult','fr-FR'),
 ('00000000-0036-4000-8000-000000000204','s036-test-b','00000000-0036-4000-8000-000000000202','s036-shared-stage',ARRAY['quiz','slide'],ARRAY[0.9],ARRAY['SIPOC'],'adult','fr-FR'),
 ('00000000-0036-4000-8000-000000000205','s036-test-legacy',NULL,'s036-shared-stage',ARRAY['quiz'],ARRAY[1.0],ARRAY['SIPOC'],'adult','fr-FR');
DO $$
DECLARE selected_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO selected_ids FROM (
    SELECT id FROM public.pedagogy_telemetry
    WHERE org_id='00000000-0036-4000-8000-000000000201'
      AND stage_id IN ('s036-shared-stage') AND subject_tags @> ARRAY['SIPOC']
      AND level='adult' AND language='fr-FR'
    ORDER BY created_at DESC,id DESC LIMIT 1000
  ) selected;
  IF selected_ids IS DISTINCT FROM ARRAY['00000000-0036-4000-8000-000000000203'::uuid] THEN
    RAISE EXCEPTION 'Tenant A scope failed';
  END IF;
  SELECT array_agg(id) INTO selected_ids FROM (
    SELECT id FROM public.pedagogy_telemetry
    WHERE org_id='00000000-0036-4000-8000-000000000202'
      AND stage_id IN ('s036-shared-stage') AND subject_tags @> ARRAY['SIPOC']
      AND level='adult' AND language='fr-FR'
    ORDER BY created_at DESC,id DESC LIMIT 1000
  ) selected;
  IF selected_ids IS DISTINCT FROM ARRAY['00000000-0036-4000-8000-000000000204'::uuid] THEN
    RAISE EXCEPTION 'Tenant B scope failed';
  END IF;
END;
$$;
RESET ROLE;
