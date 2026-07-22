-- =============================================================================
-- Migration 00029: Isoler le profil enrichi des profils visibles aux collègues
-- Chantier 2 — VIVRE (S2-001). Spec : docs/foundation/2-vivre/02-data-dictionary.md
-- =============================================================================
--
-- La migration 00022 avait ajouté ces attributs à public.profiles. Or la
-- policy profiles_select_org_comember rend cette table lisible entre collègues
-- d'une même organisation. Culture et préférences ne doivent être accessibles
-- qu'à leur propriétaire : elles rejoignent donc la table dédiée user_profiles.
--
-- Les anciennes colonnes restent temporairement en place uniquement pour ne pas
-- casser une instance web encore en cours de remplacement. Elles sont nettoyées
-- dans cette transaction ; aucune donnée de profil enrichi ne reste exposée.

CREATE TABLE public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  culture TEXT NOT NULL DEFAULT 'ma-fr',
  ui_language TEXT NOT NULL DEFAULT 'fr-FR'
    CHECK (ui_language IN ('fr-FR', 'ar-MA', 'en-US')),
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO public.user_profiles (user_id, culture, ui_language, preferences, updated_at)
SELECT id, culture, ui_language, preferences, updated_at
FROM public.profiles
ON CONFLICT (user_id) DO UPDATE
SET
  culture = EXCLUDED.culture,
  ui_language = EXCLUDED.ui_language,
  preferences = EXCLUDED.preferences,
  updated_at = EXCLUDED.updated_at;

-- Rétention de compatibilité de schéma, sans rétention de données privées.
UPDATE public.profiles
SET
  culture = 'ma-fr',
  ui_language = 'fr-FR',
  preferences = '{}'::jsonb
WHERE culture IS DISTINCT FROM 'ma-fr'
   OR ui_language IS DISTINCT FROM 'fr-FR'
   OR preferences IS DISTINCT FROM '{}'::jsonb;
