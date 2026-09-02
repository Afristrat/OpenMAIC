CREATE TABLE public.widget_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  draft_version_id UUID,
  published_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.widget_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.widget_templates(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  composition JSONB NOT NULL CHECK (jsonb_typeof(composition) = 'object'),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  UNIQUE (template_id, version_number),
  UNIQUE (template_id, id)
);

ALTER TABLE public.widget_templates
  ADD CONSTRAINT widget_templates_draft_version_fk
  FOREIGN KEY (id, draft_version_id) REFERENCES public.widget_template_versions(template_id, id),
  ADD CONSTRAINT widget_templates_published_version_fk
  FOREIGN KEY (id, published_version_id) REFERENCES public.widget_template_versions(template_id, id);

CREATE TABLE public.widget_template_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.widget_templates(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL REFERENCES public.widget_template_versions(id) ON DELETE RESTRICT,
  published_by UUID NOT NULL REFERENCES auth.users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prevent_widget_template_version_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.template_id <> NEW.template_id
    OR OLD.version_number <> NEW.version_number OR OLD.composition <> NEW.composition
    OR OLD.created_by <> NEW.created_by OR OLD.created_at <> NEW.created_at
    OR OLD.published_at IS NOT NULL OR NEW.published_at IS NULL OR NEW.published_by IS NULL THEN
    RAISE EXCEPTION 'WIDGET_TEMPLATE_VERSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_widget_template_version_mutation
BEFORE UPDATE OR DELETE ON public.widget_template_versions
FOR EACH ROW EXECUTE FUNCTION public.prevent_widget_template_version_mutation();

ALTER TABLE public.widget_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_template_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read published widget templates"
ON public.widget_templates FOR SELECT TO authenticated
USING (published_version_id IS NOT NULL);

CREATE POLICY "Authenticated users read published widget template versions"
ON public.widget_template_versions FOR SELECT TO authenticated
USING (published_at IS NOT NULL);

GRANT SELECT ON public.widget_templates, public.widget_template_versions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.widget_templates, public.widget_template_versions, public.widget_template_publications FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_widget_template(
  actor_user_id UUID, template_slug TEXT, template_title TEXT, template_composition JSONB
) RETURNS SETOF public.widget_template_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.widget_templates; version public.widget_template_versions;
BEGIN
  INSERT INTO public.widget_templates (slug, title, created_by)
  VALUES (template_slug, template_title, actor_user_id) RETURNING * INTO target;
  INSERT INTO public.widget_template_versions (template_id, version_number, composition, created_by)
  VALUES (target.id, 1, template_composition, actor_user_id) RETURNING * INTO version;
  UPDATE public.widget_templates SET draft_version_id = version.id WHERE id = target.id;
  RETURN NEXT version;
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_widget_template(
  actor_user_id UUID, target_template_id UUID, template_title TEXT, template_composition JSONB
) RETURNS SETOF public.widget_template_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_number INTEGER; version public.widget_template_versions;
BEGIN
  PERFORM 1 FROM public.widget_templates WHERE id = target_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WIDGET_TEMPLATE_NOT_FOUND'; END IF;
  SELECT COALESCE(max(version_number), 0) + 1 INTO next_number
  FROM public.widget_template_versions WHERE template_id = target_template_id;
  INSERT INTO public.widget_template_versions (template_id, version_number, composition, created_by)
  VALUES (target_template_id, next_number, template_composition, actor_user_id) RETURNING * INTO version;
  UPDATE public.widget_templates SET title = template_title, draft_version_id = version.id, updated_at = now()
  WHERE id = target_template_id;
  RETURN NEXT version;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_widget_template(
  actor_user_id UUID, target_template_id UUID, target_version_id UUID
) RETURNS SETOF public.widget_template_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE version public.widget_template_versions;
BEGIN
  SELECT * INTO version FROM public.widget_template_versions
  WHERE id = target_version_id AND template_id = target_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WIDGET_TEMPLATE_VERSION_NOT_FOUND'; END IF;
  IF version.published_at IS NULL THEN
    UPDATE public.widget_template_versions SET published_at = now(), published_by = actor_user_id
    WHERE id = target_version_id RETURNING * INTO version;
  END IF;
  UPDATE public.widget_templates SET published_version_id = target_version_id, updated_at = now()
  WHERE id = target_template_id;
  INSERT INTO public.widget_template_publications (template_id, version_id, published_by)
  VALUES (target_template_id, target_version_id, actor_user_id);
  RETURN NEXT version;
END;
$$;

REVOKE ALL ON FUNCTION public.create_widget_template(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revise_widget_template(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_widget_template(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_widget_template(UUID, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_widget_template(UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_widget_template(UUID, UUID, UUID) TO service_role;
