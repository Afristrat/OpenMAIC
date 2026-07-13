-- =============================================================================
-- Migration 00023: Persistance Storage des classrooms générés (S0-015, P0)
-- Le flux de génération (`/api/generate-classroom`) persistait jusqu'ici
-- chaque classroom en fichier JSON local (`data/classrooms/{id}.json` +
-- médias binaires dans `data/classrooms/{id}/audio|media/`) — ne survit à
-- aucun redéploiement Coolify. Les vraies tables `public.stages`/`scenes`
-- existent déjà (avec owner_id/org_id, RLS) mais n'étaient jamais branchées
-- sur ce flux. Cette migration :
-- 1) ajoute une colonne `extra` JSONB additive pour les champs du type
--    externe @openmaic/dsl non couverts par les colonnes normalisées
--    (languageDirective, whiteboard, videoManifest, generatedAgentConfigs,
--    interactiveMode, taskEngineMode côté Stage ; whiteboards, multiAgent
--    côté Scene) — round-trip sans perte ;
-- 2) crée le bucket Storage privé `classroom-media` pour les fichiers
--    audio/image/vidéo générés, même convention défense-en-profondeur que
--    le bucket `exports` (00021_export_jobs.sql) : aucun accès direct
--    anon/authenticated, tout passe par le rôle service (bypass RLS) via
--    un proxy API qui vérifie l'autorisation à chaque requête.
-- Aucun ajustement RLS sur stages/scenes : la policy "stages_select_org_member"
-- posée par 00001_initial_schema.sql couvre déjà la lecture par tout membre
-- de l'org propriétaire, cohérent avec la décision produit de ce chantier.
-- =============================================================================

ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS extra JSONB;
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS extra JSONB;

INSERT INTO storage.buckets (id, name, public)
VALUES ('classroom-media', 'classroom-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "classroom_media_select_service_only"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'classroom-media' AND false);

CREATE POLICY "classroom_media_insert_service_only"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'classroom-media' AND false);

CREATE POLICY "classroom_media_update_service_only"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'classroom-media' AND false);

CREATE POLICY "classroom_media_delete_service_only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'classroom-media' AND false);

-- Rollback :
-- DROP POLICY IF EXISTS "classroom_media_select_service_only" ON storage.objects;
-- DROP POLICY IF EXISTS "classroom_media_insert_service_only" ON storage.objects;
-- DROP POLICY IF EXISTS "classroom_media_update_service_only" ON storage.objects;
-- DROP POLICY IF EXISTS "classroom_media_delete_service_only" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'classroom-media';
-- ALTER TABLE public.scenes DROP COLUMN IF EXISTS extra;
-- ALTER TABLE public.stages DROP COLUMN IF EXISTS extra;
