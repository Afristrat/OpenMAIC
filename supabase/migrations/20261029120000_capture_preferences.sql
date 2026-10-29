-- Préférences de l'extension de capture et modèle courant du compte.
--
-- Une ligne par auteur. Le mode de capture, la narration et la langue de rédaction viennent de
-- l'extension (jeton Bearer) ; le modèle vient de l'application Qalem, qui le recopie ici dès que
-- l'auteur le change : l'extension ne choisit jamais de modèle, elle utilise celui du compte.
-- L'organisation débitée n'est pas stockée : elle se déduit de l'appartenance de l'auteur à chaque
-- appel, pour ne jamais débiter une organisation que l'auteur a quittée.
--
-- Écriture réservée au service (comme les autres tables capture_*) ; lecture par le propriétaire.

CREATE TABLE public.capture_preferences (
  owner_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL tant que l'auteur n'a pas choisi après sa connexion : l'extension le lui demande.
  capture_mode TEXT CHECK (capture_mode IN ('simple', 'ai')),
  narration BOOLEAN NOT NULL DEFAULT false,
  writing_language TEXT CHECK (writing_language IS NULL OR char_length(writing_language) BETWEEN 2 AND 12),
  -- Modèle utilisé par l'auteur dans son compte, au format « fournisseur:modèle ».
  account_model TEXT CHECK (account_model IS NULL OR char_length(account_model) BETWEEN 3 AND 200),
  account_model_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.capture_preferences.account_model IS
  'Modèle courant du compte, recopié par l''application ; jamais choisi dans l''extension.';

ALTER TABLE public.capture_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capture_preferences_select_owner"
  ON public.capture_preferences FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "capture_preferences_insert_service_only"
  ON public.capture_preferences FOR INSERT WITH CHECK (false);
CREATE POLICY "capture_preferences_update_service_only"
  ON public.capture_preferences FOR UPDATE USING (false);
CREATE POLICY "capture_preferences_delete_service_only"
  ON public.capture_preferences FOR DELETE USING (false);
