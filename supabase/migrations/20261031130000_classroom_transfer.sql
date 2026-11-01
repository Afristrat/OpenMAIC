-- Affectation d'une formation à une autre organisation par un super-administrateur.
-- La formation (classroom + cours) change d'organisation et de propriétaire : la personne désignée
-- dans l'organisation d'accueil l'édite, puis décide seule de ses droits et de sa diffusion.
-- L'historique (tentatives, certificats, usage, facturation) reste rattaché à l'organisation d'origine.

CREATE TABLE public.classroom_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id text NOT NULL,
  course_id uuid,
  from_org_id uuid,
  to_org_id uuid NOT NULL,
  from_owner_id uuid,
  to_owner_id uuid NOT NULL,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  -- Ce que l'affectation a coupé ou remis à zéro, pour pouvoir le reconstituer à la main si besoin.
  detached jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX classroom_transfers_stage_idx ON public.classroom_transfers(stage_id, performed_at DESC);

-- RLS active et aucune politique : seul le service (route réservée au super-administrateur) y accède.
ALTER TABLE public.classroom_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.classroom_transfers FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.transfer_classroom_to_organization(
  p_actor uuid,
  p_stage text,
  p_to_org uuid,
  p_new_owner uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s record;
  c record;
  v_course_count integer;
  v_shares integer := 0;
  v_delegations integer := 0;
  v_detached jsonb;
BEGIN
  SELECT id, org_id, owner_id INTO s FROM public.stages WHERE id = p_stage FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF s.org_id IS NOT DISTINCT FROM p_to_org THEN
    RAISE EXCEPTION 'SAME_ORGANIZATION' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_to_org AND status = 'active') THEN
    RAISE EXCEPTION 'TARGET_ORGANIZATION_INACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = p_to_org AND user_id = p_new_owner
      AND role IN ('admin', 'manager', 'formateur', 'author')
  ) THEN
    RAISE EXCEPTION 'NEW_OWNER_NOT_ELIGIBLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_course_count FROM public.courses WHERE stage_id = p_stage;
  IF v_course_count > 1 THEN RAISE EXCEPTION 'MULTIPLE_COURSES' USING ERRCODE = 'P0001'; END IF;
  SELECT id, owner_id, import_id, source_manifest_id, catalog_visible INTO c
  FROM public.courses WHERE stage_id = p_stage FOR UPDATE;

  -- Le classroom d'abord : le cours exige que les deux appartiennent à la même organisation.
  UPDATE public.stages SET org_id = p_to_org, owner_id = p_new_owner WHERE id = p_stage;
  IF c.id IS NOT NULL THEN
    -- L'import et le manifeste de sources appartiennent à l'organisation d'origine : on les détache.
    UPDATE public.courses
    SET org_id = p_to_org, owner_id = p_new_owner, import_id = NULL,
        source_manifest_id = NULL, catalog_visible = false
    WHERE id = c.id;
  END IF;

  -- La diffusion et l'édition déléguée décidées par l'ancienne organisation ne suivent pas.
  DELETE FROM public.shared_classrooms WHERE stage_id = p_stage;
  GET DIAGNOSTICS v_shares = ROW_COUNT;
  DELETE FROM public.classroom_edit_delegations WHERE stage_id = p_stage;
  GET DIAGNOSTICS v_delegations = ROW_COUNT;

  v_detached := jsonb_build_object(
    'sharedClassrooms', v_shares,
    'editDelegations', v_delegations,
    'catalogVisible', c.catalog_visible,
    'importId', c.import_id,
    'sourceManifestId', c.source_manifest_id
  );
  INSERT INTO public.classroom_transfers
    (stage_id, course_id, from_org_id, to_org_id, from_owner_id, to_owner_id, performed_by, detached)
  VALUES (p_stage, c.id, s.org_id, p_to_org, s.owner_id, p_new_owner, p_actor, v_detached);

  RETURN jsonb_build_object(
    'stageId', p_stage,
    'courseId', c.id,
    'fromOrgId', s.org_id,
    'toOrgId', p_to_org,
    'newOwnerId', p_new_owner,
    'detached', v_detached
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_classroom_to_organization(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_classroom_to_organization(uuid, text, uuid, uuid)
  TO service_role;
