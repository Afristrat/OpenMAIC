-- Logo propre à une formation (par exemple celui du client commanditaire).
-- Quand il est renseigné, il remplace le logo de l'organisation sur les diapositives,
-- les exports PPTX et MP4. NULL : le logo de l'organisation s'applique.
-- L'URL est écrite uniquement par la route serveur /api/classroom/[id]/logo
-- (service_role, après contrôle du droit d'édition) ; la RLS de stages reste inchangée.
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN public.stages.logo IS
  'URL publique versionnée du logo propre à la formation ; NULL = logo de l''organisation.';
