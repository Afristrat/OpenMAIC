-- Une clé personnelle va avec le modèle que la personne a choisi chez son fournisseur : le modèle
-- proposé par la plateforme sous ce nom de fournisseur peut ne pas exister sur le compte de la
-- personne (la plateforme peut router « openai » vers un autre modèle compatible).
-- La table vient d'être créée et est vide : la colonne est obligatoire d'emblée.

ALTER TABLE public.user_api_keys
  ADD COLUMN model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 100);
