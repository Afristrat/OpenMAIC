-- Vidéo unique du cours (format `video`) : distincte de `mp4`, qui livre une archive ZIP de
-- chapitres. La contrainte reste l'unique discriminant des exports asynchrones.
ALTER TABLE public.export_jobs
  DROP CONSTRAINT IF EXISTS export_jobs_format_check;

ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_format_check
  CHECK (format IN ('scorm12', 'scorm2004', 'cmi5', 'mp4', 'video'));
