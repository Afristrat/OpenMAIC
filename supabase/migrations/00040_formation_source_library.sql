-- =============================================================================
-- S6-004 — Bibliothèque documentaire et manifestes de sources versionnés
-- =============================================================================

CREATE TABLE public.organization_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 260),
  mime_type TEXT NOT NULL CHECK (char_length(trim(mime_type)) BETWEEN 1 AND 160),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 52428800),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  parser_id TEXT NOT NULL CHECK (char_length(trim(parser_id)) BETWEEN 1 AND 80),
  text_content TEXT NOT NULL CHECK (char_length(trim(text_content)) > 0),
  images JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images) = 'array'),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, content_hash),
  UNIQUE (id, org_id)
);

CREATE INDEX idx_organization_sources_org_created_at
  ON public.organization_sources(org_id, created_at DESC);

CREATE TRIGGER set_updated_at_organization_sources
  BEFORE UPDATE ON public.organization_sources
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.formation_source_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  source_ids UUID[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK (cardinality(source_ids) <= 20),
  previous_manifest_id UUID REFERENCES public.formation_source_manifests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, owner_id, version),
  UNIQUE (id, org_id)
);

CREATE INDEX idx_formation_source_manifests_latest
  ON public.formation_source_manifests(org_id, owner_id, version DESC);

ALTER TABLE public.courses
  ADD COLUMN source_manifest_id UUID REFERENCES public.formation_source_manifests(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.assert_source_manifest_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  distinct_source_count INTEGER;
  valid_source_count INTEGER;
BEGIN
  SELECT count(DISTINCT source_id), count(source.id)
  INTO distinct_source_count, valid_source_count
  FROM unnest(NEW.source_ids) AS source_id
  LEFT JOIN public.organization_sources AS source
    ON source.id = source_id
   AND source.org_id = NEW.org_id
   AND source.status = 'ready';

  IF distinct_source_count <> cardinality(NEW.source_ids)
     OR valid_source_count <> cardinality(NEW.source_ids) THEN
    RAISE EXCEPTION 'Every selected source must be unique, ready and owned by the manifest organization'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = NEW.org_id AND user_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Manifest owner is not a member of the organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER assert_source_manifest_integrity
  BEFORE INSERT OR UPDATE OF org_id, owner_id, source_ids
  ON public.formation_source_manifests
  FOR EACH ROW EXECUTE FUNCTION public.assert_source_manifest_integrity();

CREATE OR REPLACE FUNCTION public.assert_course_source_manifest_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.source_manifest_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.formation_source_manifests
    WHERE id = NEW.source_manifest_id AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Course and source manifest must belong to the same organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assert_course_source_manifest_integrity
  BEFORE INSERT OR UPDATE OF org_id, source_manifest_id
  ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.assert_course_source_manifest_integrity();

-- Immutable manifest versions make queued generation deterministic. The API
-- supplies the authenticated actor and calls this service-role-only function.
CREATE OR REPLACE FUNCTION public.replace_formation_source_manifest(
  p_org_id UUID,
  p_owner_id UUID,
  p_source_ids UUID[],
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS SETOF public.formation_source_manifests
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  latest_manifest public.formation_source_manifests;
  created_manifest public.formation_source_manifests;
BEGIN
  IF cardinality(p_source_ids) > 20 THEN
    RAISE EXCEPTION 'At most 20 sources may be selected' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_owner_id::text, 0));

  SELECT * INTO latest_manifest
  FROM public.formation_source_manifests
  WHERE org_id = p_org_id AND owner_id = p_owner_id
  ORDER BY version DESC
  LIMIT 1;

  IF p_expected_version IS NOT NULL
     AND p_expected_version <> COALESCE(latest_manifest.version, 0) THEN
    RAISE EXCEPTION 'Source manifest version conflict' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.formation_source_manifests (
    org_id, owner_id, version, source_ids, previous_manifest_id
  ) VALUES (
    p_org_id,
    p_owner_id,
    COALESCE(latest_manifest.version, 0) + 1,
    COALESCE(p_source_ids, '{}'::uuid[]),
    latest_manifest.id
  )
  RETURNING * INTO created_manifest;

  RETURN NEXT created_manifest;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_formation_source_manifest(UUID, UUID, UUID[], INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_formation_source_manifest(UUID, UUID, UUID[], INTEGER)
  TO service_role;

-- Data API grants are explicit so this migration remains valid when Supabase
-- stops exposing new public tables automatically. Browser clients can only
-- read through RLS; all mutations remain confined to the trusted server.
REVOKE ALL ON TABLE public.organization_sources, public.formation_source_manifests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_sources, public.formation_source_manifests
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.organization_sources, public.formation_source_manifests
  TO service_role;

ALTER TABLE public.organization_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formation_source_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_sources_select_org_member"
  ON public.organization_sources FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = organization_sources.org_id AND user_id = auth.uid()
    )
  );
CREATE POLICY "organization_sources_insert_service_only"
  ON public.organization_sources FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "organization_sources_update_service_only"
  ON public.organization_sources FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "organization_sources_delete_service_only"
  ON public.organization_sources FOR DELETE TO authenticated USING (false);

CREATE POLICY "formation_source_manifests_select_org_member"
  ON public.formation_source_manifests FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = formation_source_manifests.org_id AND user_id = auth.uid()
    )
  );
CREATE POLICY "formation_source_manifests_insert_service_only"
  ON public.formation_source_manifests FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "formation_source_manifests_update_service_only"
  ON public.formation_source_manifests FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "formation_source_manifests_delete_service_only"
  ON public.formation_source_manifests FOR DELETE TO authenticated USING (false);
