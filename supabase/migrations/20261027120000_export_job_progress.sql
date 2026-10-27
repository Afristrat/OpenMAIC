-- Avancement d'un export asynchrone : l'écran peut dire où en est le rendu au lieu de tourner à vide.
-- Colonnes facultatives et sans valeur par défaut : les jobs existants et les formats qui ne rendent pas
-- scène par scène (SCORM, cmi5) restent valides sans avancement.
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IS NULL OR phase IN ('rendering', 'assembling', 'uploading')),
  ADD COLUMN IF NOT EXISTS progress_done INTEGER CHECK (progress_done IS NULL OR progress_done >= 0),
  ADD COLUMN IF NOT EXISTS progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0);

COMMENT ON COLUMN public.export_jobs.phase IS 'Étape en cours du rendu : rendering, assembling ou uploading.';
COMMENT ON COLUMN public.export_jobs.progress_done IS 'Scènes déjà rendues pendant la phase rendering.';
COMMENT ON COLUMN public.export_jobs.progress_total IS 'Nombre total de scènes à rendre.';
