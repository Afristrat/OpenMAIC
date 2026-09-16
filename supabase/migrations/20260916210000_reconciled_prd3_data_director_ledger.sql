-- Le self-hosted Supabase ne conserve pas l'historique applicatif des fichiers
-- Qalem. Ce registre privé atteste uniquement les lots effectivement prévolés
-- et appliqués ; il ne reconstitue jamais une histoire antérieure par défaut.
CREATE SCHEMA IF NOT EXISTS qalem_ops_private;
REVOKE ALL ON SCHEMA qalem_ops_private FROM PUBLIC, anon, authenticated;

CREATE TABLE qalem_ops_private.reconciled_schema_batches (
  batch_id text PRIMARY KEY CHECK (batch_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  source_files text[] NOT NULL CHECK (cardinality(source_files) > 0),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  preflight text NOT NULL CHECK (preflight IN ('transaction-rollback')),
  backup_sha256 text NOT NULL CHECK (backup_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_by name NOT NULL DEFAULT current_user,
  notes text NOT NULL
);

ALTER TABLE qalem_ops_private.reconciled_schema_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qalem_ops_private.reconciled_schema_batches FROM PUBLIC, anon, authenticated;

INSERT INTO qalem_ops_private.reconciled_schema_batches (
  batch_id,
  source_files,
  source_sha256,
  preflight,
  backup_sha256,
  notes
) VALUES (
  'prd3-data-director-20260916',
  ARRAY[
    '20260910021405_course_xapi_projection.sql',
    '20260910022754_course_quiz_attempts.sql',
    '20260910023423_course_discussion_observations.sql',
    '20260910024337_anchor_xapi_consent.sql',
    '20260910025207_course_xapi_choice.sql',
    '20260910033146_consented_discussion_collection.sql',
    '20260910042141_discussion_quiz_linkage.sql',
    '20260910045739_director_experiment_receipts.sql',
    '20260910051111_director_experiment_outcomes.sql'
  ],
  'c86bf2b5cacaf8c361323400ca251dca98bed91c9f51f0a8f04fbca970d455ed',
  'transaction-rollback',
  '0f961ea41e8a5a796d0d6e94c61a05eca48a30ccbb8296d309a4f861a9b3ced9',
  'Lot appliqué atomiquement après prévol annulé sur le schéma réel ; xapi_emission demeure désactivé.'
) ON CONFLICT (batch_id) DO NOTHING;
