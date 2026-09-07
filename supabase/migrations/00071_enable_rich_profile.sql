-- Les référentiels culturels versionnés ont été validés explicitement par le
-- propriétaire produit le 2026-09-07. L’approbation de chaque référentiel
-- reste ensuite propre à l’organisation et enregistrée dans ses paramètres.
INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES (
  'rich_profile',
  true,
  'global',
  'Active le profil enrichi et les référentiels culturels approuvés par organisation.'
)
ON CONFLICT (flag_name) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description;
