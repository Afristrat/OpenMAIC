-- =============================================================================
-- S2-010 — Une transmission en échec conserve sa source immuable
-- =============================================================================

-- La contrainte initiale assimilait par erreur « source présente » à « transmission
-- terminée ». Lorsqu'un traitement dérivé échoue après le rendu de la source, la
-- transition vers failed doit rester possible afin de permettre une reprise sûre.
ALTER TABLE public.transmissions
  DROP CONSTRAINT IF EXISTS transmissions_source_artifact_matches_status;

ALTER TABLE public.transmissions
  ADD CONSTRAINT transmissions_source_artifact_required_when_done
  CHECK (status <> 'done' OR source_artifact_path IS NOT NULL) NOT VALID;
