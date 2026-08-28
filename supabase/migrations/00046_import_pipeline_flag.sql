-- Le pipeline reste fermé par défaut jusqu'à validation des CGU et de la
-- politique de conservation prévues par le canevas v1. Le code et ses tests
-- peuvent être livrés sans ouvrir prématurément cette porte aux utilisateurs.
INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES (
  'import_pipeline',
  false,
  'global',
  'Active le dépôt de canevas Markdown, DOCX et PDF vers un plan de formation éditable.'
)
ON CONFLICT (flag_name) DO UPDATE
SET
  scope = EXCLUDED.scope,
  description = EXCLUDED.description;
