-- =============================================================================
-- Migration 00060: captures de navigation (extension de capture type Tango)
-- Un auteur capture un parcours sur un site tiers avec l'extension, avant ou
-- après la création de la formation. Les captures se rattachent à un cours
-- (`courses`, stage_id nullable : le brouillon sert de « projet »).
--
-- Principes :
--   * écriture réservée au rôle service (l'API vérifie le jeton de l'extension),
--     lecture réservée au propriétaire ;
--   * l'URL d'une étape ne porte que l'origine et le chemin, jamais de requête
--     ni de fragment (contrainte de base, pas seulement du code) ;
--   * une session de capture n'existe qu'avec l'attestation de droit horodatée ;
--   * chaque étape est validée par l'auteur avant tout usage (colonne review) ;
--   * les captures d'écran vont dans un bucket privé, JPEG, taille bornée.
--
-- Retour arrière : voir le bloc commenté en fin de fichier.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sessions de capture
-- ---------------------------------------------------------------------------

CREATE TABLE public.capture_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (char_length(trim(domain)) > 0 AND domain !~ '[/?#@\s]'),
  tool_version TEXT NOT NULL CHECK (char_length(trim(tool_version)) > 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_capture_id UUID REFERENCES public.capture_sessions(id) ON DELETE SET NULL,
  rights_attested_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'receiving' CHECK (status IN ('receiving', 'complete')),
  step_count INTEGER NOT NULL DEFAULT 0 CHECK (step_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capture_sessions_not_self_superseding
    CHECK (supersedes_capture_id IS DISTINCT FROM id)
);

CREATE INDEX idx_capture_sessions_course ON public.capture_sessions(course_id, captured_at DESC);
CREATE INDEX idx_capture_sessions_owner ON public.capture_sessions(owner_id);
CREATE INDEX idx_capture_sessions_supersedes ON public.capture_sessions(supersedes_capture_id)
  WHERE supersedes_capture_id IS NOT NULL;

CREATE TRIGGER set_updated_at_capture_sessions
  BEFORE UPDATE ON public.capture_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- La session appartient à l'auteur du cours, et la capture remplacée au même cours.
CREATE OR REPLACE FUNCTION public.assert_capture_session_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.courses WHERE id = NEW.course_id AND owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'Capture session owner is not the course owner';
  END IF;

  IF NEW.supersedes_capture_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.capture_sessions
    WHERE id = NEW.supersedes_capture_id AND course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'Superseded capture must belong to the same course';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assert_capture_session_integrity
  BEFORE INSERT OR UPDATE OF course_id, owner_id, supersedes_capture_id
  ON public.capture_sessions
  FOR EACH ROW EXECUTE FUNCTION public.assert_capture_session_integrity();

-- ---------------------------------------------------------------------------
-- Étapes capturées (format_version 1)
-- ---------------------------------------------------------------------------

CREATE TABLE public.capture_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.capture_sessions(id) ON DELETE CASCADE,
  format_version INTEGER NOT NULL DEFAULT 1 CHECK (format_version = 1),
  position INTEGER NOT NULL CHECK (position >= 0),
  captured_at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('click', 'type', 'navigate', 'scroll', 'select', 'key')),
  -- Origine + chemin uniquement : ni requête (?) ni fragment (#) ni identifiants (@).
  url TEXT NOT NULL CHECK (url ~ '^https?://[^/?#@\s]+(/[^?#\s]*)?$' AND char_length(url) <= 2048),
  element JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(element) = 'object'),
  pointer JSONB CHECK (pointer IS NULL OR jsonb_typeof(pointer) = 'object'),
  viewport JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(viewport) = 'object'),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  screenshot_path TEXT UNIQUE CHECK (screenshot_path IS NULL OR char_length(trim(screenshot_path)) > 0),
  screenshot_sha256 TEXT CHECK (screenshot_sha256 IS NULL OR screenshot_sha256 ~ '^[0-9a-f]{64}$'),
  redactions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(redactions) = 'array'),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  review TEXT NOT NULL DEFAULT 'pending' CHECK (review IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capture_steps_position_unique UNIQUE (session_id, position),
  CONSTRAINT capture_steps_screenshot_has_hash
    CHECK ((screenshot_path IS NULL) = (screenshot_sha256 IS NULL)),
  CONSTRAINT capture_steps_reviewed_has_date
    CHECK ((review = 'pending') = (reviewed_at IS NULL))
);

