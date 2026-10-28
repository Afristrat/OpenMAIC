-- Courriel de fin d'export, sur demande : la personne coche « Me prévenir par courriel » au lancement.
-- Colonne additive, fausse par défaut : les jobs existants et les exports lancés sans la case ne
-- déclenchent aucun courriel.
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.export_jobs.notify_email IS 'Vrai si l''auteur a demandé un courriel quand l''export est prêt.';
