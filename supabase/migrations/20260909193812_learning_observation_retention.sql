-- Product retention: six months of consent-linked observations, bounded cleanup.
-- Legacy rows without an erasable subject remain a separate reconciliation item.
CREATE INDEX pedagogy_telemetry_retention
  ON public.pedagogy_telemetry(created_at, id) WHERE subject_hash IS NOT NULL;

CREATE FUNCTION public.purge_expired_learning_observations()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_deleted integer;
BEGIN
  WITH expired AS (
    SELECT id FROM public.pedagogy_telemetry
    WHERE subject_hash IS NOT NULL AND created_at < now() - interval '180 days'
    ORDER BY created_at, id LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.pedagogy_telemetry t USING expired e WHERE t.id = e.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_learning_observations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_learning_observations() TO service_role;
