-- Supprime les deux avertissements de `supabase db lint --level warning`
-- (variables déclarées et inutilisées) sans changer le comportement des
-- fonctions. Les droits d'exécution existants sont conservés par
-- CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.update_tenant_controls(
  actor_user_id UUID,
  tenant_id UUID,
  next_status TEXT DEFAULT NULL,
  next_seat_limit INTEGER DEFAULT NULL
)
RETURNS SETOF public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  occupied_seats INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = actor_user_id) THEN
    RAISE EXCEPTION 'INVALID_TENANT_ACTOR' USING ERRCODE = '42501';
  END IF;
  IF next_status IS NOT NULL AND next_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'INVALID_TENANT_STATUS' USING ERRCODE = '22023';
  END IF;
  IF next_seat_limit IS NOT NULL AND next_seat_limit < 1 THEN
    RAISE EXCEPTION 'INVALID_TENANT_SEAT_LIMIT' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.organizations WHERE id = tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    (SELECT count(*) FROM public.org_members WHERE org_id = tenant_id)
    +
    (SELECT count(*) FROM public.org_invitations
      WHERE org_id = tenant_id AND used_at IS NULL AND expires_at > now())
  INTO occupied_seats;

  IF next_seat_limit IS NOT NULL AND next_seat_limit < occupied_seats THEN
    RAISE EXCEPTION 'TENANT_SEAT_LIMIT_BELOW_OCCUPANCY' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('qalem.actor_id', actor_user_id::TEXT, true);
  RETURN QUERY
  UPDATE public.organizations
  SET
    status = COALESCE(next_status, organizations.status),
    seat_limit = COALESCE(next_seat_limit, organizations.seat_limit),
    updated_at = now()
  WHERE organizations.id = tenant_id
  RETURNING organizations.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tenant_usages(
  p_actor UUID,
  p_reservation_ids UUID[],
  p_actual_quantities NUMERIC[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF cardinality(p_reservation_ids) NOT BETWEEN 1 AND 8
    OR cardinality(p_reservation_ids) <> cardinality(p_actual_quantities)
    OR cardinality(p_reservation_ids) <> (
      SELECT count(DISTINCT reservation_id)
      FROM unnest(p_reservation_ids) AS reservation_id
    )
  THEN
    RAISE EXCEPTION 'INVALID_USAGE_FINALIZATION_BATCH' USING ERRCODE = '22023';
  END IF;
  FOR position IN 1..cardinality(p_reservation_ids) LOOP
    IF p_actual_quantities[position] > 0 THEN
      PERFORM * FROM public.settle_tenant_usage(
        p_actor, p_reservation_ids[position], p_actual_quantities[position]
      );
    ELSE
      PERFORM * FROM public.release_tenant_usage(
        p_actor, p_reservation_ids[position], 'Aucun usage mesuré'
      );
    END IF;
  END LOOP;
END;
$$;
