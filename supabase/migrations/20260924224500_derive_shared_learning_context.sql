-- A shared classroom stores the observation in the recipient tenant while the
-- authoritative course context remains owned by the source tenant.
CREATE OR REPLACE FUNCTION qalem_telemetry_private.derive_learning_context()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  course_language text;
  context jsonb;
  tags jsonb;
BEGIN
  NEW.subject_tags := ARRAY[]::text[];
  NEW.language := NULL;
  NEW.level := NULL;
  SELECT cardinality(s.agent_ids) INTO NEW.agent_count
    FROM public.stages s WHERE s.id=NEW.stage_id;
  -- The stage tenant, not the observation tenant, owns the course metadata.
  BEGIN
    SELECT c.language,c.outline->'analyticsContext'
      INTO STRICT course_language,context
      FROM public.courses c
      JOIN public.stages s ON s.id=c.stage_id AND s.org_id=c.org_id
      WHERE c.stage_id=NEW.stage_id AND c.status='ready'
      FOR SHARE OF c,s;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RETURN NEW;
  END;
  IF course_language IN ('fr-FR','ar-MA','en-US') THEN
    NEW.language := course_language;
  END IF;
  IF context->>'level' IN ('beginner','intermediate','advanced') THEN
    NEW.level := context->>'level';
  END IF;
  tags := context->'subjectTags';
  IF jsonb_typeof(tags) = 'array' THEN
    IF jsonb_array_length(tags) <= 20 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(tags) t
      WHERE jsonb_typeof(t) <> 'string'
        OR length(t #>> '{}') NOT BETWEEN 1 AND 256
        OR (t #>> '{}') !~ '^[A-Za-z0-9_:-]+$'
    ) THEN
      SELECT coalesce(array_agg(value ORDER BY ordinal),ARRAY[]::text[])
        INTO NEW.subject_tags
        FROM jsonb_array_elements_text(tags) WITH ORDINALITY t(value,ordinal);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION qalem_telemetry_private.derive_learning_context()
  FROM PUBLIC,anon,authenticated;
