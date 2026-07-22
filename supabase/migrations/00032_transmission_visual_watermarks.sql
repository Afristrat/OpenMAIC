-- =============================================================================
-- S2-009 — Artefacts visuels de transmission
-- =============================================================================

-- New and updated rows may only become ready when the immutable source and
-- the visual derivative are both present. NOT VALID preserves any legacy rows
-- so they can be regenerated deliberately instead of being silently rewritten.
ALTER TABLE public.transmissions
  ADD CONSTRAINT transmissions_visual_derivative_required_when_done
  CHECK (
    status <> 'done'
    OR (source_artifact_path IS NOT NULL AND visual_watermark_path IS NOT NULL)
  ) NOT VALID;
