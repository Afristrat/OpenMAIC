-- S3-012 — A resumed discussion may legitimately exceed the original compact
-- quiz/media payload. Keep a hard server-side limit while preserving a full
-- active transcript rather than silently discarding learner work.
ALTER TABLE public.learner_course_resumes
  DROP CONSTRAINT IF EXISTS learner_course_resumes_activity_state_check;

ALTER TABLE public.learner_course_resumes
  ADD CONSTRAINT learner_course_resumes_activity_state_check
  CHECK (
    jsonb_typeof(activity_state) = 'object'
    AND pg_column_size(activity_state) <= 524288
  );