CREATE INDEX idx_capture_steps_session ON public.capture_steps(session_id, position);

-- ---------------------------------------------------------------------------
-- Jetons de l'extension et codes d'appairage
-- Le jeton n'est jamais stocké en clair : seul son empreinte l'est.
-- ---------------------------------------------------------------------------

CREATE TABLE public.capture_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  label TEXT NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_capture_tokens_owner ON public.capture_tokens(owner_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.capture_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_capture_pairing_codes_owner ON public.capture_pairing_codes(owner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS : lecture par le propriétaire, écriture réservée au service.
-- Les empreintes de jetons et de codes ne sont lisibles par personne côté client.
-- ---------------------------------------------------------------------------

ALTER TABLE public.capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capture_sessions_select_owner"
  ON public.capture_sessions FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "capture_sessions_insert_service_only"
  ON public.capture_sessions FOR INSERT WITH CHECK (false);
CREATE POLICY "capture_sessions_update_service_only"
  ON public.capture_sessions FOR UPDATE USING (false);
CREATE POLICY "capture_sessions_delete_service_only"
  ON public.capture_sessions FOR DELETE USING (false);

CREATE POLICY "capture_steps_select_owner"
  ON public.capture_steps FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.capture_sessions s
      WHERE s.id = capture_steps.session_id AND s.owner_id = auth.uid()
    )
  );
CREATE POLICY "capture_steps_insert_service_only"
  ON public.capture_steps FOR INSERT WITH CHECK (false);
CREATE POLICY "capture_steps_update_service_only"
  ON public.capture_steps FOR UPDATE USING (false);
CREATE POLICY "capture_steps_delete_service_only"
  ON public.capture_steps FOR DELETE USING (false);

CREATE POLICY "capture_tokens_select_none"
  ON public.capture_tokens FOR SELECT USING (false);
CREATE POLICY "capture_tokens_insert_service_only"
  ON public.capture_tokens FOR INSERT WITH CHECK (false);
CREATE POLICY "capture_tokens_update_service_only"
  ON public.capture_tokens FOR UPDATE USING (false);
CREATE POLICY "capture_tokens_delete_service_only"
  ON public.capture_tokens FOR DELETE USING (false);

CREATE POLICY "capture_pairing_codes_select_none"
  ON public.capture_pairing_codes FOR SELECT USING (false);
CREATE POLICY "capture_pairing_codes_insert_service_only"
  ON public.capture_pairing_codes FOR INSERT WITH CHECK (false);
CREATE POLICY "capture_pairing_codes_update_service_only"
  ON public.capture_pairing_codes FOR UPDATE USING (false);
CREATE POLICY "capture_pairing_codes_delete_service_only"
  ON public.capture_pairing_codes FOR DELETE USING (false);

-- ---------------------------------------------------------------------------
-- Bucket privé des captures d'écran : JPEG uniquement, 2 Mo au plus par fichier
-- (borne appliquée par le stockage lui-même, en plus du contrôle de l'API).
-- Aucun accès client : lecture par URL signée émise côté service.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('capture-screenshots', 'capture-screenshots', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "capture_screenshots_select_service_only"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'capture-screenshots' AND false);
CREATE POLICY "capture_screenshots_insert_service_only"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'capture-screenshots' AND false);
CREATE POLICY "capture_screenshots_update_service_only"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'capture-screenshots' AND false);
CREATE POLICY "capture_screenshots_delete_service_only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'capture-screenshots' AND false);

-- ---------------------------------------------------------------------------
-- Retour arrière (à exécuter manuellement, dans cet ordre) :
--   DROP POLICY "capture_screenshots_select_service_only" ON storage.objects;
--   DROP POLICY "capture_screenshots_insert_service_only" ON storage.objects;
--   DROP POLICY "capture_screenshots_update_service_only" ON storage.objects;
--   DROP POLICY "capture_screenshots_delete_service_only" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'capture-screenshots';  -- bucket vide requis
--   DROP TABLE public.capture_pairing_codes;
--   DROP TABLE public.capture_tokens;
--   DROP TABLE public.capture_steps;
--   DROP TABLE public.capture_sessions;
--   DROP FUNCTION public.assert_capture_session_integrity();
-- ---------------------------------------------------------------------------
