-- Le catalogue interne est livré. Son flag doit être provisionné par le
-- schéma, sans dépendre d’une activation manuelle après déploiement.
INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES (
  'course_catalog',
  true,
  'global',
  'Active le catalogue interne des formations prêtes et publiées.'
)
ON CONFLICT (flag_name) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description;
