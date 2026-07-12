-- =============================================================================
-- Migration 00022: Profil utilisateur enrichi (culture, langue, préférences)
-- Chantier 2 — VIVRE (S2-001). Spec : docs/foundation/2-vivre/02-data-dictionary.md
-- (table nommée `user_profiles` dans la spec ; l'existant portée depuis
-- 00001_initial_schema.sql est `public.profiles`, PK `id` → auth.users(id) —
-- on ÉTEND cette table réelle plutôt que d'en créer une seconde en double).
-- Ces colonnes alimentent le casting personnalisé de S2-002 (culture) et
-- l'expérience (préférences de rythme, humour accepté...).
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN culture TEXT NOT NULL DEFAULT 'ma-fr',
  ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'fr-FR'
    CHECK (ui_language IN ('fr-FR', 'ar-MA', 'en-US')),
  ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.culture IS
  'Référentiel culturel pour les prénoms du casting (ex. ma-ar, ma-fr, fr, en) — consommé par S2-002.';
COMMENT ON COLUMN public.profiles.ui_language IS
  'Langue d''interface choisie par l''utilisateur.';
COMMENT ON COLUMN public.profiles.preferences IS
  'Préférences d''expérience (rythme, humour accepté...) — consommées par le casting (S2-002).';

-- Pas de nouvelle policy RLS nécessaire : `public.profiles` a déjà
-- profiles_select_own / profiles_update_own / profiles_insert_own
-- (auth.uid() = id, 00001_initial_schema.sql) qui couvrent ces nouvelles
-- colonnes au même titre que les colonnes existantes (RLS s'applique à la
-- ligne, pas colonne par colonne). Le rôle service bypasse RLS nativement.
