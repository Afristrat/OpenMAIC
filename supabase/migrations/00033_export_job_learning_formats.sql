-- S1-008 — The asynchronous export contract already exists. Extend its
-- discriminant instead of creating one table per interoperability standard.
ALTER TABLE public.export_jobs
  DROP CONSTRAINT IF EXISTS export_jobs_format_check;

ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_format_check
  CHECK (format IN ('scorm12', 'scorm2004', 'cmi5', 'mp4'));
