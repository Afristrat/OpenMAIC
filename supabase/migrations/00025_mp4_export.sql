ALTER TABLE public.export_jobs
  DROP CONSTRAINT export_jobs_format_check;

ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_format_check
  CHECK (format IN ('scorm12', 'mp4'));
