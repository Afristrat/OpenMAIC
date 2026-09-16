-- Atteste le correctif atomique de la collecte consentie réellement appliqué.
-- Ce registre ne reconstitue pas d'historique absent : il ajoute une preuve
-- append-only du prévol annulé et de la sauvegarde qui ont précédé ce lot.
INSERT INTO qalem_ops_private.reconciled_schema_batches (
  batch_id,
  source_files,
  source_sha256,
  preflight,
  backup_sha256,
  notes
) VALUES (
  'prd3-learning-fix-20260916',
  ARRAY[
    '20260910020547_learning_scene_observations.sql',
    '20260916213000_unify_consented_learning_signature.sql'
  ],
  'cd8593d67a9e97ee7db06cb0122eb47bcf20b2e7d23fbf29fa812d2ccdccc9dc',
  'transaction-rollback',
  '99293552fa6a9f682260370d8f24c2db89629b648deaefd9cf0e664dc551ab2c',
  'Lot appliqué atomiquement après prévol annulé : colonne scene_observations et signature à six arguments uniquement.'
) ON CONFLICT (batch_id) DO NOTHING;
