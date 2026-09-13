-- S3-012 — One pending resumption reminder per learner and course.

CREATE UNIQUE INDEX course_resume_deliveries_one_pending
  ON public.course_resume_deliveries(course_id, user_id)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE FUNCTION public.sync_course_resume_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL OR NEW.abandoned_at IS NOT NULL THEN
    UPDATE public.course_resume_deliveries
    SET cancelled_at = now()
    WHERE course_id = NEW.course_id
      AND user_id = NEW.user_id
      AND sent_at IS NULL
      AND cancelled_at IS NULL;
    RETURN NEW;
  END IF;
  INSERT INTO public.course_resume_deliveries (course_id, user_id, scheduled_for)
  VALUES (NEW.course_id, NEW.user_id, NEW.updated_at + interval '24 hours')
  ON CONFLICT (course_id, user_id) WHERE sent_at IS NULL AND cancelled_at IS NULL
  DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, attempt_count = 0;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_course_resume_delivery
  AFTER INSERT OR UPDATE OF updated_at, completed_at, abandoned_at
  ON public.learner_course_resumes
  FOR EACH ROW EXECUTE FUNCTION public.sync_course_resume_delivery();

CREATE FUNCTION public.complete_learner_course_resume(
  p_actor UUID,
  p_course UUID,
  p_org UUID
)
RETURNS public.learner_course_resumes
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  completed public.learner_course_resumes;
BEGIN
  UPDATE public.learner_course_resumes resume
  SET completed_at = COALESCE(resume.completed_at, now()),
      updated_at = now()
  FROM public.courses course
  JOIN public.organizations organization ON organization.id = course.org_id
  WHERE resume.course_id = p_course
    AND resume.user_id = p_actor
    AND resume.org_id = p_org
    AND course.id = resume.course_id
    AND course.org_id = p_org
    AND course.stage_id = resume.stage_id
    AND course.status = 'ready'
    AND course.catalog_visible
    AND organization.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.org_members member
      WHERE member.org_id = p_org AND member.user_id = p_actor
    )
  RETURNING resume.* INTO completed;
  IF completed.course_id IS NULL THEN
    RAISE EXCEPTION 'Learner resume target is unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN completed;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_learner_course_resume(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_learner_course_resume(UUID, UUID, UUID) TO service_role;

CREATE FUNCTION public.claim_due_course_resume_deliveries(p_now TIMESTAMPTZ DEFAULT now())
RETURNS SETOF public.course_resume_deliveries
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT delivery.id
    FROM public.course_resume_deliveries delivery
    JOIN public.learner_course_resumes resume
      ON resume.course_id = delivery.course_id AND resume.user_id = delivery.user_id
    JOIN public.courses course ON course.id = resume.course_id AND course.stage_id = resume.stage_id
    JOIN public.organizations organization ON organization.id = course.org_id AND organization.status = 'active'
    JOIN public.org_members member ON member.org_id = course.org_id AND member.user_id = resume.user_id
    JOIN public.scenes scene ON scene.id = resume.scene_id AND scene.stage_id = resume.stage_id
    WHERE delivery.sent_at IS NULL
      AND delivery.cancelled_at IS NULL
      AND delivery.scheduled_for <= p_now
      AND delivery.attempt_count < 5
      AND resume.completed_at IS NULL
      AND resume.abandoned_at IS NULL
      AND course.status = 'ready'
      AND course.catalog_visible
    ORDER BY delivery.scheduled_for
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT 100
  )
  UPDATE public.course_resume_deliveries delivery
  SET attempt_count = delivery.attempt_count + 1
  FROM due
  WHERE delivery.id = due.id
  RETURNING delivery.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_course_resume_deliveries(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_course_resume_deliveries(TIMESTAMPTZ) TO service_role;

NOTIFY pgrst, 'reload schema';
