-- =============================================================================
-- Migration 00020: Video Capsules (Hyperframes)
-- Chantier 1 — CRÉER (S1-006). Suivi de l'état d'une capsule vidéo générée par
-- le studio externe Mishkāt/Hyperframes à partir d'une scène. Le rendu réel
-- (mp4) reste hébergé côté Mishkāt (MinIO, URL publique permanente) : cette
-- table ne stocke que le statut, le brief envoyé et les variantes reçues.
-- =============================================================================

CREATE TABLE public.video_capsules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'rendering', 'done', 'error')),
  brief JSONB NOT NULL,
  mishkat_production_id TEXT,
  variants JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_capsules_stage_id ON public.video_capsules(stage_id);
CREATE INDEX idx_video_capsules_scene_id ON public.video_capsules(scene_id);

-- Réutilise la fonction trigger générique déjà posée par 00001_initial_schema.sql
CREATE TRIGGER set_updated_at_video_capsules
  BEFORE UPDATE ON public.video_capsules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.video_capsules ENABLE ROW LEVEL SECURITY;

-- Lecture : le propriétaire de la capsule (pour le polling de statut côté app).
CREATE POLICY "video_capsules_select_owner"
  ON public.video_capsules FOR SELECT
  USING (auth.uid() = owner_id);

-- Écriture réservée au rôle service (route API à la création, worker BullMQ
-- pour les transitions de statut). Le rôle `service_role` bypasse RLS
-- nativement ; ces policies bloquent explicitement anon/authenticated par
-- défense en profondeur (même convention que 00019_feature_flags.sql).
CREATE POLICY "video_capsules_insert_service_only"
  ON public.video_capsules FOR INSERT
  WITH CHECK (false);

CREATE POLICY "video_capsules_update_service_only"
  ON public.video_capsules FOR UPDATE
  USING (false);

CREATE POLICY "video_capsules_delete_service_only"
  ON public.video_capsules FOR DELETE
  USING (false);
