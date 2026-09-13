-- S3-012 — Persist and safely resolve learner-specific course resumption.

CREATE TABLE public.learner_course_resumes (
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  activity TEXT NOT NULL CHECK (activity IN ('scene', 'discussion', 'quiz', 'resource')),
  activity_state JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(activity_state) = 'object' AND pg_column_size(activity_state) <= 8192),
  position_ms INTEGER NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id),
  CHECK (NOT (completed_at IS NOT NULL AND abandoned_at IS NOT NULL))
);

CREATE INDEX learner_course_resumes_due_lookup
  ON public.learner_course_resumes(org_id, updated_at)
  WHERE completed_at IS NULL AND abandoned_at IS NULL;

CREATE TABLE public.course_resume_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  user_id UUID NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id, scheduled_for),
  FOREIGN KEY (course_id, user_id)
    REFERENCES public.learner_course_resumes(course_id, user_id) ON DELETE CASCADE
);

CREATE INDEX course_resume_deliveries_due_lookup
  ON public.course_resume_deliveries(scheduled_for)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE public.learner_course_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_resume_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY learner_course_resumes_select_own
  ON public.learner_course_resumes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY course_resume_deliveries_select_own
  ON public.course_resume_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE FUNCTION public.assert_learner_course_resume_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  expected_stage TEXT;
BEGIN
  SELECT course.stage_id INTO expected_stage
  FROM public.courses course
  JOIN public.organizations organization ON organization.id = course.org_id AND organization.status = 'active'
  JOIN public.org_members member ON member.org_id = course.org_id AND member.user_id = NEW.user_id
  WHERE course.id = NEW.course_id
    AND course.org_id = NEW.org_id
    AND course.status = 'ready'
    AND course.catalog_visible
  FOR SHARE OF course, organization, member;
  IF expected_stage IS NULL OR expected_stage IS DISTINCT FROM NEW.stage_id THEN
    RAISE EXCEPTION 'Learner resume target is unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scenes scene WHERE scene.id = NEW.scene_id AND scene.stage_id = NEW.stage_id
  ) THEN
    RAISE EXCEPTION 'Learner resume scene is unavailable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.completed_at IS NOT NULL
    AND (NEW.scene_id, NEW.activity, NEW.activity_state, NEW.position_ms, NEW.completed_at, NEW.abandoned_at)
      IS DISTINCT FROM (OLD.scene_id, OLD.activity, OLD.activity_state, OLD.position_ms, OLD.completed_at, OLD.abandoned_at)
  THEN
    RAISE EXCEPTION 'Completed learner resume is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assert_learner_course_resume_scope
  BEFORE INSERT OR UPDATE ON public.learner_course_resumes
  FOR EACH ROW EXECUTE FUNCTION public.assert_learner_course_resume_scope();

CREATE FUNCTION public.record_learner_course_resume(
  p_actor UUID,
  p_course UUID,
  p_org UUID,
  p_scene TEXT,
  p_activity TEXT,
  p_state JSONB,
  p_position_ms INTEGER
)
RETURNS public.learner_course_resumes
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  result public.learner_course_resumes;
  stage TEXT;
BEGIN
  IF p_actor IS NULL OR p_scene IS NULL OR char_length(btrim(p_scene)) = 0
    OR p_activity NOT IN ('scene', 'discussion', 'quiz', 'resource')
    OR p_position_ms < 0 OR jsonb_typeof(COALESCE(p_state, '{}'::jsonb)) <> 'object'
  THEN
    RAISE EXCEPTION 'Invalid learner resume' USING ERRCODE = '22023';
  END IF;
  SELECT course.stage_id INTO stage
  FROM public.courses course
  JOIN public.organizations organization ON organization.id = course.org_id AND organization.status = 'active'
  JOIN public.org_members member ON member.org_id = course.org_id AND member.user_id = p_actor
  WHERE course.id = p_course AND course.org_id = p_org AND course.status = 'ready' AND course.catalog_visible
  FOR SHARE OF course, organization, member;
  IF stage IS NULL OR NOT EXISTS (SELECT 1 FROM public.scenes scene WHERE scene.id = p_scene AND scene.stage_id = stage) THEN
    RAISE EXCEPTION 'Learner resume target is unavailable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.learner_course_resumes
    (course_id, org_id, user_id, stage_id, scene_id, activity, activity_state, position_ms)
  VALUES (p_course, p_org, p_actor, stage, p_scene, p_activity, COALESCE(p_state, '{}'::jsonb), p_position_ms)
  ON CONFLICT (course_id, user_id) DO UPDATE SET
    stage_id = EXCLUDED.stage_id,
    scene_id = EXCLUDED.scene_id,
    activity = EXCLUDED.activity,
    activity_state = EXCLUDED.activity_state,
    position_ms = EXCLUDED.position_ms,
    updated_at = now()
  WHERE public.learner_course_resumes.completed_at IS NULL
    AND public.learner_course_resumes.abandoned_at IS NULL
  RETURNING * INTO result;
  IF result.course_id IS NULL THEN
    RAISE EXCEPTION 'Learner resume is closed' USING ERRCODE = '42501';
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.resolve_learner_course_resume(p_actor UUID, p_course UUID, p_org UUID)
RETURNS public.learner_course_resumes
LANGUAGE sql SECURITY INVOKER SET search_path = '' STABLE AS $$
  SELECT resume.*
  FROM public.learner_course_resumes resume
  JOIN public.courses course ON course.id = resume.course_id AND course.stage_id = resume.stage_id
  JOIN public.organizations organization ON organization.id = course.org_id AND organization.status = 'active'
  JOIN public.org_members member ON member.org_id = course.org_id AND member.user_id = p_actor
  JOIN public.scenes scene ON scene.id = resume.scene_id AND scene.stage_id = resume.stage_id
  WHERE resume.user_id = p_actor
    AND resume.course_id = p_course
    AND resume.org_id = p_org
    AND course.org_id = p_org
    AND course.status = 'ready'
    AND course.catalog_visible
    AND resume.completed_at IS NULL
    AND resume.abandoned_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.record_learner_course_resume(UUID, UUID, UUID, TEXT, TEXT, JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_learner_course_resume(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_learner_course_resume(UUID, UUID, UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_learner_course_resume(UUID, UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
