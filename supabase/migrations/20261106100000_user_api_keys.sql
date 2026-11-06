-- Clés d'API personnelles : une personne peut utiliser son propre compte chez un fournisseur de
-- modèles à la place de celui de la plateforme.
--
-- La clé est chiffrée côté serveur (AES-256-GCM, secret-box) ; aucun rôle client n'y accède, pas
-- même le propriétaire : l'écran ne reçoit que le fournisseur et les quatre derniers caractères.
-- Une clé par personne et par fournisseur.

CREATE TABLE public.user_api_keys (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Famille de service. Aujourd'hui les modèles de langage ; la colonne laisse la voix, l'image et
  -- la vidéo s'ajouter sans nouvelle table.
  kind TEXT NOT NULL CHECK (kind IN ('llm')),
  provider_id TEXT NOT NULL CHECK (provider_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  key_ciphertext BYTEA NOT NULL,
  key_iv BYTEA NOT NULL,
  key_tag BYTEA NOT NULL,
  -- Quatre derniers caractères, seul morceau affiché pour reconnaître la clé.
  key_hint TEXT NOT NULL CHECK (length(key_hint) BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, provider_id)
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_api_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_api_keys TO service_role;

COMMENT ON TABLE public.user_api_keys IS
  'Clés d''API personnelles chiffrées ; serveur seul, jamais lisibles par un client.';
