-- Run as supabase_admin with migration inside BEGIN ... ROLLBACK only.
-- The superuser harness switches to the actual Auth role for both deletions.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000111'),
 ('00000000-0036-4000-8000-000000000112');
DO $$
DECLARE
  author uuid := '00000000-0036-4000-8000-000000000111';
  publisher uuid := '00000000-0036-4000-8000-000000000112';
  version public.widget_template_versions;
  draft public.widget_template_versions;
  snapshot jsonb;
  publication_snapshot jsonb;
  template_snapshot jsonb;
  visible_published integer;
  visible_draft integer;
BEGIN
  SELECT * INTO version FROM public.create_widget_template(author,'s036-rollback-widget','Test','{}');
  SELECT * INTO version FROM public.publish_widget_template(publisher,version.template_id,version.id);
  SELECT * INTO draft FROM public.revise_widget_template(author,version.template_id,'Test revised','{}');
  SELECT to_jsonb(t)-'created_by' INTO template_snapshot FROM public.widget_templates t WHERE id=version.template_id;
  SELECT to_jsonb(v)-ARRAY['created_by','published_by'] INTO snapshot FROM public.widget_template_versions v WHERE id=version.id;
  SELECT to_jsonb(p)-'published_by' INTO publication_snapshot FROM public.widget_template_publications p WHERE version_id=version.id;

  BEGIN
    UPDATE public.widget_template_versions SET created_by=NULL WHERE id=version.id;
    RAISE EXCEPTION 'Live author attribution erased';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'WIDGET_TEMPLATE_VERSION_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_widget_template(NULL,'s036-rollback-no-author','Invalid','{}');
    RAISE EXCEPTION 'Creation without author accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'WIDGET_AUTHOR_REQUIRED' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.widget_template_versions SET composition='{"changed":true}' WHERE id=version.id;
    RAISE EXCEPTION 'Published composition changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'WIDGET_TEMPLATE_VERSION_IMMUTABLE' THEN RAISE; END IF;
  END;

  SET LOCAL ROLE supabase_auth_admin;
  DELETE FROM auth.users WHERE id=author;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM public.widget_template_versions WHERE template_id=version.template_id AND created_by IS NOT NULL)
    OR (SELECT published_by FROM public.widget_template_versions WHERE id=version.id) IS DISTINCT FROM publisher
    OR (SELECT to_jsonb(t)-'created_by' FROM public.widget_templates t WHERE id=version.template_id) IS DISTINCT FROM template_snapshot
  THEN RAISE EXCEPTION 'Author removal affected content or publisher'; END IF;

  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO visible_published FROM public.widget_template_versions WHERE id=version.id;
  SELECT count(*) INTO visible_draft FROM public.widget_template_versions WHERE id=draft.id;
  RESET ROLE;
  IF visible_published<>1 OR visible_draft<>0 THEN
    RAISE EXCEPTION 'Published catalog or draft privacy changed after author erasure';
  END IF;

  -- An authorless draft still supports normal publication by a live actor.
  PERFORM public.publish_widget_template(publisher,draft.template_id,draft.id);
  SET LOCAL ROLE supabase_auth_admin;
  DELETE FROM auth.users WHERE id=publisher;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM public.widget_template_versions WHERE template_id=version.template_id AND published_by IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.widget_template_publications WHERE template_id=version.template_id AND published_by IS NOT NULL)
    OR (SELECT to_jsonb(v)-ARRAY['created_by','published_by'] FROM public.widget_template_versions v WHERE id=version.id) IS DISTINCT FROM snapshot
    OR (SELECT to_jsonb(p)-'published_by' FROM public.widget_template_publications p WHERE version_id=version.id) IS DISTINCT FROM publication_snapshot
  THEN RAISE EXCEPTION 'Publisher removal changed version or publication'; END IF;

  BEGIN
    UPDATE public.widget_template_versions SET id=gen_random_uuid() WHERE id=version.id;
    RAISE EXCEPTION 'Version identity changed after erasure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'WIDGET_TEMPLATE_VERSION_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.widget_template_versions WHERE id=version.id;
    RAISE EXCEPTION 'Version deleted after erasure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'WIDGET_TEMPLATE_VERSION_IMMUTABLE' THEN RAISE; END IF;
  END;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.prevent_widget_template_version_mutation()'::regprocedure)
    OR has_function_privilege('anon','public.prevent_widget_template_version_mutation()','EXECUTE')
    OR has_function_privilege('authenticated','public.require_widget_author_on_insert()','EXECUTE')
  THEN RAISE EXCEPTION 'Trigger privilege regression'; END IF;
END;
$$;
