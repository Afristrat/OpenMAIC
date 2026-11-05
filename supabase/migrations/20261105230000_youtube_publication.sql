-- Publication d'une vidéo de formation (cours entier ou un chapitre) sur la chaîne YouTube de la
-- personne qui la publie : une connexion OAuth par utilisateur, jamais partagée.
--
-- Le jeton de rafraîchissement est chiffré côté serveur (AES-256-GCM) ; aucun rôle client n'y
-- accède. Le suivi des envois est lisible par son propriétaire seulement.

CREATE TABLE public.youtube_connections (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  scope TEXT NOT NULL,
  refresh_ciphertext BYTEA NOT NULL,
  refresh_iv BYTEA NOT NULL,
  refresh_tag BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.youtube_connections TO service_role;

COMMENT ON TABLE public.youtube_connections IS
  'Chaîne YouTube connectée par une personne ; serveur seul, jeton de rafraîchissement chiffré.';

CREATE TABLE public.youtube_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  export_job_id UUID NOT NULL REFERENCES public.export_jobs(id) ON DELETE CASCADE,
  -- NULL : la vidéo entière du cours (format video) ; sinon rang du chapitre dans l'export mp4.
  chapter_index INTEGER CHECK (chapter_index IS NULL OR chapter_index >= 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  privacy_status TEXT NOT NULL DEFAULT 'unlisted' CHECK (privacy_status IN ('unlisted', 'private', 'public')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'uploading', 'done', 'error')),
  video_id TEXT,
  -- Privacy réellement appliquée par YouTube, relue après l'envoi (une application non auditée
  -- peut voir ses vidéos verrouillées en privé).
  applied_privacy TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX youtube_uploads_user ON public.youtube_uploads(user_id, created_at DESC);

ALTER TABLE public.youtube_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_uploads FROM PUBLIC, anon;
GRANT SELECT ON public.youtube_uploads TO authenticated;
GRANT ALL ON public.youtube_uploads TO service_role;

CREATE POLICY youtube_uploads_owner_read ON public.youtube_uploads
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.youtube_uploads IS
  'Suivi des envois YouTube d''une personne ; lecture par son propriétaire, écriture serveur seul.';
