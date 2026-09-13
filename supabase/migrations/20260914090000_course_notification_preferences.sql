-- S3-013 — Learners may make a course quieter than their global reminder policy.
CREATE TABLE public.course_notification_preferences (
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paused_until TIMESTAMPTZ,
  daily_cap INTEGER CHECK (daily_cap BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);

ALTER TABLE public.course_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_notification_preferences_select_own
  ON public.course_notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE FUNCTION public.assert_course_notification_preference_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.courses course
    JOIN public.organizations organization ON organization.id = course.org_id AND organization.status = 'active'
    JOIN public.org_members member ON member.org_id = course.org_id AND member.user_id = NEW.user_id
    WHERE course.id = NEW.course_id AND course.status = 'ready' AND course.catalog_visible
  ) THEN
    RAISE EXCEPTION 'Course notification preference is unavailable' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER assert_course_notification_preference_scope
  BEFORE INSERT OR UPDATE ON public.course_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.assert_course_notification_preference_scope();

CREATE POLICY course_notification_preferences_insert_own
  ON public.course_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY course_notification_preferences_update_own
  ON public.course_notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY course_notification_preferences_delete_own
  ON public.course_notification_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
