-- =============================================================================
-- Migration 00019: Feature Flags
-- Table d'infrastructure commune (chantier 0 — SOCLE) permettant aux chantiers
-- 1-3 de livrer en continu sur la base unique : chaque fonctionnalité en
-- cours s'abrite derrière un flag plutôt que derrière une branche longue
-- (ADR-006, dossier 0/08). Spec : docs/foundation/0-socle/02-data-dictionary.md
-- =============================================================================

CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'org', 'user')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_flags_flag_name ON public.feature_flags(flag_name);

-- Réutilise la fonction trigger générique déjà posée par 00001_initial_schema.sql
CREATE TRIGGER set_updated_at_feature_flags
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur authentifié (aucune PII dans cette table).
CREATE POLICY "feature_flags_select_authenticated"
  ON public.feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

-- Écriture réservée au rôle service. Le rôle `service_role` de Supabase
-- bypasse RLS (BYPASSRLS) indépendamment de ces policies ; elles bloquent
-- explicitement anon/authenticated par défense en profondeur (même
-- convention que "Service role only" dans 00015_usage_tracking.sql).
CREATE POLICY "feature_flags_insert_service_only"
  ON public.feature_flags FOR INSERT
  WITH CHECK (false);

CREATE POLICY "feature_flags_update_service_only"
  ON public.feature_flags FOR UPDATE
  USING (false);

CREATE POLICY "feature_flags_delete_service_only"
  ON public.feature_flags FOR DELETE
  USING (false);
