-- S3-013 — A provider acceptance is not an opening. Record the first
-- authenticated navigation separately and keep retries idempotent.
CREATE OR REPLACE FUNCTION public.mark_course_resume_delivery_opened(
  target_user_id UUID,
  target_course_id UUID,
  target_delivery_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH opened AS (
    UPDATE public.course_resume_deliveries
    SET opened_at = COALESCE(opened_at, now())
    WHERE id = target_delivery_id
      AND course_id = target_course_id
      AND user_id = target_user_id
      AND sent_at IS NOT NULL
      AND cancelled_at IS NULL
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM opened);
$$;

REVOKE ALL ON FUNCTION public.mark_course_resume_delivery_opened(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_course_resume_delivery_opened(UUID, UUID, UUID)
  TO service_role;
