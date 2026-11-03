-- Partage d'UNE formation avec UNE personne, sans adhésion à l'organisation.
--
-- Avant : « inviter » = devenir membre = voir tous les partages « organization » et « public ».
-- Désormais : un droit de lecture par (formation, personne). Le bénéficiaire lit cette formation
-- et aucune autre. Écriture réservée au serveur (service_role) : l'API contrôle le rôle de
-- l'auteur du partage (admin, gestionnaire, auteur propriétaire, super admin).

CREATE TABLE public.stage_grants (
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stage_id, user_id)
);

CREATE INDEX stage_grants_user_lookup ON public.stage_grants(user_id, created_at DESC);

ALTER TABLE public.stage_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stage_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stage_grants TO authenticated;
GRANT ALL ON public.stage_grants TO service_role;

-- Un bénéficiaire lit ses propres droits.
CREATE POLICY stage_grants_select_own ON public.stage_grants FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Pas de politique de lecture « gestionnaires » : elle relirait `stages`, dont la politique du
-- bénéficiaire relit `stage_grants` (récursion infinie). Les gestionnaires listent les droits de
-- leurs formations par l'API serveur (service_role), après contrôle de leur rôle.

-- Lecture de la formation et de ses scènes pour le seul bénéficiaire (jamais d'écriture).
CREATE POLICY stages_select_grantee ON public.stages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stage_grants g
  WHERE g.stage_id = stages.id AND g.user_id = (SELECT auth.uid())
));

CREATE POLICY scenes_select_grantee ON public.scenes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stage_grants g
  WHERE g.stage_id = scenes.stage_id AND g.user_id = (SELECT auth.uid())
));

-- Les partages « public » ne se listent plus à un compte qui n'est pas membre de l'organisation
-- éditrice. La lecture par lien direct passe par le serveur (isClassroomPublic) et n'est pas touchée.
DROP POLICY shared_classrooms_select_member ON public.shared_classrooms;
CREATE POLICY shared_classrooms_select_member ON public.shared_classrooms FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.org_members
  WHERE org_members.org_id = shared_classrooms.org_id
    AND org_members.user_id = (SELECT auth.uid())
));

-- Résolution d'une adresse en compte existant, pour le serveur seul (jamais exposée au client).
CREATE FUNCTION public.find_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(TEXT) TO service_role;

COMMENT ON TABLE public.stage_grants IS
  'Droit de lecture d''une formation pour une personne, hors adhésion à l''organisation ; écriture serveur seule.';
