-- =============================================================================
-- Migration 00021: Export Jobs (S1-007, chantier 1 — CRÉER)
-- Table générique de suivi des exports asynchrones d'un cours (stage) vers un
-- format packagé externe. Couche 1 : SCORM 1.2 uniquement (scorm12). La
-- colonne `format` est discriminante pour permettre à S1-008 (scorm2004,
-- cmi5) de réutiliser la même table plutôt que d'en créer une par format.
-- Le fichier généré (zip) est déposé dans le bucket Storage privé `exports`
-- (chemin = storage_path) ; le téléchargement passe toujours par une URL
-- signée émise côté service (jamais d'accès direct client → storage.objects).
-- =============================================================================

CREATE TABLE public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('scorm12')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'done', 'error')),
  storage_path TEXT,
  scene_count INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_export_jobs_stage_id ON public.export_jobs(stage_id);
CREATE INDEX idx_export_jobs_owner_id ON public.export_jobs(owner_id);

-- Réutilise la fonction trigger générique déjà posée par 00001_initial_schema.sql
CREATE TRIGGER set_updated_at_export_jobs
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- Lecture : le propriétaire du job (pour le polling de statut côté app).
CREATE POLICY "export_jobs_select_owner"
  ON public.export_jobs FOR SELECT
  USING (auth.uid() = owner_id);

-- Écriture réservée au rôle service (route API à la création, worker BullMQ
-- pour les transitions de statut). Le rôle `service_role` bypasse RLS
-- nativement ; ces policies bloquent explicitement anon/authenticated par
-- défense en profondeur (même convention que 00019_feature_flags.sql et
-- 00020_video_capsules.sql).
CREATE POLICY "export_jobs_insert_service_only"
  ON public.export_jobs FOR INSERT
  WITH CHECK (false);

CREATE POLICY "export_jobs_update_service_only"
  ON public.export_jobs FOR UPDATE
  USING (false);

CREATE POLICY "export_jobs_delete_service_only"
  ON public.export_jobs FOR DELETE
  USING (false);

-- ---------------------------------------------------------------------------
-- Bucket Storage privé pour les packages générés (zip SCORM).
-- Aucune policy d'accès n'est ouverte à anon/authenticated : le téléchargement
-- passe exclusivement par une URL signée émise par la route API (client
-- service, bypass RLS). Défense en profondeur identique aux tables ci-dessus.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "export_files_select_service_only"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exports' AND false);

CREATE POLICY "export_files_insert_service_only"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exports' AND false);

CREATE POLICY "export_files_update_service_only"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'exports' AND false);

CREATE POLICY "export_files_delete_service_only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exports' AND false);
