-- La commande de capsule vidéo est publiée dans l’éditeur. Son flag doit donc
-- être provisionné avec le schéma, et non dépendre d’une manipulation manuelle.
INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES (
  'video_capsules',
  true,
  'global',
  'Active la génération de capsules vidéo depuis une scène de classroom.'
)
ON CONFLICT (flag_name) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description;
